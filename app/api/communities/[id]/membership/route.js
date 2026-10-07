// app/api/communities/[id]/membership/route.js
import { NextResponse } from "next/server";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";
import { prisma } from "@/lib/prisma";

export async function POST(request, { params }) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.isGuest) return guestBlockedResponse();
  const userId = user.id;

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) {
      return NextResponse.json({ error: "Community not found." }, { status: 404 });
    }

    if (community.memberIds.includes(userId)) {
      return NextResponse.json({ ok: true, alreadyMember: true });
    }

    if (community.joinMode === "invite_only" && community.ownerId !== userId) {
      return NextResponse.json(
        { error: "This community is invite-only. Ask an existing member for an invite link." },
        { status: 403 }
      );
    }

    const updated = await prisma.community.update({
      where: { id: params.id },
      data: { memberIds: { push: userId } },
    });

    return NextResponse.json({ ok: true, memberCount: updated.memberIds.length });
  } catch (err) {
    console.error("POST /api/communities/[id]/membership error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.isGuest) return guestBlockedResponse();
  const userId = user.id;

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) {
      return NextResponse.json({ error: "Community not found." }, { status: 404 });
    }

    if (community.ownerId === userId) {
      return NextResponse.json(
        { error: "You own this community and can't leave it. Transfer ownership or delete it instead." },
        { status: 400 }
      );
    }

    if (!community.memberIds.includes(userId)) {
      return NextResponse.json({ ok: true, alreadyLeft: true });
    }

    const updated = await prisma.community.update({
      where: { id: params.id },
      data: { memberIds: community.memberIds.filter((id) => id !== userId) },
    });

    return NextResponse.json({ ok: true, memberCount: updated.memberIds.length });
  } catch (err) {
    console.error("DELETE /api/communities/[id]/membership error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}