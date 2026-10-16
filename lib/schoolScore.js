import { prisma } from "@/lib/prisma";

// Syna reads a post (caption, hashtags, and the first photo when there is one)
// and gives it a school score from 0 to 1.
//   1.0 = clearly about school, studying, exams, homework, subjects
//   0.5 = student life, motivation, partly related
//   0.0 = nothing to do with school
//
// Uses Gemini. If your Syna code uses a different env var name for the key,
// change GEMINI_KEY on the next line.
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_SCORE_MODEL || "gemini-2.5-flash";

const MAX_IMAGE_CHARS = 4_000_000;
// Videos are sent whole (up to about 10 MB). Bigger ones are judged by caption only.
const MAX_VIDEO_CHARS = 14_000_000;

// Below this score Syna takes the post down (it becomes private, which hides it
// from every feed, profile grid, search and tag page at once). Only a real
// Syna (Gemini) verdict can take a post down. The word-count backup never does.
export const NOT_SCHOOL_BELOW = 0.3;

const inFlight = new Set();

const SCHOOL_WORDS = [
  "school", "study", "studying", "exam", "exams", "test", "quiz", "homework", "assignment",
  "revision", "revise", "teacher", "lecture", "class", "classes", "college", "university",
  "maths", "math", "algebra", "calculus", "physics", "chemistry", "biology", "history",
  "geography", "english", "essay", "notes", "flashcard", "flashcards", "student", "students",
  "grade", "grades", "gpa", "waec", "neco", "jamb", "sat", "gcse", "a-level", "alevel",
  "project", "thesis", "learn", "learning", "tutor", "lesson", "semester", "campus",
];

// Backup when Gemini isn't available: counts school words in the text.
function heuristicScore(caption, tags) {
  const text = `${caption || ""} ${(tags || []).join(" ")}`.toLowerCase();
  if (!text.trim()) return { score: 0.2, topic: null };
  let hits = 0;
  for (const w of SCHOOL_WORDS) {
    if (new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(text)) hits += 1;
  }
  if (hits === 0) return { score: 0.1, topic: null };
  return { score: Math.min(1, 0.45 + hits * 0.2), topic: "school" };
}

function parseMedia(dataUrl, kind) {
  if (typeof dataUrl !== "string") return null;
  const limit = kind === "video" ? MAX_VIDEO_CHARS : MAX_IMAGE_CHARS;
  if (dataUrl.length > limit) return null;
  const m = /^data:((?:image|video)\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/is.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], data: m[2] };
}

async function askGemini({ caption, tags, media }) {
  if (!GEMINI_KEY) return null;

  const prompt =
    "You rate posts for a student study app. Read the caption, the hashtags and the attached photo or video (including any text on screen and, for video, what is said). " +
    "Reply with JSON only: {\"score\": number from 0 to 1, \"topic\": short subject or null}. " +
    "1 = clearly about school, studying, exams, homework, school subjects, teachers or college. " +
    "0.5 = student life, study motivation or partly related. " +
    "0 = unrelated (memes, entertainment, dancing, fashion, random chat). " +
    "Judge what the media actually shows, not only what the caption claims.\n\n" +
    `Caption: ${caption || "(none)"}\nHashtags: ${(tags || []).join(" ") || "(none)"}`;

  const parts = [{ text: prompt }];
  if (media) parts.push({ inline_data: { mime_type: media.mime, data: media.data } });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), media && media.mime.startsWith("video/") ? 60000 : 20000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    const score = Number(parsed.score);
    if (!isFinite(score)) return null;
    return {
      score: Math.max(0, Math.min(1, score)),
      topic: typeof parsed.topic === "string" ? parsed.topic.slice(0, 60) : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Scores one post and saves the result on it. Safe to call many times.
export async function scorePost(postId) {
  const post = await prisma.feedPost.findUnique({
    where: { id: postId },
    select: {
      id: true, authorId: true, caption: true, tags: true, mediaType: true, isPrivate: true,
      mediaUrl: true, mediaUrls: true, scoredAt: true,
    },
  });
  if (!post || post.scoredAt) return;

  // Syna looks at the first photo, or the whole video when it is small enough.
  let media = null;
  if (post.mediaType === "video") {
    media = parseMedia(post.mediaUrl, "video");
  } else {
    const first = post.mediaUrls && post.mediaUrls.length > 0 ? post.mediaUrls[0] : post.mediaUrl;
    media = parseMedia(first, "image");
  }

  const synaResult = await askGemini({ caption: post.caption, tags: post.tags, media });
  const result = synaResult || heuristicScore(post.caption, post.tags);

  await prisma.feedPost.update({
    where: { id: post.id },
    data: { schoolScore: result.score, schoolTopic: result.topic, scoredAt: new Date() },
  });

  // Not school stuff: take it down and tell the creator.
  if (synaResult && synaResult.score < NOT_SCHOOL_BELOW && !post.isPrivate) {
    await prisma.feedPost.update({ where: { id: post.id }, data: { isPrivate: true } });
    try {
      await prisma.notification.create({
        data: {
          userId: post.authorId,
          category: "feed",
          title: "Your post was taken down",
          description:
            "Syna checked your post and it isn't about school or studying, so it was removed from the feed. Vreedits is a study app. You can still see it in your Private posts.",
        },
      });
    } catch {}
  }
}

// Clears old scores so Syna looks at those posts again (used once, to re-check
// old videos now that Syna can watch them instead of just reading the caption).
export async function resetScores(kind) {
  const where = kind === "video" ? { mediaType: "video", isDraft: false } : { isDraft: false };
  const r = await prisma.feedPost.updateMany({ where, data: { scoredAt: null } });
  return r.count;
}

// Checks up to "limit" posts that Syna hasn't read yet, one after another, and
// says how many are still waiting. Used by the owner-only sweep link.
export async function sweepUnscored(limit = 5) {
  const rows = await prisma.feedPost.findMany({
    where: { scoredAt: null, isDraft: false },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true },
  });
  for (const r of rows) {
    try { await scorePost(r.id); } catch {}
  }
  const remaining = await prisma.feedPost.count({ where: { scoredAt: null, isDraft: false } });
  return { checked: rows.length, remaining };
}

// Fire and forget. Never blocks a request and never throws.
export function scoreInBackground(ids) {
  for (const id of ids || []) {
    if (!id || inFlight.has(id)) continue;
    inFlight.add(id);
    scorePost(id)
      .catch(() => {})
      .finally(() => inFlight.delete(id));
  }
}