import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.isGuest) return guestBlockedResponse();

  const comment = await prisma.feedComment.findUnique({ where: { id: params.commentId } });
  if (!comment || comment.postId !== params.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const alreadyLiked = comment.likedBy.includes(user.id);
  const likedBy = alreadyLiked
    ? comment.likedBy.filter((id) => id !== user.id)
    : [...comment.likedBy, user.id];

  await prisma.feedComment.update({ where: { id: params.commentId }, data: { likedBy } });

  return NextResponse.json({ ok: true, liked: !alreadyLiked, likeCount: likedBy.length });
}