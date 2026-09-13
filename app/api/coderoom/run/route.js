// app/api/coderoom/run/route.js
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";

// Judge0 CE language IDs — stable identifiers on the judge0-ce RapidAPI host.
// (Different system from Piston's "language + version string" approach.)
const LANGUAGE_IDS = {
  javascript: 63, // Node.js
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

const JUDGE0_HOST = "judge0-ce.p.rapidapi.com";

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { language, code } = await req.json().catch(() => ({}));
  const languageId = LANGUAGE_IDS[language];
  if (!languageId) {
    return NextResponse.json({ error: "Unsupported language." }, { status: 400 });
  }

  const apiKey = process.env.JUDGE0_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Code execution isn't set up. Add JUDGE0_API_KEY in Render's Environment tab." },
      { status: 500 }
    );
  }

  let res;
  try {
    // wait=true makes Judge0 execute synchronously and return the result
    // directly, instead of needing to poll a submission token afterward.
    res = await fetch(`https://${JUDGE0_HOST}/submissions?base64_encoded=false&wait=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": JUDGE0_HOST,
      },
      body: JSON.stringify({
        source_code: code,
        language_id: languageId,
      }),
    });
  } catch (err) {
    console.error("Judge0 request failed:", err);
    return NextResponse.json({ error: "Code execution failed." }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`Judge0 error ${res.status}:`, detail);
    const message =
      res.status === 429
        ? "Code execution is rate-limited right now. Please try again in a moment."
        : "Code execution failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const data = await res.json();

  // Judge0 reports failures (compile errors, timeouts, runtime crashes) via
  // a `status` object rather than an HTTP error code. Status id 3 means
  // the run completed normally (even if the program itself errored at
  // runtime with output in stderr); anything above 3 is Judge0 itself
  // flagging a problem — compile error, timeout, etc. — so that
  // description gets surfaced alongside any actual stderr.
  const statusDescription = data.status?.description || "";
  const isJudge0Error = (data.status?.id || 0) > 3;

  return NextResponse.json({
    stdout: data.stdout || "",
    stderr: data.stderr || data.compile_output || (isJudge0Error ? statusDescription : ""),
    exitCode: data.exit_code,
    status: statusDescription,
  });
}
