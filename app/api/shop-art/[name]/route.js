import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

// Serves the shop pictures (frames, nameplates, effects, badges).
// They can sit in the project's main folder or in public/; either works.
const FILES = new Set(["frames.webp", "nameplates.webp", "effects.webp", "badges.webp"]);

export async function GET(req, { params }) {
  const name = String(params.name || "");
  if (!FILES.has(name)) return new Response("Not found", { status: 404 });

  for (const dir of [path.join(process.cwd(), "public"), process.cwd()]) {
    try {
      const buf = await fs.readFile(path.join(dir, name));
      return new Response(buf, {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    } catch {
      // try the next folder
    }
  }
  return new Response("Not found", { status: 404 });
}
