import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countryName } from "@/lib/education";
import { callGemini } from "@/lib/gemini";

export const runtime = "nodejs";

// Fresh exam-style questions written by Syna. Logged-in users only, and a small
// per-user limit protects the AI quota.
const SUBJECTS_BY = {
  NG: ["English", "Mathematics", "Biology", "Physics", "Chemistry"],
  GB: ["Mathematics", "English", "Biology", "Chemistry", "Physics"],
  US: ["Math", "Reading & Writing", "Science"],
};
const hits = new Map(); // userId -> [timestamps]
const LIMIT = 15;
const WINDOW = 60 * 60 * 1000;

function clean(q) {
  if (!q || typeof q.q !== "string" || !Array.isArray(q.options)) return null;
  const options = q.options.map((o) => String(o).trim()).filter(Boolean);
  if (options.length !== 4 || new Set(options).size !== 4) return null;
  const answer = Number(q.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) return null;
  if (q.q.trim().length < 8) return null;
  return { q: q.q.trim(), o: options, a: answer, why: typeof q.why === "string" ? q.why.trim() : "" };
}

// The student's country and class from sign-up, so Practice can start on the right exam.
export async function GET() {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { country: true, classLevel: true } });
  const market = u?.country === "GB" ? "GB" : u?.country === "US" ? "US" : u?.country === "NG" ? "NG" : null;
  return NextResponse.json({ country: u?.country || null, classLevel: u?.classLevel || null, market });
}

export async function POST(req) {
  const userId = getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const now = Date.now();
  const recent = (hits.get(userId) || []).filter((t) => now - t < WINDOW);
  if (recent.length >= LIMIT) {
    return NextResponse.json({ error: "You've used a lot of fresh sets this hour. Try the built-in questions or come back soon." }, { status: 429 });
  }
  recent.push(now);
  hits.set(userId, recent);

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const market = SUBJECTS_BY[body.market] ? body.market : "NG";
  const subject = String(body.subject || "");
  if (!SUBJECTS_BY[market].includes(subject)) return NextResponse.json({ error: "bad subject" }, { status: 400 });
  const topic = String(body.topic || "").replace(/[^\w\s,.&'/-]/g, "").slice(0, 60).trim();

  const WHO = {
    NG: `an experienced Nigerian secondary-school examiner writing practice questions in the style of the JAMB UTME (and WAEC/NECO) for ${subject}`,
    GB: `an experienced UK examiner writing GCSE-style practice questions (AQA/Edexcel style, with some A-level-style stretch) for ${subject}, using British spelling`,
    US: `an experienced SAT and ACT item writer writing practice questions for ${subject}, in the style of the digital SAT and the ACT, using American spelling`,
  }[market];
  let level = "";
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { country: true, classLevel: true } });
    if (u?.classLevel) {
      const where = u.country ? ` in ${countryName(u.country) || u.country}` : "";
      level = `\nThe student is in ${String(u.classLevel).slice(0, 40)}${where}. Pitch the difficulty and topics so they suit this level: if the level is below the exam year, use questions on topics already taught at that level, still in the exam's style.`;
    }
  } catch {}

  const prompt = `You are ${WHO}${topic ? `, on the topic: ${topic}` : ", covering a spread of topics from the usual syllabus"}.${level}
Rules:
- Write exactly 10 multiple-choice questions at the real exam's difficulty, with local context where natural.
- Each question has exactly 4 different options and exactly ONE correct option.
- Solve each question carefully and double-check the correct option before you write it down. Do not write a question you are not certain about.
- Do not copy real past questions. Write new ones.
- "why" is one or two short sentences explaining the correct answer.
- Write maths in plain classroom signs a student sees in a textbook. Use × for multiply and ÷ for divide. Write powers with superscript digits (x², 2³), roots as √ (for example √36, ∛27), fractions as 3/4, and π for pi. Do NOT use ^, *, LaTeX, backslashes, dollar signs or code-style notation. Do not use fractional powers like 27^(1/3); write ∛27 instead.
Return ONLY JSON, with no other text, in exactly this shape:
{"questions":[{"q":"question text","options":["A","B","C","D"],"answer":0,"why":"short explanation"}]}
"answer" is the index (0 to 3) of the correct option.`;

  try {
    const text = await callGemini(prompt);
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    const data = JSON.parse(text.slice(s, e + 1));
    const questions = (Array.isArray(data.questions) ? data.questions : []).map(clean).filter(Boolean).slice(0, 10);
    if (questions.length < 6) return NextResponse.json({ error: "Syna could not write a good set. Try again." }, { status: 502 });
    return NextResponse.json({ questions, subject });
  } catch {
    return NextResponse.json({ error: "Syna is busy. Try again in a moment." }, { status: 502 });
  }
}
