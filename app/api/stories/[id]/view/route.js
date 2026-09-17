import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const story = await prisma.story.findUnique({ where: { id: params.id } });
  if (!story) return NextResponse.json({ error: "Story not found." }, { status: 404 });

  if (!story.viewedBy.includes(user.id)) {
    await prisma.story.update({
      where: { id: params.id },
      data: { viewedBy: { push: user.id } },
    });
  }

  return NextResponse.json({ ok: true });
}