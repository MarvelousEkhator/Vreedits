// app/api/feed/[id]/details/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const viewer = await requireUser();
  if (!viewer) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (viewer.isGuest) return guestBlockedResponse();

  const post = await prisma.feedPost.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      authorId: true,
      caption: true,
      mediaUrls: true,
      mediaType: true,
      isPrivate: true,
      isDraft: true,
      createdAt: true,
      viewedBy: true,
      likedBy: true,
      _count: { select: { comments: true } },
      author: { select: { isPublic: true } },
    },
  });

  const notFound = NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!post || post.isDraft) return notFound;

  const isOwner = post.authorId === viewer.id;
  if (!isOwner) {
    if (post.isPrivate || !post.author.isPublic) return notFound;

    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: viewer.id, blockedId: post.authorId },
          { blockerId: post.authorId, blockedId: viewer.id },
        ],
      },
      select: { id: true },
    });
    if (block) return notFound;
  }

  return NextResponse.json({
    post: {
      id: post.id,
      caption: post.caption || "",
      mediaType: post.mediaType,
      // Only carousels send their photos; the grid already has the first one.
      mediaUrls: post.mediaUrls && post.mediaUrls.length > 1 ? post.mediaUrls : undefined,
      createdAt: post.createdAt,
      viewCount: post.viewedBy.length,
      likeCount: post.likedBy.length,
      commentCount: post._count.comments,
    },
  });
}