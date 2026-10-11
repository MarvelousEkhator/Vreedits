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

// --- Section names -----------------------------------------------------------
// Page views that arrive without a name get one from the page address, so the
// "What people use" list on the dashboard covers the whole app. Longer
// addresses come first so /ai-tools/chat is matched before /ai-tools.
const PATH_NAMES = [
  ["/ai-tools/chat", "syna"],
  ["/ai-tools", "ai_tools"],
  ["/tools/school", "school"],
  ["/tools/business", "business"],
  ["/tools/writing", "writing"],
  ["/tools/travel", "travel"],
  ["/tools/home", "home_tools"],
  ["/feed", "feed"],
  ["/inbox", "inbox"],
  ["/communities", "community"],
  ["/favourites", "favorites"],
  ["/history", "history"],
  ["/collections", "collections"],
  ["/notifications", "notifications"],
  ["/profile", "profile"],
  ["/settings", "settings"],
];

function nameFromPath(path) {
  if (!path) return null;
  const p = path.split("?")[0].toLowerCase();
  for (const [prefix, name] of PATH_NAMES) {
    if (p === prefix || p.startsWith(prefix + "/")) return name;
  }
  return null;
}

// --- Account lookup (server side, from the login cookie) ---------------------
// We only ask "is this user a guest, and when was the account made?" and keep
// a short in-memory cache. No user id is ever written to the analytics table.
// Guests are cached only briefly, so a guest who signs up is seen as a real
// account within seconds, not minutes.
const accountCache = new Map();
const CACHE_MS = 5 * 60 * 1000;
const GUEST_CACHE_MS = 15 * 1000;

async function getAccount(userId) {
  const hit = accountCache.get(userId);
  if (hit && Date.now() - hit.at < (hit.isGuest ? GUEST_CACHE_MS : CACHE_MS)) return hit;

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

function insertEvent(e) {
  return pool.query(
    `INSERT INTO analytics_events
       (visitor_id, session_id, type, name, path, is_guest, source, country)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [e.visitor, e.session, e.type, e.name, e.path, e.isGuest, e.source, e.country]
  );
}

// --- Guest start -------------------------------------------------------------
// The first time a visitor is seen as a guest, record one "guest_start".
const guestStarted = new Set();

async function maybeRecordGuestStart(visitor, session, source, country) {
  if (guestStarted.has(visitor)) return;
  if (guestStarted.size > 2000) guestStarted.clear();
  guestStarted.add(visitor);
  try {
    const { rows } = await pool.query(
      `SELECT 1 AS found FROM analytics_events
       WHERE visitor_id = $1 AND type = 'guest_start' LIMIT 1`,
      [visitor]
    );
    if (rows.length) return;
    await insertEvent({
      visitor, session, type: "guest_start",
      name: null, path: null, isGuest: true, source, country,
    });
  } catch (e) {
    guestStarted.delete(visitor);
    console.error("track guest_start:", e?.message);
  }
}

// --- Signup / login (detected automatically) ---------------------------------
// The first time a visitor is seen signed in as a real account, record one
// event for them: "signup" if the account is new (see below), otherwise "login".
//
// An account counts as new when it was created within 10 minutes of the
// visitor's first visit (or of their guest start, since a guest who signs up
// keeps the same account), and, if they never browsed as a guest, within the
// last 24 hours.
const NEW_ACCOUNT_SLACK_MS = 10 * 60 * 1000;
const FRESH_ACCOUNT_MS = 24 * 60 * 60 * 1000;
const checkedVisitors = new Set();

async function detectConversion(visitor, session, account, source, country) {
  if (checkedVisitors.has(visitor)) return;
  if (checkedVisitors.size > 2000) checkedVisitors.clear();
  checkedVisitors.add(visitor);

  try {
    const { rows } = await pool.query(
      `SELECT
         min(ts) AS first_seen,
         min(ts) FILTER (WHERE is_guest) AS first_guest,
         bool_or(type IN ('signup', 'login')) AS converted
       FROM analytics_events WHERE visitor_id = $1`,
      [visitor]
    );
    const r = rows[0];
    if (!r || r.converted) return;

    const created = account.createdAt ? new Date(account.createdAt).getTime() : null;
    const hadGuestPhase = Boolean(r.first_guest);
    const reference = new Date(r.first_guest || r.first_seen || Date.now()).getTime();

    const isSignup =
      created !== null &&
      created >= reference - NEW_ACCOUNT_SLACK_MS &&
      (hadGuestPhase || Date.now() - created < FRESH_ACCOUNT_MS);

    await insertEvent({
      visitor, session, type: isSignup ? "signup" : "login",
      name: null, path: null, isGuest: false, source, country,
    });
  } catch (e) {
    checkedVisitors.delete(visitor);
    console.error("track conversion:", e?.message);
  }
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

    const path = clean(b.path, 200);
    let name = clean(b.name, 60);
    if (type === "pageview") {
      const fromPath = nameFromPath(path);
      // The Syna chat always counts as "syna", even if the browser sent a
      // broader name for it.
      if (fromPath && (!name || fromPath === "syna")) name = fromPath;
    }

    await ensureTable();

    if (isGuest && type !== "guest_start") {
      await maybeRecordGuestStart(visitor, session, source, country);
    }

    await insertEvent({
      visitor, session, type, name, path,
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