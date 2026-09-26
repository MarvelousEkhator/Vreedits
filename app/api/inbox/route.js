import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionUserId } from "@/lib/auth";

const prisma = new PrismaClient();

// Only the fields the inbox list actually needs — never the full user row,
// which would otherwise leak passwordHash, resetCode, verificationCode, etc.
// straight into the response JSON.
const FRIEND_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarDataUrl: true,
  online: true,
};

export async function GET() {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    include: {
      userA: { select: FRIEND_SELECT },
      userB: { select: FRIEND_SELECT },
    },
  });

  // This user's own "delete conversation" markers — a friend in here means
  // the thread was cleared on this user's side as of hiddenBefore.
  const hides = await prisma.conversationHide.findMany({ where: { userId } });
  const hideByFriendId = new Map(hides.map((h) => [h.otherUserId, h.hiddenBefore]));

  const conversations = await Promise.all(
    friendships.map(async (f) => {
      const friend = f.userAId === userId ? f.userB : f.userA;
      const hiddenBefore = hideByFriendId.get(friend.id);

      const lastMessage = await prisma.directMessage.findFirst({
        where: {
          OR: [
            { senderId: userId, receiverId: friend.id },
            { senderId: friend.id, receiverId: userId },
          ],
          ...(hiddenBefore ? { createdAt: { gt: hiddenBefore } } : {}),
        },
        orderBy: { createdAt: "desc" },
      });

      const unreadCount = await prisma.directMessage.count({
        where: {
          senderId: friend.id,
          receiverId: userId,
          read: false,
          ...(hiddenBefore ? { createdAt: { gt: hiddenBefore } } : {}),
        },
      });

      return { friend, lastMessage, unreadCount, hiddenBefore };
    })
  );

  // A conversation that was deleted and has had no new messages since
  // shouldn't reappear in the inbox — that's what "delete" is supposed to
  // mean. A brand-new friendship (never hidden, never messaged) still shows
  // up normally so the person can say hi.
  const visible = conversations.filter(({ lastMessage, hiddenBefore }) => {
    if (!hiddenBefore) return true;
    return !!lastMessage;
  });

  visible.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt || 0;
    const bTime = b.lastMessage?.createdAt || 0;
    return new Date(bTime) - new Date(aTime);
  });

  const result = visible.map(({ friend, lastMessage, unreadCount }) => ({ friend, lastMessage, unreadCount }));

  return NextResponse.json({ conversations: result });
}