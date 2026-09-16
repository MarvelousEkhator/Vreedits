import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

// Sends the message straight to the same inbox the app already emails
// from/to on Resend's sandbox tier. Set SUPPORT_EMAIL later once a real
// domain is verified, to route this anywhere you want.
export async function POST(req) {
  const { name, email, message } = await req.json();

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM;

  try {
    await sendEmail({
      to: supportEmail,
      subject: `Vreedits contact form: ${name.trim()}`,
      html: `
        <div style="font-family: -apple-system, sans-serif;">
          <p><strong>From:</strong> ${name.trim()} (${email.trim()})</p>
          <p><strong>Message:</strong></p>
          <p>${message.trim().replace(/\n/g, "<br/>")}</p>
        </div>
      `,
    });
  } catch (err) {
    return NextResponse.json({ error: `Could not send message: ${err.message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
  }
<button
  onClick={handleLogout}
  disabled={loggingOut}
  className="flex items-center justify-between py-3 w-full"
  style={{ borderTop: "1px solid var(--border)", color: "var(--danger, #e5484d)" }}
>