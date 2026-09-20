import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const targetId = params.userId;
  if (targetId === user.id) {
    return NextResponse.json({ error: "You can't block yourself." }, { status: 400 });
  }

  const existing = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId: targetId } },
  });

  if (existing) {
    await prisma.block.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, blocked: false });
  }

  await prisma.block.create({ data: { blockerId: user.id, blockedId: targetId } });

  // Blocking severs the follow relationship in both directions, matching
  // how most platforms treat a block — it's not just a mute.
  await prisma.follow.deleteMany({
    where: {
      OR: [
        { followerId: user.id, followingId: targetId },
        { followerId: targetId, followingId: user.id },
      ],
    },
  });

  return NextResponse.json({ ok: true, blocked: true });
}