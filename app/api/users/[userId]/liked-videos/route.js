import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function GET(req, { params }) {
  const viewer = await requireUser();
  if (!viewer) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const target = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, hideLikedVideos: true },
  });
  if (!target) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const isOwner = viewer.id === target.id;
  if (target.hideLikedVideos && !isOwner) {
    return NextResponse.json({ error: "This list is private.", posts: [] }, { status: 403 });
  }

  const posts = await prisma.feedPost.findMany({
    where: {
      likedBy: { has: target.id },
      // A liked post normally has to be public to show here — except when
      // the viewer is its own author, so someone doesn't lose sight of a
      // private post they liked, in their own liked-videos list.
      OR: [{ isPrivate: false }, { authorId: viewer.id }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, mediaUrl: true, mediaType: true },
    take: 60,
  });

  return NextResponse.json({ posts });
}