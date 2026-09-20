// lib/analytics.js  (server only)
import { Pool } from "pg";

// One shared pool, reused across hot reloads / requests.
export const pool =
  globalThis.__vreeditsPool ??
  (globalThis.__vreeditsPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Render/Neon need SSL. Set DATABASE_SSL=false in env if your DB rejects it.
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    max: 3,
  }));

let ready;
// Creates the events table the first time it's needed. Safe to call repeatedly.
export function ensureTable() {
  ready ??= pool
    .query(
      `
      CREATE TABLE IF NOT EXISTS analytics_events (
        id         BIGSERIAL PRIMARY KEY,
        ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
        visitor_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        type       TEXT NOT NULL,
        name       TEXT,
        path       TEXT,
        is_guest   BOOLEAN NOT NULL DEFAULT false,
        source     TEXT,
        country    TEXT
      );
      CREATE INDEX IF NOT EXISTS analytics_events_ts_idx ON analytics_events (ts);
      CREATE INDEX IF NOT EXISTS analytics_events_visitor_idx ON analytics_events (visitor_id, ts);
      CREATE INDEX IF NOT EXISTS analytics_events_session_idx ON analytics_events (session_id);
      `
    )
    .catch((e) => {
      ready = undefined;
      throw e;
    });
  return ready;
}

const SEARCH = /(google|bing|duckduckgo|yahoo|ecosia|brave|baidu|yandex|startpage)/;

// Buckets a visit into: linkedin | direct | search | other
export function classifySource(referrer, utm, selfHost) {
  const u = (utm || "").toLowerCase();
  let host = "";
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {}
  const hay = `${host} ${u}`;

  if (/linkedin|lnkd\.in/.test(hay)) return "linkedin";
  if (!host && !u) return "direct";
  const self = (selfHost || "").split(":")[0].toLowerCase();
  if (host && self && (host === self || host === `www.${self}`)) return "direct";
  if (SEARCH.test(hay)) return "search";
  return "other";
}
