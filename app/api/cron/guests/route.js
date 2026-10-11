// app/api/cron/guests/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Guests not seen for this many days are deleted. Anyone who signed up
// stops being a guest (isGuest turns false), so they are never touched.
const GUEST_MAX_IDLE_DAYS = 30;

// Work in small batches so one run can't time out.
const BATCH_SIZE = 500;
const MAX_BATCHES = 10;

export async function GET(req) {
  try {
    const authHeader = req.headers.get("authorization");

    if (
      !process.env.CRON_SECRET ||
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - GUEST_MAX_IDLE_DAYS * 24 * 60 * 60 * 1000);
    let deleted = 0;

    for (let i = 0; i < MAX_BATCHES; i++) {
      const guests = await prisma.user.findMany({
        where: {
          isGuest: true,
          createdAt: { lt: cutoff },
          OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }],
        },
        select: { id: true },
        take: BATCH_SIZE,
      });
      if (guests.length === 0) break;

      const ids = guests.map((g) => g.id);

      // Chats, notifications and other linked data are removed automatically
      // with the user. These two tables aren't linked, so clear them here.
      await prisma.$transaction([
        prisma.userSettings.deleteMany({ where: { userId: { in: ids } } }),
        prisma.screenTimeDay.deleteMany({ where: { userId: { in: ids } } }),
        prisma.user.deleteMany({ where: { id: { in: ids } } }),
      ]);

      deleted += ids.length;
      if (guests.length < BATCH_SIZE) break;
    }

    return NextResponse.json({ ok: true, deleted, olderThan: cutoff.toISOString() });
  } catch (error) {
    console.error("Guest cleanup error:", error);
    return NextResponse.json({ error: "Guest cleanup failed." }, { status: 500 });
  }
}