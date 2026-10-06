import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";
import { extractHashtags } from "@/lib/hashtags";
import { ensureSound, resolveSound } from "@/lib/sounds";
import { getSettings } from "@/lib/userSettings";
import { localTime, buildStatus } from "@/lib/screenTime";

// Videos are stored inside the database as base64 text, so keep a ceiling
// (about 45 million characters, roughly 33 MB of video).
const MAX_MEDIA_CHARS = 45_000_000;

// Same as TikTok: up to 35 photos in one post.
const MAX_PHOTOS = 35;

// Sounds you upload or record yourself are smaller (about 11 MB of audio).
const MAX_SOUND_CHARS = 15_000_000;
const MAX_UPLOADED_SOUNDS = 30;

// Trending looks at engagement within this rolling window rather than
// all-time, so a post from months ago can't outrank what's hot today.
const TRENDING_WINDOW_HOURS = 48;

const FEED_AUTHOR_SELECT = {
  id: true, username: true, displayName: true, avatarDataUrl: true, allowDownloads: true, school: true,
};
const LITE_AUTHOR_SELECT = { id: true, username: true, displayName: true, avatarDataUrl: true };
const SOUND_OWNER_SELECT = { id: true, username: true, displayName: true };

// Returns "quiet", "limit" or null. If anything goes wrong checking, the
// feed stays open (fails open) rather than breaking for everyone.
async function screenTimeBlock(user, req) {
  try {
    const local = localTime(req.cookies?.get("tz")?.value);
    const [settings, row] = await Promise.all([
      getSettings(user.id),
      prisma.screenTimeDay.findUnique({
        where: { userId_day: { userId: user.id, day: local.day } },
      }),
    ]);
    return buildStatus(settings, row, local).blocked;
  } catch {
    return null;
  }
}

function blockedResponse(blocked) {
  return NextResponse.json(
    {
      error: blocked === "quiet" ? "Quiet hours are on right now." : "Your daily screen time limit is reached.",
      blocked,
    },
    { status: 403 }
  );
}

// A sound's name is whatever its creator named it, or the classic
// "original sound - username" if they never renamed it.
function soundNameFor(author, sound) {
  if (sound?.name) return sound.name;
  return `original sound - ${(author?.username || "").toLowerCase()}`;
}

// Shared shaping used by every feed tab so the object shape FeedClient.js
// expects (likeCount, likedByMe, soundOwner, followedByMe, etc.) stays
// identical no matter which tab produced the posts.
async function shapePosts(posts, user, followedIds) {
  const soundIds = [...new Set(posts.map((p) => p.soundId).filter(Boolean))];
  const sounds = await Promise.all(soundIds.map((id) => ensureSound(id)));
  const ownerIds = [...new Set(sounds.filter(Boolean).map((s) => s.authorId))];
  const owners = ownerIds.length
    ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: SOUND_OWNER_SELECT })
    : [];
  const ownerByUserId = new Map(owners.map((o) => [o.id, o]));
  const soundOwnerById = new Map();
  const soundNameById = new Map();
  soundIds.forEach((id, i) => {
    const s = sounds[i];
    if (s) {
      soundOwnerById.set(id, ownerByUserId.get(s.authorId) || null);
      if (s.name) soundNameById.set(id, s.name);
    }
  });

  return posts.map((p) => ({
    id: p.id,
    caption: p.caption,
    mediaUrl: p.mediaUrl,
    // Only posts with several photos send the full list (a carousel).
    mediaUrls: p.mediaUrls && p.mediaUrls.length > 1 ? p.mediaUrls : undefined,
    mediaType: p.mediaType,
    tags: p.tags,
    createdAt: p.createdAt,
    author: p.author,
    soundId: p.soundId || null,
    soundOwner: p.soundId ? soundOwnerById.get(p.soundId) || null : null,
    soundName: p.soundId ? soundNameById.get(p.soundId) || null : null,
    likeCount: p.likedBy.length,
    likedByMe: p.likedBy.includes(user.id),
    commentCount: p._count.comments,
    savedByMe: p.saves.length > 0,
    followedByMe: p.authorId === user.id ? true : followedIds.has(p.authorId),
  }));
}

