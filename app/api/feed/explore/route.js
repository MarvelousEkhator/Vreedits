import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function GET(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sort = searchParams.get("sort") === "popular" ? "popular" : "recent";
  const tag = searchParams.get("tag")?.toLowerCase() || null;

  // Creators this user has muted never show up here either.
  const mutedRows = await prisma.mutedCreator.findMany({
    where: { userId: user.id },
    select: { mutedUserId: true },
  });
  const mutedIds = mutedRows.map((m) => m.mutedUserId);

  let orderedIds = null;

  if (sort === "popular") {
    // Rank across ALL public posts in the database (likes + comments * 2),
    // then take the top 60. Prisma can't order by array length, so this
    // one query is raw SQL.
    const tagClause = tag ? Prisma.sql`AND p."tags" @> ARRAY[${tag}]::text[]` : Prisma.empty;
    const mutedClause = mutedIds.length
      ? Prisma.sql`AND p."authorId" NOT IN (${Prisma.join(mutedIds)})`
      : Prisma.empty;

    const rows = await prisma.$queryRaw`
      SELECT p."id"
      FROM "FeedPost" p
      WHERE p."isPrivate" = false
        AND p."isDraft" = false
        ${tagClause}
        ${mutedClause}
      ORDER BY
        (cardinality(p."likedBy")
          + 2 * (SELECT COUNT(*) FROM "FeedComment" c WHERE c."postId" = p."id")) DESC,
        p."createdAt" DESC
      LIMIT 60
    `;
    orderedIds = rows.map((r) => r.id);
  }

  const posts = await prisma.feedPost.findMany({
    where: orderedIds
      ? { id: { in: orderedIds } }
      : {
          isPrivate: false,
          isDraft: false,
          ...(tag ? { tags: { has: tag } } : {}),
          ...(mutedIds.length ? { authorId: { notIn: mutedIds } } : {}),
        },
    ...(orderedIds ? {} : { orderBy: { createdAt: "desc" }, take: 60 }),
    include: {
      author: { select: { id: true, username: true, avatarDataUrl: true } },
      _count: { select: { comments: true } },
    },
  });

  let shaped = posts.map((p) => ({
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

  // findMany with `in` doesn't keep the SQL order, so restore it.
  if (orderedIds) {
    const pos = new Map(orderedIds.map((id, i) => [id, i]));
    shaped.sort((a, b) => pos.get(a.id) - pos.get(b.id));
  }

  return NextResponse.json({ posts: shaped, sort, tag });
}