import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { prisma } from "@/lib/prisma";

async function canAccess(record, userId) {
  if (record.userId === userId) return true;
  if (!record.businessId) return false;
  const membership = await prisma.teamMember.findUnique({
    where: { businessId_userId: { businessId: record.businessId, userId } },
  });
  return !!membership;
}

export async function GET(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const codeRoom = await prisma.codeRoom.findUnique({
    where: { id: params.roomId },
    include: { project: true, host: { select: { id: true, username: true, displayName: true } } },
  });
  if (!codeRoom || codeRoom.projectId !== params.projectId || !(await canAccess(codeRoom.project, user.id))) {
    return NextResponse.json({ error: "Code room not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, codeRoom });
}

export async function PATCH(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const codeRoom = await prisma.codeRoom.findUnique({
    where: { id: params.roomId },
    include: { project: true },
  });
  if (!codeRoom || codeRoom.projectId !== params.projectId || !(await canAccess(codeRoom.project, user.id))) {
    return NextResponse.json({ error: "Code room not found." }, { status: 404 });
  }

  const { name, language, code } = await req.json().catch(() => ({}));
  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (language !== undefined) data.language = language;
  if (code !== undefined) data.code = code;

  const updated = await prisma.codeRoom.update({ where: { id: params.roomId }, data });
  return NextResponse.json({ ok: true, codeRoom: updated });
}

export async function DELETE(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const codeRoom = await prisma.codeRoom.findUnique({
    where: { id: params.roomId },
    include: { project: true },
  });
  if (!codeRoom || codeRoom.projectId !== params.projectId || !(await canAccess(codeRoom.project, user.id))) {
    return NextResponse.json({ error: "Code room not found." }, { status: 404 });
  }

  await prisma.codeRoom.delete({ where: { id: params.roomId } });
  return NextResponse.json({ ok: true });
}