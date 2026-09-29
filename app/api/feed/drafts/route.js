import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";
import { extractHashtags } from "@/lib/hashtags";

const LITE_AUTHOR_SELECT = { id: true, username: true, displayName: true, avatarDataUrl: true };

function shapeDraft(p, includeMedia) {
  return {
    id: p.id,
    caption: p.caption,
    // Videos are base64 inside the database, so the list never sends
    // them. Load one draft with ?id= to get its full media.
    mediaUrl: includeMedia || p.mediaType === "image" ? p.mediaUrl : null,
    mediaType: p.mediaType,
    hasMedia: !!p.mediaUrl,
    tags: p.tags,
    isPrivate: p.isPrivate,
    isDraft: true,
    soundId: p.soundId || null,
    createdAt: p.createdAt,
  };
}

export async function GET(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const draft = await prisma.feedPost.findFirst({
      where: { id, authorId: user.id, isDraft: true },
    });
    if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    return NextResponse.json({ draft: shapeDraft(draft, true) });
  }

  const drafts = await prisma.feedPost.findMany({
    where: { authorId: user.id, isDraft: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ drafts: drafts.map((d) => shapeDraft(d, false)) });
}

export async function PATCH(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { id, caption, isPrivate, publish } = body || {};
  if (!id) return NextResponse.json({ error: "Missing draft id." }, { status: 400 });

  const existing = await prisma.feedPost.findFirst({
    where: { id, authorId: user.id, isDraft: true },
    select: { id: true, caption: true, mediaUrl: true },
  });
  if (!existing) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

  const data = {};

  if (typeof caption === "string") {
    const trimmed = caption.trim().slice(0, 500);
    data.caption = trimmed || null;
    data.tags = extractHashtags(trimmed);
  }
  if (typeof isPrivate === "boolean") data.isPrivate = isPrivate;

  if (publish) {
    const finalCaption = "caption" in data ? data.caption : existing.caption;
    if (!finalCaption && !existing.mediaUrl) {
      return NextResponse.json({ error: "Add a caption or media before publishing." }, { status: 400 });
    }
    data.isDraft = false;
    data.createdAt = new Date();
  }

  const updated = await prisma.feedPost.update({
    where: { id: existing.id },
    data,
    include: { author: { select: LITE_AUTHOR_SELECT } },
  });

  return NextResponse.json({
    ok: true,
    published: !updated.isDraft,
    post: {
      id: updated.id,
      caption: updated.caption,
      mediaType: updated.mediaType,
      tags: updated.tags,
      isPrivate: updated.isPrivate,
      isDraft: updated.isDraft,
      createdAt: updated.createdAt,
      author: updated.author,
    },
  });
}

export async function DELETE(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing draft id." }, { status: 400 });

  // Only ever deletes drafts, never a published post.
  const result = await prisma.feedPost.deleteMany({
    where: { id, authorId: user.id, isDraft: true },
  });
  if (result.count === 0) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}