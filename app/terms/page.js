// app/terms/page.js
export const metadata = { title: "Terms of Service - Vreedits" };

// CHANGE THIS to the email address you want people to write to.
const CONTACT_EMAIL = "support@example.com";
const UPDATED = "October 10, 2026";

const SECTIONS = [
  {
    title: "Welcome to Vreedits",
    paras: [
      "Vreedits is a social and learning app with a video and photo feed, communities, messaging, study tools and an AI assistant called Syna.",
      "By creating an account or using Vreedits, you agree to these Terms and to our Privacy Policy. If you don't agree, please don't use the app.",
    ],
  },
  {
    title: "Who can use Vreedits",
    items: [
      "You must be at least 13 years old. If you are under 13, you can't create an account.",
      "If you are under 18, you should have a parent or guardian's permission to use Vreedits and to agree to these Terms.",
      "Accounts for people under 16 start with stricter privacy settings, such as a private account and friends-only messages, which can't be loosened.",
      "Guest mode gives limited access and may be changed or removed at any time.",
    ],
  },
  {
    title: "Your account",
    items: [
      "Give accurate information when you sign up.",
      "Keep your password secret, and tell us if someone else is using your account.",
      "You are responsible for what happens on your account.",
      "Your date of birth can't be changed once it is set, so enter it correctly.",
      "Don't pretend to be someone else.",
    ],
  },
  {
    title: "Your content",
    paras: [
      "You keep ownership of what you post, send or create on Vreedits, such as videos, photos, captions, comments, messages and notes.",
      "By posting, you give Vreedits permission to store, display and deliver that content so the app can work, including showing it to the people you choose to share it with. This permission ends when you delete the content or your account, except for copies other people have already shared or that we must keep for safety or legal reasons.",
      "You are responsible for your content. Only post things you have the right to share.",
    ],
  },
  {
    title: "Rules",
    paras: ["Don't use Vreedits to:"],
    items: [
      "Harass, bully, threaten or spread hate against anyone.",
      "Share sexual content, and never any sexual content involving someone under 18.",
      "Encourage violence, self-harm or other dangerous behavior.",
      "Share someone's private information without their permission.",
      "Spam, scam, run bots, or pretend to be another person.",
      "Upload malware, scrape the app, or try to break its security.",
      "Get around age limits, parental controls, bans or restrictions.",
      "Misuse Syna, our AI assistant.",
    ],
  },
  {
    title: "Syna, our AI assistant",
    items: [
      "AI can be wrong. Double-check anything important.",
      "Syna is not a replacement for professional medical, legal, financial or safety advice.",
      "Don't share sensitive details like passwords, ID numbers or bank information in a chat.",
      "What you send to Syna is processed by an AI service provider to produce replies.",
      "We may keep records of attempts to misuse the AI.",
    ],
  },
  {
    title: "Parental controls",
    paras: [
      "Vreedits offers a guardian PIN, screen-time limits and quiet hours. They are meant to be set up by a parent or guardian.",
      "We can't check who is entering a PIN or an email, so please keep the PIN private from the person it is meant to protect. These tools help, but they can't guarantee safety.",
    ],
  },
  {
    title: "Reporting and enforcement",
    paras: [
      "You can report posts, users and community content. Communities also have their own moderators and rules on top of these Terms.",
      "We may remove content, limit features, or suspend or end accounts that break these Terms or put others at risk.",
    ],
  },
  {
    title: "Emails",
    paras: [
      "We email you for things like verification codes, password resets and important account notices. We may also send optional messages such as birthday greetings.",
      "Emails can land in your spam folder, so check there if you are waiting for a code. You can ask us to stop optional emails.",
    ],
  },
  {
    title: "Changes and availability",
    paras: [
      "Vreedits is provided as it is. It may have bugs, downtime or changes, and we may add, change or remove features.",
      "We may update these Terms. If a change is important, we'll tell you in the app or by email. Using Vreedits after an update means you accept it.",
    ],
  },
  {
    title: "Ending your account",
    paras: [
      "You can stop using Vreedits at any time and ask us to delete your account.",
      "We may suspend or end accounts that break these Terms.",
    ],
  },
  {
    title: "Limits of responsibility",
    paras: [
      "To the extent the law allows, Vreedits isn't responsible for losses that come from using the app, from other users' content or behavior, or from AI answers. Nothing here limits rights you have under the law that can't be waived.",
    ],
  },
];

export default function TermsPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "24px 18px 60px",
        color: "var(--text)",
        lineHeight: 1.65,
      }}
    >
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Terms of Service</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
        Last updated: {UPDATED}
      </p>

      {SECTIONS.map((s) => (
        <section key={s.title} style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{s.title}</h2>
          {(s.paras || []).map((p, i) => (
            <p key={i} style={{ margin: "0 0 10px", fontSize: 14 }}>{p}</p>
          ))}
          {s.items && (
            <ul style={{ margin: "0 0 10px", paddingLeft: 20, listStyle: "disc", fontSize: 14 }}>
              {s.items.map((item, i) => (
                <li key={i} style={{ marginBottom: 6 }}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Contact</h2>
        <p style={{ margin: 0, fontSize: 14 }}>
          Questions about these Terms? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent)" }}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </section>
    </main>
  );
}