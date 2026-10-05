// lib/userSettings.js
import { prisma } from "@/lib/prisma";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export const NOTIF_KEYS = [
  "messages", "friendRequests", "likes", "comments", "followers",
  "mentions", "communities", "ai", "system", "updates",
];

const AUDIENCE = ["everyone", "friends", "none"];
const LIMITS = [15, 30, 45, 60, 90, 120, 180, 240];
const BREAKS = [15, 20, 30, 45, 60, 90];

// Settings a parent or guardian can lock behind the PIN. Once a PIN is set,
// these can only be changed through the parental controls screen.
export const GUARDED = new Set([
  "isPublic", "allowComments", "allowMentions", "whoCanMessage", "discoverable",
  "dailyLimitMinutes", "quietEnabled", "quietStart", "quietEnd", "breakEveryMinutes",
]);

export function mergeNotifPrefs(stored) {
  const base = { pauseAll: false };
  for (const k of NOTIF_KEYS) base[k] = true;
  if (stored && typeof stored === "object") {
    for (const k of [...NOTIF_KEYS, "pauseAll"]) {
      if (typeof stored[k] === "boolean") base[k] = stored[k];
    }
  }
  return base;
}

export function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

// "strict" = under 16, "teen" = 16-17, "adult" = 18+, "unknown" = no birthday yet.
export function tierForAge(age) {
  if (age === null || age === undefined) return "unknown";
  if (age < 16) return "strict";
  if (age < 18) return "teen";
  return "adult";
}

export async function getSettings(userId) {
  const existing = await prisma.userSettings.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await prisma.userSettings.create({ data: { userId } });
  } catch {
    return prisma.userSettings.findUnique({ where: { userId } });
  }
}

// Everything the settings page needs, and nothing secret (no PIN hash).
export function publicSettings(s) {
  return {
    whoCanMessage: s.whoCanMessage,
    showOnlineStatus: s.showOnlineStatus,
    showReadReceipts: s.showReadReceipts,
    discoverable: s.discoverable,
    notifPrefs: mergeNotifPrefs(s.notifPrefs),
    dailyLimitMinutes: s.dailyLimitMinutes,
    quietEnabled: s.quietEnabled,
    quietStart: s.quietStart,
    quietEnd: s.quietEnd,
    breakEveryMinutes: s.breakEveryMinutes,
  };
}

// ── Guardian PIN ──────────────────────────────────────────────
export function isValidPin(pin) {
  return typeof pin === "string" && /^\d{4}$/.test(pin);
}

export function hashPin(pin) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPinHash(pin, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(pin, salt, 32);
  const real = Buffer.from(hash, "hex");
  return test.length === real.length && timingSafeEqual(test, real);
}

