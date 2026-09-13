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

  const client = await prisma.client.findUnique({
    where: { id: params.clientId },
    include: { notes: { orderBy: { updatedAt: "desc" } } },
  });
  if (!client || !(await canAccess(client, user.id))) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, client });
}

export async function PATCH(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const client = await prisma.client.findUnique({ where: { id: params.clientId } });
  if (!client || !(await canAccess(client, user.id))) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  const { name, company, email, phone } = await req.json().catch(() => ({}));
  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (company !== undefined) data.company = company?.trim() || null;
  if (email !== undefined) data.email = email?.trim() || null;
  if (phone !== undefined) data.phone = phone?.trim() || null;

  const updated = await prisma.client.update({ where: { id: params.clientId }, data });
  return NextResponse.json({ ok: true, client: updated });
}

export async function DELETE(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const client = await prisma.client.findUnique({ where: { id: params.clientId } });
  if (!client || !(await canAccess(client, user.id))) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  // Notes stay — they just lose the client link (onDelete: SetNull).
  await prisma.client.delete({ where: { id: params.clientId } });
  return NextResponse.json({ ok: true });
}