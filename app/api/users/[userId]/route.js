import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const viewer = await requireUser();
  if (!viewer) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const target = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarDataUrl: true,
      isPublic: true,
      createdAt: true,
    },
  });

  if (!target) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const isOwner = viewer.id === target.id;
  const canViewPosts = isOwner || target.isPublic;

  const [followerCount, followingCount, isFollowedByMe] = await Promise.all([
    prisma.follow.count({ where: { followingId: target.id } }),
    prisma.follow.count({ where: { followerId: target.id } }),
    isOwner
      ? Promise.resolve(false)
      : prisma.follow
          .findUnique({ where: { followerId_followingId: { followerId: viewer.id, followingId: target.id } } })
          .then((f) => !!f),
  ]);

  let publicPosts = [];
  let privatePosts = [];
  let likeCount = 0;

  if (canViewPosts) {
    const allPosts = await prisma.feedPost.findMany({
      where: { authorId: target.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, mediaUrl: true, mediaType: true, isPrivate: true, likedBy: true },
    });

    const visible = isOwner ? allPosts : allPosts.filter((p) => !p.isPrivate);
    likeCount = visible.reduce((sum, p) => sum + p.likedBy.length, 0);

    publicPosts = allPosts
      .filter((p) => !p.isPrivate)
      .map(({ id, mediaUrl, mediaType }) => ({ id, mediaUrl, mediaType }));
    privatePosts = isOwner
      ? allPosts.filter((p) => p.isPrivate).map(({ id, mediaUrl, mediaType }) => ({ id, mediaUrl, mediaType }))
      : [];
  }

  return NextResponse.json({
    profile: {
      id: target.id,
      username: target.username,
      displayName: target.displayName,
      bio: target.bio,
      avatarDataUrl: target.avatarDataUrl,
      isPublic: target.isPublic,
      createdAt: target.createdAt,
    },
    isOwner,
    isFollowedByMe,
    followerCount,
    followingCount,
    likeCount,
    canViewPosts,
    postCount: canViewPosts ? publicPosts.length : null,
    posts: publicPosts,
    publicPosts,
    privatePosts,
  });
}