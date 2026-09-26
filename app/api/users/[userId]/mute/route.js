import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const targetId = params.userId;
  if (targetId === user.id) {
    return NextResponse.json({ error: "You can't mute yourself." }, { status: 400 });
  }

  const existing = await prisma.mutedCreator.findUnique({
    where: { userId_mutedUserId: { userId: user.id, mutedUserId: targetId } },
  });

  if (existing) {
    await prisma.mutedCreator.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, muted: false });
  }

  await prisma.mutedCreator.create({ data: { userId: user.id, mutedUserId: targetId } });
  return NextResponse.json({ ok: true, muted: true });
}