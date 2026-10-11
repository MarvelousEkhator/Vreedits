// app/api/feed/[id]/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";
import { releaseSoundForPost } from "@/lib/sounds";

// Single-post fetch, used by share links (/feed/[id]). Guests can read it.
// Private posts, drafts, private accounts and blocked people are hidden from
// everyone except the owner, the same rules the feed itself uses.
export async function GET(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const post = await prisma.feedPost.findUnique({
    where: { id: params.id },
    include: {
      author: {
        select: {
          id: true, username: true, displayName: true, avatarDataUrl: true,
          allowDownloads: true, isPublic: true,
        },
      },
      _count: { select: { comments: true } },
      saves: { where: { userId: user.id }, select: { id: true } },
    },
  });

  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (post.authorId !== user.id) {
    if (post.isDraft || post.isPrivate || !post.author.isPublic) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: user.id, blockedId: post.authorId },
          { blockerId: post.authorId, blockedId: user.id },
        ],
      },
      select: { id: true },
    });
    if (block) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { isPublic, ...author } = post.author;

  return NextResponse.json({
    post: {
      id: post.id,
      caption: post.caption,
      mediaUrl: post.mediaUrl,
      mediaUrls: post.mediaUrls && post.mediaUrls.length > 1 ? post.mediaUrls : undefined,
      mediaType: post.mediaType,
      createdAt: post.createdAt,
      author,
      likeCount: post.likedBy.length,
      likedByMe: post.likedBy.includes(user.id),
      commentCount: post._count.comments,
      savedByMe: post.saves.length > 0,
    },
  });
}

export async function DELETE(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.isGuest) return guestBlockedResponse();

  const post = await prisma.feedPost.findUnique({ where: { id: params.id } });
  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (post.authorId !== user.id) {
    return NextResponse.json({ error: "You can only delete your own posts." }, { status: 403 });
  }

  // If other videos use this post's sound, its audio is copied onto the
  // sound first so they keep working. If nobody else uses it, the sound
  // and its favorites are removed.
  await releaseSoundForPost(post);

  await prisma.feedPost.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}