// app/api/admin/migrate-comment-pin/route.js
//
// ONE-TIME USE. Adds the `pinned` column to FeedComment. Visit this URL
// once while logged in (GET works directly in a browser tab), confirm
// "ok": true, then DELETE THIS FILE.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function POST() {
  return runMigration();
}

export async function GET() {
  return runMigration();
}

async function runMigration() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "FeedComment" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false`
    );
    return NextResponse.json({
      ok: true,
      reminder: "Delete app/api/admin/migrate-comment-pin/route.js now that this has run.",
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}