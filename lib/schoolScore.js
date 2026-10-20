import { prisma } from "@/lib/prisma";

// Syna checks every post BEFORE it goes on the feed.
//
// Allowed:
//   school   - anything to do with school, studying, exams, homework, subjects, online learning
//   life     - a student sharing how their weekend or day is going (clean, ordinary life)
// Not posted:
//   offtopic - anything else (memes, dancing, fashion, gaming, ads, random chat)
//   unsafe   - nudity, sexual content, violence, gore, drugs, hate, bullying, scams, personal info
//
// Uses Gemini. If your Syna code uses a different env var name for the key,
// change GEMINI_KEY on the next line.
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_SCORE_MODEL || "gemini-2.5-flash";

const MAX_IMAGE_CHARS = 4_000_000;
// Videos are sent whole (up to about 10 MB).
const MAX_VIDEO_CHARS = 14_000_000;
// A carousel can hold 35 photos. Syna looks at up to this many, spread across it.
const MAX_CHECKED_PHOTOS = 4;

// Used by old posts being re-checked: Gemini scores below this get taken down.
export const NOT_SCHOOL_BELOW = 0.3;

// Strikes (unsafe posts). 3 = 24 hour pause on posting, 5 or more = 7 days.
const STRIKE_PAUSE_AT = 3;
const STRIKE_LONG_PAUSE_AT = 5;

const SCORE_FOR = { school: 1, life: 0.6, offtopic: 0.05, unsafe: 0 };

const inFlight = new Set();

const SCHOOL_WORDS = [
  "school", "study", "studying", "exam", "exams", "test", "quiz", "homework", "assignment",
  "revision", "revise", "teacher", "lecture", "class", "classes", "college", "university",
  "maths", "math", "algebra", "calculus", "physics", "chemistry", "biology", "history",
  "geography", "english", "essay", "notes", "flashcard", "flashcards", "student", "students",
  "grade", "grades", "gpa", "waec", "neco", "jamb", "sat", "gcse", "a-level", "alevel",
  "project", "thesis", "learn", "learning", "tutor", "lesson", "semester", "campus",
];
const LIFE_WORDS = ["weekend", "saturday", "sunday", "friday night", "my day", "today i", "this week", "holiday", "break"];
const BLOCK_WORDS = [
  "nude", "nudes", "porn", "sexy", "onlyfans", "kill yourself", "cocaine",
  "fuck", "bitch", "slut", "whore", "nigga", "nigger", "cunt", "rape",
];

function hasWord(text, w) {
  return new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(text);
}

// Backup when Gemini isn't available. Only used for posts with no photo or video.
function heuristicVerdict(caption, tags) {
  const text = `${caption || ""} ${(tags || []).join(" ")}`.toLowerCase();
  if (!text.trim()) return null;
  if (BLOCK_WORDS.some((w) => hasWord(text, w))) return { verdict: "unsafe", topic: null, reason: "It has words that aren't allowed here." };
  if (SCHOOL_WORDS.some((w) => hasWord(text, w))) return { verdict: "school", topic: "school", reason: "" };
  if (LIFE_WORDS.some((w) => text.includes(w))) return { verdict: "life", topic: "life", reason: "" };
  return null;
}

function parseMedia(dataUrl, kind) {
  if (typeof dataUrl !== "string") return null;
  const limit = kind === "video" ? MAX_VIDEO_CHARS : MAX_IMAGE_CHARS;
  if (dataUrl.length > limit) return null;
  const m = /^data:((?:image|video)\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/is.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], data: m[2] };
}

// Picks up to n items spread across the list (first, last and in between).
function spread(list, n) {
  if (list.length <= n) return list;
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[Math.round((i * (list.length - 1)) / (n - 1))]);
  return out;
}

