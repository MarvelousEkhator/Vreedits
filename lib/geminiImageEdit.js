// Edits one or more uploaded images using Gemini's native image model
// ("Nano Banana"), which takes image(s) + a text instruction and returns
// a modified image — used for things like background swaps, outfit
// changes, style changes, or combining two attached photos (e.g. "give
// this one the background from that one").
//
// This is different from lib/cloudflareImage.js, which only generates a
// brand-new image from a text prompt and has no image input at all.

const IMAGE_MODEL = "gemini-3.1-flash-image";

export async function editImage(prompt, images) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Image editing isn't set up. Add GEMINI_API_KEY in Render's Environment tab.");
  }

  const instruction = prompt?.trim() || "Edit this image as described.";

  // When more than one image is attached, spell out how many so the model
  // treats them as separate, ordered references ("the first image" / "the
  // second image") instead of guessing which photo the instruction means —
  // this is what makes "use this image's background on that one" work.
  const text =
    images.length > 1
      ? `You are given ${images.length} reference images, in the order attached (first image, second image, etc). ${instruction}`
      : instruction;

  const parts = [{ text }];
  for (const img of images) {
    const match = img?.dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`Gemini image edit error ${res.status}:`, detail);
    throw new Error("Couldn't edit that image right now. Please try again.");
  }

  const data = await res.json();
  const imagePart = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);

  if (!imagePart) {
    throw new Error("No edited image came back. Try describing the change differently.");
  }

  const { mimeType, data: base64 } = imagePart.inlineData;
  return `data:${mimeType};base64,${base64}`;
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
