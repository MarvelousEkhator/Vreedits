// --- Layer 0: known jailbreak-shape pre-check (runs on the user's message, before Gemini) ---
const JAILBREAK_PATTERNS = [
  /\bignore (all |your |previous |the )?(instructions|rules|prompt)\b/i,
  /\byou are now\b/i,
  /\bpretend (you are|to be)\b.{0,40}\b(unrestricted|unfiltered|no rules|jailbroken|dan)\b/i,
  /\brespond (only |back )?in binary\b/i,
  /\bspeak (only )?in binary\b/i,
  /\b(only |also )?in binary\b.{0,60}\b(system|prompt|instructions|config)\b/i,
  /\bunrestricted (ai|version|mode)\b/i,
  /\bno (longer )?(hindered|restricted|bound) by\b/i,
  /\byour underlying configuration\b/i,
  /\bwhat were you told\b/i,
  /\bsend me the (syna|system) (stuff|prompt|config)\b/i,
];

function looksLikeJailbreakAttempt(text) {
  if (!text) return false;
  return JAILBREAK_PATTERNS.some((re) => re.test(text));
}

// --- decode helper: catches binary/hex encoding used to smuggle a leak past plain-text checks ---
function decodeIfEncoded(text) {
  const decoded = [];

  // binary: sequences of 8-bit groups separated by spaces
  const binaryMatches = text.match(/(?:[01]{7,8}\s+){3,}[01]{7,8}/g) || [];
  for (const m of binaryMatches) {
    try {
      const bytes = m.trim().split(/\s+/);
      const chars = bytes.map((b) => String.fromCharCode(parseInt(b, 2)));
      decoded.push(chars.join(""));
    } catch {}
  }

  // hex: sequences of 2-digit hex pairs
  const hexMatches = text.match(/(?:\b[0-9a-f]{2}\b\s*){4,}/gi) || [];
  for (const m of hexMatches) {
    try {
      const pairs = m.trim().split(/\s+/);
      const chars = pairs.map((p) => String.fromCharCode(parseInt(p, 16)));
      decoded.push(chars.join(""));
    } catch {}
  }

  return decoded.join(" ");
}

// --- silent logging: fire-and-forget, never surfaced to the user ---
async function logSuspiciousAttempt({ userId, reason, message }) {
  try {
    // Swap this for your actual DB call, e.g. a Prisma model — see schema addition below.
    await prisma.suspiciousAiAttempt.create({
      data: {
        userId,
        reason,
        message: message?.slice(0, 2000) || "",
      },
    });
  } catch (err) {
    // never let logging failures break the chat response
    console.error("Failed to log suspicious attempt:", err);
  }
}

// Updated sanitizeReply — now also decodes binary/hex before checking for leaks
async function sanitizeReply(replyText, apiKey) {
  const decoded = decodeIfEncoded(replyText);
  const combined = decoded ? `${replyText}\n${decoded}` : replyText;

  if (containsSensitivePattern(combined)) return TECH_DECLINE;
  if (containsPromptLeak(combined)) return GENERIC_DECLINE;
  if (await classifyLeak(combined, apiKey)) return GENERIC_DECLINE;
  return replyText;
}