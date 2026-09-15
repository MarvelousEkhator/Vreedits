import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

// Only the post's owner can pin/unpin a comment on it — matching TikTok,
// where pinning is a moderation power over your own post, not something
// a commenter can do to their own comment. Only one comment can be
// pinned per post at a time, so pinning a new one unpins whichever was
// pinned before it.
export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const post = await prisma.feedPost.findUnique({ where: { id: params.id } });
  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (post.authorId !== user.id) {
    return NextResponse.json({ error: "Only the post owner can pin comments." }, { status: 403 });
  }

  const comment = await prisma.feedComment.findUnique({ where: { id: params.commentId } });
  if (!comment || comment.postId !== params.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (comment.pinned) {
    await prisma.feedComment.update({ where: { id: params.commentId }, data: { pinned: false } });
    return NextResponse.json({ ok: true, pinned: false });
  }

  await prisma.$transaction([
    prisma.feedComment.updateMany({ where: { postId: params.id, pinned: true }, data: { pinned: false } }),
    prisma.feedComment.update({ where: { id: params.commentId }, data: { pinned: true } }),
  ]);

  return NextResponse.json({ ok: true, pinned: true });
}