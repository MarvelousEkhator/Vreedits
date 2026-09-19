import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";
import { extractHashtags } from "@/lib/hashtags";

export async function GET(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // ── Search mode: /api/feed?q=... ──────────────────────────────
  const q = (searchParams.get("q") || "").trim();
  if (q) {
    const isHashtag = q.startsWith("#");
    const isMention = q.startsWith("@");
    const term = q.replace(/^[@#]+/, "").trim().slice(0, 60);
    if (!term) return NextResponse.json({ users: [], posts: [] });
    const lower = term.toLowerCase();

    const users = isHashtag
      ? []
      : await prisma.user.findMany({
          where: {
            verified: true,
            isGuest: false,
            OR: [
              { username: { contains: term, mode: "insensitive" } },
              { displayName: { contains: term, mode: "insensitive" } },
            ],
          },
          take: 10,
          select: { id: true, username: true, displayName: true, avatarDataUrl: true },
        });

    const posts = isMention
      ? []
      : await prisma.feedPost.findMany({
          where: {
            isPrivate: false,
            isDraft: false,
            OR: [
              { caption: { contains: term, mode: "insensitive" } },
              { tags: { hasSome: [lower, "#" + lower] } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 9,
          select: {
            id: true,
            caption: true,
            mediaUrl: true,
            mediaType: true,
            createdAt: true,
            author: { select: { id: true, username: true, displayName: true, avatarDataUrl: true } },
          },
        });

    return NextResponse.json({ users, posts });
  }

  // ── Normal feed ───────────────────────────────────────────────
  const cursor = searchParams.get("cursor");
  const rawTab = searchParams.get("tab");
  const tab = ["school", "following"].includes(rawTab) ? rawTab : "for-you";

  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
  });
  const friendIds = friendships.map((f) => (f.userAId === user.id ? f.userBId : f.userAId));

  const follows = await prisma.follow.findMany({
    where: { followerId: user.id },
    select: { followingId: true },
  });
  const followingIds = follows.map((f) => f.followingId);

  const knownIds = [...new Set([user.id, ...friendIds, ...followingIds])];
  const excludeIds = knownIds.filter((id) => id !== user.id);

  let authorFilter;
  if (tab === "following") {
    authorFilter = { authorId: { in: knownIds } };
  } else if (tab === "school") {
    // Only meaningful if the viewer has set a school; otherwise nobody
    // matches and the tab just shows empty rather than erroring.
    authorFilter = user.school
      ? { author: { school: user.school } }
      : { authorId: { in: [] } };
  } else {
    authorFilter = { OR: [{ authorId: user.id }, { authorId: { notIn: excludeIds } }] };
  }

  const posts = await prisma.feedPost.findMany({
    take: 10,
    where: { isPrivate: false, ...authorFilter },
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarDataUrl: true, allowDownloads: true, school: true } },
      _count: { select: { comments: true } },
      saves: { where: { userId: user.id }, select: { id: true } },
    },
  });

  const authorIds = [...new Set(posts.map((p) => p.authorId))];
  const authorFollows = await prisma.follow.findMany({
    where: { followerId: user.id, followingId: { in: authorIds } },
    select: { followingId: true },
  });
  const followedIds = new Set(authorFollows.map((f) => f.followingId));

  const shaped = posts.map((p) => ({
    id: p.id,
    caption: p.caption,
    mediaUrl: p.mediaUrl,
    mediaType: p.mediaType,
    tags: p.tags,
    createdAt: p.createdAt,
    author: p.author,
    likeCount: p.likedBy.length,
    likedByMe: p.likedBy.includes(user.id),
    commentCount: p._count.comments,
    savedByMe: p.saves.length > 0,
    followedByMe: p.authorId === user.id ? true : followedIds.has(p.authorId),
  }));

  return NextResponse.json({
    posts: shaped,
    tab,
    viewerSchool: user.school || null,
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

  const tags = extractHashtags(caption);

  const post = await prisma.feedPost.create({
    data: {
      authorId: user.id,
      caption: caption?.trim() || null,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType === "video" ? "video" : "image",
      isPrivate: !!isPrivate,
      tags,
    },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarDataUrl: true, allowDownloads: true, school: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    post: {
      id: post.id,
      caption: post.caption,
      mediaUrl: post.mediaUrl,
      mediaType: post.mediaType,
      tags: post.tags,
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