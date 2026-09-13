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

  const project = await prisma.project.findUnique({ where: { id: params.projectId } });
  if (!project || !(await canAccess(project, user.id))) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const codeRooms = await prisma.codeRoom.findMany({
    where: { projectId: params.projectId },
    orderBy: { updatedAt: "desc" },
    include: { host: { select: { id: true, username: true, displayName: true } } },
  });

  return NextResponse.json({ ok: true, codeRooms });
}

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const project = await prisma.project.findUnique({ where: { id: params.projectId } });
  if (!project || !(await canAccess(project, user.id))) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const { name, language } = await req.json().catch(() => ({}));
  if (!name?.trim()) {
    return NextResponse.json({ error: "Room name is required." }, { status: 400 });
  }

  const codeRoom = await prisma.codeRoom.create({
    data: {
      projectId: params.projectId,
      businessId: project.businessId,
      hostId: user.id,
      name: name.trim(),
      language: language || "javascript",
      code: "",
    },
  });

  return NextResponse.json({ ok: true, codeRoom });
}