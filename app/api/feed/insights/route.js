// app/api/feed/insights/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

// Numbers for the person's own posts. Never returns who viewed or liked.
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.isGuest) return guestBlockedResponse();

  const rows = await prisma.feedPost.findMany({
    where: { authorId: user.id, isDraft: false },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      caption: true,
      mediaType: true,
      isPrivate: true,
      createdAt: true,
      viewedBy: true,
      likedBy: true,
      _count: { select: { comments: true, saves: true } },
    },
  });

  const posts = rows.map((p) => ({
    id: p.id,
    caption: p.caption,
    mediaType: p.mediaType,
    isPrivate: p.isPrivate,
    createdAt: p.createdAt,
    views: p.viewedBy.length,
    likes: p.likedBy.length,
    comments: p._count.comments,
    saves: p._count.saves,
  }));

  const totals = posts.reduce(
    (t, p) => ({
      views: t.views + p.views,
      likes: t.likes + p.likes,
      comments: t.comments + p.comments,
      saves: t.saves + p.saves,
    }),
    { views: 0, likes: 0, comments: 0, saves: 0 }
  );

  return NextResponse.json({ posts, totals });
}