// app/api/admin/check-user/route.js
//
// ONE-TIME DIAGNOSTIC. Visit this once while logged in to see the raw,
// unfiltered database value for your own user row — bypasses every
// layer of caching/session logic to settle what's actually stored.
// DELETE THIS FILE after checking.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await requireUser();
  if (!viewer) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  // Raw read, straight from Postgres, no select shaping, no caching.
  const raw = await prisma.$queryRawUnsafe(
    `SELECT id, username, "displayName", "avatarDataUrl", "updatedAt" FROM "User" WHERE id = $1`,
    viewer.id
  );

  return NextResponse.json({ raw, timestamp: new Date().toISOString() });
}