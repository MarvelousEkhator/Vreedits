import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkImages } from "@/lib/imageSafety";

const MAX_IMAGE_CHARS = 1.4 * 1024 * 1024;
const MAX_NAME_CHARS = 32;
const MAX_EMOJIS_PER_COMMUNITY = 100;

function canManage(community, userId) {
  return community.ownerId === userId || community.adminIds.includes(userId);
}

export async function GET(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Only members can see a community's emojis and stickers.
    if (community.ownerId !== userId && !community.memberIds.includes(userId)) {
      return NextResponse.json({ error: "You must join this community first." }, { status: 403 });
    }

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

    const body = await request.json().catch(() => ({}));
    const name = (body.name || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, MAX_NAME_CHARS);
    const type = body.type === "sticker" ? "sticker" : "emoji";
    const imageDataUrl = body.imageDataUrl;

    if (!name) return NextResponse.json({ error: "Name must contain letters, numbers, or underscores." }, { status: 400 });
    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "An image is required." }, { status: 400 });
    }
    if (imageDataUrl.length > MAX_IMAGE_CHARS) {
      return NextResponse.json({ error: "Image is too large." }, { status: 400 });
    }

    const count = await prisma.communityEmoji.count({ where: { communityId: params.id } });
    if (count >= MAX_EMOJIS_PER_COMMUNITY) {
      return NextResponse.json({ error: "This community has reached its emoji and sticker limit." }, { status: 400 });
    }

    // Emojis and stickers are shown to every member, so they are checked first.
    const scan = await checkImages([imageDataUrl]);
    if (!scan.ok) {
      return NextResponse.json(
        { error: scan.message },
        { status: scan.code === "unavailable" ? 503 : 422 }
      );
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