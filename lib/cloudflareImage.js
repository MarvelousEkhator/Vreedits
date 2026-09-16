// Free/low-cost image generation via Cloudflare Workers AI.
// - Text-only prompt -> FLUX.1 Schnell (fast, free-tier friendly).
// - Prompt + a reference photo -> FLUX.2 [dev] (image-to-image/editing,
//   accepts up to 4 reference images; costs more Neurons than Schnell).
export async function generateImage(prompt, inputImageDataUrl) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      "Image generation is not set up yet. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in Render's Environment tab."
    );
  }

  if (inputImageDataUrl) {
    const match = inputImageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("That attachment isn't a usable image.");
    const [, mimeType, base64Data] = match;
    const buffer = Buffer.from(base64Data, "base64");
    const blob = new Blob([buffer], { type: mimeType });

    const form = new FormData();
    form.append("prompt", prompt);
    form.append("input_image_0", blob, "reference.jpg");
    form.append("steps", "25");

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-2-dev`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}` }, // no Content-Type: fetch sets the multipart boundary itself
        body: form,
      }
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`Cloudflare FLUX.2 image-edit error ${res.status}:`, detail);
      throw new Error("Image editing failed. Please try again.");
    }

    const data = await res.json();
    const base64 = data?.result?.image || data?.image;
    if (!base64) throw new Error("Image editing failed. Please try again.");
    return `data:image/jpeg;base64,${base64}`;
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`Cloudflare image error ${res.status}:`, detail);
    throw new Error("Image generation failed. Please try again.");
  }

  const data = await res.json();
  const base64 = data?.result?.image || data?.image;

  if (!base64) {
    throw new Error("Image generation failed. Please try again.");
  }

  return `data:image/jpeg;base64,${base64}`;
}

// Simple heuristic to detect when someone's asking Syna to draw/generate/edit an image.
export function isImageRequest(text) {
  if (!text) return false;
  return /\b(generate|create|draw|make|design|paint|edit|turn|transform|stylize|reimagine)\b[\s\S]{0,30}\b(image|picture|photo|drawing|art|illustration|logo|icon|artwork|this|it)\b/i.test(
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