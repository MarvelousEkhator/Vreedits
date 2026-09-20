import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

const ALLOWED_VALUES = {
  allowComments: ["everyone", "friends", "none"],
  allowMentions: ["everyone", "friends", "none"],
};

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