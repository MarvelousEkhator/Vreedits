import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function canManage(community, userId) {
  return community.ownerId === userId || community.adminIds.includes(userId);
}

export async function GET(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const emojis = await prisma.communityEmoji.findMany({
      where: { communityId: params.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ emojis });
  } catch (err) {
    console.error("GET /api/communities/[id]/emojis error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canManage(community, userId)) {
      return NextResponse.json({ error: "You don't have permission to upload emojis or stickers." }, { status: 403 });
    }

    const body = await request.json();
    const name = (body.name || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    const type = body.type === "sticker" ? "sticker" : "emoji";
    const imageDataUrl = body.imageDataUrl;

    if (!name) return NextResponse.json({ error: "Name must contain letters, numbers, or underscores." }, { status: 400 });
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return NextResponse.json({ error: "An image is required." }, { status: 400 });
    }
    if (imageDataUrl.length > 1.4 * 1024 * 1024) {
      return NextResponse.json({ error: "Image is too large." }, { status: 400 });
    }

    const emoji = await prisma.communityEmoji.create({
      data: { communityId: params.id, name, type, imageDataUrl, createdById: userId },
    });

    return NextResponse.json({ emoji });
  } catch (err) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: "An emoji or sticker with that name already exists." }, { status: 409 });
    }
    console.error("POST /api/communities/[id]/emojis error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}