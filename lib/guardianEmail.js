// lib/guardianEmail.js
import { createHash } from "crypto";
import { sendEmail } from "@/lib/email";
import { generateCode, CODE_TTL_MS } from "@/lib/security";

// "someone@gmail.com" -> "s***@gmail.com"
export function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!name || !domain) return "";
  return `${name[0]}***@${domain}`;
}

export function hashConfirmCode(userId, code) {
  return createHash("sha256")
    .update(`guardian-email:${userId}:${code}`)
    .digest("hex");
}

// A fresh confirmation code plus the values to store for it.
export function makeConfirmCode(userId) {
  const code = String(generateCode());
  return {
    code,
    hash: hashConfirmCode(userId, code),
    expires: new Date(Date.now() + CODE_TTL_MS),
  };
}

function confirmEmailHtml(code) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 420px; margin: 0 auto;">
      <h2 style="color:#14151A;">Confirm this email</h2>
      <p style="color:#54565f; font-size:14px;">This address was added as the parent contact for a Vreedits account. Enter this code to confirm it. Once confirmed, it can be used to reset the parental PIN. The code expires in 10 minutes.</p>
      <div style="font-size:28px; font-weight:700; letter-spacing:0.1em; background:#F2F2F5; padding:16px; border-radius:12px; text-align:center; margin:16px 0;">
        ${code}
      </div>
      <p style="color:#8A8C99; font-size:12px;">If you didn't expect this, you can ignore this email and nothing will change.</p>
    </div>
  `;
}

export async function sendConfirmEmail(to, code) {
  return sendEmail({
    to,
    subject: "Confirm your email as a parent contact on Vreedits",
    html: confirmEmailHtml(code),
  });
}