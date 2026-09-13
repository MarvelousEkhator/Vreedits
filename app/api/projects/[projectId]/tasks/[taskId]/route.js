import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = ["todo", "in_progress", "done"];

async function canAccess(record, userId) {
  if (record.userId === userId) return true;
  if (!record.businessId) return false;
  const membership = await prisma.teamMember.findUnique({
    where: { businessId_userId: { businessId: record.businessId, userId } },
  });
  return !!membership;
}

export async function PATCH(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const task = await prisma.projectTask.findUnique({
    where: { id: params.taskId },
    include: { project: true },
  });
  if (!task || task.projectId !== params.projectId || !(await canAccess(task.project, user.id))) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const { title, status, dueDate } = await req.json().catch(() => ({}));
  const data = {};
  if (title !== undefined) data.title = title.trim();
  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    data.status = status;
  }
  if (dueDate !== undefined) data.dueDate = dueDate || null;

  const updated = await prisma.projectTask.update({ where: { id: params.taskId }, data });
  return NextResponse.json({ ok: true, task: updated });
}

export async function DELETE(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const task = await prisma.projectTask.findUnique({
    where: { id: params.taskId },
    include: { project: true },
  });
  if (!task || task.projectId !== params.projectId || !(await canAccess(task.project, user.id))) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  await prisma.projectTask.delete({ where: { id: params.taskId } });
  return NextResponse.json({ ok: true });
}