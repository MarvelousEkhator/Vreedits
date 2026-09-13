import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { prisma } from "@/lib/prisma";

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Business name is required." }, { status: 400 });

  const business = await prisma.business.create({
    data: {
      name,
      ownerId: user.id,
      members: { create: { userId: user.id, role: "owner" } },
    },
    include: { members: true },
  });

  return NextResponse.json({ business });
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const businesses = await prisma.business.findMany({
    where: { members: { some: { userId: user.id } } },
    include: { members: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ businesses });
}