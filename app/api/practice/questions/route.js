import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { callGemini } from "@/lib/gemini";

export const runtime = "nodejs";

// Fresh exam-style questions written by Syna. Logged-in users only, and a small
// per-user limit protects the AI quota.
const SUBJECTS = ["English", "Mathematics", "Biology", "Physics", "Chemistry"];
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
  const subject = String(body.subject || "");
  if (!SUBJECTS.includes(subject)) return NextResponse.json({ error: "bad subject" }, { status: 400 });
  const topic = String(body.topic || "").replace(/[^\w\s,.&'/-]/g, "").slice(0, 60).trim();

  const prompt = `You are an experienced Nigerian secondary-school examiner writing practice questions in the style of the JAMB UTME (and WAEC/NECO) for ${subject}${topic ? `, on the topic: ${topic}` : ", covering a spread of topics from the UTME syllabus"}.
Rules:
- Write exactly 10 multiple-choice questions at UTME difficulty, with Nigerian context where natural.
- Each question has exactly 4 different options and exactly ONE correct option.
- Solve each question carefully and double-check the correct option before you write it down. Do not write a question you are not certain about.
- Do not copy real past questions. Write new ones.
- "why" is one or two short sentences explaining the correct answer.
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
