// Free/low-cost image generation via Cloudflare Workers AI.
// - Text-only prompt -> FLUX.1 Schnell (fast, free-tier friendly).
// - Prompt + reference photo(s) -> FLUX.2 [dev] (image-to-image/editing,
//   accepts up to 4 reference images; costs more Neurons than Schnell).
//
// The second argument can be a single data URL string or an array of
// data URLs (up to 4 are used).

const MAX_REFERENCE_IMAGES = 4;

export async function generateImage(prompt, inputImages) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      "Image generation is not set up yet. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in Render's Environment tab."
    );
  }

  const references = (Array.isArray(inputImages) ? inputImages : [inputImages])
    .filter(Boolean)
    .slice(0, MAX_REFERENCE_IMAGES);

  if (references.length > 0) {
    const form = new FormData();

    const fullPrompt =
      references.length > 1
        ? `You are given ${references.length} reference images, in the order attached (first image, second image, etc). ${prompt}`
        : prompt;
    form.append("prompt", fullPrompt);

    references.forEach((dataUrl, i) => {
      const match = typeof dataUrl === "string" ? dataUrl.match(/^data:([^;]+);base64,(.+)$/) : null;
      if (!match) throw new Error("That attachment isn't a usable image.");
      const [, mimeType, base64Data] = match;
      const blob = new Blob([Buffer.from(base64Data, "base64")], { type: mimeType });
      form.append(`input_image_${i}`, blob, `reference-${i}.jpg`);
    });

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
    if (!base64) {
      console.error("Cloudflare FLUX.2 returned no image:", JSON.stringify(data).slice(0, 500));
      throw new Error("Image editing failed. Please try again.");
    }
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
    console.error("Cloudflare image returned no image:", JSON.stringify(data).slice(0, 500));
    throw new Error("Image generation failed. Please try again.");
  }

  return `data:image/jpeg;base64,${base64}`;
}

// Simple heuristic to detect when someone's asking Syna to draw/generate/edit an image.
export function isImageRequest(text) {
  if (!text) return false;
  const verb = /\b(generate|create|draw|make|design|paint|edit|turn|transform|stylize|reimagine|render|sketch|show me)\b/i;
  const mediaNoun = /\b(image|picture|photo|drawing|art|illustration|logo|icon|artwork|this|it)\b/i;
  const subjectPattern = /\b(generate|create|draw|make|design|paint|render|sketch)\b\s+(a|an|me\s+a|me\s+an)\s+\S/i;

  return verb.test(text) && (mediaNoun.test(text) || subjectPattern.test(text));
}