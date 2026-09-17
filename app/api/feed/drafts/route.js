import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const drafts = await prisma.feedPost.findMany({
    where: { authorId: user.id, isDraft: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ drafts });
}