import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

const MAX_MENTIONS_PER_COMMENT = 10;

function shapeComment(c, userId) {
  return {
    id: c.id,
    content: c.content,
    author: c.author,
    createdAt: c.createdAt,
    likeCount: c.likedBy.length,
    likedByMe: c.likedBy.includes(userId),
  };
}

// True if the two users are friends (Friendship rows can be stored in either order).
async function areFriends(userIdA, userIdB) {
  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: userIdA, userBId: userIdB },
        { userAId: userIdB, userBId: userIdA },
      ],
    },
    select: { id: true },
  });
  return !!friendship;
}

// True if either user has blocked the other.
async function isBlockedEitherWay(userIdA, userIdB) {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userIdA, blockedId: userIdB },
        { blockerId: userIdB, blockedId: userIdA },
      ],
    },
    select: { id: true },
  });
  return !!block;
}

// setting is "everyone" | "friends" | "none". ownerId is the person whose
// setting it is, actorId is the person trying to interact with them.
async function settingAllows(setting, ownerId, actorId) {
  if (ownerId === actorId) return true;
  if (setting === "none") return false;
  if (setting === "friends") return areFriends(ownerId, actorId);
  return true;
}

// Pulls unique @usernames out of comment text.
function extractMentionedUsernames(text) {
  const found = new Set();
  const regex = /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_.]{1,30})/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[2].replace(/\.+$/, "");
    if (name) found.add(name.toLowerCase());
    if (found.size >= MAX_MENTIONS_PER_COMMENT) break;
  }
  return Array.from(found);
}

// Creates a notification for each mentioned user who allows it.
// Never throws — a mention problem must not stop the comment from posting.
async function notifyMentions({ content, commenter, postId }) {
  try {
    const usernames = extractMentionedUsernames(content);
    if (usernames.length === 0) return;

    const mentionedUsers = await prisma.user.findMany({
      where: {
        OR: usernames.map((name) => ({
          username: { equals: name, mode: "insensitive" },
        })),
      },
      select: { id: true, username: true, allowMentions: true },
    });

    const notifications = [];
    for (const mentioned of mentionedUsers) {
      if (mentioned.id === commenter.id) continue;
      if (await isBlockedEitherWay(mentioned.id, commenter.id)) continue;
      const allowed = await settingAllows(mentioned.allowMentions, mentioned.id, commenter.id);
      if (!allowed) continue;

      const preview = content.length > 100 ? content.slice(0, 100) + "…" : content;
      notifications.push({
        userId: mentioned.id,
        category: "Mentions",
        title: `${commenter.username} mentioned you in a comment`,
        description: preview,
      });
    }

    if (notifications.length > 0) {
      await prisma.notification.createMany({ data: notifications });
    }
  } catch (err) {
    console.error("Mention notification failed:", err);
  }
}

export async function GET(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  // Only fetch top-level comments (parentId: null) here; each one carries
  // its replies nested inside it, one level deep — matching how the
  // comment sheet renders threads (replies don't have their own replies).
  const comments = await prisma.feedComment.findMany({
    where: { postId: params.id, parentId: null },
    orderBy: [{ pinned: "desc" }, { createdAt: "asc" }],
    include: {
      author: { select: { id: true, username: true, avatarDataUrl: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, username: true, avatarDataUrl: true } } },
      },
    },
  });

  const shaped = comments.map((c) => ({
    ...shapeComment(c, user.id),
    replies: c.replies.map((r) => shapeComment(r, user.id)),
  }));

  return NextResponse.json({ comments: shaped });
}

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { content, parentId } = await req.json().catch(() => ({}));
  if (!content?.trim()) {
    return NextResponse.json({ error: "Comment can't be empty." }, { status: 400 });
  }

  const post = await prisma.feedPost.findUnique({ where: { id: params.id } });
  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // The post author can always comment on their own post. Everyone else
  // is checked against the author's block list and comment setting.
  if (post.authorId !== user.id) {
    const authorBlockedCommenter = await prisma.block.findFirst({
      where: { blockerId: post.authorId, blockedId: user.id },
      select: { id: true },
    });
    if (authorBlockedCommenter) {
      return NextResponse.json(
        { error: "You can't comment on this post." },
        { status: 403 }
      );
    }

    const postAuthor = await prisma.user.findUnique({
      where: { id: post.authorId },
      select: { allowComments: true },
    });
    const allowed = await settingAllows(
      postAuthor?.allowComments || "everyone",
      post.authorId,
      user.id
    );
    if (!allowed) {
      const message =
        postAuthor?.allowComments === "friends"
          ? "Only friends can comment on this post."
          : "Comments are turned off for this post.";
      return NextResponse.json({ error: message }, { status: 403 });
    }
  }

  // Replying to a reply isn't supported (one level of threading, matching
  // most short-form video apps) — the parent must itself be a top-level
  // comment on this same post.
  if (parentId) {
    const parent = await prisma.feedComment.findUnique({ where: { id: parentId } });
    if (!parent || parent.postId !== params.id) {
      return NextResponse.json({ error: "Comment to reply to was not found." }, { status: 404 });
    }
    if (parent.parentId) {
      return NextResponse.json({ error: "Can't reply to a reply." }, { status: 400 });
    }
  }

  const trimmed = content.trim();

  const comment = await prisma.feedComment.create({
    data: { postId: params.id, authorId: user.id, content: trimmed, parentId: parentId || null },
    include: { author: { select: { id: true, username: true, avatarDataUrl: true } } },
  });

  await notifyMentions({
    content: trimmed,
    commenter: { id: user.id, username: comment.author.username },
    postId: params.id,
  });

  return NextResponse.json({
    ok: true,
    comment: {
      id: comment.id,
      content: comment.content,
      author: comment.author,
      createdAt: comment.createdAt,
      likeCount: 0,
      likedByMe: false,
      parentId: comment.parentId,
      replies: comment.parentId ? undefined : [],
    },
  });
}