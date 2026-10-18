import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionUserId } from "@/lib/auth";

const prisma = new PrismaClient();

const MAX_IMAGES = 6;
const MAX_IMAGE_CHARS = 2_500_000;

async function isBlockedEitherWay(userId, otherId) {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: otherId },
        { blockerId: otherId, blockedId: userId },
      ],
    },
  });
  return !!block;
}

async function requireFriend(userId, otherUsername) {
  const other = await prisma.user.findUnique({ where: { username: otherUsername } });
  if (!other) return { error: "User not found", status: 404 };

  // Messaging yourself needs no friendship — you're always "friends" with
  // your own notes-to-self thread, and blocking is meaningless here too.
  if (other.id === userId) return { other };

  if (await isBlockedEitherWay(userId, other.id)) {
    return { error: "This conversation is not available.", status: 403 };
  }

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

  // If this user cleared the conversation on their side, only show
  // messages sent after that point — the other person's copy is untouched.
  const hide = await prisma.conversationHide.findUnique({
    where: { userId_otherUserId: { userId, otherUserId: check.other.id } },
  });

  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: check.other.id },
        { senderId: check.other.id, receiverId: userId },
      ],
      ...(hide ? { createdAt: { gt: hide.hiddenBefore } } : {}),
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

  const body = await req.json();
  const text = typeof body.content === "string" ? body.content.trim() : "";
  const images = Array.isArray(body.images)
    ? body.images.filter((u) => typeof u === "string" && u.startsWith("data:image/") && u.length <= MAX_IMAGE_CHARS).slice(0, MAX_IMAGES)
    : [];
  if (!text && images.length === 0) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  // Pictures, reactions and the pin all live in "attachments" (no database change needed):
  // { images: [dataUrl], reactions: { "emoji": [userId] }, pinned: true|false }
  const message = await prisma.directMessage.create({
    data: {
      senderId: userId,
      receiverId: check.other.id,
      content: text || "\u{1F4F7} Photo",
      attachments: images.length ? { images } : undefined,
    },
  });

  return NextResponse.json({ message });
}

// React to a message or pin / unpin it.
// Body: { messageId, action: "react" | "pin", emoji? }
export async function PATCH(req, { params }) {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const check = await requireFriend(userId, params.username);
  if (check.error) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { messageId, action, emoji } = await req.json();
  const msg = messageId
    ? await prisma.directMessage.findFirst({
        where: {
          id: messageId,
          OR: [
            { senderId: userId, receiverId: check.other.id },
            { senderId: check.other.id, receiverId: userId },
          ],
        },
      })
    : null;
  if (!msg) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const data = msg.attachments && typeof msg.attachments === "object" && !Array.isArray(msg.attachments)
    ? { ...msg.attachments }
    : {};

  if (action === "react") {
    if (typeof emoji !== "string" || !emoji || emoji.length > 16) {
      return NextResponse.json({ error: "Bad emoji" }, { status: 400 });
    }
    const reactions = { ...(data.reactions || {}) };
    const list = Array.isArray(reactions[emoji]) ? [...reactions[emoji]] : [];
    const at = list.indexOf(userId);
    if (at >= 0) list.splice(at, 1);
    else list.push(userId);
    if (list.length) reactions[emoji] = list;
    else delete reactions[emoji];
    data.reactions = reactions;
  } else if (action === "pin") {
    data.pinned = !data.pinned;
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const message = await prisma.directMessage.update({
    where: { id: msg.id },
    data: { attachments: data },
  });
  return NextResponse.json({ message });
}

// "Delete conversation" — hides everything up to now, for this user only.
export async function DELETE(req, { params }) {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // /api/dm/NAME?messageId=ID deletes one message you sent (for both of you).
  const oneId = new URL(req.url).searchParams.get("messageId");
  if (oneId) {
    const gone = await prisma.directMessage.deleteMany({ where: { id: oneId, senderId: userId } });
    if (gone.count === 0) {
      return NextResponse.json({ error: "You can only delete your own messages." }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  }

  const other = await prisma.user.findUnique({ where: { username: params.username } });
  if (!other) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.conversationHide.upsert({
    where: { userId_otherUserId: { userId, otherUserId: other.id } },
    update: { hiddenBefore: new Date() },
    create: { userId, otherUserId: other.id, hiddenBefore: new Date() },
  });

  return NextResponse.json({ ok: true });
}