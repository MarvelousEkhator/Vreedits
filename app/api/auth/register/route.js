// app/api/auth/register/route.js
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";
import { generateCode, CODE_TTL_MS } from "@/lib/security";
import { ageFromDob, tierForAge, hashPin, isValidPin } from "@/lib/userSettings";
import { signSession, setSessionCookie } from "@/lib/auth";
import { maskEmail, makeConfirmCode, sendConfirmEmail } from "@/lib/guardianEmail";

const MIN_AGE = 13;
const MAX_AGE = 120;
const BLOCK_COOKIE = "age_gate_blocked";
const BLOCK_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 30;
const USERNAME_PATTERN = /^[a-z0-9_.]+$/;
const RESEND_COOLDOWN_MS = 60 * 1000;

// Set SKIP_EMAIL_VERIFICATION=true on Render to let people sign up without
// the email code. Remove it (or set it to false) to turn verification back on.
const SKIP_EMAIL_VERIFICATION = process.env.SKIP_EMAIL_VERIFICATION === "true";

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

function isValidEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

  // Parent hand-off (under 18). Under 16 must set a PIN; 16-17 may skip it.
  let guardianInput = null;
  if (age < 18) {
    const gPin = typeof body.guardianPin === "string" ? body.guardianPin.trim() : "";
    const gEmail = typeof body.guardianEmail === "string" ? body.guardianEmail.trim().toLowerCase() : "";
    const wantsPin = age < 16 || gPin || gEmail;

    if (wantsPin) {
      if (!isValidPin(gPin)) return err("The parent PIN must be 4 digits.");
      if (gEmail) {
        if (!isValidEmail(gEmail)) return err("Enter a valid parent email.");
        if (gEmail === email) return err("The parent email must be different from the account email.");
      }
      guardianInput = { pin: gPin, email: gEmail || null };
    }
  }

  const displayName = displayNameRaw.slice(0, 50) || username;

  // An account that was never verified doesn't own its email yet, so a new
  // signup is allowed to take it over. Verified accounts stay protected.
  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  let reuseId = null;
  if (existingByEmail) {
    if (existingByEmail.verified || existingByEmail.isGuest) {
      return err("An account with that email already exists.", 409);
    }
    const last = existingByEmail.lastCodeSentAt
      ? new Date(existingByEmail.lastCodeSentAt).getTime()
      : 0;
    if (Date.now() - last < RESEND_COOLDOWN_MS) {
      return err("We just sent a code to this email. Please wait a minute and try again.", 429);
    }
    reuseId = existingByEmail.id;
  }

  const usernameTaken = await prisma.user.findFirst({
    where: {
      username: { equals: username, mode: "insensitive" },
      ...(reuseId ? { NOT: { id: reuseId } } : {}),
    },
    select: { id: true },
  });
  if (usernameTaken) return err("That username is already taken.", 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const code = generateCode();
  const guardianPinHash = guardianInput ? await hashPin(guardianInput.pin) : null;

  // Under 16: private account, friends-only, hidden from suggestions from day one.
  const isStrict = tierForAge(age) === "strict";

  // Settings saved with the account (strict-tier protections and/or the parent PIN).
  const settingsData = {
    ...(isStrict ? { discoverable: false, whoCanMessage: "friends" } : {}),
    ...(guardianInput
      ? {
          guardianPinHash,
          ...(guardianInput.email
            ? { guardianEmail: guardianInput.email, guardianEmailVerified: false }
            : {}),
        }
      : {}),
  };

  const userData = {
    username,
    displayName,
    passwordHash,
    dateOfBirth: dob,
    termsAcceptedAt: new Date(),
    ...(SKIP_EMAIL_VERIFICATION
      ? { verified: true, verificationCode: null, verificationExpires: null }
      : {
          verified: false,
          verificationCode: code,
          verificationExpires: new Date(Date.now() + CODE_TTL_MS),
          lastCodeSentAt: new Date(),
          verifyAttempts: 0,
        }),
    ...(isStrict
      ? {
          isPublic: false,
          allowDownloads: false,
          allowComments: "friends",
          allowMentions: "friends",
        }
      : {}),
  };

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      let created;
      if (reuseId) {
        // Start the taken-over account fresh: clear its old settings first.
        await tx.userSettings.deleteMany({ where: { userId: reuseId } });
        created = await tx.user.update({ where: { id: reuseId }, data: userData });
      } else {
        created = await tx.user.create({ data: { email, ...userData } });
      }

      if (Object.keys(settingsData).length) {
        await tx.userSettings.upsert({
          where: { userId: created.id },
          create: { userId: created.id, ...settingsData },
          update: settingsData,
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

  // Email the parent a confirmation code. This never blocks the signup:
  // if it fails, the parent can ask for a new code in the parental settings.
  let guardianNote = {};
  if (guardianInput?.email) {
    let sent = false;
    try {
      const c = makeConfirmCode(user.id);
      await prisma.userSettings.update({
        where: { userId: user.id },
        data: {
          guardianEmailCodeHash: c.hash,
          guardianEmailCodeExpires: c.expires,
          guardianEmailCodeSentAt: new Date(),
          guardianEmailCodeAttempts: 0,
        },
      });
      await sendConfirmEmail(guardianInput.email, c.code);
      sent = true;
    } catch (e) {
      console.error("Parent email confirmation at signup failed:", e);
    }
    guardianNote = {
      guardianEmailMasked: maskEmail(guardianInput.email),
      guardianEmailSent: sent,
    };
  }

  // Email verification is paused: the account is ready to use right away,
  // so sign the new user in immediately instead of sending them to login.
  if (SKIP_EMAIL_VERIFICATION) {
    try {
      setSessionCookie(signSession(user.id));
    } catch (e) {
      console.error("Auto sign-in after register failed:", e);
      // Account exists; the client falls back to the login page.
      return NextResponse.json(
        { ok: true, email: user.email, verified: true, signedIn: false, ...guardianNote },
        { status: 201 }
      );
    }
    return NextResponse.json(
      { ok: true, email: user.email, verified: true, signedIn: true, ...guardianNote },
      { status: 201 }
    );
  }

  try {
    await sendVerificationEmail(user.email, code);
  } catch (e) {
    // Log the real reason on the server; don't send provider details to the browser.
    console.error("Verification email failed:", e);
    return NextResponse.json(
      { ok: true, email: user.email, emailError: true, ...guardianNote },
      { status: 201 }
    );
  }

  return NextResponse.json({ ok: true, email: user.email, ...guardianNote }, { status: 201 });
}