// app/api/settings/parental/route.js
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";
import {
  ageFromDob, tierForAge, getSettings, sanitizePatch, checkPin, hashPin,
  isValidPin, publicSettings, protectionFixes, GUARDED,
} from "@/lib/userSettings";
import { localTime } from "@/lib/screenTime";
import { sendEmail } from "@/lib/email";
import { generateCode, CODE_TTL_MS } from "@/lib/security";
import {
  maskEmail, hashConfirmCode, makeConfirmCode, sendConfirmEmail,
} from "@/lib/guardianEmail";

export const dynamic = "force-dynamic";

const MAX_CODE_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

function fail(error, status = 400, code) {
  return NextResponse.json(code ? { error, code } : { error }, { status });
}

// Logs the real error for the server logs and sends back a plain message
// plus the error code (for example P2021 means a table is missing).
function serverFailure(e, what) {
  console.error(`${what} failed:`, e);
  const code = typeof e?.code === "string" ? e.code : undefined;
  return fail("Something went wrong on the server. Please try again in a moment.", 500, code);
}

function cleanEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sameHex(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function hashResetCode(userId, code) {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

async function clearReset(userId) {
  await prisma.userSettings.update({
    where: { userId },
    data: {
      pinResetCodeHash: null,
      pinResetExpires: null,
      pinResetSentAt: null,
      pinResetAttempts: 0,
    },
  });
}

async function clearConfirm(userId) {
  await prisma.userSettings.update({
    where: { userId },
    data: {
      guardianEmailCodeHash: null,
      guardianEmailCodeExpires: null,
      guardianEmailCodeSentAt: null,
      guardianEmailCodeAttempts: 0,
    },
  });
}

// Stores a fresh confirmation code and emails it. Returns true if it was sent.
async function issueConfirmCode(userId, email) {
  const c = makeConfirmCode(userId);
  await prisma.userSettings.update({
    where: { userId },
    data: {
      guardianEmailCodeHash: c.hash,
      guardianEmailCodeExpires: c.expires,
      guardianEmailCodeSentAt: new Date(),
      guardianEmailCodeAttempts: 0,
    },
  });
  try {
    await sendConfirmEmail(email, c.code);
    return true;
  } catch (e) {
    console.error("Parent email confirmation failed:", e);
    await clearConfirm(userId);
    return false;
  }
}

function resetEmailHtml(code) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 420px; margin: 0 auto;">
      <h2 style="color:#14151A;">Reset the parental PIN</h2>
      <p style="color:#54565f; font-size:14px;">Someone asked to reset the parental control PIN on a Vreedits account that lists this email as the parent contact. Use this code to continue. It expires in 10 minutes.</p>
      <div style="font-size:28px; font-weight:700; letter-spacing:0.1em; background:#F2F2F5; padding:16px; border-radius:12px; text-align:center; margin:16px 0;">
        ${code}
      </div>
      <p style="color:#8A8C99; font-size:12px;">If you didn't expect this, don't share the code with anyone.</p>
    </div>
  `;
}

// Everything the parental controls page needs. Never returns the PIN hash.
export async function GET(req) {
  try {
    const user = await requireUser();
    if (!user) return fail("Not authenticated.", 401);
    if (user.isGuest) return guestBlockedResponse();

    const [settings, u] = await Promise.all([
      getSettings(user.id),
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          dateOfBirth: true, isPublic: true, allowDownloads: true,
          allowComments: true, allowMentions: true,
        },
      }),
    ]);

    const tier = tierForAge(ageFromDob(u?.dateOfBirth));

    // Under-16 accounts that somehow have looser settings get corrected here.
    const fixes = protectionFixes(tier, u, settings);
    const ops = [];
    if (Object.keys(fixes.userData).length) {
      ops.push(prisma.user.update({ where: { id: user.id }, data: fixes.userData }));
    }
    if (Object.keys(fixes.settingsData).length) {
      ops.push(prisma.userSettings.update({ where: { userId: user.id }, data: fixes.settingsData }));
    }
    if (ops.length) await prisma.$transaction(ops);

    const s = { ...settings, ...fixes.settingsData };
    const us = { ...u, ...fixes.userData };
    const local = localTime(new URL(req.url).searchParams.get("tz"));

    return NextResponse.json({
      hasPin: !!settings.guardianPinHash,
      hasGuardianEmail: !!settings.guardianEmail,
      guardianEmailVerified: !!settings.guardianEmailVerified,
      guardianEmailMasked: settings.guardianEmail ? maskEmail(settings.guardianEmail) : null,
      tier,
      day: local.day,
      settings: {
        ...publicSettings(s),
        isPublic: us.isPublic,
        allowComments: us.allowComments,
        allowMentions: us.allowMentions,
      },
    });
  } catch (e) {
    return serverFailure(e, "GET /api/settings/parental");
  }
}

export async function POST(req) {
  try {
    const user = await requireUser();
    if (!user) return fail("Not authenticated.", 401);
    if (user.isGuest) return guestBlockedResponse();

    let body;
    try {
      body = await req.json();
    } catch {
      return fail("Invalid request.");
    }

    const settings = await getSettings(user.id);
    const action = body?.action;

    // First-time setup: pick a 4-digit PIN (and, optionally, a parent email
    // that gets a confirmation code and can later reset a forgotten PIN).
    if (action === "setPin") {
      if (settings.guardianPinHash) return fail("A PIN is already set.");
      if (!isValidPin(body.pin)) return fail("The PIN must be 4 digits.");

      const data = { guardianPinHash: hashPin(body.pin), failedPinAttempts: 0, pinLockedUntil: null };

      const rawEmail = cleanEmail(body.guardianEmail);
      if (rawEmail) {
        if (!isValidEmail(rawEmail)) return fail("Enter a valid parent email.");
        data.guardianEmail = rawEmail;
        data.guardianEmailVerified = false;
      }

      await prisma.userSettings.update({ where: { userId: user.id }, data });

      if (rawEmail) {
        const sent = await issueConfirmCode(user.id, rawEmail);
        return NextResponse.json({
          ok: true,
          guardianEmailSent: sent,
          sentTo: maskEmail(rawEmail),
        });
      }
      return NextResponse.json({ ok: true });
    }

    // Forgot the PIN: email a 6-digit code to the CONFIRMED parent email.
    if (action === "requestPinReset") {
      if (!settings.guardianPinHash) return fail("No PIN is set.");
      if (!settings.guardianEmail) {
        return fail("There's no parent email on file, so the PIN can't be reset by email.");
      }
      if (!settings.guardianEmailVerified) {
        return fail("The parent email hasn't been confirmed yet, so the PIN can't be reset by email.");
      }

      const last = settings.pinResetSentAt ? new Date(settings.pinResetSentAt).getTime() : 0;
      if (Date.now() - last < RESEND_COOLDOWN_MS) {
        return fail("Please wait a minute before asking for another code.", 429);
      }

      const code = String(generateCode());
      await prisma.userSettings.update({
        where: { userId: user.id },
        data: {
          pinResetCodeHash: hashResetCode(user.id, code),
          pinResetExpires: new Date(Date.now() + CODE_TTL_MS),
          pinResetSentAt: new Date(),
          pinResetAttempts: 0,
        },
      });

      try {
        await sendEmail({
          to: settings.guardianEmail,
          subject: "Reset the parental PIN on Vreedits",
          html: resetEmailHtml(code),
        });
      } catch (e) {
        console.error("PIN reset email failed:", e);
        await clearReset(user.id);
        return fail("We couldn't send the email right now. Please try again later.", 502);
      }

      return NextResponse.json({ ok: true, sentTo: maskEmail(settings.guardianEmail) });
    }

    // Finish the reset with the code from the parent's email.
    if (action === "resetPin") {
      if (!settings.guardianPinHash || !settings.pinResetCodeHash || !settings.pinResetExpires) {
        return fail("Ask for a reset code first.");
      }
      if (new Date(settings.pinResetExpires).getTime() < Date.now()) {
        await clearReset(user.id);
        return fail("That code has expired. Ask for a new one.");
      }
      if (!isValidPin(body.newPin)) return fail("The new PIN must be 4 digits.");

      if ((settings.pinResetAttempts ?? 0) >= MAX_CODE_ATTEMPTS) {
        await clearReset(user.id);
        return fail("Too many wrong codes. Ask for a new one.", 429);
      }

      const given = hashResetCode(user.id, String(body.code ?? "").trim());
      if (!sameHex(given, settings.pinResetCodeHash)) {
        await prisma.userSettings.update({
          where: { userId: user.id },
          data: { pinResetAttempts: { increment: 1 } },
        });
        return fail("That code isn't right.");
      }

      await prisma.userSettings.update({
        where: { userId: user.id },
        data: {
          guardianPinHash: hashPin(body.newPin),
          failedPinAttempts: 0,
          pinLockedUntil: null,
          pinResetCodeHash: null,
          pinResetExpires: null,
          pinResetSentAt: null,
          pinResetAttempts: 0,
        },
      });
      return NextResponse.json({ ok: true });
    }

    // Everything else needs the right PIN.
    const check = await checkPin(settings, body?.pin);
    if (!check.ok) return fail(check.error, check.status);

    if (action === "verify") {
      return NextResponse.json({ ok: true });
    }

    if (action === "changePin") {
      if (!isValidPin(body.newPin)) return fail("The new PIN must be 4 digits.");
      await prisma.userSettings.update({
        where: { userId: user.id },
        data: { guardianPinHash: hashPin(body.newPin) },
      });
      return NextResponse.json({ ok: true });
    }

    // Add or change the parent email. It starts unconfirmed and gets a code.
    if (action === "setGuardianEmail") {
      const email = cleanEmail(body.guardianEmail);
      if (!isValidEmail(email)) return fail("Enter a valid parent email.");

      await prisma.userSettings.update({
        where: { userId: user.id },
        data: {
          guardianEmail: email,
          guardianEmailVerified: false,
          guardianEmailCodeHash: null,
          guardianEmailCodeExpires: null,
          guardianEmailCodeSentAt: null,
          guardianEmailCodeAttempts: 0,
          pinResetCodeHash: null,
          pinResetExpires: null,
          pinResetSentAt: null,
          pinResetAttempts: 0,
        },
      });

      const sent = await issueConfirmCode(user.id, email);
      return NextResponse.json({
        ok: true,
        guardianEmailMasked: maskEmail(email),
        guardianEmailSent: sent,
      });
    }

    // Send the confirmation code again.
    if (action === "sendGuardianEmailCode") {
      if (!settings.guardianEmail) return fail("Add a parent email first.");
      if (settings.guardianEmailVerified) return fail("That email is already confirmed.");

      const last = settings.guardianEmailCodeSentAt
        ? new Date(settings.guardianEmailCodeSentAt).getTime()
        : 0;
      if (Date.now() - last < RESEND_COOLDOWN_MS) {
        return fail("Please wait a minute before asking for another code.", 429);
      }

      const sent = await issueConfirmCode(user.id, settings.guardianEmail);
      if (!sent) return fail("We couldn't send the email right now. Please try again later.", 502);
      return NextResponse.json({ ok: true, sentTo: maskEmail(settings.guardianEmail) });
    }

    // Confirm the parent email with the code that was emailed to it.
    if (action === "confirmGuardianEmail") {
      if (!settings.guardianEmail) return fail("Add a parent email first.");
      if (settings.guardianEmailVerified) return NextResponse.json({ ok: true });

      if (!settings.guardianEmailCodeHash || !settings.guardianEmailCodeExpires) {
        return fail("Ask for a new code first.");
      }
      if (new Date(settings.guardianEmailCodeExpires).getTime() < Date.now()) {
        await clearConfirm(user.id);
        return fail("That code has expired. Ask for a new one.");
      }
      if ((settings.guardianEmailCodeAttempts ?? 0) >= MAX_CODE_ATTEMPTS) {
        await clearConfirm(user.id);
        return fail("Too many wrong codes. Ask for a new one.", 429);
      }

      const given = hashConfirmCode(user.id, String(body.code ?? "").trim());
      if (!sameHex(given, settings.guardianEmailCodeHash)) {
        await prisma.userSettings.update({
          where: { userId: user.id },
          data: { guardianEmailCodeAttempts: { increment: 1 } },
        });
        return fail("That code isn't right.");
      }

      await prisma.userSettings.update({
        where: { userId: user.id },
        data: {
          guardianEmailVerified: true,
          guardianEmailCodeHash: null,
          guardianEmailCodeExpires: null,
          guardianEmailCodeSentAt: null,
          guardianEmailCodeAttempts: 0,
        },
      });
      return NextResponse.json({ ok: true });
    }

    // Removing the PIN unlocks the settings again (their values stay as they are).
    if (action === "removePin") {
      await prisma.userSettings.update({
        where: { userId: user.id },
        data: { guardianPinHash: null, failedPinAttempts: 0, pinLockedUntil: null },
      });
      return NextResponse.json({ ok: true });
    }

    // Extra screen time for today.
    if (action === "addTime") {
      const minutes = Number(body.minutes);
      if (![15, 30, 60].includes(minutes)) return fail("Choose 15, 30 or 60 minutes.");
      if (typeof body.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.day)) return fail("Invalid day.");
      await prisma.screenTimeDay.upsert({
        where: { userId_day: { userId: user.id, day: body.day } },
        create: { userId: user.id, day: body.day, bonusMinutes: minutes },
        update: { bonusMinutes: { increment: minutes } },
      });
      return NextResponse.json({ ok: true });
    }

    // Change the locked settings.
    if (action === "update") {
      const full = await prisma.user.findUnique({ where: { id: user.id }, select: { dateOfBirth: true } });
      const tier = tierForAge(ageFromDob(full?.dateOfBirth));

      // Only the guarded settings can be changed here.
      const allowed = {};
      for (const k of GUARDED) {
        if (k in body) allowed[k] = body[k];
      }
      const { userData, settingsData, error } = sanitizePatch(allowed, tier);
      if (error) return fail(error, 403);

      const ops = [];
      if (Object.keys(userData).length) {
        ops.push(prisma.user.update({ where: { id: user.id }, data: userData }));
      }
      if (Object.keys(settingsData).length) {
        ops.push(prisma.userSettings.update({ where: { userId: user.id }, data: settingsData }));
      }
      if (ops.length) await prisma.$transaction(ops);
      return NextResponse.json({ ok: true });
    }

    return fail("Unknown action.");
  } catch (e) {
    return serverFailure(e, "POST /api/settings/parental");
  }
}