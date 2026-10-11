import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.isGuest) return guestBlockedResponse();

  const post = await prisma.feedPost.findUnique({ where: { id: params.id } });
  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const hasLiked = post.likedBy.includes(user.id);
  const likedBy = hasLiked
    ? post.likedBy.filter((id) => id !== user.id)
    : [...post.likedBy, user.id];

  await prisma.feedPost.update({ where: { id: params.id }, data: { likedBy } });

  return NextResponse.json({ ok: true, likedByMe: !hasLiked, likeCount: likedBy.length });
}