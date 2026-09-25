import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageChannel } from "@/lib/channelAccess";
import { sanitizeAccessConfig } from "@/lib/channelAccess";

const VALID_TYPES = ["text", "announcement", "media", "forum", "voice", "event"];

export async function PATCH(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const channel = await prisma.channel.findUnique({ where: { id: params.channelId } });
    if (!channel || channel.communityId !== params.id) {
      return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    }

    const roles = await prisma.role.findMany({ where: { communityId: params.id } });
    if (!canManageChannel(channel, community, roles, userId)) {
      return NextResponse.json({ error: "You don't have permission to edit this channel." }, { status: 403 });
    }

    const body = await request.json();
    const data = {};

    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim().toLowerCase().replace(/\s+/g, "-");
    }
    if (typeof body.archived === "boolean") data.archived = body.archived;
    if (typeof body.canSendImages === "boolean") data.canSendImages = body.canSendImages;
    if (VALID_TYPES.includes(body.type)) data.type = body.type;

    if (body.viewAccess !== undefined) {
      const v = sanitizeAccessConfig(body.viewAccess);
      if (v) {
        data.viewAccess = v;
        data.visibility = v.type === "everyone" ? "public" : "restricted";
        data.allowedRoleIds = v.type === "roles" ? v.roleIds : [];
      }
    }
    if (body.sendAccess !== undefined) {
      const s = sanitizeAccessConfig(body.sendAccess);
      if (s) {
        data.sendAccess = s;
        data.canSendMessages = s.type !== "owner";
      }
    }
    if (body.threadAccess !== undefined) {
      const t = sanitizeAccessConfig(body.threadAccess);
      if (t) {
        data.threadAccess = t;
        data.canUseThreads = t.type !== "owner";
      }
    }
    if (body.manageAccess !== undefined) {
      const m = sanitizeAccessConfig(body.manageAccess);
      if (m) data.manageAccess = m;
    }

    const updated = await prisma.channel.update({
      where: { id: params.channelId },
      data,
    });

    return NextResponse.json({ channel: updated });
  } catch (err) {
    console.error("PATCH /api/communities/[id]/channels/[channelId] error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const channel = await prisma.channel.findUnique({ where: { id: params.channelId } });
    if (!channel || channel.communityId !== params.id) {
      return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    }

    const roles = await prisma.role.findMany({ where: { communityId: params.id } });
    if (!canManageChannel(channel, community, roles, userId)) {
      return NextResponse.json({ error: "You don't have permission to delete this channel." }, { status: 403 });
    }

    await prisma.channel.delete({ where: { id: params.channelId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/communities/[id]/channels/[channelId] error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}