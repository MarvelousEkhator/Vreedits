import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function GET(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sort = searchParams.get("sort") === "popular" ? "popular" : "recent";
  const tag = searchParams.get("tag")?.toLowerCase() || null;

  const posts = await prisma.feedPost.findMany({
    where: {
      isPrivate: false,
      ...(tag ? { tags: { has: tag } } : {}),
    },
    orderBy: sort === "recent" ? { createdAt: "desc" } : undefined,
    include: {
      author: { select: { id: true, username: true, avatarDataUrl: true } },
      _count: { select: { comments: true } },
    },
    take: 60,
  });

  const shaped = posts.map((p) => ({
    id: p.id,
    mediaUrl: p.mediaUrl,
    mediaType: p.mediaType,
    tags: p.tags,
    author: p.author,
    likeCount: p.likedBy.length,
    commentCount: p._count.comments,
    createdAt: p.createdAt,
    score: p.likedBy.length + p._count.comments * 2,
  }));

  if (sort === "popular") shaped.sort((a, b) => b.score - a.score);

  return NextResponse.json({ posts: shaped, sort, tag });
}