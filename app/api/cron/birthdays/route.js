import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendBirthdayEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function calculateAge(dateOfBirth, today = new Date()) {
  const birth = new Date(dateOfBirth);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();

  const birthdayNotReached =
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() &&
      today.getUTCDate() < birth.getUTCDate());

  if (birthdayNotReached) age--;
  return age;
}

// Feb 29 users celebrate on Feb 28 in non-leap years
function isBirthdayMatch(dob, now) {
  const dobMonth = dob.getUTCMonth();
  const dobDate = dob.getUTCDate();
  const nowMonth = now.getUTCMonth();
  const nowDate = now.getUTCDate();

  if (dobMonth === nowMonth && dobDate === nowDate) return true;

  const leapDayFallback =
    dobMonth === 1 && // February
    dobDate === 29 &&
    !isLeapYear(now.getUTCFullYear()) &&
    nowMonth === 1 &&
    nowDate === 28;

  return leapDayFallback;
}

export async function GET(req) {
  try {
    const authHeader = req.headers.get("authorization");

    if (
      !process.env.CRON_SECRET ||
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const year = now.getUTCFullYear();

    const users = await prisma.user.findMany({
      where: {
        dateOfBirth: { not: null },
        birthdayEmailEnabled: true,
        OR: [
          { lastBirthdayEmailYear: null },
          { lastBirthdayEmailYear: { not: year } },
        ],
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        dateOfBirth: true,
      },
    });

    const birthdayUsers = users.filter((user) =>
      isBirthdayMatch(new Date(user.dateOfBirth), now)
    );

    const results = [];

    for (const user of birthdayUsers) {
      // Claim this year's send atomically before emailing, so a
      // concurrent/duplicate cron run can't send twice.
      const claim = await prisma.user.updateMany({
        where: {
          id: user.id,
          OR: [
            { lastBirthdayEmailYear: null },
            { lastBirthdayEmailYear: { not: year } },
          ],
        },
        data: { lastBirthdayEmailYear: year },
      });

      if (claim.count === 0) {
        // Another run already claimed/sent it this year.
        results.push({ userId: user.id, sent: false, reason: "already-claimed" });
        continue;
      }

      const age = calculateAge(user.dateOfBirth, now);

      try {
        await sendBirthdayEmail(user.email, user.displayName, age);
        results.push({ userId: user.id, sent: true });
      } catch (error) {
        console.error(`Birthday email failed for ${user.email}:`, error);
        // Roll back the claim so a future run can retry.
        await prisma.user.update({
          where: { id: user.id },
          data: { lastBirthdayEmailYear: null },
        });
        results.push({ userId: user.id, sent: false, reason: "send-failed" });
      }
    }

    return NextResponse.json({
      ok: true,
      date: now.toISOString(),
      birthdaysFound: birthdayUsers.length,
      results,
    });
  } catch (error) {
    console.error("Birthday cron error:", error);
    return NextResponse.json({ error: "Birthday job failed." }, { status: 500 });
  }
}