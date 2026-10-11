import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";

export async function DELETE(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.isGuest) return guestBlockedResponse();

  const comment = await prisma.feedComment.findUnique({ where: { id: params.commentId } });
  if (!comment) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (comment.authorId !== user.id) {
    return NextResponse.json({ error: "You can only delete your own comments." }, { status: 403 });
  }

  await prisma.feedComment.delete({ where: { id: params.commentId } });
  return NextResponse.json({ ok: true });
}