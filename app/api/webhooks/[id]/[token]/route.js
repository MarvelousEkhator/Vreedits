import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/webhooks/<id>/<token>   body: { "content": "Hello", "username": "Optional name" }
export async function POST(request, { params }) {
  try {
    const webhook = await prisma.communityWebhook.findFirst({
      where: { id: params.id, token: params.token },
    });
    if (!webhook) {
      return NextResponse.json({ error: "Invalid webhook." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "content is required." }, { status: 400 });
    }
    if (content.length > 2000) {
      return NextResponse.json({ error: "content must be 2000 characters or fewer." }, { status: 400 });
    }

    const channel = await prisma.channel.findFirst({
      where: { id: webhook.channelId, communityId: webhook.communityId },
    });
    if (!channel) {
      return NextResponse.json({ error: "The target channel no longer exists." }, { status: 404 });
    }

    const label =
      typeof body.username === "string" && body.username.trim()
        ? body.username.trim().slice(0, 40)
        : webhook.name;

    const post = await prisma.post.create({
      data: {
        communityId: webhook.communityId,
        channelId: channel.id,
        authorId: webhook.createdById,
        content: "[" + label + "] " + content,
      },
    });

    return NextResponse.json({ ok: true, id: post.id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/webhooks error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}