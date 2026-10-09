import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendBirthdayEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// A missed birthday wish is still sent for this many days afterwards.
const CATCH_UP_DAYS = 7;

// Max birthday emails per run. Brevo's free plan allows ~300 emails/day in
// total and verification/reset codes share that, so leave room for them.
// Override with BIRTHDAY_MAX_PER_DAY in Render's Environment tab.
const MAX_SENDS_PER_RUN = Number(process.env.BIRTHDAY_MAX_PER_DAY) || 200;

const DAY_MS = 24 * 60 * 60 * 1000;

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Age the person turns on the given date.
function calculateAge(dateOfBirth, onDate) {
  const birth = new Date(dateOfBirth);
  let age = onDate.getUTCFullYear() - birth.getUTCFullYear();

  const birthdayNotReached =
    onDate.getUTCMonth() < birth.getUTCMonth() ||
    (onDate.getUTCMonth() === birth.getUTCMonth() &&
      onDate.getUTCDate() < birth.getUTCDate());

  if (birthdayNotReached) age--;
  return age;
}

// The birthday date in a given year. Feb 29 users celebrate on Feb 28
// in non-leap years.
function birthdayInYear(dob, year) {
  const month = dob.getUTCMonth();
  let date = dob.getUTCDate();
  if (month === 1 && date === 29 && !isLeapYear(year)) date = 28;
  return new Date(Date.UTC(year, month, date));
}

// The most recent birthday that falls inside the catch-up window
// (today, or up to CATCH_UP_DAYS ago). Returns null if there isn't one.
function recentBirthday(dob, now) {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  // Also check last year so a Dec 31 birthday can still be caught on Jan 1-7.
  for (const year of [now.getUTCFullYear(), now.getUTCFullYear() - 1]) {
    const occurrence = birthdayInYear(dob, year);
    const daysAgo = Math.round((today.getTime() - occurrence.getTime()) / DAY_MS);
    if (daysAgo >= 0 && daysAgo <= CATCH_UP_DAYS) {
      return { date: occurrence, year, daysAgo };
    }
  }
  return null;
}

// Errors that mean "stop for today" (daily limit reached or key problem),
// not "this one address is bad".
function isStopError(error) {
  const msg = String(error?.message || "");
  return /\((429|402|403)\)|limit|quota/i.test(msg);
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
    const currentYear = now.getUTCFullYear();

    const users = await prisma.user.findMany({
      where: {
        dateOfBirth: { not: null },
        birthdayEmailEnabled: true,
        OR: [
          { lastBirthdayEmailYear: null },
          { lastBirthdayEmailYear: { lt: currentYear } },
        ],
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        dateOfBirth: true,
        lastBirthdayEmailYear: true,
      },
    });

    // Everyone whose birthday is today or was missed within the window,
    // skipping anyone already wished for that birthday.
    const due = [];
    for (const user of users) {
      const birthday = recentBirthday(new Date(user.dateOfBirth), now);
      if (!birthday) continue;
      if (user.lastBirthdayEmailYear === birthday.year) continue;
      due.push({ user, birthday });
    }

    // People who missed out on earlier days go first.
    due.sort((a, b) => b.birthday.daysAgo - a.birthday.daysAgo);

    const results = [];
    let sentCount = 0;
    let stoppedEarly = false;

    for (const { user, birthday } of due) {
      if (sentCount >= MAX_SENDS_PER_RUN) {
        stoppedEarly = true;
        break;
      }

      // Claim this birthday atomically before emailing, so a concurrent or
      // duplicate cron run can't send twice.
      const claim = await prisma.user.updateMany({
        where: {
          id: user.id,
          OR: [
            { lastBirthdayEmailYear: null },
            { lastBirthdayEmailYear: { not: birthday.year } },
          ],
        },
        data: { lastBirthdayEmailYear: birthday.year },
      });

      if (claim.count === 0) {
        results.push({ userId: user.id, sent: false, reason: "already-claimed" });
        continue;
      }

      const age = calculateAge(user.dateOfBirth, birthday.date);

      try {
        await sendBirthdayEmail(user.email, user.displayName, age);
        sentCount++;
        results.push({
          userId: user.id,
          sent: true,
          lateByDays: birthday.daysAgo,
        });
      } catch (error) {
        console.error(`Birthday email failed for ${user.email}:`, error);

        // Undo the claim so tomorrow's run picks this person up again.
        await prisma.user.update({
          where: { id: user.id },
          data: { lastBirthdayEmailYear: user.lastBirthdayEmailYear },
        });
        results.push({ userId: user.id, sent: false, reason: "send-failed" });

        if (isStopError(error)) {
          stoppedEarly = true;
          break;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      date: now.toISOString(),
      birthdaysDue: due.length,
      sent: sentCount,
      stoppedEarly,
      results,
    });
  } catch (error) {
    console.error("Birthday cron error:", error);
    return NextResponse.json({ error: "Birthday job failed." }, { status: 500 });
  }
}