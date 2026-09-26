import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";
import { extractHashtags } from "@/lib/hashtags";

// Videos are stored inside the database as base64 text, so keep a ceiling
// (about 45 million characters, roughly 33 MB of video).
const MAX_MEDIA_CHARS = 45_000_000;

const FEED_AUTHOR_SELECT = {
  id: true, username: true, displayName: true, avatarDataUrl: true, allowDownloads: true, school: true,
};
const LITE_AUTHOR_SELECT = { id: true, username: true, displayName: true, avatarDataUrl: true };
const SOUND_OWNER_SELECT = { id: true, username: true, displayName: true };

function soundNameFor(author) {
  return `original sound - ${(author?.username || "").toLowerCase()}`;
}

// Turns any post id into the ORIGINAL post that owns the sound.
// (A video made with a sound points back to the original, so favorites and
// counts always belong to one place.)
async function resolveSound(postId, viewerId) {
  if (!postId) return null;
  let src = await prisma.feedPost.findUnique({
    where: { id: postId },
    select: { id: true, soundId: true, authorId: true, isPrivate: true },
  });
  if (!src) return null;
  if (src.soundId) {
    const root = await prisma.feedPost.findUnique({
      where: { id: src.soundId },
      select: { id: true, soundId: true, authorId: true, isPrivate: true },
    });
    if (root) src = root;
  }
  if (src.isPrivate && src.authorId !== viewerId) return null;
  return src;
}

