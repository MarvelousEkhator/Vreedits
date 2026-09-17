import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!community.memberIds.includes(userId)) {
      return NextResponse.json({ error: "You must be a member to complete onboarding." }, { status: 403 });
    }

    const onboarding = await prisma.communityOnboarding.findUnique({
      where: { communityId: params.id },
    });
    if (!onboarding || !onboarding.enabled) {
      return NextResponse.json({ error: "Onboarding is not enabled for this community." }, { status: 400 });
    }

    const body = await request.json();
    const answers = body.answers && typeof body.answers === "object" ? body.answers : {};

    const questions = Array.isArray(onboarding.questions) ? onboarding.questions : [];
    const roleIdsToGrant = new Set();

    for (const q of questions) {
      const answer = answers[q.id];
      if (!answer || !Array.isArray(q.options)) continue;
      const selected = Array.isArray(answer) ? answer : [answer];
      for (const optionId of selected) {
        const option = q.options.find((o) => o.id === optionId);
        if (option?.roleId) roleIdsToGrant.add(option.roleId);
      }
    }

    if (roleIdsToGrant.size > 0) {
      const roles = await prisma.role.findMany({
        where: { id: { in: Array.from(roleIdsToGrant) }, communityId: params.id },
      });
      for (const role of roles) {
        if (!role.memberIds.includes(userId)) {
          await prisma.role.update({
            where: { id: role.id },
            data: { memberIds: [...role.memberIds, userId] },
          });
        }
      }
    }

    if (onboarding.requireRulesAck && !community.rulesAcknowledgedBy.includes(userId)) {
      await prisma.community.update({
        where: { id: params.id },
        data: { rulesAcknowledgedBy: [...community.rulesAcknowledgedBy, userId] },
      });
    }

    const completion = await prisma.onboardingCompletion.upsert({
      where: { communityId_userId: { communityId: params.id, userId } },
      update: { answers },
      create: {
        communityId: params.id,
        userId,
        onboardingId: onboarding.id,
        answers,
      },
    });

    return NextResponse.json({ ok: true, completedAt: completion.createdAt });
  } catch (err) {
    console.error("POST /api/communities/[id]/onboarding/complete error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}