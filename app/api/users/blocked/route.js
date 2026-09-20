import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const blocks = await prisma.block.findMany({
    where: { blockerId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      blocked: { select: { id: true, username: true, displayName: true, avatarDataUrl: true } },
    },
  });

  return NextResponse.json({
    blocked: blocks.map((b) => ({ ...b.blocked, blockedAt: b.createdAt })),
  });
}