export async function GET(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // ── Sound details: /api/feed?sound=POST_ID ────────────────────
  const soundParam = searchParams.get("sound");
  if (soundParam) {
    const root = await resolveSound(soundParam, user.id);
    if (!root) return NextResponse.json({ error: "Sound not available." }, { status: 404 });

    const usesWhere = {
      isPrivate: false,
      isDraft: false,
      OR: [{ id: root.id }, { soundId: root.id }],
    };

    const [source, count, uses, favorite] = await Promise.all([
      prisma.feedPost.findUnique({
        where: { id: root.id },
        select: { id: true, mediaUrl: true, mediaType: true, author: { select: LITE_AUTHOR_SELECT } },
      }),
      prisma.feedPost.count({ where: usesWhere }),
      prisma.feedPost.findMany({
        where: usesWhere,
        orderBy: { createdAt: "asc" },
        take: 4,
        select: {
          id: true, mediaUrl: true, mediaType: true, caption: true,
          author: { select: LITE_AUTHOR_SELECT },
        },
      }),
      prisma.favoriteSound.findUnique({
        where: { userId_soundId: { userId: user.id, soundId: root.id } },
      }),
    ]);

    if (!source) return NextResponse.json({ error: "Sound not available." }, { status: 404 });

    return NextResponse.json({
      sound: {
        id: source.id,
        name: soundNameFor(source.author),
        author: source.author,
        mediaUrl: source.mediaUrl,
        count: Math.max(count, 1),
        favorited: !!favorite,
      },
      // The original video's media is only sent once (in `sound`), not twice.
      posts: uses.map((p) => (p.id === source.id ? { ...p, mediaUrl: null, isSource: true } : p)),
    });
  }

  // ── My favorite sounds: /api/feed?favoriteSounds=1 ────────────
  if (searchParams.get("favoriteSounds")) {
    const favs = await prisma.favoriteSound.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const sources = favs.length
      ? await prisma.feedPost.findMany({
          where: { id: { in: favs.map((f) => f.soundId) } },
          select: { id: true, authorId: true, isPrivate: true, author: { select: LITE_AUTHOR_SELECT } },
        })
      : [];
    const byId = new Map(sources.map((s) => [s.id, s]));
    const sounds = favs
      .map((f) => byId.get(f.soundId))
      .filter((s) => s && (!s.isPrivate || s.authorId === user.id))
      .map((s) => ({ id: s.id, name: soundNameFor(s.author), author: s.author }));
    return NextResponse.json({ sounds });
  }

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
          select: LITE_AUTHOR_SELECT,
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
            author: { select: LITE_AUTHOR_SELECT },
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

  // Creators this user has muted never show up in any tab. Muting hides
  // a creator's posts without unfollowing or blocking them, and neither
  // side is ever notified about it.
  const muted = await prisma.mutedCreator.findMany({
    where: { userId: user.id },
    select: { mutedUserId: true },
  });
  const mutedIds = muted.map((m) => m.mutedUserId);
  const where = mutedIds.length
    ? { isPrivate: false, AND: [authorFilter, { authorId: { notIn: mutedIds } }] }
    : { isPrivate: false, ...authorFilter };

  const posts = await prisma.feedPost.findMany({
    take: 10,
    where,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: FEED_AUTHOR_SELECT },
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

  // Who owns the sound each video uses (for the "original sound - name" label)
  const soundIds = [...new Set(posts.map((p) => p.soundId).filter(Boolean))];
  const soundSources = soundIds.length
    ? await prisma.feedPost.findMany({
        where: { id: { in: soundIds } },
        select: { id: true, author: { select: SOUND_OWNER_SELECT } },
      })
    : [];
  const soundOwnerById = new Map(soundSources.map((s) => [s.id, s.author]));

  const shaped = posts.map((p) => ({
    id: p.id,
    caption: p.caption,
    mediaUrl: p.mediaUrl,
    mediaType: p.mediaType,
    tags: p.tags,
    createdAt: p.createdAt,
    author: p.author,
    soundId: p.soundId || null,
    soundOwner: p.soundId ? soundOwnerById.get(p.soundId) || null : null,
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

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // ── Favorite / unfavorite a sound ─────────────────────────────
  if (body?.action === "toggleFavoriteSound") {
    const root = await resolveSound(body.soundId, user.id);
    if (!root) return NextResponse.json({ error: "Sound not available." }, { status: 404 });

    const existing = await prisma.favoriteSound.findUnique({
      where: { userId_soundId: { userId: user.id, soundId: root.id } },
    });
    if (existing) {
      await prisma.favoriteSound.delete({ where: { id: existing.id } });
      return NextResponse.json({ ok: true, favorited: false });
    }
    try {
      await prisma.favoriteSound.create({ data: { userId: user.id, soundId: root.id } });
    } catch {
      // Double tap created it a moment ago — that's fine, it's favorited.
    }
    return NextResponse.json({ ok: true, favorited: true });
  }

  // ── Create a post ─────────────────────────────────────────────
  const { caption, mediaUrl, mediaType, isPrivate, soundId } = body || {};
  if (!caption?.trim() && !mediaUrl) {
    return NextResponse.json({ error: "Add a caption or an image first." }, { status: 400 });
  }
  if (mediaUrl && mediaUrl.length > MAX_MEDIA_CHARS) {
    return NextResponse.json({ error: "That file is too big. Try a shorter video." }, { status: 413 });
  }

  const finalType = mediaType === "video" ? "video" : "image";
  const tags = extractHashtags(caption || "");

  let soundRoot = null;
  if (soundId && finalType === "video") {
    soundRoot = await resolveSound(soundId, user.id);
  }

  const post = await prisma.feedPost.create({
    data: {
      authorId: user.id,
      caption: caption?.trim() || null,
      mediaUrl: mediaUrl || null,
      mediaType: finalType,
      isPrivate: !!isPrivate,
      soundId: soundRoot ? soundRoot.id : null,
      tags,
    },
    include: {
      author: { select: FEED_AUTHOR_SELECT },
    },
  });

  let soundOwner = null;
  if (soundRoot) {
    const srcPost = await prisma.feedPost.findUnique({
      where: { id: soundRoot.id },
      select: { author: { select: SOUND_OWNER_SELECT } },
    });
    soundOwner = srcPost?.author || null;
  }

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
      soundId: post.soundId || null,
      soundOwner,
      likeCount: 0,
      likedByMe: false,
      commentCount: 0,
      savedByMe: false,
      followedByMe: true,
    },
  });
}