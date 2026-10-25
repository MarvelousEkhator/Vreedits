// lib/analytics.js  (server only)
// Uses the Prisma client you already have installed, so no new packages are needed.
import { PrismaClient } from "@prisma/client";

const prisma =
  globalThis.__vreeditsAnalyticsPrisma ??
  (globalThis.__vreeditsAnalyticsPrisma = new PrismaClient());

// Small wrapper so the rest of the code can run plain SQL: pool.query(text, params) -> { rows }
export const pool = {
  async query(text, params = []) {
    if (/^\s*(insert|create|update|alter)\s/i.test(text)) {
      await prisma.$executeRawUnsafe(text, ...params);
      return { rows: [] };
    }
    return { rows: await prisma.$queryRawUnsafe(text, ...params) };
  },
};

// The table now comes from prisma/schema.prisma (created by `prisma db push` during the build).
// Signed-in people: one row per account, so the dashboard can show who signed up and how they arrived.
// (Only the owner dashboard reads this. The events table itself still never stores a user id.)
let membersReady = false;
export async function ensureTable() {
  if (membersReady) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS analytics_members (
       user_id text PRIMARY KEY,
       visitor_id text NOT NULL,
       first_ts timestamptz NOT NULL DEFAULT now(),
       last_ts timestamptz NOT NULL DEFAULT now()
     )`
  );
  membersReady = true;
}

const SEARCH = /(google|bing|duckduckgo|yahoo|ecosia|brave|baidu|yandex|startpage)/;

// Known places people share links. Anything else is kept as "other:<site>" so you can see the exact site.
const SOCIAL = [
  ["linkedin", /linkedin|lnkd\.in/],
  ["whatsapp", /whatsapp|wa\.me/],
  ["facebook", /facebook|fb\.com|fb\.me|l\.facebook|lm\.facebook/],
  ["instagram", /instagram|l\.instagram/],
  ["tiktok", /tiktok/],
  ["twitter", /twitter|t\.co|x\.com/],
  ["telegram", /telegram|t\.me/],
  ["youtube", /youtube|youtu\.be/],
  ["reddit", /reddit/],
  ["snapchat", /snapchat/],
  ["discord", /discord/],
  ["github", /github/],
];

// Buckets a visit into: a social/messaging name | direct | search | other:<site>
export function classifySource(referrer, utm, selfHost) {
  const u = (utm || "").toLowerCase();
  let host = "";
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {}
  const hay = `${host} ${u}`;

  for (const [name, re] of SOCIAL) if (re.test(hay)) return name;
  if (!host && !u) return "direct";
  const self = (selfHost || "").split(":")[0].toLowerCase();
  if (host && self && (host === self || host === `www.${self}`)) return "direct";
  if (SEARCH.test(hay)) return "search";
  if (host) return `other:${host.replace(/^www\./, "").slice(0, 60)}`;
  return `other:${u.slice(0, 40)}`;
}
