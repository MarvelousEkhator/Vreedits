import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Returns { userId, community } for owners/admins, or { error: NextResponse }.
export async function requireCommunityAdmin(communityId) {
  const userId = getSessionUserId();
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const community = await prisma.community.findUnique({ where: { id: communityId } });
  if (!community) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  const isAdmin = community.ownerId === userId || (community.adminIds || []).includes(userId);
  if (!isAdmin) {
    return { error: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  }
  return { userId, community };
}

// Never throws: an audit-log failure must not break the action being logged.
export async function logAudit({ communityId, actorId, action, targetType = null, targetId = null, summary }) {
  try {
    await prisma.auditLogEntry.create({
      data: { communityId, actorId, action, targetType, targetId, summary },
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}