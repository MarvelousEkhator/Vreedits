import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function GET(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const tag = params.tag.toLowerCase();

  const posts = await prisma.feedPost.findMany({
    where: { isPrivate: false, tags: { has: tag } },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, username: true, displayName: true, avatarDataUrl: true } } },
  });

  return NextResponse.json({ tag, posts });
}