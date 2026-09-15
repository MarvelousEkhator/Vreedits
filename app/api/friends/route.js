import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionUserId } from "@/lib/auth";

const prisma = new PrismaClient();

export async function GET() {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    include: { userA: true, userB: true },
    orderBy: { createdAt: "desc" },
  });

  const friends = friendships.map((f) =>
    f.userAId === userId ? f.userB : f.userA
  );

  return NextResponse.json({ friends });
}