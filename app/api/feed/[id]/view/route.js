// app/api/feed/[id]/view/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";

// Counts one view per person per post (unique viewers).
export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.isGuest) return guestBlockedResponse();

  const post = await prisma.feedPost.findUnique({
    where: { id: params.id },
    select: { authorId: true, isPrivate: true, isDraft: true },
  });
  if (!post || post.isDraft) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Your own views never count.
  if (post.authorId === user.id) {
    return NextResponse.json({ ok: true, counted: false });
  }
  if (post.isPrivate) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // If the author blocked this person, the view isn't counted.
  const blocked = await prisma.block.findFirst({
    where: { blockerId: post.authorId, blockedId: user.id },
    select: { id: true },
  });
  if (blocked) return NextResponse.json({ ok: true, counted: false });

  // One statement: only adds the viewer if they aren't in the list yet,
  // so two requests at the same moment can't count twice.
  const result = await prisma.feedPost.updateMany({
    where: { id: params.id, NOT: { viewedBy: { has: user.id } } },
    data: { viewedBy: { push: user.id } },
  });

  return NextResponse.json({ ok: true, counted: result.count > 0 });
}