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

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    include: { tasks: { orderBy: { createdAt: "asc" } } },
  });
  if (!project || !(await canAccess(project, user.id))) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, project });
}

export async function PATCH(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const project = await prisma.project.findUnique({ where: { id: params.projectId } });
  if (!project || !(await canAccess(project, user.id))) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const { name, description, status } = await req.json().catch(() => ({}));
  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (description !== undefined) data.description = description?.trim() || null;
  if (status !== undefined) data.status = status;

  const updated = await prisma.project.update({ where: { id: params.projectId }, data });
  return NextResponse.json({ ok: true, project: updated });
}

export async function DELETE(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const project = await prisma.project.findUnique({ where: { id: params.projectId } });
  if (!project || !(await canAccess(project, user.id))) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  await prisma.project.delete({ where: { id: params.projectId } });
  return NextResponse.json({ ok: true });
}