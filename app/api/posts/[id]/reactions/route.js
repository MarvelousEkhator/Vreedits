import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionUserId } from "@/lib/auth";

const prisma = new PrismaClient();

export async function POST(req, { params }) {
  const { id } = params;
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { emoji } = await req.json();
  if (!emoji) {
    return NextResponse.json({ error: "Missing emoji" }, { status: 400 });
  }

  const existing = await prisma.postReaction.findUnique({
    where: { postId_userId_emoji: { postId: id, userId, emoji } },
  });

  if (existing) {
    await prisma.postReaction.delete({ where: { id: existing.id } });
    return NextResponse.json({ toggled: "off", emoji });
  }

  const reaction = await prisma.postReaction.create({
    data: { postId: id, userId, emoji },
  });

  return NextResponse.json({ toggled: "on", reaction });
}

export async function GET(req, { params }) {
  const { id } = params;
  const reactions = await prisma.postReaction.findMany({
    where: { postId: id },
    select: { emoji: true, userId: true },
  });

  const grouped = {};
  for (const r of reactions) {
    if (!grouped[r.emoji]) grouped[r.emoji] = [];
    grouped[r.emoji].push(r.userId);
  }

  return NextResponse.json({ grouped });
}