const PROMPT =
  "You are Syna, the moderator of a student STUDY app. Decide if a post may be shown to other students. " +
  "Read the caption, the hashtags and every attached photo or video (including text on screen and, for video, what is said). " +
  "Judge what the media actually shows, not only what the caption claims.\n" +
  "Verdicts:\n" +
  "- \"school\": clearly about school or learning: studying, notes, exams, homework, lessons, school subjects, teachers, campus life, online courses, study tips, study setups, school projects.\n" +
  "- \"life\": an ordinary, clean post where a student shares how their weekend or day is going (rest, family time, a walk, food, a hobby, an outing). Must be wholesome and not an ad.\n" +
  "- \"offtopic\": not school and not a student sharing their weekend or day: memes, dance or music clips, celebrity or fashion content, gaming, product ads, promotions, politics, random chat.\n" +
  "- \"unsafe\": nudity or sexual content, violence or gore, drugs or alcohol, weapons, hate or harassment, bullying, self-harm, scams, or private information such as phone numbers, addresses or IDs. Unsafe wins over every other verdict.\n" +
  "Reply with JSON only: {\"verdict\": \"school\"|\"life\"|\"offtopic\"|\"unsafe\", \"topic\": short subject or null, \"reason\": one short friendly sentence telling the poster why, written to them}.";

// Returns { verdict, topic, reason } or null when Syna can't be reached.
async function askGemini({ caption, tags, parts: mediaParts, hasVideo }) {
  if (!GEMINI_KEY) return null;
  const text = `${PROMPT}\n\nCaption: ${caption || "(none)"}\nHashtags: ${(tags || []).join(" ") || "(none)"}`;
  const parts = [{ text }, ...mediaParts.map((m) => ({ inline_data: { mime_type: m.mime, data: m.data } }))];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), hasVideo ? 60000 : 25000);
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
    const out = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(out.replace(/```json|```/g, "").trim());
    const verdict = String(parsed.verdict || "").toLowerCase();
    if (!(verdict in SCORE_FOR)) return null;
    return {
      verdict,
      topic: typeof parsed.topic === "string" ? parsed.topic.slice(0, 60) : null,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Collects what Syna can look at. Returns { parts, hasVideo, tooBig }.
function collectMedia({ mediaType, mediaUrl, mediaUrls }) {
  const parts = [];
  let tooBig = false;
  let hasVideo = false;
  if (mediaType === "video") {
    hasVideo = true;
    if (mediaUrl) {
      const m = parseMedia(mediaUrl, "video");
      if (m) parts.push(m); else tooBig = true;
    }
  } else {
    const all = mediaUrls && mediaUrls.length > 1 ? mediaUrls : mediaUrl ? [mediaUrl] : [];
    for (const u of spread(all, MAX_CHECKED_PHOTOS)) {
      const m = parseMedia(u, "image");
      if (m) parts.push(m); else tooBig = true;
    }
  }
  return { parts, hasVideo, tooBig };
}

// The gate. Call before a post is saved or published.
// Returns { ok, verdict, score, topic, message }.
//   ok true  -> school or life, may be posted
//   ok false -> do not post; show "message" to the person
// A post with media is never allowed through when Syna can't look at it.
export async function moderatePost({ caption, tags, mediaType, mediaUrl, mediaUrls }) {
  const hasMedia = !!(mediaUrl || (mediaUrls && mediaUrls.length));
  const media = collectMedia({ mediaType, mediaUrl, mediaUrls });

  if (hasMedia && media.tooBig) {
    return {
      ok: false, verdict: "unchecked", score: null, topic: null,
      message: media.hasVideo
        ? "Syna can't check a video this long. Please try a shorter clip (under about 10 MB)."
        : "Syna can't check a photo this big. Please try a smaller photo.",
    };
  }

  const ai = await askGemini({ caption, tags, parts: media.parts, hasVideo: media.hasVideo });
  let result = ai;
  if (!result && !hasMedia) result = heuristicVerdict(caption, tags);

  if (!result) {
    return {
      ok: false, verdict: "unchecked", score: null, topic: null,
      message: "Syna couldn't check your post right now, so it wasn't posted. Please try again in a moment.",
    };
  }

  const score = SCORE_FOR[result.verdict];
  if (result.verdict === "school" || result.verdict === "life") {
    return { ok: true, verdict: result.verdict, score, topic: result.topic || (result.verdict === "life" ? "life" : null), message: "" };
  }
  if (result.verdict === "unsafe") {
    return {
      ok: false, verdict: "unsafe", score, topic: null,
      message: `Warning: this post isn't allowed on Vreedits and was not posted. ${result.reason || ""}`.trim(),
    };
  }
  return {
    ok: false, verdict: "offtopic", score, topic: result.topic || null,
    message:
      `Not posted. Vreedits only allows school and learning posts, or you sharing how your weekend is going. ${result.reason || ""}`.trim(),
  };
}

// Is this person paused from posting? Returns a message or "".
// Never throws: if the new columns aren't in the database yet, nobody is paused.
export async function postingPauseMessage(userId) {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { feedBannedUntil: true } });
    const until = u?.feedBannedUntil;
    if (until && until.getTime() > Date.now()) {
      const hours = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 3600000));
      return hours >= 48
        ? `Posting is paused on your account for about ${Math.ceil(hours / 24)} more days because of earlier warnings.`
        : `Posting is paused on your account for about ${hours} more hour${hours === 1 ? "" : "s"} because of earlier warnings.`;
    }
  } catch {}
  return "";
}

