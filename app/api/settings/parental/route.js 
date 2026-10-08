// app/api/settings/parental/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";
import {
  ageFromDob, tierForAge, getSettings, sanitizePatch, checkPin, hashPin,
  isValidPin, publicSettings, protectionFixes, GUARDED,
} from "@/lib/userSettings";
import { localTime } from "@/lib/screenTime";

export const dynamic = "force-dynamic";

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

    // First-time setup: pick a 4-digit PIN.
    if (action === "setPin") {
      if (settings.guardianPinHash) return fail("A PIN is already set.");
      if (!isValidPin(body.pin)) return fail("The PIN must be 4 digits.");
      await prisma.userSettings.update({
        where: { userId: user.id },
        data: { guardianPinHash: hashPin(body.pin), failedPinAttempts: 0, pinLockedUntil: null },
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