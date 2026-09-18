import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function canManage(community, userId) {
  return community.ownerId === userId || community.adminIds.includes(userId);
}

function serializeGuide(guide) {
  if (!guide) {
    return {
      id: null,
      introduction: "",
      importantInfo: "",
      recommendedChannelIds: [],
      faqs: [],
      resources: [],
    };
  }
  return {
    id: guide.id,
    introduction: guide.introduction || "",
    importantInfo: guide.importantInfo || "",
    recommendedChannelIds: guide.recommendedChannelIds || [],
    faqs: Array.isArray(guide.faqs) ? guide.faqs : [],
    resources: Array.isArray(guide.resources) ? guide.resources : [],
  };
}

export async function GET(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const guide = await prisma.communityGuide.findUnique({
      where: { communityId: params.id },
    });

    return NextResponse.json({ guide: serializeGuide(guide) });
  } catch (err) {
    console.error("GET /api/communities/[id]/guide error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canManage(community, userId)) {
      return NextResponse.json({ error: "You don't have permission to edit the community guide." }, { status: 403 });
    }

    const body = await request.json();
    const data = {};

    if (typeof body.introduction === "string") data.introduction = body.introduction.trim();
    if (typeof body.importantInfo === "string") data.importantInfo = body.importantInfo.trim();
    if (Array.isArray(body.recommendedChannelIds)) {
      data.recommendedChannelIds = body.recommendedChannelIds.filter((id) => typeof id === "string");
    }
    if (Array.isArray(body.faqs)) {
      data.faqs = body.faqs
        .filter((f) => f && (typeof f.question === "string" || typeof f.answer === "string"))
        .map((f) => ({
          id: f.id || `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
          question: (f.question || "").trim(),
          answer: (f.answer || "").trim(),
        }));
    }
    if (Array.isArray(body.resources)) {
      data.resources = body.resources
        .filter((r) => r && (typeof r.label === "string" || typeof r.url === "string"))
        .map((r) => ({
          id: r.id || `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
          label: (r.label || "").trim(),
          url: (r.url || "").trim(),
        }));
    }

    const guide = await prisma.communityGuide.upsert({
      where: { communityId: params.id },
      update: data,
      create: { communityId: params.id, ...data },
    });

    return NextResponse.json({ guide: serializeGuide(guide) });
  } catch (err) {
    console.error("PATCH /api/communities/[id]/guide error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}