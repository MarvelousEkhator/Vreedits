import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

function clean(q) {
  if (!q || typeof q.q !== "string" || !Array.isArray(q.options)) return null;
  const options = q.options.map((o) => String(o).trim()).filter(Boolean);
  if (options.length !== 4 || new Set(options).size !== 4) return null;
  const answer = Number(q.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) return null;
  return {
    q: q.q.trim(),
    options,
    answer,
    why: typeof q.why === "string" ? q.why.trim() : "",
  };
}

function parseQuestions(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return [];
  try {
    const data = JSON.parse(text.slice(start, end + 1));
    return (Array.isArray(data.questions) ? data.questions : [])
      .map(clean)
      .filter(Boolean);
  } catch {
    return [];
  }
}

const SYSTEM = `You write quiz questions for students from their own study notes.
Use ONLY facts that appear in the notes. Never add outside facts.
If the notes contain numbers, quantities, rates or processes, write short word problems that make the student work something out. Otherwise write recall and reasoning questions.
Return ONLY JSON in exactly this shape, with no other text:
{"questions":[{"q":"question text","options":["A","B","C","D"],"answer":0,"why":"one short sentence explaining the answer using the notes"}]}
Write exactly 8 questions. Each has exactly 4 different options. "answer" is the index (0 to 3) of the correct option.`;

export async function POST(req) {
  // If Vreedits has logged-in users, check the session here so strangers can't use this route.
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const title = String(body.title || "").slice(0, 120);
  const content = String(body.content || "").slice(0, 6000);
  if (content.trim().length < 60) {
    return NextResponse.json({ error: "note too short" }, { status: 400 });
  }

  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: `Note title: ${title}\n\nNotes:\n${content}` },
          ],
          max_tokens: 2000,
        }),
      }
    );
    if (!res.ok) {
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }
    const data = await res.json();
    const raw = data?.result?.response;
    const text = typeof raw === "string" ? raw : JSON.stringify(raw || "");
    const questions = parseQuestions(text);
    if (questions.length < 4) {
      return NextResponse.json({ error: "no questions" }, { status: 502 });
    }
    return NextResponse.json({ questions: questions.slice(0, 8) });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }
}