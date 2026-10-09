// lib/email.js
// Sends email through Brevo's HTTPS API (free plan: ~300 emails/day).
// Render env vars needed:
//   BREVO_API_KEY = your Brevo API key
//   EMAIL_FROM    = your verified sender, e.g. Vreedits <youraddress@gmail.com>
//                   (or just youraddress@gmail.com)

function parseSender(value) {
  const raw = (value || "").trim();
  const match = raw.match(/^(.*)<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^"|"$/g, "") || "Vreedits",
      email: match[2].trim(),
    };
  }
  return { name: "Vreedits", email: raw };
}

export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error(
      "BREVO_API_KEY is not set. Add it in Render's Environment tab."
    );
  }

  const sender = parseSender(process.env.EMAIL_FROM);
  if (!sender.email) {
    throw new Error(
      "EMAIL_FROM is not set. Add your verified Brevo sender address in Render's Environment tab."
    );
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Brevo email failed (${res.status}): ${detail}`);
  }
  return res.json().catch(() => ({}));
}

function codeEmailHtml(heading, code) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 420px; margin: 0 auto;">
      <h2 style="color:#14151A;">${heading}</h2>
      <p style="color:#54565f; font-size:14px;">Use this code to continue. It expires in 10 minutes.</p>
      <div style="font-size:28px; font-weight:700; letter-spacing:0.1em; background:#F2F2F5; padding:16px; border-radius:12px; text-align:center; margin:16px 0;">
        ${code}
      </div>
      <p style="color:#8A8C99; font-size:12px;">If you didn't request this, you can ignore this email.</p>
    </div>
  `;
}

function ordinalSuffix(n) {
  const j = n % 10, k = n % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}

function birthdayEmailHtml(displayName, age) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 420px; margin: 0 auto;">
      <h2 style="color:#14151A;">Happy Birthday${displayName ? `, ${displayName}` : ""}! 🎉🎂</h2>
      <p style="color:#54565f; font-size:14px; line-height:1.6;">
        Another year, another trip around the sun — and today's all about you!
        Everyone here at Vreedits is celebrating your ${age}${ordinalSuffix(age)} birthday
        and wanted to take a moment to say how glad we are to have you with us.
      </p>
      <p style="color:#54565f; font-size:14px; line-height:1.6;">
        We hope your day is filled with good food, good company, and maybe even
        a little extra cake. Thanks for being part of the Vreedits community —
        here's to another great year ahead. 🥳
      </p>
      <p style="color:#8A8C99; font-size:12px; margin-top:24px;">
        — With love from the Vreedits team
      </p>
    </div>
  `;
}

export async function sendVerificationEmail(to, code) {
  return sendEmail({
    to,
    subject: "Verify your Vreedits account",
    html: codeEmailHtml("Verify your email", code),
  });
}

export async function sendResetEmail(to, code) {
  return sendEmail({
    to,
    subject: "Reset your Vreedits password",
    html: codeEmailHtml("Reset your password", code),
  });
}

export async function sendBirthdayEmail(to, displayName, age) {
  return sendEmail({
    to,
    subject: "Happy Birthday from Vreedits! 🎉",
    html: birthdayEmailHtml(displayName, age),
  });
}