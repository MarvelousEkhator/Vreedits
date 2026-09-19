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
      return NextResponse.json({ error: "You don't have permission to view safety settings." }, { status: 403 });
    }

    return NextResponse.json({
      safety: {
        verificationLevel: community.verificationLevel,
        raidProtectionOn: community.raidProtectionOn,
        maxMentionsPerMsg: community.maxMentionsPerMsg,
        joinLockdown: community.joinLockdown,
      },
    });
  } catch (err) {
    console.error("GET /api/communities/[id]/safety error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canManage(community, userId)) {
      return NextResponse.json({ error: "You don't have permission to edit safety settings." }, { status: 403 });
    }

    const body = await request.json();
    const data = {};

    if (["none", "low", "medium", "high"].includes(body.verificationLevel)) {
      data.verificationLevel = body.verificationLevel;
    }
    if (typeof body.raidProtectionOn === "boolean") data.raidProtectionOn = body.raidProtectionOn;
    if (typeof body.joinLockdown === "boolean") data.joinLockdown = body.joinLockdown;
    if (Number.isInteger(body.maxMentionsPerMsg) && body.maxMentionsPerMsg >= 0 && body.maxMentionsPerMsg <= 100) {
      data.maxMentionsPerMsg = body.maxMentionsPerMsg;
    }

    const updated = await prisma.community.update({ where: { id: params.id }, data });

    return NextResponse.json({
      safety: {
        verificationLevel: updated.verificationLevel,
        raidProtectionOn: updated.raidProtectionOn,
        maxMentionsPerMsg: updated.maxMentionsPerMsg,
        joinLockdown: updated.joinLockdown,
      },
    });
  } catch (err) {
    console.error("PATCH /api/communities/[id]/safety error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}