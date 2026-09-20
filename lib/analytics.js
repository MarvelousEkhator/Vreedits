// lib/analytics.js  (server only)
// Uses the Prisma client you already have installed, so no new packages are needed.
import { PrismaClient } from "@prisma/client";

const prisma =
  globalThis.__vreeditsAnalyticsPrisma ??
  (globalThis.__vreeditsAnalyticsPrisma = new PrismaClient());

// Small wrapper so the rest of the code can run plain SQL: pool.query(text, params) -> { rows }
export const pool = {
  async query(text, params = []) {
    if (/^\s*insert\s/i.test(text)) {
      await prisma.$executeRawUnsafe(text, ...params);
      return { rows: [] };
    }
    return { rows: await prisma.$queryRawUnsafe(text, ...params) };
  },
};

// The table now comes from prisma/schema.prisma (created by `prisma db push` during the build).
export async function ensureTable() {}

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
