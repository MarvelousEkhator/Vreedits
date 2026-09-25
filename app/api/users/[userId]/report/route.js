import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const targetId = params.userId;
  if (targetId === user.id) {
    return NextResponse.json({ error: "You can't report yourself." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const reason = body?.reason ? String(body.reason).trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "Please describe the issue." }, { status: 400 });
  }
  if (reason.length > 500) {
    return NextResponse.json({ error: "Keep it under 500 characters." }, { status: 400 });
  }

  await prisma.userReport.create({
    data: { reporterId: user.id, targetUserId: targetId, reason },
  });

  return NextResponse.json({ ok: true });
}