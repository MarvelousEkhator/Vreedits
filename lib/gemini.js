// Real calls to Google's Gemini API. No SDK dependency — plain REST.
//
// Google is transitioning from old "Standard" keys (AIza...) to new "Auth"
// keys (AQ...). Auth keys must be sent as an HTTP header, not a ?key= URL
// parameter — that's what this uses, so it works with your new key.
//
// Accepts either a single prompt string (original single-shot behavior)
// or an array of { role, text } messages for multi-turn conversations
// (used by the tool follow-up chat feature).

export async function callGemini(promptOrMessages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it in Render's Environment tab."
    );
  }

  const contents = Array.isArray(promptOrMessages)
    ? promptOrMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }],
      }))
    : [{ role: "user", parts: [{ text: promptOrMessages }] }];

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({ contents }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no usable response.");
  }
  return text;
}
async function geminiRequest({ contents, systemInstruction, tools }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it in Render's Environment tab.");
  }

  const body = { contents };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (tools) {
    body.tools = [{ functionDeclarations: tools }];
  }

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (${res.status}): ${detail}`);
  }
  return res.json();
}
export async function callSyna({ messages, systemInstruction, tools, executeTool }) {
  let contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.text }],
  }));

  for (let i = 0; i < 5; i++) {
    const data = await geminiRequest({ contents, systemInstruction, tools });
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const functionCallPart = parts.find((p) => p.functionCall);

    if (!functionCallPart) {
      const text = parts.find((p) => p.text)?.text;
      if (!text) throw new Error("Gemini returned no usable response.");
      return text;
    }

    if (!executeTool) throw new Error("Model requested a tool but none was provided.");

    const { name, args } = functionCallPart.functionCall;
    const result = await executeTool(name, args);

    contents.push({ role: "model", parts: [functionCallPart] });
    contents.push({
      role: "user",
      parts: [{ functionResponse: { name, response: { result } } }],
    });
  }

  throw new Error("Too many tool-call rounds without a final answer.");
}
try {
    const replyText = await callGemini(contents, apiKey);
    return NextResponse.json({
      reply: { role: "assistant", text: sanitizeReply(replyText), usedFallback: false },
    });
  } catch (err) {
    if (err.fallback) {
      console.error("Gemini unavailable, falling back to Cloudflare:", err.message);
      