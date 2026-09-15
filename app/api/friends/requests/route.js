import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionUserId } from "@/lib/auth";

const prisma = new PrismaClient();

export async function POST(req) {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { receiverUsername } = await req.json();
  if (!receiverUsername) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const receiver = await prisma.user.findUnique({
    where: { username: receiverUsername },
  });
  if (!receiver) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (receiver.id === userId) {
    return NextResponse.json({ error: "Can't add yourself" }, { status: 400 });
  }

  const [a, b] = [userId, receiver.id].sort();
  const existingFriendship = await prisma.friendship.findUnique({
    where: { userAId_userBId: { userAId: a, userBId: b } },
  });
  if (existingFriendship) {
    return NextResponse.json({ error: "Already friends" }, { status: 400 });
  }

  const existing = await prisma.friendRequest.findFirst({
    where: {
      OR: [
        { senderId: userId, receiverId: receiver.id },
        { senderId: receiver.id, receiverId: userId },
      ],
      status: "pending",
    },
  });
  if (existing) {
    return NextResponse.json({ error: "Request already pending" }, { status: 400 });
  }

  const request = await prisma.friendRequest.create({
    data: { senderId: userId, receiverId: receiver.id },
    include: { receiver: true },
  });

  return NextResponse.json({ request });
}

export async function GET() {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const incoming = await prisma.friendRequest.findMany({
    where: { receiverId: userId, status: "pending" },
    include: { sender: true },
    orderBy: { createdAt: "desc" },
  });

  const outgoing = await prisma.friendRequest.findMany({
    where: { senderId: userId, status: "pending" },
    include: { receiver: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ incoming, outgoing });
}