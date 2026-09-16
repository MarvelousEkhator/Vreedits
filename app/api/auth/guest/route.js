import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signSession, setSessionCookie } from "@/lib/auth";

export async function POST() {
  const suffix = Math.random().toString(36).slice(2, 10);

  const guest = await prisma.user.create({
    data: {
      username: `guest_${suffix}`,
      displayName: "Guest",
      email: `guest_${suffix}@guest.vreedits.local`,
      passwordHash: "",
      verified: true,
      online: true,
      isGuest: true,
    },
  });

  setSessionCookie(signSession(guest.id));

  return NextResponse.json({
    ok: true,
    user: { id: guest.id, username: guest.username, email: guest.email, isGuest: true },
  });
}