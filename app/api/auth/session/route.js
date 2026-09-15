import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ user: null });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.verified) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: { id: user.id, username: user.username, email: user.email, online: user.online },
  });
}