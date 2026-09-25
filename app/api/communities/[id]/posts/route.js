import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewChannel, canSendInChannel } from "@/lib/channelAccess";

const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarDataUrl: true,
};

export async function GET(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Baseline: you must be a member of the community to see any of its
    // channel content, regardless of that channel's own viewAccess config.
    // Channel-level permissions only refine visibility among members.
    if (!community.memberIds.includes(userId)) {
      return NextResponse.json({ error: "You must join this community to view its channels." }, { status: 403 });
    }

    if (channelId) {
      const channel = await prisma.channel.findUnique({ where: { id: channelId } });
      if (channel) {
        const roles = await prisma.role.findMany({ where: { communityId: params.id } });
        if (!canViewChannel(channel, community, roles, userId)) {
          return NextResponse.json({ error: "You don't have access to this channel." }, { status: 403 });
        }
      }
    }

    const where = { communityId: params.id };
    if (channelId) where.channelId = channelId;

    const posts = await prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: authorSelect },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: authorSelect } },
        },
      },
    });

    const replyIds = [...new Set(posts.filter((p) => p.replyToId).map((p) => p.replyToId))];
    const replyTargets = replyIds.length
      ? await prisma.post.findMany({
          where: { id: { in: replyIds } },
          select: { id: true, content: true, author: { select: authorSelect } },
        })
      : [];
    const replyMap = Object.fromEntries(replyTargets.map((r) => [r.id, r]));

    const formatted = posts.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      imageUrl: p.imageUrl,
      createdAt: p.createdAt,
      channelId: p.channelId,
      author: p.author,
      likeCount: p.likedBy.length,
      likedByMe: p.likedBy.includes(userId),
      comments: p.comments,
      replyToId: p.replyToId,
      replyTo: p.replyToId ? replyMap[p.replyToId] || null : null,
    }));

    return NextResponse.json({ posts: formatted });
  } catch (err) {
    console.error("GET /api/communities/[id]/posts error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { channelId, content, imageUrl, title, replyToId } = body;

  const hasContent = typeof content === "string" && content.trim().length > 0;
  const hasImage = typeof imageUrl === "string" && imageUrl.length > 0;

  if (!hasContent && !hasImage) {
    return NextResponse.json({ error: "Message can't be empty." }, { status: 400 });
  }

  try {
    const community = await prisma.community.findUnique({ where: { id: params.id } });
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!community.memberIds.includes(userId)) {
      return NextResponse.json({ error: "You must join this community to post here." }, { status: 403 });
    }

    let channel = null;
    if (channelId) {
      channel = await prisma.channel.findUnique({ where: { id: channelId } });
      if (!channel) {
        return NextResponse.json({ error: "Channel not found." }, { status: 404 });
      }
      const roles = await prisma.role.findMany({ where: { communityId: params.id } });
      if (!canSendInChannel(channel, community, roles, userId)) {
        return NextResponse.json({ error: "You don't have permission to send messages in this channel." }, { status: 403 });
      }
    }

    // Only the owner/admins can send images in a channel where it's off for everyone else
    if (hasImage && channel && channel.canSendImages === false) {
      const isOwner = community.ownerId === userId;
      const isAdmin = (community.adminIds || []).includes(userId);
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: "Images aren't allowed in this channel." }, { status: 403 });
      }
    }

    if (replyToId) {
      const replyTarget = await prisma.post.findUnique({ where: { id: replyToId } });
      if (!replyTarget || replyTarget.communityId !== params.id) {
        return NextResponse.json({ error: "The message you're replying to no longer exists." }, { status: 400 });
      }
    }

    const post = await prisma.post.create({
      data: {
        communityId: params.id,
        channelId: channelId || null,
        authorId: userId,
        title: title || null,
        content: hasContent ? content.trim() : "",
        imageUrl: hasImage ? imageUrl : null,
        replyToId: replyToId || null,
      },
      include: {
        author: { select: authorSelect },
      },
    });

    const replyTo = replyToId
      ? await prisma.post.findUnique({
          where: { id: replyToId },
          select: { id: true, content: true, author: { select: authorSelect } },
        })
      : null;

    return NextResponse.json({
      post: {
        id: post.id,
        title: post.title,
        content: post.content,
        imageUrl: post.imageUrl,
        createdAt: post.createdAt,
        channelId: post.channelId,
        author: post.author,
        likeCount: 0,
        likedByMe: false,
        comments: [],
        replyToId: post.replyToId,
        replyTo,
      },
    });
  } catch (err) {
    console.error("POST /api/communities/[id]/posts error:", err);
    return NextResponse.json({ error: "Database error, please retry." }, { status: 500 });
  }
}