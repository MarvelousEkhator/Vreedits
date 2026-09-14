// app/api/admin/migrate-comments/route.js
//
// ONE-TIME USE ONLY. This exists to patch the production database to
// match the FeedComment schema change (likedBy + parentId/replies) since
// there's no way to run `npx prisma db push` directly (no Render Shell,
// no confirmed local setup). Hit this once while logged in, confirm it
// works, then DELETE THIS FILE — leaving a route that alters your
// database schema sitting in the live app isn't something to keep
// around long-term.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function POST() {
  return runMigration();
}

// Also callable via GET so it can be triggered by just visiting the URL
// in a browser tab where you're already logged into Vreedits — no REST
// client needed for this one-time use.
export async function GET() {
  return runMigration();
}

async function runMigration() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const results = [];

  const statements = [
    {
      label: "add likedBy column",
      sql: `ALTER TABLE "FeedComment" ADD COLUMN IF NOT EXISTS "likedBy" TEXT[] NOT NULL DEFAULT '{}'`,
    },
    {
      label: "add parentId column",
      sql: `ALTER TABLE "FeedComment" ADD COLUMN IF NOT EXISTS "parentId" TEXT`,
    },
  ];

  for (const { label, sql } of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      results.push({ step: label, ok: true });
    } catch (err) {
      results.push({ step: label, ok: false, error: err.message });
    }
  }

  // The foreign key constraint doesn't have an "IF NOT EXISTS" form in
  // Postgres, so this checks pg_constraint first to stay safe if this
  // route accidentally gets hit twice.
  try {
    const existing = await prisma.$queryRawUnsafe(
      `SELECT 1 FROM pg_constraint WHERE conname = 'FeedComment_parentId_fkey'`
    );
    if (existing.length === 0) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE`
      );
      results.push({ step: "add parentId foreign key", ok: true });
    } else {
      results.push({ step: "add parentId foreign key", ok: true, note: "already existed" });
    }
  } catch (err) {
    results.push({ step: "add parentId foreign key", ok: false, error: err.message });
  }

  const allOk = results.every((r) => r.ok);

  return NextResponse.json({
    ok: allOk,
    results,
    reminder: "Delete app/api/admin/migrate-comments/route.js now that this has run.",
  });
}
