import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const posts = await prisma.feedPost.findMany({
    where: {
      likedBy: { has: user.id },
      // A post you liked while it was public shouldn't keep showing here
      // forever if the author later makes it private — same rule already
      // applied in ProfileClient's Likes tab and /liked-videos.
      OR: [{ isPrivate: false }, { authorId: user.id }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, mediaUrl: true, mediaType: true },
  });

  return NextResponse.json({ posts });
}