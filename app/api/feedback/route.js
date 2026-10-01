// app/api/feedback/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

const DAY_MS = 24 * 60 * 60 * 1000;

// What the popup lets people pick. Anything else is dropped.
const CATEGORIES = [
  "Feed & videos",
  "Camera",
  "Sounds",
  "Inbox",
  "Communities",
  "AI Tools",
  "Speed & bugs",
  "Design",
  "Other",
];

// Tells the popup whether to show (guests who haven't sent feedback this
// week) and whether there's a thank-you message waiting for this person.
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ eligible: false, thanks: null });

  const [recent, thanks] = await Promise.all([
    prisma.feedback.findFirst({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 7 * DAY_MS) } },
      select: { id: true },
    }),
    prisma.feedback.findFirst({
      where: { userId: user.id, thanksSentAt: { not: null }, thanksSeenAt: null },
      orderBy: { thanksSentAt: "desc" },
      select: { id: true, thanksMessage: true },
    }),
  ]);

  return NextResponse.json({
    eligible: !!user.isGuest && !recent,
    thanks: thanks ? { id: thanks.id, message: thanks.thanksMessage } : null,
  });
}

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // The person closed the thank-you card.
  if (body?.action === "seenThanks") {
    await prisma.feedback.updateMany({
      where: { id: String(body.id || ""), userId: user.id, thanksSentAt: { not: null } },
      data: { thanksSeenAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  // Sending feedback.
  const message = String(body?.message || "").trim().slice(0, 1000);
  if (message.length < 3) {
    return NextResponse.json({ error: "Tell us a little more." }, { status: 400 });
  }

  const categories = Array.isArray(body?.categories)
    ? [...new Set(body.categories.filter((c) => CATEGORIES.includes(c)))].slice(0, CATEGORIES.length)
    : [];
  const page = typeof body?.page === "string" ? body.page.slice(0, 200) : null;

  // Keeps spam out: at most 5 messages a day per person.
  const today = await prisma.feedback.count({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
  });
  if (today >= 5) {
    return NextResponse.json({ error: "You've sent a lot today. Thank you!" }, { status: 429 });
  }

  await prisma.feedback.create({
    data: {
      userId: user.id,
      username: user.username || null,
      isGuest: !!user.isGuest,
      categories,
      message,
      page,
    },
  });

  return NextResponse.json({ ok: true });
}