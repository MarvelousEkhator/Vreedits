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

  // This list respects hideFollowing — if the profile owner has chosen to
  // hide who they follow, only they can see it; everyone else gets an
  // empty list rather than an error, so the UI doesn't break.
  const targetUser = await prisma.user.findUnique({
    where: { id: target.id },
    select: { hideFollowing: true },
  });
  if (targetUser?.hideFollowing && viewer.id !== target.id) {
    return NextResponse.json({ following: [] });
  }

  const follows = await prisma.follow.findMany({
    where: { followerId: target.id },
    include: {
      following: { select: { id: true, username: true, displayName: true, avatarDataUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ following: follows.map((f) => f.following) });
}