import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";
import { extractHashtags } from "@/lib/hashtags";

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { caption, mediaUrl, mediaUrls, mediaType, isPrivate, isDraft, scheduledFor } = await req.json();
  const allMedia = Array.isArray(mediaUrls) && mediaUrls.length > 0 ? mediaUrls : (mediaUrl ? [mediaUrl] : []);

  if (!caption?.trim() && allMedia.length === 0) {
    return NextResponse.json({ error: "Add a caption or an image first." }, { status: 400 });
  }
  if (scheduledFor && new Date(scheduledFor) <= new Date()) {
    return NextResponse.json({ error: "Scheduled time must be in the future." }, { status: 400 });
  }

  const tags = extractHashtags(caption);

  const post = await prisma.feedPost.create({
    data: {
      authorId: user.id,
      caption: caption?.trim() || null,
      mediaUrl: allMedia[0] || null,
      mediaUrls: allMedia,
      mediaType: mediaType === "video" ? "video" : "image",
      isPrivate: !!isPrivate,
      isDraft: !!isDraft,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      tags,
    },
    include: {
      author: { select: { id: true, username: true, avatarDataUrl: true, allowDownloads: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    post: {
      id: post.id,
      caption: post.caption,
      mediaUrl: post.mediaUrl,
      mediaUrls: post.mediaUrls,
      mediaType: post.mediaType,
      tags: post.tags,
      isPrivate: post.isPrivate,
      isDraft: post.isDraft,
      scheduledFor: post.scheduledFor,
      createdAt: post.createdAt,
      author: post.author,
      likeCount: 0,
      likedByMe: false,
      commentCount: 0,
      savedByMe: false,
      followedByMe: true,
    },
  });
}