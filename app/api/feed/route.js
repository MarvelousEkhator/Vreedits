import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";
import { extractHashtags } from "@/lib/hashtags";
import { ensureSound, resolveSound } from "@/lib/sounds";
import { getSettings } from "@/lib/userSettings";
import { localTime, buildStatus } from "@/lib/screenTime";
import { scoreInBackground } from "@/lib/schoolScore";

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

// Ranked tabs (For You, Explore, School) pick the best posts out of the
// newest POOL_SIZE posts, then hand them out PAGE_SIZE at a time.
const POOL_SIZE = 150;
const PAGE_SIZE = 10;

// How fast a post fades with age (hours until its recency weight halves).
const RECENCY_HALF_LIFE = { "for-you": 36, explore: 96, school: 48 };

// Posts Syna hasn't scored yet count as slightly-not-school until she does.
const UNSCORED_SCHOOL_SCORE = 0.35;

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

// ── School ranking ────────────────────────────────────────────

// Likes + comments + saves, with comments and saves counting double
// because they show a viewer actually cared.
function postEngagement(p) {
  return p.likedBy.length + 2 * (p._count?.comments || 0) + 2 * (p._count?.saves || 0);
}

// Turns a school score (0 to 1) into a multiplier. Clearly-school posts get
// about 2.0, unscored posts about 0.38, and unrelated posts about 0.17, so
// anything that isn't school sinks a long way down.
function schoolFactor(score) {
  const s = typeof score === "number" ? score : UNSCORED_SCHOOL_SCORE;
  return 0.15 + 1.85 * s * s;
}

// "Top students": creators whose school posts got good feedback. Each
// creator gets a boost between 1x and 2x based on the total engagement on
// their school posts in this pool.
function creatorBoosts(posts) {
  const totals = new Map();
  for (const p of posts) {
    if (typeof p.schoolScore === "number" && p.schoolScore >= 0.5) {
      totals.set(p.authorId, (totals.get(p.authorId) || 0) + postEngagement(p));
    }
  }
  const boosts = new Map();
  for (const [authorId, total] of totals) {
    boosts.set(authorId, 1 + Math.min(1, Math.log1p(total) / 4));
  }
  return boosts;
}

// The boost only counts as much as the post itself is about school, so a
// top student's non-school post doesn't ride on their reputation.
function boostFor(p, boosts) {
  const b = boosts.get(p.authorId) || 1;
  const s = typeof p.schoolScore === "number" ? p.schoolScore : UNSCORED_SCHOOL_SCORE;
  return 1 + (b - 1) * s;
}

function rankScore(p, boosts, tab) {
  const hours = Math.max(0, (Date.now() - new Date(p.createdAt).getTime()) / 3_600_000);
  const halfLife = RECENCY_HALF_LIFE[tab] || 36;
  const recency = Math.max(0.15, 1 / (1 + hours / halfLife));
  return (
    schoolFactor(p.schoolScore) *
    boostFor(p, boosts) *
    (1 + Math.log1p(postEngagement(p))) *
    recency
  );
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
    saveCount: p._count.saves || 0,
    savedByMe: p.saves.length > 0,
    followedByMe: p.authorId === user.id ? true : followedIds.has(p.authorId),
  }));
}

