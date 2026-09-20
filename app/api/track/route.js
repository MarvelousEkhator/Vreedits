// app/api/track/route.js
import { NextResponse } from "next/server";
import { pool, ensureTable, classifySource } from "../../../lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["pageview", "heartbeat", "feature", "signup", "login", "guest_start"]);
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|uptime/i;

const clean = (v, max = 100) => (typeof v === "string" && v ? v.slice(0, max) : null);
const done = (status = 204) => new NextResponse(null, { status });

export async function POST(req) {
  try {
    const ua = req.headers.get("user-agent") || "";
    if (!ua || BOT.test(ua)) return done();

    const b = await req.json();
    const type = clean(b.type, 20);
    const visitor = clean(b.visitorId, 64);
    const session = clean(b.sessionId, 64);
    if (!TYPES.has(type) || !visitor || !session) return done(400);

    // Broad location only: 2-letter country code from the host's edge header.
    // No IP address is ever stored.
    const rawCountry = (
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-vercel-ip-country") ||
      ""
    ).toUpperCase();
    const country = /^[A-Z]{2}$/.test(rawCountry) && rawCountry !== "XX" ? rawCountry : null;

    const source = classifySource(
      clean(b.ref, 300) || "",
      clean(b.utm, 60) || "",
      req.headers.get("host") || ""
    );

    await ensureTable();
    await pool.query(
      `INSERT INTO analytics_events
         (visitor_id, session_id, type, name, path, is_guest, source, country)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [visitor, session, type, clean(b.name, 60), clean(b.path, 200), b.isGuest === true, source, country]
    );
    return done();
  } catch (e) {
    // Tracking must never break the app.
    console.error("track error:", e?.message);
    return done();
  }
}
