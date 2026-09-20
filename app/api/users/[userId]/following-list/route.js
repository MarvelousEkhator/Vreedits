import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function GET(req, { params }) {
  const viewer = await requireUser();
  if (!viewer) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const target = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, hideFollowing: true },
  });
  if (!target) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const isOwner = viewer.id === target.id;
  if (target.hideFollowing && !isOwner) {
    return NextResponse.json({ error: "This list is private.", following: [] }, { status: 403 });
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