import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function GET(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") === "following" ? "following" : "for-you";

  let authorFilter = {};

  if (tab === "following") {
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
    });
    const friendIds = friendships.map((f) => (f.userAId === user.id ? f.userBId : f.userAId));

    const follows = await prisma.follow.findMany({
      where: { followerId: user.id },
      select: { followingId: true },
    });
    const followingIds = follows.map((f) => f.followingId);

    const authorIds = [...new Set([user.id, ...friendIds, ...followingIds])];
    authorFilter = { authorId: { in: authorIds } };
  } else {
    // For You: everyone public, excluding accounts already followed/friended
    // so this tab surfaces new/undiscovered authors rather than duplicating Following.
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
    });
    const friendIds = friendships.map((f) => (f.userAId === user.id ? f.userBId : f.userAId));

    const follows = await prisma.follow.findMany({
      where: { followerId: user.id },
      select: { followingId: true },
    });
    const followingIds = follows.map((f) => f.followingId);

    const excludeIds = [...new Set([user.id, ...friendIds, ...followingIds])];
    authorFilter = { authorId: { notIn: excludeIds } };
  }

  const posts = await prisma.feedPost.findMany({
    where: { isPrivate: false, ...authorFilter },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarDataUrl: true } },
      _count: { select: { comments: true } },
    },
    take: 50,
  });

  return NextResponse.json({ posts, tab });
}