// Guests can read the feed (public posts, search, sounds). Anything that
// creates or changes data is blocked for guests in POST below.
export async function GET(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const blocked = await screenTimeBlock(user, req);
  if (blocked) return blockedResponse(blocked);

  // Posts from private accounts are only ever shown to their own owner.
  const visibleAuthor = { OR: [{ isPublic: true }, { id: user.id }] };

  const { searchParams } = new URL(req.url);

  // ── Sound details: /api/feed?sound=SOUND_OR_POST_ID ───────────
  const soundParam = searchParams.get("sound");
  if (soundParam) {
    const soundRow = await resolveSound(soundParam, user.id);
    if (!soundRow) return NextResponse.json({ error: "Sound not available." }, { status: 404 });

    const usesWhere = {
      isPrivate: false,
      isDraft: false,
      author: visibleAuthor,
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
            author: visibleAuthor,
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

  // "Following" is only people the viewer actually follows (Follow rows).
  // Friends are not the same thing and don't count here.
  const follows = await prisma.follow.findMany({
    where: { followerId: user.id },
    select: { followingId: true },
  });
  const followingIds = follows.map((f) => f.followingId);

  // Creators this user has muted never show up in any tab. Muting hides
  // a creator's posts without unfollowing or blocking them, and neither
  // side is ever notified about it.
  const mutedRows = await prisma.mutedCreator.findMany({
    where: { userId: user.id },
    select: { mutedUserId: true },
  });
  const mutedIds = mutedRows.map((m) => m.mutedUserId);

  // People blocked in either direction are hidden from every tab too.
  const blockRows = await prisma.block.findMany({
    where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
    select: { blockerId: true, blockedId: true },
  });
  const blockedIds = blockRows.map((b) => (b.blockerId === user.id ? b.blockedId : b.blockerId));

  const hiddenIds = [...new Set([...mutedIds, ...blockedIds])];

  // ── Trending: engagement-ranked posts from the last 48 hours ───
  // This is a bounded, single-page list (score isn't something the
  // database can paginate by cursor), so nextCursor is always null here —
  // scrolling to the bottom of Trending just won't load more for now.
  // School posts from top students rise; non-school posts sink.
  if (tab === "trending") {
    const cutoff = new Date(Date.now() - TRENDING_WINDOW_HOURS * 60 * 60 * 1000);
    const where = {
      isPrivate: false,
      isDraft: false,
      author: visibleAuthor,
      createdAt: { gte: cutoff },
      ...(hiddenIds.length ? { authorId: { notIn: hiddenIds } } : {}),
    };

    const rawPosts = await prisma.feedPost.findMany({
      where,
      include: {
        author: { select: FEED_AUTHOR_SELECT },
        _count: { select: { comments: true, saves: true } },
        saves: { where: { userId: user.id }, select: { id: true } },
      },
    });

    scoreInBackground(rawPosts.filter((p) => !p.scoredAt).slice(0, 4).map((p) => p.id));

    const boosts = creatorBoosts(rawPosts);
    const trendRank = new Map(
      rawPosts.map((p) => [
        p.id,
        (1 + postEngagement(p)) * schoolFactor(p.schoolScore) * boostFor(p, boosts),
      ])
    );

    const authorIds = [...new Set(rawPosts.map((p) => p.authorId))];
    const authorFollows = await prisma.follow.findMany({
      where: { followerId: user.id, followingId: { in: authorIds } },
      select: { followingId: true },
    });
    const followedIds = new Set(authorFollows.map((f) => f.followingId));

    const shaped = await shapePosts(rawPosts, user, followedIds);
    shaped.sort((a, b) => (trendRank.get(b.id) || 0) - (trendRank.get(a.id) || 0));

    return NextResponse.json({
      posts: shaped.slice(0, 30),
      tab,
      viewerSchool: user.school || null,
      nextCursor: null,
    });
  }

  let authorFilter;
  if (tab === "following") {
    // Only creators the viewer follows. Nobody followed means an empty list.
    authorFilter = { authorId: { in: followingIds } };
  } else if (tab === "school") {
    // Only meaningful if the viewer has set a school; otherwise nobody
    // matches and the tab just shows empty rather than erroring.
    authorFilter = user.school
      ? { author: { school: user.school } }
      : { authorId: { in: [] } };
  } else {
    // "For You" and "Explore": everyone's public posts, including people
    // the viewer follows and friends.
    authorFilter = {};
  }

  // Every condition is its own entry in AND, so none can overwrite another.
  const where = {
    isPrivate: false,
    isDraft: false,
    AND: [
      authorFilter,
      { author: visibleAuthor },
      ...(hiddenIds.length ? [{ authorId: { notIn: hiddenIds } }] : []),
    ],
  };

  // ── Following: newest first, only people you follow ───────────
  if (tab === "following") {
    const posts = await prisma.feedPost.findMany({
      take: PAGE_SIZE,
      where,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: FEED_AUTHOR_SELECT },
        _count: { select: { comments: true, saves: true } },
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
      nextCursor: posts.length === PAGE_SIZE ? posts[posts.length - 1].id : null,
    });
  }

  // ── For You / Explore / School: ranked, school-first ──────────
  // Takes the newest posts, scores each one (how school-related it is,
  // how well it did, and whether the creator is a top student), sorts by
  // that score, and serves them a page at a time. The cursor here is just
  // how many posts have already been served.
  const pool = await prisma.feedPost.findMany({
    take: POOL_SIZE,
    where,
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: FEED_AUTHOR_SELECT },
      _count: { select: { comments: true, saves: true } },
      saves: { where: { userId: user.id }, select: { id: true } },
    },
  });

  // Older posts Syna hasn't read yet get scored a few at a time in the
  // background, so the feed gets better as people use it.
  scoreInBackground(pool.filter((p) => !p.scoredAt).slice(0, 4).map((p) => p.id));

  const boosts = creatorBoosts(pool);
  const ranked = pool
    .map((p) => ({ p, rank: rankScore(p, boosts, tab) }))
    .sort((a, b) => b.rank - a.rank || new Date(b.p.createdAt) - new Date(a.p.createdAt));

  const offset = Math.max(0, parseInt(cursor || "0", 10) || 0);
  const pagePosts = ranked.slice(offset, offset + PAGE_SIZE).map((r) => r.p);
  const nextOffset = offset + PAGE_SIZE;

  const authorIds = [...new Set(pagePosts.map((p) => p.authorId))];
  const authorFollows = await prisma.follow.findMany({
    where: { followerId: user.id, followingId: { in: authorIds } },
    select: { followingId: true },
  });
  const followedIds = new Set(authorFollows.map((f) => f.followingId));

  const shaped = await shapePosts(pagePosts, user, followedIds);

  return NextResponse.json({
    posts: shaped,
    tab,
    viewerSchool: user.school || null,
    nextCursor: nextOffset < ranked.length ? String(nextOffset) : null,
  });
}

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.isGuest) return guestBlockedResponse();

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

  // Syna reads the new post in the background and scores how school-related
  // it is. Drafts are scored later, once they're published and show up in the feed.
  if (!post.isDraft) scoreInBackground([post.id]);

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