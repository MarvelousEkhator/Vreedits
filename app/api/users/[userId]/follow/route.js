import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

// Toggles a follow relationship: creates it if it doesn't exist, removes
// it if it does. Uses the existing Follow model (follower -> following).
export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const targetId = params.userId;
  if (targetId === user.id) {
    return NextResponse.json({ error: "You can't follow yourself." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: user.id, followingId: targetId } },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, following: false });
  }

  await prisma.follow.create({ data: { followerId: user.id, followingId: targetId } });
  return NextResponse.json({ ok: true, following: true });
}
