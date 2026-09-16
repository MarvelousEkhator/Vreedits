import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { SYNA_SYSTEM_CONTEXT } from "@/lib/synaContext";
import { generateImage, isImageRequest } from "@/lib/cloudflareImage";
import { generateTextReply } from "@/lib/cloudflareText";
import { editImage, isImageEditRequest } from "@/lib/geminiImageEdit";

const MAX_ATTACHMENT_LENGTH = 5_500_000;
const MAX_ATTACHMENTS = 3;

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_TIMEOUT_MS = 15_000;

const LEAK_CHECK_MIN_WORDS = 6;
const GENERIC_DECLINE = "I can't share my internal configuration, but I'm happy to help with Vreedits!";
const TECH_DECLINE = "I don't have access to information about how Vreedits is built — I can help with using the platform, though!";

const SYSTEM_PROMPT_WORDS = SYNA_SYSTEM_CONTEXT
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim()
  .split(" ");
const SYSTEM_PROMPT_JOINED = SYSTEM_PROMPT_WORDS.join(" ");

function containsPromptLeak(replyText) {
  const replyWords = replyText.toLowerCase().replace(/\s+/g, " ").trim().split(" ");
  if (replyWords.length < LEAK_CHECK_MIN_WORDS) return false;
  for (let i = 0; i <= replyWords.length - LEAK_CHECK_MIN_WORDS; i++) {
    const window = replyWords.slice(i, i + LEAK_CHECK_MIN_WORDS).join(" ");
    if (SYSTEM_PROMPT_JOINED.includes(window)) return true;
  }
  return false;
}

const SENSITIVE_PATTERNS = [
  /process\.env/i,
  /\bapi[_-]?key\b\s*[:=]/i,
  /sk-[a-z0-9]{10,}/i,
  /\bDATABASE_URL\b/i,
  /\bJWT_SECRET\b/i,
  /\bprisma\/schema\.prisma\b/i,
  /\bgemini-3\.1-flash-lite\b/i,
  /\bcloudflareimage\.js\b|\bcloudflaretext\.js\b|\bgeminiimageedit\.js\b/i,
];

function containsSensitivePattern(replyText) {
  return SENSITIVE_PATTERNS.some((re) => re.test(replyText));
}

function sanitizeReply(replyText) {
  if (containsSensitivePattern(replyText)) return TECH_DECLINE;
  if (containsPromptLeak(replyText)) return GENERIC_DECLINE;
  return replyText;
}

function attachmentsForMessage(m) {
  if (Array.isArray(m?.attachments) && m.attachments.length > 0) return m.attachments;
  if (m?.attachment) return [m.attachment];
  return [];
}

function partsForMessage(m) {
  const parts = [];
  const text = typeof m.text === "string" ? m.text : (typeof m.text?.text === "string" ? m.text.text : "");
  if (text) parts.push({ text });
  for (const att of attachmentsForMessage(m)) {
    const match = att?.dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
  }
  return parts.length > 0 ? parts : [{ text: "" }];
}

function roleForGemini(role) {
  return role === "assistant" ? "model" : "user";
}

async function callGemini(contents, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: SYNA_SYSTEM_CONTEXT }] },
        }),
        signal: controller.signal,
      }
    );

    if (res.status === 429) {
      const err = new Error("Gemini rate limited");
      err.fallback = true;
      throw err;
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`Gemini error ${res.status}:`, detail);
      const err = new Error("Gemini request failed");
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const replyText = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";

    if (!replyText) {
      const err = new Error("Gemini returned no text");
      throw err;
    }

    return replyText;
  } catch (err) {
    if (err.name === "AbortError") {
      const timeoutErr = new Error("Gemini timed out");
      timeoutErr.fallback = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages provided." }, { status: 400 });
  }

  const lastMessage = messages[messages.length - 1];
  const lastAttachments = attachmentsForMessage(lastMessage);

  if (lastAttachments.length > MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `You can attach up to ${MAX_ATTACHMENTS} images at a time.` },
      { status: 400 }
    );
  }

  for (const att of lastAttachments) {
    if (att?.dataUrl?.length > MAX_ATTACHMENT_LENGTH) {
      return NextResponse.json({ error: "One of your images is too large. Please use a smaller file." }, { status: 400 });
    }
  }

  const lastImageAttachments = lastAttachments.filter((att) => att?.type?.startsWith("image/"));

  if (lastMessage.role !== "assistant" && lastImageAttachments.length > 0 && isImageEditRequest(lastMessage.text)) {
    try {
      const dataUrl = await editImage(lastMessage.text, lastImageAttachments);
      return NextResponse.json({
        reply: {
          role: "assistant",
          text: "Here's the edited image:",
          attachment: { dataUrl, name: "edited-image.jpg" },
        },
      });
    } catch (err) {
      return NextResponse.json({
        reply: { role: "assistant", text: err.message || "Image editing failed. Please try again." },
      });
    }
  }

  if (lastMessage.role !== "assistant" && lastImageAttachments.length === 0 && isImageRequest(lastMessage.text)) {
    try {
      const dataUrl = await generateImage(lastMessage.text);
      return NextResponse.json({
        reply: {
          role: "assistant",
          text: "Here's what I generated:",
          attachment: { dataUrl, name: "generated-image.jpg" },
        },
      });
    } catch (err) {
      return NextResponse.json({
        reply: { role: "assistant", text: err.message || "Image generation failed. Please try again." },
      });
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Chat isn't set up yet. Add GEMINI_API_KEY in Render's Environment tab." },
      { status: 500 }
    );
  }

  const contents = messages.map((m) => ({
    role: roleForGemini(m.role),
    parts: partsForMessage(m),
  }));

  try {
    const replyText = await callGemini(contents, apiKey);
    return NextResponse.json({
      reply: { role: "assistant", text: sanitizeReply(replyText), usedFallback: false },
    });
  } catch (err) {
    if (err.fallback) {
      console.error("Gemini unavailable, falling back to Cloudflare:", err.message);
      try {
        const fallbackText = await generateTextReply(messages, SYNA_SYSTEM_CONTEXT);
        return NextResponse.json({
          reply: { role: "assistant", text: sanitizeReply(fallbackText), usedFallback: true },
        });
      } catch (fallbackErr) {
        console.error("Cloudflare fallback also failed:", fallbackErr);
        return NextResponse.json(
          { error: "Syna couldn't respond right now. Please try again." },
          { status: 502 }
        );
      }
    }

    console.error("POST /api/ai/chat error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}