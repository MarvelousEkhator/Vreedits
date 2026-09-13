import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";

// Judge0 via RapidAPI. Kept DISABLED by default so it never gets called
// (and never costs anything) until you're ready — flip CODE_RUN_ENABLED
// to "true" in Render's Environment tab when you want this live.
// The in-browser JS/Python/HTML runner in app/coderoom/[roomId]/page.js
// is unaffected either way — this route is only for languages beyond
// those three (Java, C++, Go, etc.), and nothing currently calls it.

const LANGUAGE_IDS = {
  javascript: 63,
  typescript: 74,
  python: 71,
  java: 62,
  c: 50,
  cpp: 54,
  csharp: 51,
  go: 60,
  rust: 73,
  ruby: 72,
  php: 68,
  kotlin: 78,
  swift: 83,
  bash: 46,
};

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  if (process.env.CODE_RUN_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Multi-language code execution isn't enabled yet." },
      { status: 503 }
    );
  }

  const { language, code } = await req.json().catch(() => ({}));
  const languageId = LANGUAGE_IDS[language];
  if (!languageId) {
    return NextResponse.json({ error: "Unsupported language." }, { status: 400 });
  }

  const apiKey = process.env.JUDGE0_API_KEY;
  const apiHost = process.env.JUDGE0_API_HOST || "judge0-ce.p.rapidapi.com";
  if (!apiKey) {
    return NextResponse.json(
      { error: "Code execution isn't set up. Add JUDGE0_API_KEY in Render's Environment tab." },
      { status: 500 }
    );
  }

  let submitRes;
  try {
    submitRes = await fetch(
      `https://${apiHost}/submissions?base64_encoded=true&wait=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": apiHost,
        },
        body: JSON.stringify({
          language_id: languageId,
          source_code: Buffer.from(code || "").toString("base64"),
        }),
      }
    );
  } catch (err) {
    console.error("Judge0 request failed:", err);
    return NextResponse.json({ error: "Code execution failed." }, { status: 502 });
  }

  if (!submitRes.ok) {
    const detail = await submitRes.text().catch(() => "");
    console.error(`Judge0 error ${submitRes.status}:`, detail);
    const message =
      submitRes.status === 401 || submitRes.status === 403
        ? "Code execution isn't authorized. Check JUDGE0_API_KEY."
        : "Code execution failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const data = await submitRes.json();
  const decode = (val) => (val ? Buffer.from(val, "base64").toString("utf-8") : "");

  return NextResponse.json({
    stdout: decode(data.stdout),
    stderr: decode(data.stderr) || decode(data.compile_output),
    exitCode: data.status?.id === 3 ? 0 : data.status?.id,
    statusDescription: data.status?.description,
  });
}