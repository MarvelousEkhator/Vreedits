import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { checkFriendAllowed } from "@/lib/minorSafety";

export async function PATCH(req, { params }) {
  const { id } = params;
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action; // "accept" | "decline"
  if (!["accept", "decline"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const request = await prisma.friendRequest.findUnique({ where: { id } });
  if (!request || request.receiverId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only pending requests can be answered.
  if (request.status !== "pending") {
    return NextResponse.json({ error: "This request has already been answered." }, { status: 400 });
  }

  if (action === "decline") {
    await prisma.friendRequest.update({
      where: { id },
      data: { status: "declined" },
    });
    return NextResponse.json({ status: "declined" });
  }

  // ── Accepting: re-check the safety rules, because the request may be old. ──

  // Blocked either way since the request was sent.
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: request.senderId, blockedId: request.receiverId },
        { blockerId: request.receiverId, blockedId: request.senderId },
      ],
    },
    select: { id: true },
  });
  if (block) {
    await prisma.friendRequest.update({ where: { id }, data: { status: "declined" } });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Minors and adults can't become friends. The request is closed so it
  // no longer shows up in anyone's inbox.
  const allowed = await checkFriendAllowed(request.senderId, request.receiverId);
  if (!allowed.ok) {
    await prisma.friendRequest.update({ where: { id }, data: { status: "declined" } });
    return NextResponse.json({ error: "You can't accept this request." }, { status: allowed.status });
  }

  const [a, b] = [request.senderId, request.receiverId].sort();

  // If they somehow already are friends, just close the request.
  const existing = await prisma.friendship.findUnique({
    where: { userAId_userBId: { userAId: a, userBId: b } },
  });
  if (existing) {
    await prisma.friendRequest.update({ where: { id }, data: { status: "accepted" } });
    return NextResponse.json({ status: "accepted", friendship: existing });
  }

  try {
    const [, friendship] = await prisma.$transaction([
      prisma.friendRequest.update({
        where: { id },
        data: { status: "accepted" },
      }),
      prisma.friendship.create({
        data: { userAId: a, userBId: b },
      }),
    ]);
    return NextResponse.json({ status: "accepted", friendship });
  } catch (err) {
    // Two taps at the same moment: the friendship already exists.
    if (err?.code === "P2002") {
      return NextResponse.json({ status: "accepted" });
    }
    console.error("PATCH /api/friends/requests/[id] error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

// Unsend: the sender cancels a request they sent, before it's been
// accepted or declined. Only the original sender can do this, and only
// while it's still pending.
export async function DELETE(req, { params }) {
  const { id } = params;
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const request = await prisma.friendRequest.findUnique({ where: { id } });
  if (!request || request.senderId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (request.status !== "pending") {
    return NextResponse.json({ error: "This request has already been responded to." }, { status: 400 });
  }

  await prisma.friendRequest.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}