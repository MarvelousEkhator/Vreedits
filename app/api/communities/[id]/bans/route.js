import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function canManage(community, userId) {
  return community.ownerId === userId || community.adminIds.includes(userId);
}

export async function GET(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canManage(community, userId)) {
      return NextResponse.json({ error: "You don't have permission to view banned users." }, { status: 403 });
    }

    const bans = await prisma.communityBan.findMany({
      where: { communityId: params.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ bans });
  } catch (err) {
    console.error("GET /api/communities/[id]/bans error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canManage(community, userId)) {
      return NextResponse.json({ error: "You don't have permission to ban members." }, { status: 403 });
    }

    const body = await request.json();
    const targetUserId = body.userId;
    const reason = (body.reason || "").trim() || null;
    if (!targetUserId) return NextResponse.json({ error: "userId is required." }, { status: 400 });
    if (targetUserId === community.ownerId) {
      return NextResponse.json({ error: "You can't ban the community owner." }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return NextResponse.json({ error: "User not found." }, { status: 404 });

    const ban = await prisma.communityBan.upsert({
      where: { communityId_userId: { communityId: params.id, userId: targetUserId } },
      update: { reason, bannedById: userId },
      create: {
        communityId: params.id,
        userId: targetUserId,
        username: targetUser.username,
        reason,
        bannedById: userId,
      },
    });

    await prisma.community.update({
      where: { id: params.id },
      data: {
        memberIds: community.memberIds.filter((id) => id !== targetUserId),
        adminIds: community.adminIds.filter((id) => id !== targetUserId),
      },
    });

    await prisma.moderationAction.create({
      data: {
        communityId: params.id,
        moderatorId: userId,
        targetUserId,
        action: "ban",
        reason,
      },
    });

    return NextResponse.json({ ban });
  } catch (err) {
    console.error("POST /api/communities/[id]/bans error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}