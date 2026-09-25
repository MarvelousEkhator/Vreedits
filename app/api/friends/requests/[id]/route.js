import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionUserId } from "@/lib/auth";

const prisma = new PrismaClient();

export async function PATCH(req, { params }) {
  const { id } = params;
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { action } = await req.json(); // "accept" | "decline"
  if (!["accept", "decline"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const request = await prisma.friendRequest.findUnique({ where: { id } });
  if (!request || request.receiverId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "decline") {
    await prisma.friendRequest.update({
      where: { id },
      data: { status: "declined" },
    });
    return NextResponse.json({ status: "declined" });
  }

  const [a, b] = [request.senderId, request.receiverId].sort();

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
}

// Unsend: the sender cancels a request they sent, before it's been
// accepted or declined. Only the original sender can do this, and only
// while it's still pending — once accepted/declined there's nothing to
// "unsend" (the accepted case has already created a Friendship, and
// declining is the receiver's call, not the sender's to undo).
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