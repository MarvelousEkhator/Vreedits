import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { prisma } from "@/lib/prisma";

async function requireMember(businessId, userId) {
  return prisma.teamMember.findUnique({ where: { businessId_userId: { businessId, userId } } });
}

export async function GET(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await requireMember(params.id, user.id))) {
    return NextResponse.json({ error: "Not a member of this business." }, { status: 403 });
  }

  const invoices = await prisma.invoice.findMany({
    where: { businessId: params.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ invoices });
}

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await requireMember(params.id, user.id))) {
    return NextResponse.json({ error: "Not a member of this business." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const clientName = (body.clientName || "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!clientName || items.length === 0) {
    return NextResponse.json({ error: "Client name and at least one line item are required." }, { status: 400 });
  }

  const invoice = await prisma.invoice.create({
    data: {
      businessId: params.id,
      clientName,
      items,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    },
  });

  return NextResponse.json({ invoice });
}