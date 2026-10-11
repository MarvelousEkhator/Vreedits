import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { signSession, setSessionCookie, getSessionUserId } from "@/lib/auth";

// Each IP address can start this many NEW guest accounts per hour.
// Kept fairly high because many phones on mobile networks share one IP.
const MAX_NEW_GUESTS_PER_IP = 20;
const WINDOW_MS = 60 * 60 * 1000;

// In memory, so it resets when the server restarts or redeploys, and each
// server instance keeps its own count. Fine for a single Render service.
const hits = new Map();

function clientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function tooManyGuests(ip) {
  const now = Date.now();

  // Occasionally drop old entries so the map can't grow forever.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(key);
    }
  }

  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_NEW_GUESTS_PER_IP) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export async function POST(req) {
  // Already browsing as a guest? Keep that account instead of making another.
  try {
    const existingId = getSessionUserId();
    if (existingId) {
      const existing = await prisma.user.findUnique({
        where: { id: existingId },
        select: { id: true, username: true, email: true, isGuest: true },
      });
      if (existing?.isGuest) {
        setSessionCookie(signSession(existing.id));
        return NextResponse.json({
          ok: true,
          user: { id: existing.id, username: existing.username, email: existing.email, isGuest: true },
        });
      }
    }
  } catch (e) {
    console.error("Guest session reuse check failed:", e);
  }

  if (tooManyGuests(clientIp(req))) {
    return NextResponse.json(
      { error: "Too many guest sessions from this network. Please try again later or create an account." },
      { status: 429 }
    );
  }

  const suffix = randomBytes(6).toString("hex");

  let guest;
  try {
    guest = await prisma.user.create({
      data: {
        username: `guest_${suffix}`,
        displayName: "Guest",
        email: `guest_${suffix}@guest.vreedits.local`,
        passwordHash: "",
        verified: true,
        online: true,
        isGuest: true,
      },
    });
  } catch (e) {
    console.error("Guest creation failed:", e);
    return NextResponse.json({ error: "Couldn't start guest session." }, { status: 500 });
  }

  setSessionCookie(signSession(guest.id));

  return NextResponse.json({
    ok: true,
    user: { id: guest.id, username: guest.username, email: guest.email, isGuest: true },
  });
}