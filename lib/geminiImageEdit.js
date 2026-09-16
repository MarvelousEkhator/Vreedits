// Edits one or more uploaded images using Gemini's native image model
// ("Nano Banana"), which takes an image + a text instruction and returns
// a modified image — used for things like background swaps, outfit
// changes, or style changes on a photo the user attached.
//
// This is different from lib/cloudflareImage.js, which only generates a
// brand-new image from a text prompt and has no image input at all.

const IMAGE_MODEL = "gemini-3.1-flash-image";

export async function editImage(prompt, images) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Image editing isn't set up. Add GEMINI_API_KEY in Render's Environment tab.");
  }

  const parts = [{ text: prompt || "Edit this image as described." }];
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

// Heuristic for "please modify this image" phrasing. Only checked when at
// least one image is attached — distinguishes an edit request ("swap the
// outfit", "change the background") from a plain question about the photo
// ("what's in this?", which should go through normal chat instead).
export function isImageEditRequest(text) {
  if (!text) return false;
  return /\b(change|swap|replace|remove|edit|make|turn|transform|add|put|give)\b[\s\S]{0,40}\b(background|outfit|clothes|clothing|atmosphere|color|colour|style|hair|dress|shirt|jacket|scene|setting|sky|lighting|filter)\b/i.test(
    text
  );
}
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
