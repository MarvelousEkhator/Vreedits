import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireUser } from "@/lib/requireUser";
import { prisma } from "@/lib/prisma";

async function requireAdmin(businessId, userId) {
  const membership = await prisma.teamMember.findUnique({
    where: { businessId_userId: { businessId, userId } },
  });
  return membership && (membership.role === "owner" || membership.role === "admin");
}

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const businessId = params.id;
  if (!(await requireAdmin(businessId, user.id))) {
    return NextResponse.json({ error: "Only owners/admins can invite." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email = (body.email || "").trim().toLowerCase();
  const role = body.role === "admin" ? "admin" : "member";
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  const invite = await prisma.teamInvite.create({
    data: { businessId, email, role, token: crypto.randomUUID() },
  });

  const baseUrl = process.env.APP_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const inviteLink = `${baseUrl}/team-invites/${invite.token}`;

  return NextResponse.json({ invite, inviteLink });
}