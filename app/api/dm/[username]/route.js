import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionUserId } from "@/lib/auth";

const prisma = new PrismaClient();

async function requireFriend(userId, otherUsername) {
  const other = await prisma.user.findUnique({ where: { username: otherUsername } });
  if (!other) return { error: "User not found", status: 404 };

  const [a, b] = [userId, other.id].sort();
  const friendship = await prisma.friendship.findUnique({
    where: { userAId_userBId: { userAId: a, userBId: b } },
  });
  if (!friendship) return { error: "Not friends", status: 403 };

  return { other };
}

export async function GET(req, { params }) {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const check = await requireFriend(userId, params.username);
  if (check.error) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: check.other.id },
        { senderId: check.other.id, receiverId: userId },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  await prisma.directMessage.updateMany({
    where: { senderId: check.other.id, receiverId: userId, read: false },
    data: { read: true, readAt: new Date() },
  });

  return NextResponse.json({ messages, otherUser: check.other });
}

export async function POST(req, { params }) {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const check = await requireFriend(userId, params.username);
  if (check.error) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { content } = await req.json();
  if (!content || !content.trim()) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  const message = await prisma.directMessage.create({
    data: { senderId: userId, receiverId: check.other.id, content: content.trim() },
  });

  return NextResponse.json({ message });
}