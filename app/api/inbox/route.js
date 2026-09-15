import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionUserId } from "@/lib/auth";

const prisma = new PrismaClient();

export async function GET() {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    include: { userA: true, userB: true },
  });

  const conversations = await Promise.all(
    friendships.map(async (f) => {
      const friend = f.userAId === userId ? f.userB : f.userA;

      const lastMessage = await prisma.directMessage.findFirst({
        where: {
          OR: [
            { senderId: userId, receiverId: friend.id },
            { senderId: friend.id, receiverId: userId },
          ],
        },
        orderBy: { createdAt: "desc" },
      });

      const unreadCount = await prisma.directMessage.count({
        where: { senderId: friend.id, receiverId: userId, read: false },
      });

      return { friend, lastMessage, unreadCount };
    })
  );

  conversations.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt || 0;
    const bTime = b.lastMessage?.createdAt || 0;
    return new Date(bTime) - new Date(aTime);
  });

  return NextResponse.json({ conversations });
}