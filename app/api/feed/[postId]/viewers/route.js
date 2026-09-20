import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function GET(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const post = await prisma.feedPost.findUnique({
    where: { id: params.postId },
    select: { authorId: true, viewedBy: true },
  });
  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (post.authorId !== user.id) {
    return NextResponse.json({ error: "Only the post owner can see viewers." }, { status: 403 });
  }

  const viewers = await prisma.user.findMany({
    where: { id: { in: post.viewedBy } },
    select: { id: true, username: true, displayName: true, avatarDataUrl: true },
  });

  return NextResponse.json({ viewers, count: viewers.length });
}