import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

const TRENDING_WINDOW_HOURS = 48;

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const cutoff = new Date(Date.now() - TRENDING_WINDOW_HOURS * 60 * 60 * 1000);

  const posts = await prisma.feedPost.findMany({
    where: { isPrivate: false, createdAt: { gte: cutoff } },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarDataUrl: true } },
      comments: { select: { id: true } },
      _count: { select: { comments: true } },
    },
  });

  // Score = likes + (comments * 2), weighted toward comments since they signal
  // deeper engagement than a like. Recency isn't factored in beyond the window
  // cutoff above — within that window, pure engagement wins.
  const ranked = posts
    .map((post) => ({
      ...post,
      score: post.likedBy.length + post._count.comments * 2,
    }))
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ posts: ranked });
}