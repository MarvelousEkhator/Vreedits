import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { prisma } from "@/lib/prisma";

const GEMINI_MODEL = "gemini-3.1-flash-lite";

export async function POST(req, { params }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const comment = await prisma.feedComment.findUnique({ where: { id: params.commentId } });
  if (!comment || comment.postId !== params.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { targetLanguage } = await req.json().catch(() => ({}));
  const language = targetLanguage || "English";

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Translation isn't set up. Add GEMINI_API_KEY." }, { status: 500 });
  }

  const prompt = `Translate the following text to ${language}. Return ONLY the translated text, no commentary, no quotes:\n\n${comment.content}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
      }
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`Translate error ${res.status}:`, detail);
      return NextResponse.json({ error: "Translation failed." }, { status: 502 });
    }

    const data = await res.json();
    const translated = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();

    if (!translated) {
      return NextResponse.json({ error: "Translation failed." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, translated });
  } catch (err) {
    console.error("Translate request failed:", err);
    return NextResponse.json({ error: "Translation failed." }, { status: 502 });
  }
}