// app/api/admin/feedback/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";
import { isFeedbackAdmin } from "@/lib/feedbackAdmin";

export async function GET(req) {
  const user = await requireUser();
  if (!isFeedbackAdmin(user)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter");

  const where =
    filter === "new" ? { status: "new" } :
    filter === "notThanked" ? { thanksSentAt: null } :
    {};

  const [items, total, newCount, notThankedCount] = await Promise.all([
    prisma.feedback.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.feedback.count(),
    prisma.feedback.count({ where: { status: "new" } }),
    prisma.feedback.count({ where: { thanksSentAt: null } }),
  ]);

  return NextResponse.json({ items, counts: { total, new: newCount, notThanked: notThankedCount } });
}

export async function POST(req) {
  const user = await requireUser();
  if (!isFeedbackAdmin(user)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const ids = Array.isArray(body?.ids) ? body.ids.map(String).slice(0, 500) : [];

  if (body?.action === "markRead") {
    await prisma.feedback.updateMany({ where: { id: { in: ids } }, data: { status: "read" } });
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "delete") {
    await prisma.feedback.deleteMany({ where: { id: { in: ids } } });
    return NextResponse.json({ ok: true });
  }

  // Send thanks to the chosen messages, or to everyone not thanked yet.
  if (body?.action === "thank") {
    const message = String(body.message || "").trim().slice(0, 500);
    if (!message) return NextResponse.json({ error: "Write a thank-you message first." }, { status: 400 });

    const targets = await prisma.feedback.findMany({
      where: {
        thanksSentAt: null,
        ...(body.allPending ? {} : { id: { in: ids } }),
      },
      select: { id: true, userId: true },
    });
    if (targets.length === 0) return NextResponse.json({ ok: true, sent: 0 });

    const now = new Date();
    await prisma.feedback.updateMany({
      where: { id: { in: targets.map((t) => t.id) } },
      data: { thanksMessage: message, thanksSentAt: now, status: "read" },
    });

    // Also drop it in their notifications (best effort, only for accounts
    // that still exist). The popup shows it the next time they open the app.
    try {
      const userIds = [...new Set(targets.map((t) => t.userId))];
      const existing = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true },
      });
      if (existing.length) {
        await prisma.notification.createMany({
          data: existing.map((u) => ({
            userId: u.id,
            category: "feedback",
            title: "Thanks from the Vreedits team",
            description: message,
          })),
        });
      }
    } catch {
      // Notifications are a bonus; the thank-you popup still works without them.
    }

    return NextResponse.json({ ok: true, sent: targets.length });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}