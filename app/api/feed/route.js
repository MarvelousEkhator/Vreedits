import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function GET(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");

  const posts = await prisma.feedPost.findMany({
    take: 10,
    where: { isPrivate: false },
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, username: true, avatarDataUrl: true, allowDownloads: true } },
      _count: { select: { comments: true } },
      saves: { where: { userId: user.id }, select: { id: true } },
    },
  });

  // Batch-check which of these authors the current user already follows,
  // instead of one query per post.
  const authorIds = [...new Set(posts.map((p) => p.authorId))];
  const follows = await prisma.follow.findMany({
    where: { followerId: user.id, followingId: { in: authorIds } },
    select: { followingId: true },
  });
  const followedIds = new Set(follows.map((f) => f.followingId));

  const shaped = posts.map((p) => ({
    id: p.id,
    caption: p.caption,
    mediaUrl: p.mediaUrl,
    mediaType: p.mediaType,
    createdAt: p.createdAt,
    author: p.author,
    likeCount: p.likedBy.length,
    likedByMe: p.likedBy.includes(user.id),
    commentCount: p._count.comments,
    savedByMe: p.saves.length > 0,
    // Following yourself isn't a thing — the button is hidden for your
    // own posts in the UI, but this keeps the API response consistent.
    followedByMe: p.authorId === user.id ? true : followedIds.has(p.authorId),
  }));

  return NextResponse.json({
    posts: shaped,
    nextCursor: posts.length === 10 ? posts[posts.length - 1].id : null,
  });
}

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { caption, mediaUrl, mediaType, isPrivate } = await req.json();
  if (!caption?.trim() && !mediaUrl) {
    return NextResponse.json({ error: "Add a caption or an image first." }, { status: 400 });
  }

  const post = await prisma.feedPost.create({
    data: {
      authorId: user.id,
      caption: caption?.trim() || null,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType === "video" ? "video" : "image",
      isPrivate: !!isPrivate,
    },
    include: {
      author: { select: { id: true, username: true, avatarDataUrl: true, allowDownloads: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    post: {
      id: post.id,
      caption: post.caption,
      mediaUrl: post.mediaUrl,
      mediaType: post.mediaType,
      isPrivate: post.isPrivate,
      createdAt: post.createdAt,
      author: post.author,
      likeCount: 0,
      likedByMe: false,
      commentCount: 0,
      savedByMe: false,
      followedByMe: true,
    },
  });
}
