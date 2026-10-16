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

function parseImage(dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.length > MAX_IMAGE_CHARS) return null;
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], data: m[2] };
}

async function askGemini({ caption, tags, image }) {
  if (!GEMINI_KEY) return null;

  const prompt =
    "You rate posts for a student study app. Read the caption, the hashtags and the image (including any text written in it). " +
    "Reply with JSON only: {\"score\": number from 0 to 1, \"topic\": short subject or null}. " +
    "1 = clearly about school, studying, exams, homework, school subjects, teachers or college. " +
    "0.5 = student life, study motivation or partly related. " +
    "0 = unrelated (memes, entertainment, dancing, random chat).\n\n" +
    `Caption: ${caption || "(none)"}\nHashtags: ${(tags || []).join(" ") || "(none)"}`;

  const parts = [{ text: prompt }];
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
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
      id: true, caption: true, tags: true, mediaType: true,
      mediaUrl: true, mediaUrls: true, scoredAt: true,
    },
  });
  if (!post || post.scoredAt) return;

  // Photos are read directly. Videos are scored from the caption and hashtags
  // (the full video is too big to send).
  let image = null;
  if (post.mediaType === "image") {
    const first = post.mediaUrls && post.mediaUrls.length > 0 ? post.mediaUrls[0] : post.mediaUrl;
    image = parseImage(first);
  }

  const result =
    (await askGemini({ caption: post.caption, tags: post.tags, image })) ||
    heuristicScore(post.caption, post.tags);

  await prisma.feedPost.update({
    where: { id: post.id },
    data: { schoolScore: result.score, schoolTopic: result.topic, scoredAt: new Date() },
  });
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