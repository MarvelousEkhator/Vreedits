import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function GET(req, { params }) {
  const viewer = await requireUser();
  if (!viewer) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const target = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Followers list isn't gated by hideFollowing — that setting only hides
  // who *you* follow, not who follows *you*. Most platforms treat these
  // as separate visibility concerns; if you want followers hidden too,
  // say so and I'll add a matching toggle.
  const follows = await prisma.follow.findMany({
    where: { followingId: target.id },
    include: {
      follower: { select: { id: true, username: true, displayName: true, avatarDataUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ followers: follows.map((f) => f.follower) });
}