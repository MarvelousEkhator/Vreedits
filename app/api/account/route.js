// app/api/account/route.js
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

// Lists that hold user ids with no foreign key (so the database won't clean them up).
const ARRAY_COLUMNS = [
  ["Community", "memberIds"],
  ["Community", "adminIds"],
  ["Community", "rulesAcknowledgedBy"],
  ["FeedPost", "likedBy"],
  ["FeedPost", "viewedBy"],
  ["FeedComment", "likedBy"],
  ["Post", "likedBy"],
  ["Story", "viewedBy"],
  ["Role", "memberIds"],
  ["Event", "attendeeIds"],
  ["Thread", "memberIds"],
];

function err(error, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function DELETE(req) {
  const user = await requireUser();
  if (!user) return err("Not authenticated.", 401);
  if (user.isGuest) {
    return err("Guest sessions have no account to delete. Log out to leave, or sign up to keep your data.");
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) return err("Enter your password to confirm.");

  // Lockout after too many wrong passwords.
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
    return err(`Too many wrong tries. Try again in ${mins} min.`, 429);
  }

  const passwordOk = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!passwordOk) {
    const attempts = (user.failedLoginAttempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MS) },
      });
      return err("Too many wrong tries. Locked for 15 minutes.", 429);
    }
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: attempts } });
    const left = MAX_ATTEMPTS - attempts;
    return err(`Wrong password. ${left} ${left === 1 ? "try" : "tries"} left.`, 403);
  }

  // Don't delete things other people depend on.
  const owned = await prisma.community.findMany({
    where: { ownerId: user.id },
    select: { name: true, memberIds: true },
  });
  const shared = owned.filter((c) => c.memberIds.some((id) => id !== user.id));
  if (shared.length > 0) {
    const names = shared.slice(0, 3).map((c) => `"${c.name}"`).join(", ");
    return err(
      `You own ${shared.length === 1 ? "a community" : "communities"} with other members (${names}). ` +
        "Delete or transfer it first, then try again.",
      409
    );
  }

  const ownedBusinesses = await prisma.business.count({ where: { ownerId: user.id } });
  if (ownedBusinesses > 0) {
    return err("You own a business workspace. Delete it first, then try again.", 409);
  }

  const id = user.id;
  try {
    await prisma.$transaction([
      prisma.teamMember.deleteMany({ where: { userId: id } }),
      prisma.userSettings.deleteMany({ where: { userId: id } }),
      prisma.screenTimeDay.deleteMany({ where: { userId: id } }),
      prisma.favoriteSound.deleteMany({ where: { userId: id } }),
      prisma.mutedCreator.deleteMany({ where: { OR: [{ userId: id }, { mutedUserId: id }] } }),
      prisma.conversationHide.deleteMany({ where: { OR: [{ userId: id }, { otherUserId: id }] } }),
      prisma.sound.deleteMany({ where: { authorId: id } }),
      prisma.postReport.deleteMany({ where: { reporterId: id } }),
      prisma.userReport.deleteMany({ where: { reporterId: id } }),
      prisma.report.deleteMany({ where: { reporterId: id } }),
      prisma.feedback.deleteMany({ where: { userId: id } }),
      // Everything linked with a foreign key (posts, comments, messages,
      // friends, follows, blocks, notifications...) is removed with the user.
      prisma.user.delete({ where: { id } }),
    ]);
  } catch (e) {
    console.error("Account deletion failed:", e);
    return err("Couldn't delete your account. Please try again.", 500);
  }

  // Clean the user's id out of lists on other people's content. Best effort:
  // the account is already gone, so a problem here is only logged.
  for (const [table, column] of ARRAY_COLUMNS) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET "${column}" = array_remove("${column}", $1::text) WHERE $1::text = ANY("${column}")`,
        id
      );
    } catch (e) {
      console.error(`Cleanup failed for ${table}.${column}:`, e);
    }
  }

  return NextResponse.json({ ok: true });
}