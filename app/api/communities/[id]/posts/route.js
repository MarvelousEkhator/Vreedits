import { getSessionUserId } from "@/lib/auth";
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