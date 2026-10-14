// app/api/feedback/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { pool } from "../../../lib/analytics";
import { ensureFeedbackTable } from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser() {
  const userId = await getSessionUserId();
  if (userId == null) return null;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, displayName: true, isGuest: true },
  });
  return u || null;
}

const json = (body, status = 200) => NextResponse.json(body, { status });

// Tells the browser who is signed in and whether to show the popup.
export async function GET() {
  try {
    const u = await currentUser();
    if (!u) return json({ signedIn: false, guest: false, eligible: false });
    if (u.isGuest) return json({ signedIn: true, guest: true, eligible: false });

    await ensureFeedbackTable();
    const { rows } = await pool.query(
      `SELECT 1 FROM feedback WHERE user_id = $1 LIMIT 1`,
      [String(u.id)]
    );
    return json({
      signedIn: true,
      guest: false,
      eligible: rows.length === 0,
      username: u.username,
      name: u.displayName || u.username,
    });
  } catch (e) {
    console.error("feedback status:", e?.message);
    return json({ signedIn: false, guest: false, eligible: false });
  }
}

export async function POST(req) {
  try {
    const u = await currentUser();
    if (!u) return json({ error: "Please log in to send feedback." }, 401);
    if (u.isGuest) {
      return json({ error: "Feedback is for members. Create an account to share yours." }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Invalid request." }, 400);

    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return json({ error: "Pick a star rating from 1 to 5." }, 400);
    }
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";
    const source = body.source === "popup" ? "popup" : "settings";

    await ensureFeedbackTable();

    // Basic spam guard: one submission per 20 seconds per user.
    const recent = await pool.query(
      `SELECT 1 FROM feedback WHERE user_id = $1 AND created_at > now() - interval '20 seconds' LIMIT 1`,
      [String(u.id)]
    );
    if (recent.rows.length) {
      return json({ error: "You just sent feedback. Please wait a moment." }, 429);
    }

    await pool.query(
      `INSERT INTO feedback (user_id, username, display_name, rating, message, source)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [String(u.id), u.username, u.displayName || null, rating, message || null, source]
    );
    return json({ ok: true }, 201);
  } catch (e) {
    console.error("feedback post:", e?.message);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}