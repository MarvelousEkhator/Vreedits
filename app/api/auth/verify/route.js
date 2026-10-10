// app/api/auth/verify/route.js
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { signSession, setSessionCookie } from "@/lib/auth";

const MAX_ATTEMPTS = 5;
const INVALID = "That code is invalid or expired.";

function fail(error, status = 400) {
  return NextResponse.json({ error }, { status });
}

function codesMatch(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req) {
  const body = await req.json().catch(() => null);

  const cleanEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const code =
    typeof body?.code === "string" || typeof body?.code === "number"
      ? String(body.code).trim()
      : "";

  if (!cleanEmail || !code) {
    return fail("Enter the code from your email.");
  }

  const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

  // Same message whether the account exists or not, so this can't be used
  // to check which emails are registered.
  if (
    !user ||
    !user.verificationCode ||
    !user.verificationExpires ||
    new Date(user.verificationExpires) < new Date()
  ) {
    return fail(INVALID);
  }

  if (!codesMatch(user.verificationCode, code)) {
    const after = await prisma.user.update({
      where: { id: user.id },
      data: { verifyAttempts: { increment: 1 } },
      select: { verifyAttempts: true },
    });

    if (after.verifyAttempts >= MAX_ATTEMPTS) {
      // Too many wrong guesses: cancel this code so a new one must be requested.
      await prisma.user.update({
        where: { id: user.id },
        data: { verificationCode: null, verificationExpires: null, verifyAttempts: 0 },
      });
      return fail("Too many wrong codes. Please request a new one.", 429);
    }

    return fail(INVALID);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      verified: true,
      online: true,
      verificationCode: null,
      verificationExpires: null,
      verifyAttempts: 0,
    },
  });

  setSessionCookie(signSession(updated.id));

  return NextResponse.json({
    ok: true,
    user: { id: updated.id, username: updated.username, email: updated.email },
  });
}