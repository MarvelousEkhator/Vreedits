// lib/feedbackAdmin.js
//
// Only the people listed in the FEEDBACK_ADMIN_EMAILS environment variable
// (comma separated, set it in Render) can read feedback or send thanks.
// Guests can never be admins.
export function isFeedbackAdmin(user) {
  if (!user || user.isGuest) return false;
  const allowed = (process.env.FEEDBACK_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes((user.email || "").toLowerCase());
}
