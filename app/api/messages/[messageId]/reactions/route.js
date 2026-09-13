import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionUserId } from "@/lib/auth";

const prisma = new PrismaClient();

// POST — toggle a reaction on/off for the current user
export async function POST(req, { params }) {
  const { messageId } = params;
  const userId = getSessionUserId();

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { emoji } = await req.json();
  if (!emoji) {
    return NextResponse.json({ error: "Missing emoji" }, { status: 400 });
  }

  const existing = await prisma.messageReaction.findUnique({
    where: {
      messageId_userId_emoji: {
        messageId,
        userId,
        emoji,
      },
    },
  });

  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
    return NextResponse.json({ toggled: "off", emoji });
  }

  const reaction = await prisma.messageReaction.create({
    data: {
      messageId,
      userId,
      emoji,
    },
  });

  return NextResponse.json({ toggled: "on", reaction });
}

// GET — fetch grouped reaction counts for a message
export async function GET(req, { params }) {
  const { messageId } = params;

  const reactions = await prisma.messageReaction.findMany({
    where: { messageId },
    select: { emoji: true, userId: true },
  });

  const grouped = {};
  for (const r of reactions) {
    if (!grouped[r.emoji]) grouped[r.emoji] = [];
    grouped[r.emoji].push(r.userId);
  }

  return NextResponse.json({ grouped });
}