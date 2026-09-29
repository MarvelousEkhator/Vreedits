// Edits one or more uploaded images using Gemini's native image model
// ("Nano Banana"): image(s) + a text instruction in, modified image out.
// Used for background swaps, outfit/style changes, or combining two
// attached photos (e.g. "give this one the background from that one").
//
// If Gemini is unavailable (no key, quota exhausted, billing/permission
// problem, model missing, server error), we fall back to Cloudflare
// FLUX.2 in lib/cloudflareImage.js, which also supports reference
// images (up to 4). We do NOT fall back when Gemini blocks a request
// for safety reasons.

import { generateImage as cloudflareGenerate } from "./cloudflareImage";

const IMAGE_MODEL = "gemini-3.1-flash-image";
const TIMEOUT_MS = 90_000;

// Errors where trying another provider makes sense.
class GeminiUnavailableError extends Error {}

function parseDataUrl(dataUrl) {
  const match = typeof dataUrl === "string" ? dataUrl.match(/^data:([^;]+);base64,(.+)$/) : null;
  return match ? { mimeType: match[1], data: match[2] } : null;
}

async function editWithGemini(instruction, images) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiUnavailableError("GEMINI_API_KEY is not set");
  }

  // With several images, spell out how many so the model treats them as
  // separate, ordered references ("first image" / "second image").
  const text =
    images.length > 1
      ? `You are given ${images.length} reference images, in the order attached (first image, second image, etc). ${instruction}`
      : instruction;

  const parts = [{ text }];
  for (const img of images) {
    const parsed = parseDataUrl(img.dataUrl);
    if (parsed) parts.push({ inlineData: parsed });
  }

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
  } catch (err) {
    console.error("Gemini image edit request failed:", err);
    if (err?.name === "TimeoutError") {
      throw new Error("Image editing took too long. Please try again.");
    }
    throw new GeminiUnavailableError(`network error: ${err?.message}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`Gemini image edit error ${res.status}:`, detail);
    // Quota, billing/permission, missing model, or Google-side trouble.
    if ([403, 404, 429].includes(res.status) || res.status >= 500) {
      throw new GeminiUnavailableError(`Gemini returned ${res.status}`);
    }
    throw new Error("Couldn't edit that image right now. Please try again.");
  }

  const data = await res.json();
  const imagePart = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);

  if (!imagePart) {
    const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
    console.error("Gemini returned no image:", reason, JSON.stringify(data).slice(0, 500));
    throw new Error(
      "The image editor couldn't make that change. Try describing it differently or using a different photo."
    );
  }

  const { mimeType, data: base64 } = imagePart.inlineData;
  return `data:${mimeType};base64,${base64}`;
}

export async function editImage(prompt, images) {
  const usable = (images || []).filter((img) => parseDataUrl(img?.dataUrl));
  if (usable.length === 0) {
    throw new Error("That attachment isn't a usable image.");
  }

  const instruction = prompt?.trim() || "Edit this image as described.";

  try {
    return await editWithGemini(instruction, usable);
  } catch (err) {
    if (!(err instanceof GeminiUnavailableError)) throw err;

    console.warn(`Gemini unavailable (${err.message}); falling back to Cloudflare FLUX.2`);
    try {
      return await cloudflareGenerate(
        instruction,
        usable.map((img) => img.dataUrl)
      );
    } catch (cfErr) {
      console.error("Cloudflare fallback failed:", cfErr);
      throw new Error("Image editing is unavailable right now. Please try again later.");
    }
  }
}

// Only called when at least one image is attached (see
// app/api/ai/chat/route.js, which already filters to image attachments
// before checking this). Default to "yes, this is an edit request" for
// almost anything said alongside an attached photo — that's what people
// mean nearly every time, including phrasing with no action verb at all
// ("I want this background", "this image's background and stuff"). Only
// fall back to plain vision chat for genuine questions ABOUT the photo,
// or when there's no caption at all (which reads as "what is this?").
const PLAIN_QUESTION_PATTERNS = [
  // "what/who/where/when/why/how/is/are/does/do ...?" as a real question
  /^\s*(what|who|where|when|why|how|is|are|does|do)\b[\s\S]{0,80}\?\s*$/i,
  // "what's this/that/in this/going on"
  /\bwhat(?:'?s| is| are)\b[\s\S]{0,30}\b(this|that|in (this|it)|going on|happening)\b/i,
  // "describe/identify/explain/caption this photo"
  /\b(describe|identify|explain|caption)\b[\s\S]{0,20}\b(this|it|image|photo|picture)\b/i,
  // "who's this / who is that"
  /\bwho(?:'?s| is)\b[\s\S]{0,20}\b(this|that|in (this|it))\b/i,
  // "tell me about this photo"
  /\btell me about\b[\s\S]{0,20}\b(this|it|image|photo|picture)\b/i,
];

export function isImageEditRequest(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return false; // no caption at all — treat as "what is this?", not an edit
  return !PLAIN_QUESTION_PATTERNS.some((re) => re.test(trimmed));
}