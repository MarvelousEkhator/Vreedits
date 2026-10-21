import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkImages } from "@/lib/imageSafety";

// The crop screen outputs small JPEGs, so this is generous.
const MAX_IMAGE_CHARS = 2_500_000;

function canManage(community, userId) {
  return community.ownerId === userId || community.adminIds.includes(userId);
}

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidImage(value) {
  return typeof value === "string" && value.startsWith("data:image/") && value.length <= MAX_IMAGE_CHARS;
}

export async function PATCH(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canManage(community, userId)) {
      return NextResponse.json({ error: "You don't have permission to edit this community." }, { status: 403 });
    }

    const body = await request.json();
    const data = {};
    const imagesToCheck = [];

    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.description === "string") data.description = body.description.trim() || null;
    if (typeof body.welcomeMessage === "string") data.welcomeMessage = body.welcomeMessage.trim() || null;
    if (typeof body.category === "string") data.category = body.category.trim() || null;
    if (typeof body.accentColor === "string") data.accentColor = body.accentColor || null;
    if (Array.isArray(body.tags)) data.tags = body.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());

    // Banner and icon: an empty string removes the image; anything else must
    // be a real, reasonably sized image and is checked before it is saved.
    for (const field of ["bannerDataUrl", "iconDataUrl"]) {
      if (typeof body[field] !== "string") continue;
      if (body[field] === "") {
        data[field] = null;
        continue;
      }
      if (!isValidImage(body[field])) {
        return NextResponse.json({ error: "That image isn't valid or is too large." }, { status: 400 });
      }
      data[field] = body[field];
      imagesToCheck.push(body[field]);
    }

    if (typeof body.slug === "string" && body.slug.trim()) {
      const clean = slugify(body.slug);
      if (!clean) return NextResponse.json({ error: "Invalid slug." }, { status: 400 });
      const existing = await prisma.community.findUnique({ where: { slug: clean } });
      if (existing && existing.id !== params.id) {
        return NextResponse.json({ error: "That URL is already taken." }, { status: 409 });
      }
      data.slug = clean;
    }

    if (Array.isArray(body.adminIds) && community.ownerId === userId) {
      data.adminIds = body.adminIds.filter((id) => typeof id === "string");
    }

    // The scan comes last, after all the cheap checks.
    if (imagesToCheck.length > 0) {
      const scan = await checkImages(imagesToCheck);
      if (!scan.ok) {
        return NextResponse.json(
          { error: scan.message },
          { status: scan.code === "unavailable" ? 503 : 422 }
        );
      }
    }

    const updated = await prisma.community.update({ where: { id: params.id }, data });

    return NextResponse.json({
      community: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        description: updated.description,
        iconDataUrl: updated.iconDataUrl,
        bannerDataUrl: updated.bannerDataUrl,
        welcomeMessage: updated.welcomeMessage,
        category: updated.category,
        tags: updated.tags,
        accentColor: updated.accentColor,
        adminIds: updated.adminIds,
      },
    });
  } catch (err) {
    console.error("PATCH /api/communities/[id]/settings error:", err);
    if (err.code === "P2002") {
      return NextResponse.json({ error: "A community with that name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}