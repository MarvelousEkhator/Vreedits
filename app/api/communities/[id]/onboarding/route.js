import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function canManage(community, userId) {
  return community.ownerId === userId || community.adminIds.includes(userId);
}

function serializeOnboarding(onboarding) {
  if (!onboarding) {
    return {
      id: null,
      enabled: false,
      welcomeTitle: "",
      welcomeBody: "",
      questions: [],
      recommendedChannelIds: [],
      requireRulesAck: false,
    };
  }
  return {
    id: onboarding.id,
    enabled: onboarding.enabled,
    welcomeTitle: onboarding.welcomeTitle || "",
    welcomeBody: onboarding.welcomeBody || "",
    questions: Array.isArray(onboarding.questions) ? onboarding.questions : [],
    recommendedChannelIds: onboarding.recommendedChannelIds || [],
    requireRulesAck: onboarding.requireRulesAck,
  };
}

export async function GET(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const onboarding = await prisma.communityOnboarding.findUnique({
      where: { communityId: params.id },
    });

    let completed = false;
    if (onboarding) {
      const completion = await prisma.onboardingCompletion.findUnique({
        where: { communityId_userId: { communityId: params.id, userId } },
      });
      completed = !!completion;
    }

    return NextResponse.json({
      onboarding: serializeOnboarding(onboarding),
      completed,
    });
  } catch (err) {
    console.error("GET /api/communities/[id]/onboarding error:", err);
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
      return NextResponse.json({ error: "You don't have permission to edit onboarding." }, { status: 403 });
    }

    const body = await request.json();
    const data = {};

    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if (typeof body.welcomeTitle === "string") data.welcomeTitle = body.welcomeTitle.trim();
    if (typeof body.welcomeBody === "string") data.welcomeBody = body.welcomeBody.trim();
    if (Array.isArray(body.questions)) {
      data.questions = body.questions
        .filter((q) => q && typeof q.text === "string")
        .map((q) => ({
          id: q.id || `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
          text: q.text.trim(),
          type: ["single", "multi", "text"].includes(q.type) ? q.type : "single",
          options: Array.isArray(q.options)
            ? q.options
                .filter((o) => o && typeof o.label === "string")
                .map((o) => ({
                  id: o.id || `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
                  label: o.label.trim(),
                  roleId: o.roleId || null,
                }))
            : [],
        }));
    }
    if (Array.isArray(body.recommendedChannelIds)) {
      data.recommendedChannelIds = body.recommendedChannelIds.filter((id) => typeof id === "string");
    }
    if (typeof body.requireRulesAck === "boolean") data.requireRulesAck = body.requireRulesAck;

    const onboarding = await prisma.communityOnboarding.upsert({
      where: { communityId: params.id },
      update: data,
      create: { communityId: params.id, ...data },
    });

    return NextResponse.json({ onboarding: serializeOnboarding(onboarding) });
  } catch (err) {
    console.error("PATCH /api/communities/[id]/onboarding error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}