import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";
import {
  getSettings, ageFromDob, tierForAge, sanitizePatch, touchesGuarded,
} from "@/lib/userSettings";

const ALLOWED_VALUES = {
  allowComments: ["everyone", "friends", "none"],
  allowMentions: ["everyone", "friends", "none"],
};

// The settings a parent can lock, and that under-16 accounts can't loosen.
const GUARDED_KEYS = ["isPublic", "allowComments", "allowMentions"];

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const settings = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      allowComments: true,
      allowMentions: true,
      shareProfileLinks: true,
      hideFollowing: true,
      hideLikedVideos: true,
      isPublic: true,
    },
  });

  return NextResponse.json({ settings });
}

export async function PATCH(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const data = {};

  for (const key of ["allowComments", "allowMentions"]) {
    if (body[key] !== undefined) {
      if (!ALLOWED_VALUES[key].includes(body[key])) {
        return NextResponse.json({ error: `Invalid value for ${key}.` }, { status: 400 });
      }
      data[key] = body[key];
    }
  }

  for (const key of ["shareProfileLinks", "hideFollowing", "hideLikedVideos", "isPublic"]) {
    if (body[key] !== undefined) data[key] = !!body[key];
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  // Age rules and guardian PIN lock, only for values that actually change.
  const wanted = {};
  for (const key of GUARDED_KEYS) {
    if (key in data && data[key] !== user[key]) wanted[key] = data[key];
  }

  if (Object.keys(wanted).length > 0) {
    const [settings, full] = await Promise.all([
      getSettings(user.id),
      prisma.user.findUnique({ where: { id: user.id }, select: { dateOfBirth: true } }),
    ]);
    const tier = tierForAge(ageFromDob(full?.dateOfBirth));

    const { userData, settingsData, error } = sanitizePatch(wanted, tier);
    if (error) {
      return NextResponse.json({ error }, { status: 403 });
    }

    if (settings.guardianPinHash && touchesGuarded(userData, settingsData)) {
      return NextResponse.json(
        { error: "This setting is locked by a guardian PIN. Use Parental controls to change it." },
        { status: 403 }
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: {
      allowComments: true,
      allowMentions: true,
      shareProfileLinks: true,
      hideFollowing: true,
      hideLikedVideos: true,
      isPublic: true,
    },
  });

  return NextResponse.json({ ok: true, settings: updated });
}