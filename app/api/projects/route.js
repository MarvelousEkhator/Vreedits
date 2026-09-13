import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { prisma } from "@/lib/prisma";

async function requireMember(businessId, userId) {
  return prisma.teamMember.findUnique({ where: { businessId_userId: { businessId, userId } } });
}

export async function GET(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("businessId");

  let where;
  if (businessId) {
    if (!(await requireMember(businessId, user.id))) {
      return NextResponse.json({ error: "Not a member of this business." }, { status: 403 });
    }
    where = { businessId };
  } else {
    where = { userId: user.id, businessId: null };
  }

  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { tasks: true } } },
  });

  return NextResponse.json({ ok: true, projects });
}

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { name, description, businessId } = await req.json().catch(() => ({}));
  if (!name?.trim()) {
    return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  }

  if (businessId && !(await requireMember(businessId, user.id))) {
    return NextResponse.json({ error: "Not a member of this business." }, { status: 403 });
  }

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      businessId: businessId || null,
      name: name.trim(),
      description: description?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true, project });
}