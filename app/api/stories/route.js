import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";
import { checkImages } from "@/lib/imageSafety";
import { postingPauseMessage, addStrike } from "@/lib/schoolScore";
import { ageGroupFromDob, isCrossAgeContact } from "@/lib/minorSafety";

const STORY_LIFESPAN_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_CHARS = 7_000_000;
const MAX_CAPTION_CHARS = 200;
const MAX_STORIES_PER_DAY = 10;

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.isGuest) return guestBlockedResponse();

  const body = await req.json().catch(() => ({}));
  const mediaUrl = typeof body?.mediaUrl === "string" ? body.mediaUrl : "";
  const caption = typeof body?.caption === "string" ? body.caption.trim().slice(0, MAX_CAPTION_CHARS) : "";

  if (!mediaUrl.trim()) {
    return NextResponse.json({ error: "A photo is required." }, { status: 400 });
  }
  // Photos only for now: videos can't be checked yet.
  if (!mediaUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "Stories are photos only for now." }, { status: 400 });
  }
  if (mediaUrl.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ error: "That photo is too large. Please use a smaller one." }, { status: 413 });
  }

  const recent = await prisma.story.count({
    where: { authorId: user.id, createdAt: { gte: new Date(Date.now() - STORY_LIFESPAN_MS) } },
  });
  if (recent >= MAX_STORIES_PER_DAY) {
    return NextResponse.json({ error: "You've reached today's story limit." }, { status: 429 });
  }

  // Same posting pause as the feed (after repeated unsafe uploads).
  const paused = await postingPauseMessage(user.id);
  if (paused) {
    return NextResponse.json({ error: paused, blocked: true }, { status: 403 });
  }

  const scan = await checkImages([mediaUrl]);
  if (!scan.ok) {
    if (scan.code === "unsafe") {
      const strike = await addStrike(user.id);
      return NextResponse.json({ error: scan.message + strike, rejected: true }, { status: 422 });
    }
    return NextResponse.json(
      { error: scan.message },
      { status: scan.code === "unavailable" ? 503 : 422 }
    );
  }

  const story = await prisma.story.create({
    data: {
      authorId: user.id,
      mediaUrl,
      mediaType: "image",
      caption: caption || null,
    },
  });

  return NextResponse.json({
    ok: true,
    story: {
      id: story.id,
      authorId: story.authorId,
      mediaUrl: story.mediaUrl,
      mediaType: story.mediaType,
      caption: story.caption,
      createdAt: story.createdAt,
      viewCount: 0,
      viewedByMe: false,
    },
  });
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.isGuest) return NextResponse.json({ rail: [] });

  const cutoff = new Date(Date.now() - STORY_LIFESPAN_MS);

  // Friends in either direction, minus anyone blocked either way.
  const [friendships, blocks] = await Promise.all([
    prisma.friendship.findMany({
      where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
    }),
    prisma.block.findMany({
      where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
      select: { blockerId: true, blockedId: true },
    }),
  ]);
  const blockedIds = new Set(
    blocks.map((b) => (b.blockerId === user.id ? b.blockedId : b.blockerId))
  );
  const friendIds = friendships
    .map((f) => (f.userAId === user.id ? f.userBId : f.userAId))
    .filter((id) => !blockedIds.has(id));

  // Minors and adults never see each other's stories, even if an old
  // friendship between them still exists.
  const people = await prisma.user.findMany({
    where: { id: { in: [user.id, ...friendIds] } },
    select: { id: true, dateOfBirth: true },
  });
  const dobById = new Map(people.map((p) => [p.id, p.dateOfBirth]));
  const myGroup = ageGroupFromDob(dobById.get(user.id));
  const visibleFriendIds = friendIds.filter(
    (id) => !isCrossAgeContact(myGroup, ageGroupFromDob(dobById.get(id)))
  );

  const authorIds = [user.id, ...visibleFriendIds];

  const stories = await prisma.story.findMany({
    where: { authorId: { in: authorIds }, createdAt: { gte: cutoff } },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, username: true, displayName: true, avatarDataUrl: true } } },
  });

  // Group into one rail entry per author, most recent story first.
  // The list of who viewed a story is never sent; only a count and
  // whether you have seen it.
  const grouped = {};
  for (const story of stories) {
    if (!grouped[story.authorId]) {
      grouped[story.authorId] = { author: story.author, stories: [] };
    }
    grouped[story.authorId].stories.push({
      id: story.id,
      authorId: story.authorId,
      mediaUrl: story.mediaUrl,
      mediaType: story.mediaType,
      caption: story.caption,
      createdAt: story.createdAt,
      viewCount: story.viewedBy.length,
      viewedByMe: story.viewedBy.includes(user.id),
    });
  }

  return NextResponse.json({ rail: Object.values(grouped) });
}