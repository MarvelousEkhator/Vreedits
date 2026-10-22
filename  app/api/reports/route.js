import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";

const MAX_REASON_CHARS = 500;
const MAX_SNAPSHOT_CHARS = 500;
const MAX_REPORTS_PER_HOUR = 20;

// One line only, so nobody can fake extra lines in a report.
function clean(text, max) {
  return String(text || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/-{3,}/g, "--")
    .trim()
    .slice(0, max);
}

// Reports a DM message you received, or a feed comment.
// Body: { type: "dm_message" | "feed_comment", targetId, reason }
export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.isGuest) return guestBlockedResponse();

  const body = await req.json().catch(() => ({}));
  const type = body?.type;
  const targetId = typeof body?.targetId === "string" ? body.targetId : "";
  const reason = clean(body?.reason, MAX_REASON_CHARS);

  if (!targetId || !["dm_message", "feed_comment"].includes(type)) {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Tell us what's wrong." }, { status: 400 });
  }

  // Stops report spam.
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [userCount, postCount] = await Promise.all([
    prisma.userReport.count({ where: { reporterId: user.id, createdAt: { gte: since } } }),
    prisma.postReport.count({ where: { reporterId: user.id, createdAt: { gte: since } } }),
  ]);
  if (userCount + postCount >= MAX_REPORTS_PER_HOUR) {
    return NextResponse.json({ error: "You've sent a lot of reports. Please try again later." }, { status: 429 });
  }

  try {
    if (type === "dm_message") {
      // Only the person who received the message can report it.
      const msg = await prisma.directMessage.findFirst({
        where: { id: targetId, receiverId: user.id },
      });
      if (!msg || msg.senderId === user.id) {
        return NextResponse.json({ error: "Message not found." }, { status: 404 });
      }

      const already = await prisma.userReport.findFirst({
        where: {
          reporterId: user.id,
          targetUserId: msg.senderId,
          reason: { contains: `Message ID: ${msg.id}` },
        },
        select: { id: true },
      });
      if (already) return NextResponse.json({ ok: true, alreadyReported: true });

      const att = msg.attachments && typeof msg.attachments === "object" && !Array.isArray(msg.attachments)
        ? msg.attachments
        : {};
      const photos = Array.isArray(att.images) ? att.images.length : 0;

      await prisma.userReport.create({
        data: {
          reporterId: user.id,
          targetUserId: msg.senderId,
          reason:
            `[DM] ${reason}\n---\n` +
            `Message ID: ${msg.id}\n` +
            `Message: ${clean(msg.content, MAX_SNAPSHOT_CHARS) || "(empty)"}\n` +
            `Photos: ${photos}`,
        },
      });
      return NextResponse.json({ ok: true });
    }

    // feed_comment
    const comment = await prisma.feedComment.findUnique({
      where: { id: targetId },
      select: { id: true, authorId: true, content: true, postId: true },
    });
    if (!comment || comment.authorId === user.id) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }

    const already = await prisma.userReport.findFirst({
      where: {
        reporterId: user.id,
        targetUserId: comment.authorId,
        reason: { contains: `Comment ID: ${comment.id}` },
      },
      select: { id: true },
    });
    if (already) return NextResponse.json({ ok: true, alreadyReported: true });

    await prisma.userReport.create({
      data: {
        reporterId: user.id,
        targetUserId: comment.authorId,
        reason:
          `[COMMENT] ${reason}\n---\n` +
          `Comment ID: ${comment.id}\n` +
          `Post ID: ${comment.postId}\n` +
          `Comment: ${clean(comment.content, MAX_SNAPSHOT_CHARS) || "(empty)"}`,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/reports error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}