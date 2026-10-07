// app/api/auth/upgrade/route.js
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";
import { sendVerificationEmail } from "@/lib/email";
import { generateCode, CODE_TTL_MS } from "@/lib/security";
import { ageFromDob, tierForAge } from "@/lib/userSettings";

const MIN_AGE = 13;
const MAX_AGE = 120;
const BLOCK_COOKIE = "age_gate_blocked";
const BLOCK_SECONDS = 60 * 60 * 24 * 7;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 30;
const USERNAME_PATTERN = /^[a-z0-9_.]+$/;
const SKIP_EMAIL_VERIFICATION = process.env.SKIP_EMAIL_VERIFICATION === "true";

function parseDob(value) {
  if (typeof value !== "string") return null;
  const str = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [y, m, d] = str.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function err(error, status = 400) {
  return NextResponse.json({ error }, { status });
}

// Turns the logged-in guest into a real account. Same user row, so
// everything the guest already made is kept.
export async function POST(req) {
  const guest = await requireUser();
  if (!guest) return err("Not authenticated.", 401);
  if (!guest.isGuest) return err("You already have an account.");

  if (req.cookies.get(BLOCK_COOKIE)) {
    return err("Sign up isn't available on this device right now.", 403);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return err("Invalid request.");

  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const displayNameRaw = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !email || !password || !body.dateOfBirth) return err("All fields are required.");
  if (!body.termsAccepted) return err("You must accept the Terms and Privacy Policy.");

  const dob = parseDob(body.dateOfBirth);
  const age = dob ? ageFromDob(dob) : null;
  if (age === null || age < 0 || age > MAX_AGE) return err("Enter a valid date of birth.");
  if (age < MIN_AGE) {
    const res = err("You must be at least 13 years old to sign up.");
    res.cookies.set(BLOCK_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: BLOCK_SECONDS,
      path: "/",
    });
    return res;
  }

  if (username.length < MIN_USERNAME_LENGTH) return err(`Username must be at least ${MIN_USERNAME_LENGTH} characters.`);
  if (username.length > MAX_USERNAME_LENGTH) return err(`Username must be ${MAX_USERNAME_LENGTH} characters or fewer.`);
  if (!USERNAME_PATTERN.test(username)) {
    return err("Username can only use small letters, numbers, underscores and periods (no spaces).");
  }
  if (password.length < 8) return err("Password must be at least 8 characters.");

  const displayName = displayNameRaw.slice(0, 50) || username;

  const [emailTaken, usernameTaken] = await Promise.all([
    prisma.user.findFirst({ where: { email, NOT: { id: guest.id } }, select: { id: true } }),
    prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" }, NOT: { id: guest.id } },
      select: { id: true },
    }),
  ]);
  if (emailTaken) return err("An account with that email already exists.", 409);
  if (usernameTaken) return err("That username is already taken.", 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const code = generateCode();
  const isStrict = tierForAge(age) === "strict";

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: guest.id },
        data: {
          username,
          displayName,
          email,
          passwordHash,
          dateOfBirth: dob,
          termsAcceptedAt: new Date(),
          isGuest: false,
          ...(SKIP_EMAIL_VERIFICATION
            ? { verified: true }
            : {
                verified: false,
                verificationCode: code,
                verificationExpires: new Date(Date.now() + CODE_TTL_MS),
                lastCodeSentAt: new Date(),
              }),
          ...(isStrict
            ? {
                isPublic: false,
                allowDownloads: false,
                allowComments: "friends",
                allowMentions: "friends",
              }
            : {}),
        },
      });

      if (isStrict) {
        await tx.userSettings.upsert({
          where: { userId: u.id },
          create: { userId: u.id, discoverable: false, whoCanMessage: "friends" },
          update: { discoverable: false, whoCanMessage: "friends" },
        });
      }
      return u;
    });
  } catch (e) {
    if (e?.code === "P2002") return err("That email or username is already taken.", 409);
    console.error("Guest upgrade failed:", e);
    return err("Something went wrong. Please try again.", 500);
  }

  if (SKIP_EMAIL_VERIFICATION) {
    return NextResponse.json({ ok: true, email: updated.email, verified: true });
  }

  try {
    await sendVerificationEmail(updated.email, code);
  } catch (e) {
    return NextResponse.json({ ok: true, email: updated.email, emailError: e.message });
  }
  return NextResponse.json({ ok: true, email: updated.email });
}