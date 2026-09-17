import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

const STORY_LIFESPAN_MS = 24 * 60 * 60 * 1000;

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { mediaUrl, mediaType, caption } = await req.json();
  if (!mediaUrl?.trim()) {
    return NextResponse.json({ error: "A media file is required." }, { status: 400 });
  }

  const story = await prisma.story.create({
    data: {
      authorId: user.id,
      mediaUrl,
      mediaType: mediaType === "video" ? "video" : "image",
      caption: caption?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true, story });
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const cutoff = new Date(Date.now() - STORY_LIFESPAN_MS);

  // Friends in either direction, plus the user's own stories.
  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
  });
  const friendIds = friendships.map((f) => (f.userAId === user.id ? f.userBId : f.userAId));
  const authorIds = [user.id, ...friendIds];

  const stories = await prisma.story.findMany({
    where: { authorId: { in: authorIds }, createdAt: { gte: cutoff } },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, username: true, displayName: true, avatarDataUrl: true } } },
  });

  // Group into one rail entry per author, most recent story first.
  const grouped = {};
  for (const story of stories) {
    if (!grouped[story.authorId]) {
      grouped[story.authorId] = { author: story.author, stories: [] };
    }
    grouped[story.authorId].stories.push(story);
  }

  return NextResponse.json({ rail: Object.values(grouped) });
}