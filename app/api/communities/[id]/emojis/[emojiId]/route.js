import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function canManage(community, userId) {
  return community.ownerId === userId || community.adminIds.includes(userId);
}

export async function DELETE(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canManage(community, userId)) {
      return NextResponse.json({ error: "You don't have permission to delete emojis or stickers." }, { status: 403 });
    }

    const emoji = await prisma.communityEmoji.findUnique({ where: { id: params.emojiId } });
    if (!emoji || emoji.communityId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.communityEmoji.delete({ where: { id: params.emojiId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/communities/[id]/emojis/[emojiId] error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}