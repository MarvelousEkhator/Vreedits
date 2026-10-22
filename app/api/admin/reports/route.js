import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";
import { isFeedbackAdmin } from "@/lib/feedbackAdmin";
import { addStrike } from "@/lib/schoolScore";

export const dynamic = "force-dynamic";

const LIMIT = 50; // per report table

async function requireOwner() {
  const user = await requireUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  if (!isFeedbackAdmin(user)) return { error: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
  return { user };
}

function short(text, max) {
  const t = String(text || "");
  return t.length > max ? t.slice(0, max) + "…" : t;
}

// DM and comment reports are stored as:
// "[DM] reporter's reason\n---\nMessage ID: ...\nMessage: ...\nPhotos: n"
function parseTagged(raw) {
  const m = /^\[(DM|COMMENT)\]\s*/.exec(raw || "");
  if (!m) return { tag: null, userReason: raw || "", details: "" };
  const rest = raw.slice(m[0].length);
  const cut = rest.indexOf("\n---\n");
  return {
    tag: m[1],
    userReason: cut >= 0 ? rest.slice(0, cut) : rest,
    details: cut >= 0 ? rest.slice(cut + 5) : "",
  };
}

function lineValue(details, label) {
  const m = new RegExp(`^${label}: (.+)$`, "m").exec(details || "");
  return m ? m[1].trim() : null;
}

function idFrom(details, label) {
  const v = lineValue(details, label);
  return v && /^[\w-]{8,64}$/.test(v) ? v : null;
}

function loadReport(source, id) {
  if (source === "post") return prisma.postReport.findUnique({ where: { id } });
  if (source === "user") return prisma.userReport.findUnique({ where: { id } });
  return prisma.report.findUnique({ where: { id } });
}

function updateStatus(source, id, status) {
  const args = { where: { id }, data: { status } };
  if (source === "post") return prisma.postReport.update(args);
  if (source === "user") return prisma.userReport.update(args);
  return prisma.report.update(args);
}

// Works out who wrote the reported content and what "Remove" would delete.
async function resolveTarget(source, report) {
  if (source === "post") {
    const p = await prisma.feedPost.findUnique({ where: { id: report.postId }, select: { authorId: true } });
    return { userId: p?.authorId || null, removeKind: p ? "feedPost" : null, removeId: report.postId };
  }
  if (source === "user") {
    const t = parseTagged(report.reason);
    if (t.tag === "DM") return { userId: report.targetUserId, removeKind: "dm", removeId: idFrom(t.details, "Message ID") };
    if (t.tag === "COMMENT") return { userId: report.targetUserId, removeKind: "feedComment", removeId: idFrom(t.details, "Comment ID") };
    return { userId: report.targetUserId, removeKind: null, removeId: null };
  }
  // community report
  if (report.targetType === "post") {
    const p = await prisma.post.findUnique({ where: { id: report.targetId }, select: { authorId: true } });
    return { userId: p?.authorId || null, removeKind: p ? "communityPost" : null, removeId: report.targetId };
  }
  if (report.targetType === "comment") {
    const c = await prisma.comment.findUnique({ where: { id: report.targetId }, select: { authorId: true } });
    return { userId: c?.authorId || null, removeKind: c ? "communityComment" : null, removeId: report.targetId };
  }
  return { userId: report.targetId, removeKind: null, removeId: null };
}

// Returns an error message, or null when the content was removed.
async function removeContent(target, report) {
  const { removeKind, removeId } = target;
  if (!removeKind || !removeId) return "There's nothing to remove for this report.";

  if (removeKind === "feedPost") {
    await prisma.feedPost.update({ where: { id: removeId }, data: { isPrivate: true } });
    return null;
  }
  if (removeKind === "communityPost") {
    await prisma.post.deleteMany({ where: { id: removeId } });
    return null;
  }
  if (removeKind === "communityComment") {
    await prisma.comment.deleteMany({ where: { id: removeId } });
    return null;
  }
  if (removeKind === "dm") {
    // The message must really be from the reported person to the reporter.
    const msg = await prisma.directMessage.findUnique({
      where: { id: removeId },
      select: { senderId: true, receiverId: true },
    });
    if (!msg || msg.senderId !== report.targetUserId || msg.receiverId !== report.reporterId) {
      return "Couldn't verify that message, so it wasn't removed.";
    }
    await prisma.directMessage.delete({ where: { id: removeId } });
    return null;
  }
  if (removeKind === "feedComment") {
    const c = await prisma.feedComment.findUnique({ where: { id: removeId }, select: { authorId: true } });
    if (!c || c.authorId !== report.targetUserId) {
      return "Couldn't verify that comment, so it wasn't removed.";
    }
    await prisma.feedComment.delete({ where: { id: removeId } });
    return null;
  }
  return "Unknown content type.";
}

export async function GET(req) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);

  // Media is loaded on demand (it can be large).
  const mediaKind = searchParams.get("media");
  if (mediaKind) {
    const id = searchParams.get("id") || "";
    if (mediaKind === "feed") {
      const p = await prisma.feedPost.findUnique({
        where: { id },
        select: { mediaUrl: true, mediaUrls: true, mediaType: true },
      });
      if (!p) return NextResponse.json({ error: "Post not found." }, { status: 404 });
      return NextResponse.json({
        mediaType: p.mediaType,
        mediaUrl: p.mediaUrl,
        mediaUrls: p.mediaUrls && p.mediaUrls.length > 1 ? p.mediaUrls : undefined,
      });
    }
    if (mediaKind === "community") {
      const p = await prisma.post.findUnique({ where: { id }, select: { imageUrl: true } });
      if (!p) return NextResponse.json({ error: "Post not found." }, { status: 404 });
      return NextResponse.json({ mediaType: "image", mediaUrl: p.imageUrl });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const closed = searchParams.get("status") === "closed";
  const statusWhere = closed ? { status: { not: "open" } } : { status: "open" };

  const [postReports, userReports, communityReports] = await Promise.all([
    prisma.postReport.findMany({ where: statusWhere, orderBy: { createdAt: "desc" }, take: LIMIT }),
    prisma.userReport.findMany({ where: statusWhere, orderBy: { createdAt: "desc" }, take: LIMIT }),
    prisma.report.findMany({
      where: statusWhere,
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      include: { community: { select: { name: true } } },
    }),
  ]);

  const feedPostIds = [...new Set(postReports.map((r) => r.postId))];
  const cPostIds = communityReports.filter((r) => r.targetType === "post").map((r) => r.targetId);
  const cCommentIds = communityReports.filter((r) => r.targetType === "comment").map((r) => r.targetId);

  const [feedPosts, cPosts, cComments] = await Promise.all([
    feedPostIds.length
      ? prisma.feedPost.findMany({
          where: { id: { in: feedPostIds } },
          select: { id: true, authorId: true, caption: true, mediaType: true, isPrivate: true },
        })
      : [],
    cPostIds.length
      ? prisma.post.findMany({ where: { id: { in: cPostIds } }, select: { id: true, authorId: true, content: true, title: true } })
      : [],
    cCommentIds.length
      ? prisma.comment.findMany({ where: { id: { in: cCommentIds } }, select: { id: true, authorId: true, content: true } })
      : [],
  ]);

  const feedPostById = new Map(feedPosts.map((p) => [p.id, p]));
  const cPostById = new Map(cPosts.map((p) => [p.id, p]));
  const cCommentById = new Map(cComments.map((c) => [c.id, c]));

  const userIds = new Set();
  for (const r of postReports) userIds.add(r.reporterId);
  for (const r of userReports) { userIds.add(r.reporterId); userIds.add(r.targetUserId); }
  for (const r of communityReports) {
    userIds.add(r.reporterId);
    if (r.targetType === "member") userIds.add(r.targetId);
  }
  for (const p of feedPosts) userIds.add(p.authorId);
  for (const p of cPosts) userIds.add(p.authorId);
  for (const c of cComments) userIds.add(c.authorId);

  const users = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, username: true, displayName: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const person = (id) => {
    const u = userById.get(id);
    return u ? { id: u.id, username: u.username, displayName: u.displayName } : null;
  };

  const items = [];

  for (const r of postReports) {
    const p = feedPostById.get(r.postId);
    items.push({
      key: `post:${r.id}`, source: "post", id: r.id, kind: "Feed post",
      createdAt: r.createdAt, status: r.status,
      reporter: person(r.reporterId),
      target: p ? person(p.authorId) : null,
      reason: r.reason,
      preview: p ? short(p.caption || `(${p.mediaType} post with no caption)`, 300) : "(this post was deleted)",
      context: p?.isPrivate ? "Already hidden from the feed" : null,
      canRemove: !!p && !p.isPrivate,
      canWarn: !!p,
      mediaKind: p ? "feed" : null,
      mediaId: r.postId,
    });
  }

  for (const r of userReports) {
    const t = parseTagged(r.reason);
    const kind = t.tag === "DM" ? "DM message" : t.tag === "COMMENT" ? "Feed comment" : "User";
    const removeId = t.tag === "DM" ? idFrom(t.details, "Message ID") : t.tag === "COMMENT" ? idFrom(t.details, "Comment ID") : null;
    const snapshot = t.tag ? lineValue(t.details, t.tag === "DM" ? "Message" : "Comment") : null;
    const photos = t.tag === "DM" ? lineValue(t.details, "Photos") : null;
    items.push({
      key: `user:${r.id}`, source: "user", id: r.id, kind,
      createdAt: r.createdAt, status: r.status,
      reporter: person(r.reporterId),
      target: person(r.targetUserId),
      reason: t.userReason,
      preview: snapshot ? short(snapshot, 300) + (photos && photos !== "0" ? `  [+${photos} photo(s), not saved]` : "") : "",
      context: null,
      canRemove: !!removeId,
      canWarn: true,
      mediaKind: null,
      mediaId: null,
    });
  }

  for (const r of communityReports) {
    let kind = "Community member";
    let target = null;
    let preview = "";
    let canRemove = false;
    let mediaKind = null;
    if (r.targetType === "post") {
      kind = "Community post";
      const p = cPostById.get(r.targetId);
      target = p ? person(p.authorId) : null;
      preview = p ? short([p.title, p.content].filter(Boolean).join(" — ") || "(image only)", 300) : "(this post was deleted)";
      canRemove = !!p;
      mediaKind = p ? "community" : null;
    } else if (r.targetType === "comment") {
      kind = "Community reply";
      const c = cCommentById.get(r.targetId);
      target = c ? person(c.authorId) : null;
      preview = c ? short(c.content, 300) : "(this reply was deleted)";
      canRemove = !!c;
    } else {
      target = person(r.targetId);
    }
    items.push({
      key: `community:${r.id}`, source: "community", id: r.id, kind,
      createdAt: r.createdAt, status: r.status,
      reporter: person(r.reporterId),
      target,
      reason: r.reason,
      preview,
      context: r.community?.name ? `In community: ${r.community.name}` : null,
      canRemove,
      canWarn: !!target,
      mediaKind,
      mediaId: r.targetId,
    });
  }

  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return NextResponse.json({ items });
}

// Body: { source: "post" | "user" | "community", id, action: "dismiss" | "reviewed" | "remove" | "warn" }
export async function PATCH(req) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const { source, id, action } = body || {};
  if (!["post", "user", "community"].includes(source) || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!["dismiss", "reviewed", "remove", "warn"].includes(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  try {
    const report = await loadReport(source, id);
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });

    if (action === "dismiss") {
      await updateStatus(source, id, "dismissed");
      return NextResponse.json({ ok: true });
    }
    if (action === "reviewed") {
      await updateStatus(source, id, "reviewed");
      return NextResponse.json({ ok: true });
    }

    const target = await resolveTarget(source, report);

    if (action === "remove") {
      const err = await removeContent(target, report);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      if (target.userId) {
        try {
          await prisma.notification.create({
            data: {
              userId: target.userId,
              category: "system",
              title: "Content removed",
              description: "Something you shared was removed because it broke the Vreedits rules.",
            },
          });
        } catch {}
      }
      await updateStatus(source, id, "actioned");
      return NextResponse.json({ ok: true });
    }

    // warn
    if (!target.userId) {
      return NextResponse.json({ error: "Couldn't find who wrote this." }, { status: 400 });
    }
    const note = await addStrike(target.userId);
    await updateStatus(source, id, "actioned");
    return NextResponse.json({ ok: true, note });
  } catch (err) {
    console.error("PATCH /api/admin/reports error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}