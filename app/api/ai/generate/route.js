import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { getTool, buildPrompt } from "@/lib/aiTools";
import { callGemini } from "@/lib/gemini";
import { checkDomainAvailability } from "@/lib/domainCheck";

// Turns the saved language code (from the request body or the
// "vreedits-lang" cookie) into a name like "Portuguese".
function resolveLanguageName(req, bodyLang) {
  const raw = bodyLang || req.cookies?.get?.("vreedits-lang")?.value || "en";
  if (!/^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(raw)) return "English";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(raw) || "English";
  } catch {
    return "English";
  }
}

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { toolId, values, followUp, history, language } = await req.json();
  const tool = getTool(toolId);
  if (!tool) {
    return NextResponse.json({ error: "Unknown tool." }, { status: 400 });
  }

  const languageName = resolveLanguageName(req, language);

  let contents;

  if (followUp && Array.isArray(history) && history.length > 0) {
    // Continuing a conversation about a result the tool already generated.
    contents = [...history, { role: "user", text: followUp }];
  } else {
    // First run of the tool — validate the form same as before.
    const requiredFields = tool.fields.filter((f) => !f.label.includes("optional"));
    for (const field of requiredFields) {
      if (!values?.[field.name]?.trim()) {
        return NextResponse.json({ error: `${field.label} is required.` }, { status: 400 });
      }
    }

    const enrichedValues = { ...values };

    if (tool.id === "business-name-checker" && values?.name) {
      const domainResult = await checkDomainAvailability(values.name);
      if (domainResult) {
        enrichedValues.domainCheck =
          domainResult.available === true
            ? `${domainResult.domain} is currently AVAILABLE (unregistered).`
            : domainResult.available === false
            ? `${domainResult.domain} is currently TAKEN (already registered).`
            : `Could not verify domain availability for ${domainResult.domain} right now.`;
      }
    }

    let prompt;
    try {
      prompt = buildPrompt(tool, enrichedValues);
    } catch {
      return NextResponse.json({ error: "Could not build request." }, { status: 400 });
    }

    contents = [{ role: "user", text: prompt }];
  }

  // The language instruction is added only to what Gemini sees, so it isn't
  // stored in the saved history (which would go stale if the language changes).
  const languageNote = `\n\n(Write your entire response in ${languageName}.)`;
  const geminiContents = contents.map((m, i) =>
    i === contents.length - 1 ? { ...m, text: `${m.text}${languageNote}` } : m
  );

  try {
    const result = await callGemini(geminiContents);
    const updatedHistory = [...contents, { role: "assistant", text: result }];
    return NextResponse.json({ ok: true, result, history: updatedHistory });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}