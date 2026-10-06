// app/api/auth/register/route.js  (adjust the path if yours differs)
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";
import { generateCode, CODE_TTL_MS } from "@/lib/security";
import { ageFromDob, tierForAge } from "@/lib/userSettings";

const MIN_AGE = 13;
const MAX_AGE = 120;
const BLOCK_COOKIE = "age_gate_blocked";
const BLOCK_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 30;
const USERNAME_PATTERN = /^[a-z0-9_.]+$/;

// Accepts "YYYY-MM-DD" only, and rejects impossible dates like Feb 30.
function parseDob(value) {
  if (typeof value !== "string") return null;
  const str = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [y, m, d] = str.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

function err(error, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req) {
  // A browser that already failed the age check can't try again with a new date.
  if (req.cookies.get(BLOCK_COOKIE)) {
    return err("Sign up isn't available on this device right now.", 403);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return err("Invalid request.");

  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const displayNameRaw = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !email || !password || !body.dateOfBirth) {
    return err("All fields are required.");
  }
  if (!body.termsAccepted) {
    return err("You must accept the Terms and Privacy Policy.");
  }

  const dob = parseDob(body.dateOfBirth);
  const age = dob ? ageFromDob(dob) : null;
  if (age === null || age < 0 || age > MAX_AGE) {
    return err("Enter a valid date of birth.");
  }
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

  if (username.length < MIN_USERNAME_LENGTH) {
    return err(`Username must be at least ${MIN_USERNAME_LENGTH} characters.`);
  }
  if (username.length > MAX_USERNAME_LENGTH) {
    return err(`Username must be ${MAX_USERNAME_LENGTH} characters or fewer.`);
  }
  if (!USERNAME_PATTERN.test(username)) {
    return err("Username can only use small letters, numbers, underscores and periods (no spaces).");
  }
  if (password.length < 8) {
    return err("Password must be at least 8 characters.");
  }

  const displayName = displayNameRaw.slice(0, 50) || username;

  const [emailTaken, usernameTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      select: { id: true },
    }),
  ]);
  if (emailTaken) return err("An account with that email already exists.", 409);
  if (usernameTaken) return err("That username is already taken.", 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const code = generateCode();

  // Under 16: private account, friends-only, hidden from suggestions from day one.
  const isStrict = tierForAge(age) === "strict";

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          displayName,
          email,
          passwordHash,
          dateOfBirth: dob,
          termsAcceptedAt: new Date(),
          verificationCode: code,
          verificationExpires: new Date(Date.now() + CODE_TTL_MS),
          lastCodeSentAt: new Date(),
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
          where: { userId: created.id },
          create: { userId: created.id, discoverable: false, whoCanMessage: "friends" },
          update: { discoverable: false, whoCanMessage: "friends" },
        });
      }

      return created;
    });
  } catch (e) {
    if (e?.code === "P2002") {
      return err("That email or username is already taken.", 409);
    }
    console.error("Register failed:", e);
    return err("Something went wrong. Please try again.", 500);
  }

  try {
    await sendVerificationEmail(user.email, code);
  } catch (e) {
    return NextResponse.json(
      { ok: true, email: user.email, emailError: e.message },
      { status: 201 }
    );
  }

  return NextResponse.json({ ok: true, email: user.email }, { status: 201 });
}