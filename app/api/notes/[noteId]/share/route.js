import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const note = await prisma.note.findUnique({ where: { id: params.noteId } });
  if (!note || note.userId !== user.id) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }

  let shareToken = note.shareToken;
  if (!shareToken) {
    shareToken = crypto.randomBytes(12).toString("hex");
    await prisma.note.update({ where: { id: params.noteId }, data: { shareToken } });
  }

  return NextResponse.json({ ok: true, shareToken });
}

export async function DELETE(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const note = await prisma.note.findUnique({ where: { id: params.noteId } });
  if (!note || note.userId !== user.id) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }

  await prisma.note.update({ where: { id: params.noteId }, data: { shareToken: null } });
  return NextResponse.json({ ok: true });
}