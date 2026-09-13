import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { prisma } from "@/lib/prisma";

async function canAccess(room, userId) {
  if (room.hostId === userId) return true;
  if (!room.businessId) return false;
  const membership = await prisma.teamMember.findUnique({
    where: { businessId_userId: { businessId: room.businessId, userId } },
  });
  return !!membership;
}

export async function GET(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const room = await prisma.codeRoom.findUnique({ where: { id: params.roomId } });
  if (!room || !(await canAccess(room, user.id))) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, room });
}

export async function PATCH(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const room = await prisma.codeRoom.findUnique({ where: { id: params.roomId } });
  if (!room || !(await canAccess(room, user.id))) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const { code, language } = await req.json().catch(() => ({}));
  const data = {};
  if (typeof code === "string") data.code = code;
  if (language === "javascript" || language === "python" || language === "html") data.language = language;

  const updated = await prisma.codeRoom.update({ where: { id: params.roomId }, data });
  return NextResponse.json({ ok: true, room: updated });
}