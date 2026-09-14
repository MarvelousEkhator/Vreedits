// app/api/feed/[id]/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

// Single-post fetch — used by share links (/feed/[id]) if that page exists.
export async function GET(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const post = await prisma.feedPost.findUnique({
    where: { id: params.id },
    include: {
      author: { select: { id: true, username: true, avatarDataUrl: true, allowDownloads: true } },
      _count: { select: { comments: true } },
      saves: { where: { userId: user.id }, select: { id: true } },
    },
  });

  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({
    post: {
      id: post.id,
      caption: post.caption,
      mediaUrl: post.mediaUrl,
      mediaType: post.mediaType,
      createdAt: post.createdAt,
      author: post.author,
      likeCount: post.likedBy.length,
      likedByMe: post.likedBy.includes(user.id),
      commentCount: post._count.comments,
      savedByMe: post.saves.length > 0,
    },
  });
}

// This is the handler FeedClient.js's handleDeletePost has been calling
// all along — it just never existed, so every delete attempt silently
// 404'd with no error surfaced anywhere.
export async function DELETE(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const post = await prisma.feedPost.findUnique({ where: { id: params.id } });
  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (post.authorId !== user.id) {
    return NextResponse.json({ error: "You can only delete your own posts." }, { status: 403 });
  }

  await prisma.feedPost.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