// Checks a PIN and handles lockouts: 5 wrong tries locks it for 15 minutes.
export async function checkPin(settings, pin) {
  if (!settings.guardianPinHash) {
    return { ok: false, status: 400, error: "No PIN is set." };
  }
  if (settings.pinLockedUntil && settings.pinLockedUntil > new Date()) {
    const mins = Math.ceil((settings.pinLockedUntil.getTime() - Date.now()) / 60000);
    return { ok: false, status: 429, error: `Too many wrong tries. Try again in ${mins} min.` };
  }
  if (isValidPin(pin) && verifyPinHash(pin, settings.guardianPinHash)) {
    if (settings.failedPinAttempts) {
      await prisma.userSettings.update({
        where: { userId: settings.userId },
        data: { failedPinAttempts: 0, pinLockedUntil: null },
      });
    }
    return { ok: true };
  }
  const attempts = (settings.failedPinAttempts || 0) + 1;
  if (attempts >= 5) {
    await prisma.userSettings.update({
      where: { userId: settings.userId },
      data: { failedPinAttempts: 0, pinLockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
    });
    return { ok: false, status: 429, error: "Too many wrong tries. Locked for 15 minutes." };
  }
  await prisma.userSettings.update({
    where: { userId: settings.userId },
    data: { failedPinAttempts: attempts },
  });
  return { ok: false, status: 403, error: `Wrong PIN. ${5 - attempts} ${5 - attempts === 1 ? "try" : "tries"} left.` };
}

// ── Age protections ───────────────────────────────────────────
// Under 16: private account, friends-only messages, downloads off, hidden
// from suggestions. These can't be loosened until the person turns 16.
export function protectionFixes(tier, user, settings) {
  const userData = {};
  const settingsData = {};
  if (tier === "strict") {
    if (user.isPublic) userData.isPublic = false;
    if (user.allowDownloads) userData.allowDownloads = false;
    if (user.allowComments === "everyone") userData.allowComments = "friends";
    if (user.allowMentions === "everyone") userData.allowMentions = "friends";
    if (settings.discoverable) settingsData.discoverable = false;
    if (settings.whoCanMessage === "everyone") settingsData.whoCanMessage = "friends";
  }
  return { userData, settingsData };
}

function tierError(tier, userData, settingsData) {
  if (tier !== "strict") return null;
  if (userData.isPublic === true) return "Your account stays private until you turn 16.";
  if (userData.allowDownloads === true) return "Downloads stay off until you turn 16.";
  if (settingsData.discoverable === true) return "Your account stays out of suggestions until you turn 16.";
  if (settingsData.whoCanMessage === "everyone") return "Only friends can message you until you turn 16.";
  if (userData.allowComments === "everyone") return "Only friends can comment until you turn 16.";
  if (userData.allowMentions === "everyone") return "Only friends can mention you until you turn 16.";
  return null;
}

// Turns a request body into safe database updates. Unknown fields are ignored.
export function sanitizePatch(body, tier) {
  const userData = {};
  const settingsData = {};
  let notifPatch = null;

  for (const k of ["isPublic", "allowDownloads", "shareProfileLinks", "hideFollowing", "hideLikedVideos"]) {
    if (typeof body[k] === "boolean") userData[k] = body[k];
  }
  for (const k of ["allowComments", "allowMentions"]) {
    if (AUDIENCE.includes(body[k])) userData[k] = body[k];
  }
  for (const k of ["showOnlineStatus", "showReadReceipts", "discoverable", "quietEnabled"]) {
    if (typeof body[k] === "boolean") settingsData[k] = body[k];
  }
  if (AUDIENCE.includes(body.whoCanMessage)) settingsData.whoCanMessage = body.whoCanMessage;

  if ("dailyLimitMinutes" in body) {
    if (body.dailyLimitMinutes === null) settingsData.dailyLimitMinutes = null;
    else if (LIMITS.includes(body.dailyLimitMinutes)) settingsData.dailyLimitMinutes = body.dailyLimitMinutes;
  }
  if ("breakEveryMinutes" in body) {
    if (body.breakEveryMinutes === null) settingsData.breakEveryMinutes = null;
    else if (BREAKS.includes(body.breakEveryMinutes)) settingsData.breakEveryMinutes = body.breakEveryMinutes;
  }
  for (const k of ["quietStart", "quietEnd"]) {
    if (Number.isInteger(body[k]) && body[k] >= 0 && body[k] <= 1439) settingsData[k] = body[k];
  }

  if (typeof body.language === "string" && body.language.trim()) {
    userData.language = body.language.trim().slice(0, 30);
  }

  if (body.notifPrefs && typeof body.notifPrefs === "object") {
    notifPatch = {};
    for (const k of [...NOTIF_KEYS, "pauseAll"]) {
      if (typeof body.notifPrefs[k] === "boolean") notifPatch[k] = body.notifPrefs[k];
    }
  }

  return { userData, settingsData, notifPatch, error: tierError(tier, userData, settingsData) };
}

export function touchesGuarded(userData, settingsData) {
  return [...Object.keys(userData), ...Object.keys(settingsData)].some((k) => GUARDED.has(k));
}

// ── Use these in other routes ─────────────────────────────────
// Call canMessage(senderId, receiverId) in your DM send route.
export async function canMessage(senderId, receiverId) {
  if (senderId === receiverId) return true;
  const s = await prisma.userSettings.findUnique({
    where: { userId: receiverId },
    select: { whoCanMessage: true },
  });
  const mode = s?.whoCanMessage || "everyone";
  if (mode === "everyone") return true;
  if (mode === "none") return false;
  const friend = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: senderId, userBId: receiverId },
        { userAId: receiverId, userBId: senderId },
      ],
    },
    select: { id: true },
  });
  return !!friend;
}

// Call shouldNotify(userId, "likes") before creating a notification.
export async function shouldNotify(userId, key) {
  const s = await prisma.userSettings.findUnique({
    where: { userId },
    select: { notifPrefs: true },
  });
  const prefs = mergeNotifPrefs(s?.notifPrefs);
  if (prefs.pauseAll) return false;
  return prefs[key] !== false;
}
