import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { prisma } from "@/lib/prisma";

async function requireMember(businessId, userId) {
  return prisma.teamMember.findUnique({ where: { businessId_userId: { businessId, userId } } });
}

export async function PATCH(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await requireMember(params.id, user.id))) {
    return NextResponse.json({ error: "Not a member of this business." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data = {};
  if (body.status) data.status = body.status;
  if (body.items) data.items = body.items;
  if (body.clientName) data.clientName = body.clientName.trim();

  const invoice = await prisma.invoice.update({
    where: { id: params.invoiceId },
    data,
  });
  return NextResponse.json({ invoice });
}

export async function DELETE(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await requireMember(params.id, user.id))) {
    return NextResponse.json({ error: "Not a member of this business." }, { status: 403 });
  }
  await prisma.invoice.delete({ where: { id: params.invoiceId } });
  return NextResponse.json({ ok: true });
}