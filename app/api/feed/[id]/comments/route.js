import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

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

  const comment = await prisma.feedComment.create({
    data: { postId: params.id, authorId: user.id, content: content.trim(), parentId: parentId || null },
    include: { author: { select: { id: true, username: true, avatarDataUrl: true } } },
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
