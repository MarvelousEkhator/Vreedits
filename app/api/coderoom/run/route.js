// app/api/coderoom/run/route.js
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";

const LANGUAGE_VERSIONS = {
  javascript: "18.15.0",
  python: "3.10.0",
  java: "15.0.2",
  cpp: "10.2.0",
  c: "10.2.0",
  typescript: "5.0.3",
};

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { language, code } = await req.json().catch(() => ({}));
  const version = LANGUAGE_VERSIONS[language];
  if (!version) return NextResponse.json({ error: "Unsupported language." }, { status: 400 });

  const res = await fetch("https://emkc.org/api/v2/piston/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language,
      version,
      files: [{ content: code }],
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Code execution failed." }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json({
    stdout: data.run?.stdout || "",
    stderr: data.run?.stderr || "",
    exitCode: data.run?.code,
  });
}