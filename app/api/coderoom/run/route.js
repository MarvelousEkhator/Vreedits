// app/api/coderoom/run/route.js
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";

// glot.io's run endpoint wants a filename with the right extension for
// the entry file — this doesn't need to be perfect for every language,
// it just needs to look like a real source file of that type.
const FILENAMES = {
  javascript: "main.js",
  typescript: "main.ts",
  python: "main.py",
  java: "Main.java", // capitalized: matches Java's usual "public class Main" convention
  c: "main.c",
  cpp: "main.cpp",
  csharp: "main.cs",
  go: "main.go",
  rust: "main.rs",
  ruby: "main.rb",
  php: "main.php",
  kotlin: "main.kt",
  swift: "main.swift",
  bash: "main.sh",
};

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { language, code } = await req.json().catch(() => ({}));
  const filename = FILENAMES[language];
  if (!filename) {
    return NextResponse.json({ error: "Unsupported language." }, { status: 400 });
  }

  const apiToken = process.env.GLOT_API_TOKEN;
  if (!apiToken) {
    return NextResponse.json(
      { error: "Code execution isn't set up. Add GLOT_API_TOKEN in Render's Environment tab." },
      { status: 500 }
    );
  }

  let res;
  try {
    res = await fetch(`https://run.glot.io/languages/${language}/latest`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: [{ name: filename, content: code || "" }],
      }),
    });
  } catch (err) {
    console.error("glot.io request failed:", err);
    return NextResponse.json({ error: "Code execution failed." }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`glot.io error ${res.status}:`, detail);
    const message =
      res.status === 401 || res.status === 403
        ? "Code execution isn't authorized. Check GLOT_API_TOKEN."
        : "Code execution failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const data = await res.json();

  return NextResponse.json({
    stdout: data.stdout || "",
    stderr: data.stderr || data.error || "",
    exitCode: undefined, // glot.io doesn't return a separate exit code
  });
}