// Adds a strike for an unsafe post, pauses posting at 3 and 5 strikes, and tells the person.
// Returns an extra sentence to add to the warning shown to them.
export async function addStrike(userId) {
  try {
    const u = await prisma.user.update({
      where: { id: userId },
      data: { feedWarnings: { increment: 1 } },
      select: { feedWarnings: true },
    });
    const n = u.feedWarnings;
    let pause = 0;
    if (n >= STRIKE_LONG_PAUSE_AT) pause = 7 * 24;
    else if (n >= STRIKE_PAUSE_AT) pause = 24;
    let extra = ` This is warning ${n}.`;
    if (pause) {
      await prisma.user.update({
        where: { id: userId },
        data: { feedBannedUntil: new Date(Date.now() + pause * 3600000) },
      });
      extra += pause >= 48
        ? " Posting is now paused for 7 days."
        : " Posting is now paused for 24 hours.";
    } else {
      extra += ` At ${STRIKE_PAUSE_AT} warnings, posting is paused for 24 hours.`;
    }
    try {
      await prisma.notification.create({
        data: {
          userId, category: "feed", title: "Warning about your post",
          description: `A post of yours wasn't allowed on Vreedits.${extra}`,
        },
      });
    } catch {}
    return extra;
  } catch {
    return "";
  }
}

// Scores one existing post (used for old posts by the owner sweep) and saves the result.
// Posts that now fail the check are taken down (they become private).
export async function scorePost(postId) {
  const post = await prisma.feedPost.findUnique({
    where: { id: postId },
    select: {
      id: true, authorId: true, caption: true, tags: true, mediaType: true, isPrivate: true,
      mediaUrl: true, mediaUrls: true, scoredAt: true,
    },
  });
  if (!post || post.scoredAt) return;

  const media = collectMedia(post);
  const ai = await askGemini({ caption: post.caption, tags: post.tags, parts: media.parts, hasVideo: media.hasVideo });
  const result = ai || heuristicVerdict(post.caption, post.tags);
  const verdict = result ? result.verdict : null;
  const score = verdict ? SCORE_FOR[verdict] : 0.2;

  await prisma.feedPost.update({
    where: { id: post.id },
    data: { schoolScore: score, schoolTopic: result?.topic || null, scoredAt: new Date() },
  });

  // Only a real Syna verdict takes a post down.
  if (ai && (verdict === "offtopic" || verdict === "unsafe") && !post.isPrivate) {
    await prisma.feedPost.update({ where: { id: post.id }, data: { isPrivate: true } });
    try {
      await prisma.notification.create({
        data: {
          userId: post.authorId,
          category: "feed",
          title: "Your post was taken down",
          description:
            verdict === "unsafe"
              ? "Syna checked your post and it isn't allowed on Vreedits, so it was removed. You can still see it in your Private posts."
              : "Syna checked your post and it isn't about school or how your weekend is going, so it was removed from the feed. You can still see it in your Private posts.",
        },
      });
    } catch {}
  }
}

// Clears old scores so Syna looks at those posts again.
export async function resetScores(kind) {
  const where = kind === "video" ? { mediaType: "video", isDraft: false } : { isDraft: false };
  const r = await prisma.feedPost.updateMany({ where, data: { scoredAt: null } });
  return r.count;
}

// Checks up to "limit" posts that Syna hasn't read yet and says how many are left.
// Used by the owner-only sweep link.
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
