import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { prisma } from "@/lib/prisma";

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const invite = await prisma.teamInvite.findUnique({ where: { token: params.token } });
  if (!invite || invite.status !== "pending") {
    return NextResponse.json({ error: "This invite is invalid or already used." }, { status: 400 });
  }

  if (invite.email !== user.email?.toLowerCase()) {
    return NextResponse.json({ error: "This invite was sent to a different email address." }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.teamMember.upsert({
      where: { businessId_userId: { businessId: invite.businessId, userId: user.id } },
      create: { businessId: invite.businessId, userId: user.id, role: invite.role },
      update: { role: invite.role },
    }),
    prisma.teamInvite.update({ where: { id: invite.id }, data: { status: "accepted" } }),
  ]);

  return NextResponse.json({ businessId: invite.businessId });
}