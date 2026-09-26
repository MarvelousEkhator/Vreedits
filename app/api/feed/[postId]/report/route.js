import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const post = await prisma.feedPost.findUnique({ where: { id: params.postId }, select: { id: true } });
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const reason = body?.reason ? String(body.reason).trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "Please describe the issue." }, { status: 400 });
  }
  if (reason.length > 500) {
    return NextResponse.json({ error: "Keep it under 500 characters." }, { status: 400 });
  }

  await prisma.postReport.create({
    data: { postId: post.id, reporterId: user.id, reason },
  });

  return NextResponse.json({ ok: true });
}