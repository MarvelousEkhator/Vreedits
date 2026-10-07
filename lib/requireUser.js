// lib/requireUser.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

export async function requireUser() {
  const userId = getSessionUserId();
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.verified) return null;
  return user;
}

// Like requireUser, but guests don't count. Use it in routes that need a
// real account (commenting, joining communities, posting, and so on).
export async function requireMember() {
  const user = await requireUser();
  if (!user || user.isGuest) return null;
  return user;
}

// Send this back when a guest tries something that needs an account.
export function guestBlockedResponse() {
  return NextResponse.json(
    { error: "Create a free account to do this.", guestBlocked: true },
    { status: 403 }
  );
}