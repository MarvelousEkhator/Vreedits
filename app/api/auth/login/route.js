import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSession, setSessionCookie } from "@/lib/auth";
import {
  generateCode, CODE_TTL_MS, isLockedOut,
  MAX_FAILED_LOGINS, LOCKOUT_MS,
} from "@/lib/security";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req) {
  const { email, password } = await req.json();
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail || !password) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
  if (!user) {
    return NextResponse.json({ error: "No account found with that email." }, { status: 404 });
  }

  if (isLockedOut(user)) {
    const minutesLeft = Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000);
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${minutesLeft} minute(s).` },
      { status: 429 }
    );
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    const attempts = user.failedLoginAttempts + 1;
    const lockingOut = attempts >= MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lockingOut ? 0 : attempts,
        lockedUntil: lockingOut ? new Date(Date.now() + LOCKOUT_MS) : null,
      },
    });
    return NextResponse.json(
      {
        error: lockingOut
          ? "Too many failed attempts. Account locked for 15 minutes."
          : "Incorrect password.",
      },
      { status: 401 }
    );
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  if (!user.verified) {
    const code = generateCode();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationCode: code,
        verificationExpires: new Date(Date.now() + CODE_TTL_MS),
        lastCodeSentAt: new Date(),
      },
    });
    await sendVerificationEmail(user.email, code);
    return NextResponse.json(
      { needsVerification: true, email: user.email },
      { status: 200 }
    );
  }

  await prisma.user.update({ where: { id: user.id }, data: { online: true } });
  setSessionCookie(signSession(user.id));

  return NextResponse.json({
    ok: true,
    user: { id: user.id, username: user.username, email: user.email },
  });
}