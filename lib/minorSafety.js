// lib/minorSafety.js
import { prisma } from "@/lib/prisma";
import { ageFromDob, canMessage } from "@/lib/userSettings";

export const ADULT_AGE = 18;

// "minor" = under 18, "adult" = 18+, "unknown" = no birthday on file.
export function ageGroupFromDob(dob) {
  const age = ageFromDob(dob);
  if (age === null || age === undefined) return "unknown";
  return age < ADULT_AGE ? "minor" : "adult";
}

// True when exactly one of the two people is a known minor.
// An account with no birthday counts as "not a minor" here, so it can
// never contact a minor (and a minor can never contact it).
export function isCrossAgeContact(groupA, groupB) {
  return (groupA === "minor") !== (groupB === "minor");
}

// Loads both people and returns their age groups, or null if one is missing.
async function loadAgeGroups(idA, idB) {
  const users = await prisma.user.findMany({
    where: { id: { in: [idA, idB] } },
    select: { id: true, dateOfBirth: true },
  });
  const a = users.find((u) => u.id === idA);
  const b = users.find((u) => u.id === idB);
  if (!a || !b) return null;
  return { a: ageGroupFromDob(a.dateOfBirth), b: ageGroupFromDob(b.dateOfBirth) };
}

// Call this before a direct message is sent.
// Returns { ok: true } or { ok: false, status, error }.
export async function checkDmAllowed(senderId, receiverId) {
  if (senderId === receiverId) return { ok: true };

  const groups = await loadAgeGroups(senderId, receiverId);
  if (!groups) return { ok: false, status: 404, error: "User not found" };

  // The wording is generic on purpose, so it never reveals anyone's age.
  if (isCrossAgeContact(groups.a, groups.b)) {
    return { ok: false, status: 403, error: "You can't send messages to this person." };
  }

  // The receiver's own "who can message me" setting (under 16 is friends-only).
  const allowed = await canMessage(senderId, receiverId);
  if (!allowed) {
    return { ok: false, status: 403, error: "This person isn't accepting messages right now." };
  }

  return { ok: true };
}

// Call this before a friend request is created or accepted.
// Returns { ok: true } or { ok: false, status, error }.
export async function checkFriendAllowed(senderId, receiverId) {
  if (senderId === receiverId) return { ok: true };

  const groups = await loadAgeGroups(senderId, receiverId);
  if (!groups) return { ok: false, status: 404, error: "User not found" };

  if (isCrossAgeContact(groups.a, groups.b)) {
    return { ok: false, status: 403, error: "You can't send a friend request to this person." };
  }

  return { ok: true };
}