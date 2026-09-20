// app/api/track/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { pool, ensureTable, classifySource } from "../../../lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["pageview", "heartbeat", "feature", "signup", "login", "guest_start"]);
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|uptime/i;

const clean = (v, max = 100) => (typeof v === "string" && v ? v.slice(0, max) : null);
const done = (status = 204) => new NextResponse(null, { status });

// --- Guest detection (server side, from the login cookie) -------------------
// We only ask "is this user a guest?" and keep a short in-memory cache.
// No user id is ever written to the analytics table.
const accountCache = new Map();
const CACHE_MS = 5 * 60 * 1000;

async function getAccount(userId) {
  const hit = accountCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;

  let u = null;
  try {
    u = await prisma.user.findUnique({ where: { id: userId }, select: { isGuest: true, createdAt: true } });
  } catch {
    // Fallback if the User model has no createdAt field
    u = await prisma.user.findUnique({ where: { id: userId }, select: { isGuest: true } });
  }
  const info = {
    exists: Boolean(u),
    isGuest: Boolean(u?.isGuest),
    createdAt: u?.createdAt ?? null,
    at: Date.now(),
  };
  if (accountCache.size > 500) accountCache.clear();
  accountCache.set(userId, info);
  return info;
}

// --- Guest -> account conversion (detected automatically) --------------------
// If a visitor was a guest before and is now signed in as a real account,
// record one "signup" (account created after they were a guest) or "login".
const checkedVisitors = new Set();

async function detectConversion(visitor, session, account, source, country) {
  if (checkedVisitors.has(visitor)) return;
  if (checkedVisitors.size > 2000) checkedVisitors.clear();
  checkedVisitors.add(visitor);

  const { rows } = await pool.query(
    `SELECT
       min(ts) FILTER (WHERE is_guest) AS first_guest,
       bool_or(type IN ('signup', 'login')) AS converted
     FROM analytics_events WHERE visitor_id = $1`,
    [visitor]
  );
  const r = rows[0];
  if (!r?.first_guest || r.converted) return;

  const isSignup = account.createdAt && new Date(account.createdAt) > new Date(r.first_guest);
  await insertEvent({
    visitor, session, type: isSignup ? "signup" : "login",
    name: null, path: null, isGuest: false, source, country,
  });
}

function insertEvent(e) {
  return pool.query(
    `INSERT INTO analytics_events
       (visitor_id, session_id, type, name, path, is_guest, source, country)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [e.visitor, e.session, e.type, e.name, e.path, e.isGuest, e.source, e.country]
  );
}

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

    // Is the person signed in as a guest? Decided here, not by the browser.
    let account = null;
    try {
      const userId = getSessionUserId();
      if (userId != null) account = await getAccount(userId);
    } catch (e) {
      console.error("track account lookup:", e?.message);
    }
    const isGuest = Boolean(account?.isGuest);

    await ensureTable();
    await insertEvent({
      visitor, session, type,
      name: clean(b.name, 60), path: clean(b.path, 200),
      isGuest, source, country,
    });

    if (type === "pageview" && account?.exists && !account.isGuest) {
      await detectConversion(visitor, session, account, source, country);
    }
    return done();
  } catch (e) {
    // Tracking must never break the app.
    console.error("track error:", e?.message);
    return done();
  }
}
