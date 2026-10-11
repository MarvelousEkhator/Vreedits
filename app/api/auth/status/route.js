// app/api/auth/status/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { maskEmail } from "@/lib/guardianEmail";

export const dynamic = "force-dynamic";

// Tells the app whether the signed-in person still needs to confirm their email.
export async function GET() {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ signedIn: false });

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, isGuest: true, verified: true, emailVerified: true },
  });
  if (!u) return NextResponse.json({ signedIn: false });

  return NextResponse.json({
    signedIn: true,
    isGuest: u.isGuest,
    emailVerified: u.isGuest ? true : u.verified && u.emailVerified,
    email: u.isGuest ? null : u.email,
    emailMasked: u.isGuest ? null : maskEmail(u.email),
  });
}