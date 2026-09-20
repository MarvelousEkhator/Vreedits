import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const post = await prisma.feedPost.findUnique({
    where: { id: params.postId },
    select: { viewedBy: true },
  });
  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (!post.viewedBy.includes(user.id)) {
    await prisma.feedPost.update({
      where: { id: params.postId },
      data: { viewedBy: { push: user.id } },
    });
  }

  return NextResponse.json({ ok: true });
}