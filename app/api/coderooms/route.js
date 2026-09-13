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
    where = { hostId: user.id, businessId: null };
  }

  const rooms = await prisma.codeRoom.findMany({ where, orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ ok: true, rooms });
}

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { name, businessId, projectId } = await req.json().catch(() => ({}));
  if (!name?.trim()) return NextResponse.json({ error: "Room name is required." }, { status: 400 });

  if (businessId && !(await requireMember(businessId, user.id))) {
    return NextResponse.json({ error: "Not a member of this business." }, { status: 403 });
  }

  const room = await prisma.codeRoom.create({
    data: {
      name: name.trim(),
      hostId: user.id,
      businessId: businessId || null,
      projectId: projectId || null,
      code: "// Start coding together!\n",
    },
  });

  return NextResponse.json({ ok: true, room });
}