export async function GET(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const blocked = await screenTimeBlock(user, req);
  if (blocked) return blockedResponse(blocked);

  const { searchParams } = new URL(req.url);

  // ── Sound details: /api/feed?sound=SOUND_OR_POST_ID ───────────
  const soundParam = searchParams.get("sound");
  if (soundParam) {
    const soundRow = await resolveSound(soundParam, user.id);
    if (!soundRow) return NextResponse.json({ error: "Sound not available." }, { status: 404 });

    const usesWhere = {
      isPrivate: false,
      isDraft: false,
      OR: [
        { soundId: soundRow.id },
        ...(soundRow.sourcePostId ? [{ id: soundRow.sourcePostId }] : []),
      ],
    };

    const [author, sourcePost, count, uses, favorite] = await Promise.all([
      prisma.user.findUnique({ where: { id: soundRow.authorId }, select: LITE_AUTHOR_SELECT }),
      soundRow.sourcePostId && !soundRow.mediaUrl
        ? prisma.feedPost.findUnique({ where: { id: soundRow.sourcePostId }, select: { mediaUrl: true } })
        : null,
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
        where: { userId_soundId: { userId: user.id, soundId: soundRow.id } },
      }),
    ]);

    const mediaUrl = soundRow.mediaUrl || sourcePost?.mediaUrl || null;
    if (!author || !mediaUrl) {
      return NextResponse.json({ error: "Sound not available." }, { status: 404 });
    }

    return NextResponse.json({
      sound: {
        id: soundRow.id,
        name: soundNameFor(author, soundRow),
        author,
        mediaUrl,
        count,
        favorited: !!favorite,
        isMine: soundRow.authorId === user.id,
      },
      // The original video's media is only sent once (in `sound`), not twice.
      posts: uses.map((p) =>
        p.id === soundRow.sourcePostId ? { ...p, mediaUrl: null, isSource: true } : p
      ),
    });
  }

  // ── Sounds I made: /api/feed?mySounds=1 ───────────────────────
  // Every original sound from my videos, plus sounds I uploaded or recorded.
  // No need to favorite anything first.
  if (searchParams.get("mySounds")) {
    // Older videos from before sounds were their own records get one now.
    const legacy = await prisma.feedPost.findMany({
      where: { authorId: user.id, mediaType: "video", soundId: null },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    await Promise.all(legacy.map((p) => ensureSound(p.id)));

    const [rows, me] = await Promise.all([
      prisma.sound.findMany({
        where: { authorId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, name: true, authorId: true, sourcePostId: true, createdAt: true },
      }),
      prisma.user.findUnique({ where: { id: user.id }, select: LITE_AUTHOR_SELECT }),
    ]);

    const sounds = rows.map((s) => ({
      id: s.id,
      name: soundNameFor(me, s),
      author: me,
      uploaded: !s.sourcePostId,
    }));
    return NextResponse.json({ sounds });
  }

  // ── My favorite sounds: /api/feed?favoriteSounds=1 ────────────
  if (searchParams.get("favoriteSounds")) {
    const favs = await prisma.favoriteSound.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const resolved = await Promise.all(favs.map((f) => resolveSound(f.soundId, user.id)));
    const seen = new Set();
    const list = resolved.filter((s) => {
      if (!s || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    const authorIds = [...new Set(list.map((s) => s.authorId))];
    const authors = authorIds.length
      ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: LITE_AUTHOR_SELECT })
      : [];
    const authorById = new Map(authors.map((a) => [a.id, a]));

    const sounds = list
      .filter((s) => authorById.has(s.authorId))
      .map((s) => {
        const author = authorById.get(s.authorId);
        return { id: s.id, name: soundNameFor(author, s), author };
      });
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
  const tab = ["school", "following", "trending", "explore"].includes(rawTab) ? rawTab : "for-you";

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

  // Creators this user has muted never show up in any tab. Muting hides
  // a creator's posts without unfollowing or blocking them, and neither
  // side is ever notified about it.
  const mutedRows = await prisma.mutedCreator.findMany({
    where: { userId: user.id },
    select: { mutedUserId: true },
  });
  const mutedIds = mutedRows.map((m) => m.mutedUserId);

  // ── Trending: engagement-ranked posts from the last 48 hours ───
  // This is a bounded, single-page list (score isn't something the
  // database can paginate by cursor), so nextCursor is always null here —
  // scrolling to the bottom of Trending just won't load more for now.
  if (tab === "trending") {
    const cutoff = new Date(Date.now() - TRENDING_WINDOW_HOURS * 60 * 60 * 1000);
    const where = {
      isPrivate: false,
      isDraft: false,
      createdAt: { gte: cutoff },
      ...(mutedIds.length ? { authorId: { notIn: mutedIds } } : {}),
    };

    const rawPosts = await prisma.feedPost.findMany({
      where,
      include: {
        author: { select: FEED_AUTHOR_SELECT },
        _count: { select: { comments: true } },
        saves: { where: { userId: user.id }, select: { id: true } },
      },
    });

    const authorIds = [...new Set(rawPosts.map((p) => p.authorId))];
    const authorFollows = await prisma.follow.findMany({
      where: { followerId: user.id, followingId: { in: authorIds } },
      select: { followingId: true },
    });
    const followedIds = new Set(authorFollows.map((f) => f.followingId));

    const shaped = await shapePosts(rawPosts, user, followedIds);
    // Score = likes + (comments * 2), weighted toward comments since they
    // signal deeper engagement than a like.
    shaped.sort((a, b) => (b.likeCount + b.commentCount * 2) - (a.likeCount + a.commentCount * 2));

    return NextResponse.json({
      posts: shaped.slice(0, 30),
      tab,
      viewerSchool: user.school || null,
      nextCursor: null,
    });
  }

  let authorFilter;
  if (tab === "following") {
    authorFilter = { authorId: { in: knownIds } };
  } else if (tab === "school") {
    // Only meaningful if the viewer has set a school; otherwise nobody
    // matches and the tab just shows empty rather than erroring.
    authorFilter = user.school
      ? { author: { school: user.school } }
      : { authorId: { in: [] } };
  } else if (tab === "explore") {
    // Explore is the true global feed — everyone's public posts, not
    // filtered down to people you already follow or don't yet know.
    authorFilter = {};
  } else {
    authorFilter = { OR: [{ authorId: user.id }, { authorId: { notIn: excludeIds } }] };
  }

  const where = mutedIds.length
    ? { isPrivate: false, isDraft: false, AND: [authorFilter, { authorId: { notIn: mutedIds } }] }
    : { isPrivate: false, isDraft: false, ...authorFilter };

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

  const shaped = await shapePosts(posts, user, followedIds);

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

  const blocked = await screenTimeBlock(user, req);
  if (blocked) return blockedResponse(blocked);

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

  // ── Create your own sound (uploaded or recorded audio) ────────
  if (body?.action === "createSound") {
    const name = String(body.name || "").trim().slice(0, 60);
    const audio = body.mediaUrl;
    if (!name) return NextResponse.json({ error: "Give your sound a name." }, { status: 400 });
    if (typeof audio !== "string" || !/^data:(audio|video)\//.test(audio)) {
      return NextResponse.json({ error: "Add an audio or video file first." }, { status: 400 });
    }
    if (audio.length > MAX_SOUND_CHARS) {
      return NextResponse.json({ error: "That sound is too big. Try a shorter one." }, { status: 413 });
    }
    const made = await prisma.sound.count({ where: { authorId: user.id, sourcePostId: null } });
    if (made >= MAX_UPLOADED_SOUNDS) {
      return NextResponse.json({ error: "You've reached the limit of uploaded sounds." }, { status: 400 });
    }

    const sound = await prisma.sound.create({
      data: { id: randomUUID(), authorId: user.id, name, mediaUrl: audio },
    });
    return NextResponse.json({
      ok: true,
      sound: { id: sound.id, name: sound.name, mediaUrl: sound.mediaUrl },
    });
  }

  // ── Rename a sound you made ───────────────────────────────────
  if (body?.action === "renameSound") {
    const name = String(body.name || "").trim().slice(0, 60);
    if (!name) return NextResponse.json({ error: "Give your sound a name." }, { status: 400 });
    const sound = await ensureSound(body.soundId);
    if (!sound || sound.authorId !== user.id) {
      return NextResponse.json({ error: "You can only rename your own sounds." }, { status: 403 });
    }
    await prisma.sound.update({ where: { id: sound.id }, data: { name } });
    return NextResponse.json({ ok: true, name });
  }

  // ── Create a post (or save it as a draft) ─────────────────────
  const { caption, mediaUrl: rawMediaUrl, mediaUrls: rawMediaUrls, mediaType, isPrivate, soundId, isDraft } = body || {};

  // A photo post can carry up to 35 photos (a carousel). The first photo
  // is also stored as the main mediaUrl so covers/grids keep working.
  let photoList = [];
  if (Array.isArray(rawMediaUrls)) {
    photoList = rawMediaUrls
      .filter((u) => typeof u === "string" && u.startsWith("data:image/"))
      .slice(0, MAX_PHOTOS);
  }
  const isCarousel = photoList.length > 1;
  const mediaUrl = isCarousel ? photoList[0] : rawMediaUrl;
  const totalChars = isCarousel
    ? photoList.reduce((n, u) => n + u.length, 0)
    : (mediaUrl ? mediaUrl.length : 0);

  if (!caption?.trim() && !mediaUrl) {
    return NextResponse.json({ error: "Add a caption or an image first." }, { status: 400 });
  }
  if (totalChars > MAX_MEDIA_CHARS) {
    return NextResponse.json({ error: "That's too big. Try fewer photos or a shorter video." }, { status: 413 });
  }

  const finalType = isCarousel ? "image" : mediaType === "video" ? "video" : "image";
  const tags = extractHashtags(caption || "");

  let soundRoot = null;
  if (soundId && finalType === "video") {
    soundRoot = await resolveSound(soundId, user.id);
  }

  // Every video belongs to a Sound: either the one it reuses, or a brand
  // new one that starts with this video (same id as the post).
  const postId = randomUUID();
  const finalSoundId = finalType === "video" ? (soundRoot ? soundRoot.id : postId) : null;

  const post = await prisma.feedPost.create({
    data: {
      id: postId,
      authorId: user.id,
      caption: caption?.trim() || null,
      mediaUrl: mediaUrl || null,
      mediaUrls: isCarousel ? photoList : [],
      mediaType: finalType,
      isPrivate: !!isPrivate,
      isDraft: !!isDraft,
      soundId: finalSoundId,
      tags,
    },
    include: {
      author: { select: FEED_AUTHOR_SELECT },
    },
  });

  if (finalType === "video" && !soundRoot) {
    try {
      await prisma.sound.create({
        data: { id: postId, authorId: user.id, sourcePostId: postId },
      });
    } catch {
      // Already created by a lookup a moment ago — that's fine.
    }
  }

  let soundOwner = null;
  if (soundRoot) {
    soundOwner = await prisma.user.findUnique({
      where: { id: soundRoot.authorId },
      select: SOUND_OWNER_SELECT,
    });
  }

  return NextResponse.json({
    ok: true,
    post: {
      id: post.id,
      caption: post.caption,
      mediaUrl: post.mediaUrl,
      mediaUrls: isCarousel ? post.mediaUrls : undefined,
      mediaType: post.mediaType,
      tags: post.tags,
      isPrivate: post.isPrivate,
      isDraft: post.isDraft,
      createdAt: post.createdAt,
      author: post.author,
      soundId: post.soundId || null,
      soundOwner,
      soundName: soundRoot?.name || null,
      likeCount: 0,
      likedByMe: false,
      commentCount: 0,
      savedByMe: false,
      followedByMe: true,
    },
  });
}