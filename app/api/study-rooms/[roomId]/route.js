import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { prisma } from "@/lib/prisma";

export async function GET(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const room = await prisma.studyRoom.findUnique({
    where: { id: params.roomId },
    include: {
      host: { select: { id: true, username: true, displayName: true } },
      members: {
        where: { status: { not: "left" } },
        include: { user: { select: { id: true, username: true, displayName: true, avatarDataUrl: true } } },
        orderBy: { joinedAt: "asc" },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 100,
        include: { user: { select: { id: true, username: true, displayName: true, avatarDataUrl: true } } },
      },
    },
  });

  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const myMembership = room.members.find((m) => m.userId === user.id);
  if (!myMembership) return NextResponse.json({ error: "You're not part of this room." }, { status: 403 });

  return NextResponse.json({ ok: true, room, myStatus: myMembership.status });
}

export async function DELETE(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const room = await prisma.studyRoom.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (room.hostId !== user.id) {
    return NextResponse.json({ error: "Only the host can end this room." }, { status: 403 });
  }

  await prisma.studyRoom.update({ where: { id: params.roomId }, data: { status: "ended" } });
  return NextResponse.json({ ok: true });
}
