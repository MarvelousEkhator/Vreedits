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
// never message a minor (and a minor can never message it).
export function isCrossAgeContact(groupA, groupB) {
  return (groupA === "minor") !== (groupB === "minor");
}

// Call this before a direct message is sent.
// Returns { ok: true } or { ok: false, status, error }.
export async function checkDmAllowed(senderId, receiverId) {
  if (senderId === receiverId) return { ok: true };

  const users = await prisma.user.findMany({
    where: { id: { in: [senderId, receiverId] } },
    select: { id: true, dateOfBirth: true },
  });
  const sender = users.find((u) => u.id === senderId);
  const receiver = users.find((u) => u.id === receiverId);
  if (!sender || !receiver) {
    return { ok: false, status: 404, error: "User not found" };
  }

  // Minors and adults can't message each other. The wording is generic on
  // purpose, so it never reveals anyone's age.
  const senderGroup = ageGroupFromDob(sender.dateOfBirth);
  const receiverGroup = ageGroupFromDob(receiver.dateOfBirth);
  if (isCrossAgeContact(senderGroup, receiverGroup)) {
    return { ok: false, status: 403, error: "You can't send messages to this person." };
  }

  // The receiver's own "who can message me" setting (under 16 is friends-only).
  const allowed = await canMessage(senderId, receiverId);
  if (!allowed) {
    return { ok: false, status: 403, error: "This person isn't accepting messages right now." };
  }

  return { ok: true };
}