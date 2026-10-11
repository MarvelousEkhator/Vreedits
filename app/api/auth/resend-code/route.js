import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail, sendResetEmail } from "@/lib/email";
import { generateCode, CODE_TTL_MS, RESEND_COOLDOWN_MS } from "@/lib/security";

// purpose: "verify" | "reset"
export async function POST(req) {
  const { email, purpose } = await req.json().catch(() => ({}));
  const cleanEmail = (email || "").trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
  if (!user) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  // Nothing to confirm if the email is already confirmed.
  if (purpose !== "reset" && user.verified && user.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  if (
    user.lastCodeSentAt &&
    Date.now() - new Date(user.lastCodeSentAt).getTime() < RESEND_COOLDOWN_MS
  ) {
    return NextResponse.json(
      { error: "Please wait a moment before requesting another code." },
      { status: 429 }
    );
  }

  const code = generateCode();
  const expires = new Date(Date.now() + CODE_TTL_MS);

  await prisma.user.update({
    where: { id: user.id },
    data:
      purpose === "reset"
        ? { resetCode: code, resetExpires: expires, lastCodeSentAt: new Date() }
        : {
            verificationCode: code,
            verificationExpires: expires,
            lastCodeSentAt: new Date(),
            verifyAttempts: 0,
          },
  });

  try {
    await (purpose === "reset" ? sendResetEmail : sendVerificationEmail)(cleanEmail, code);
  } catch (e) {
    console.error("Resend code email failed:", e);
    return NextResponse.json(
      { error: "We couldn't send the email right now. Please try again in a moment." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}