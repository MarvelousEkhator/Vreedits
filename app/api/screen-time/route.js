// app/api/screen-time/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";
import { getSettings } from "@/lib/userSettings";
import { localTime, buildStatus } from "@/lib/screenTime";

export const dynamic = "force-dynamic";

const MAX_HEARTBEAT_SECONDS = 65;

async function loadRow(userId, day) {
  return prisma.screenTimeDay.findUnique({ where: { userId_day: { userId, day } } });
}

// Where does today stand? (used when the app opens)
export async function GET(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const local = localTime(new URL(req.url).searchParams.get("tz"));
  const [settings, row] = await Promise.all([getSettings(user.id), loadRow(user.id, local.day)]);
  return NextResponse.json(buildStatus(settings, row, local));
}

// Heartbeat: the app calls this every 30 seconds while it's open and visible.
export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const local = localTime(body?.tz);
  const settings = await getSettings(user.id);

  let row = await loadRow(user.id, local.day);
  let status = buildStatus(settings, row, local);
  if (status.blocked) return NextResponse.json(status);

  const seconds = Math.max(0, Math.min(MAX_HEARTBEAT_SECONDS, Math.floor(Number(body?.seconds) || 0)));
  if (seconds > 0) {
    row = await prisma.screenTimeDay.upsert({
      where: { userId_day: { userId: user.id, day: local.day } },
      create: { userId: user.id, day: local.day, secondsUsed: seconds },
      update: { secondsUsed: { increment: seconds } },
    });
    status = buildStatus(settings, row, local);
  }
  return NextResponse.json(status);
}