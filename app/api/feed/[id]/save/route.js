import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.isGuest) return guestBlockedResponse();

  const post = await prisma.feedPost.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const existing = await prisma.feedSave.findUnique({
    where: { postId_userId: { postId: params.id, userId: user.id } },
  });

  if (existing) {
    await prisma.feedSave.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, savedByMe: false });
  }

  await prisma.feedSave.create({ data: { postId: params.id, userId: user.id } });
  return NextResponse.json({ ok: true, savedByMe: true });
}