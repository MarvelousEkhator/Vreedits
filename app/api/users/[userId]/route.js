import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

// Adjust if you want to block guests from customizing their profile.
const ALLOW_GUEST_PROFILE_EDIT = true;

// Rough cap so a data-URL avatar can't blow up your Postgres row/network payload.
// ~2MB base64 (roughly ~1.5MB actual image data).
const MAX_AVATAR_DATA_URL_LENGTH = 2 * 1024 * 1024;

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

export async function PATCH(req, { params }) {
  const viewer = await requireUser();
  if (!viewer) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  if (viewer.id !== params.userId) {
    return NextResponse.json({ error: "You can only edit your own profile." }, { status: 403 });
  }

  if (viewer.isGuest && !ALLOW_GUEST_PROFILE_EDIT) {
    return NextResponse.json({ error: "Guests can't edit their profile." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { displayName, bio, avatarDataUrl, isPublic } = body;
  const data = {};

  if (displayName !== undefined) {
    const clean = String(displayName).trim();
    if (clean.length < 1 || clean.length > 40) {
      return NextResponse.json(
        { error: "Display name must be between 1 and 40 characters." },
        { status: 400 }
      );
    }
    data.displayName = clean;
  }

  if (bio !== undefined) {
    const clean = bio === null ? null : String(bio).trim();
    if (clean && clean.length > 300) {
      return NextResponse.json({ error: "Bio must be 300 characters or fewer." }, { status: 400 });
    }
    data.bio = clean || null;
  }

  if (avatarDataUrl !== undefined) {
    if (avatarDataUrl === null) {
      data.avatarDataUrl = null;
    } else {
      const clean = String(avatarDataUrl);
      if (!clean.startsWith("data:image/")) {
        return NextResponse.json({ error: "Avatar must be an image data URL." }, { status: 400 });
      }
      if (clean.length > MAX_AVATAR_DATA_URL_LENGTH) {
        return NextResponse.json({ error: "Avatar image is too large." }, { status: 400 });
      }
      data.avatarDataUrl = clean;
    }
  }

  if (isPublic !== undefined) {
    data.isPublic = !!isPublic;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: viewer.id },
    data,
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarDataUrl: true,
      isPublic: true,
    },
  });

  return NextResponse.json({ ok: true, profile: updated });
}
