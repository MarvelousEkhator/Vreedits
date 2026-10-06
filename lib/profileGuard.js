// lib/profileGuard.js
import { prisma } from "@/lib/prisma";
import {
  getSettings, ageFromDob, tierForAge, sanitizePatch, touchesGuarded,
} from "@/lib/userSettings";

// Call this in any route that lets a user change isPublic or allowDownloads.
// Returns { ok: true } or { ok: false, status, error }.
export async function checkProfileGuard(viewer, body) {
  // Only look at values that actually change something.
  const wanted = {};
  for (const k of ["isPublic", "allowDownloads"]) {
    if (typeof body?.[k] === "boolean" && body[k] !== viewer[k]) wanted[k] = body[k];
  }
  if (Object.keys(wanted).length === 0) return { ok: true };

  const [settings, full] = await Promise.all([
    getSettings(viewer.id),
    prisma.user.findUnique({ where: { id: viewer.id }, select: { dateOfBirth: true } }),
  ]);
  const tier = tierForAge(ageFromDob(full?.dateOfBirth));

  const { userData, settingsData, error } = sanitizePatch(wanted, tier);
  if (error) return { ok: false, status: 403, error };

  if (settings.guardianPinHash && touchesGuarded(userData, settingsData)) {
    return {
      ok: false,
      status: 403,
      error: "This setting is locked by a guardian PIN. Use Parental controls to change it.",
    };
  }
  return { ok: true };
}