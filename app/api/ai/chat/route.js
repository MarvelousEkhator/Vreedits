const LEAK_CHECK_MIN_WORDS = 6; // a run of 6+ consecutive words matching the prompt is not a coincidence
const GENERIC_DECLINE = "I can't share my internal configuration, but I'm happy to help with Vreedits!";
const TECH_DECLINE = "I don't have access to information about how Vreedits is built — I can help with using the platform, though!";

// Precompute normalized word-sequences from the system prompt once,
// so we're not re-splitting it on every request.
const SYSTEM_PROMPT_WORDS = SYNA_SYSTEM_CONTEXT
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim()
  .split(" ");

function containsPromptLeak(replyText) {
  const replyWords = replyText.toLowerCase().replace(/\s+/g, " ").trim().split(" ");
  if (replyWords.length < LEAK_CHECK_MIN_WORDS) return false;

  // Sliding window: does any run of LEAK_CHECK_MIN_WORDS+ consecutive
  // words in the reply appear verbatim, in order, in the system prompt?
  for (let i = 0; i <= replyWords.length - LEAK_CHECK_MIN_WORDS; i++) {
    const window = replyWords.slice(i, i + LEAK_CHECK_MIN_WORDS).join(" ");
    if (SYSTEM_PROMPT_WORDS.join(" ").includes(window)) {
      return true;
    }
  }
  return false;
}

// Catches secrets/internals even if phrased in ways that don't match
// the system prompt's own wording (e.g. the model paraphrasing an
// env var name, or echoing back a key a user pasted in).
const SENSITIVE_PATTERNS = [
  /process\.env/i,
  /\bapi[_-]?key\b\s*[:=]/i,
  /sk-[a-z0-9]{10,}/i,
  /\bDATABASE_URL\b/i,
  /\bJWT_SECRET\b/i,
  /\bprisma\/schema\.prisma\b/i,
  /\bgemini-3\.1-flash-lite\b/i,
  /\bcloudflareimage\.js\b|\bcloudflaretext\.js\b|\bgeminiimageedit\.js\b/i,
];

function containsSensitivePattern(replyText) {
  return SENSITIVE_PATTERNS.some((re) => re.test(replyText));
}

function sanitizeReply(replyText) {
  if (containsSensitivePattern(replyText)) return TECH_DECLINE;
  if (containsPromptLeak(replyText)) return GENERIC_DECLINE;
  return replyText;
}