import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { checkFriendAllowed } from "@/lib/minorSafety";

// Only public profile fields are ever sent to the browser.
// Never send the whole user row: it has the password hash, email,
// birthday and reset codes.
const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarDataUrl: true,
  online: true,
  lastSeenAt: true,
  verified: true,
};

export async function POST(req) {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const receiverUsername = body?.receiverUsername;
  if (!receiverUsername || typeof receiverUsername !== "string") {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const receiver = await prisma.user.findUnique({
    where: { username: receiverUsername },
    select: { id: true },
  });
  if (!receiver) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (receiver.id === userId) {
    return NextResponse.json({ error: "Can't add yourself" }, { status: 400 });
  }

  // Blocked either way: same generic answer as "not found" so nobody can
  // tell they were blocked.
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: receiver.id },
        { blockerId: receiver.id, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  if (block) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Minors and adults can't become friends.
  const allowed = await checkFriendAllowed(userId, receiver.id);
  if (!allowed.ok) {
    return NextResponse.json({ error: allowed.error }, { status: allowed.status });
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
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Request already pending" }, { status: 400 });
  }

  const request = await prisma.friendRequest.create({
    data: { senderId: userId, receiverId: receiver.id },
    include: { receiver: { select: publicUserSelect } },
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
    include: { sender: { select: publicUserSelect } },
    orderBy: { createdAt: "desc" },
  });

  const outgoing = await prisma.friendRequest.findMany({
    where: { senderId: userId, status: "pending" },
    include: { receiver: { select: publicUserSelect } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ incoming, outgoing });
}