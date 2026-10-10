// app/privacy/page.js
export const metadata = { title: "Privacy Policy - Vreedits" };

// CHANGE THIS to the email address you want people to write to.
const CONTACT_EMAIL = "support@example.com";
const UPDATED = "October 10, 2026";

const SECTIONS = [
  {
    title: "The short version",
    paras: [
      "Vreedits collects the information needed to run your account and the app, keeps it with the services we use to host it, and doesn't sell your personal information. This page explains what we collect, why, and the choices you have.",
    ],
  },
  {
    title: "What we collect",
    items: [
      "Account details: your email, username, display name, and a password (stored in a scrambled form, never as plain text).",
      "Date of birth: used to check the minimum age, apply stricter protections for younger users, and send birthday greetings.",
      "Profile details you add: photo, bio, country, school and language.",
      "Your content: posts, comments, messages, notes, flashcards, study room and community chat, and your conversations with Syna.",
      "Social activity: follows, friends, blocks, reports and likes.",
      "Safety and parental controls: your settings, a guardian PIN (stored in a scrambled form), a parent email if one is added, and screen-time use.",
      "Usage information: pages visited, sessions, your general country, and how you arrived, collected by our own analytics.",
      "Cookies: a sign-in cookie that keeps you logged in for up to 30 days, and a short-lived cookie that stops a device from retrying signup after failing the age check.",
    ],
  },
  {
    title: "How we use it",
    items: [
      "To run your account, sign you in and show you the app.",
      "To send verification codes, password resets and account notices.",
      "To keep people safe: enforcing age rules, moderating content and handling reports.",
      "To power parental controls and screen-time limits.",
      "To send optional messages such as birthday greetings.",
      "To understand how the app is used and improve it.",
      "To generate Syna's replies.",
    ],
  },
  {
    title: "Who can see it",
    paras: [
      "Other people see what you share according to your settings, for example a private account, who can message you, and who can comment. Communities have their own members and moderators, who can see what is posted there.",
    ],
  },
  {
    title: "Who we share it with",
    paras: [
      "We don't sell your personal information. We use service providers to run Vreedits, and they process data for us:",
    ],
    items: [
      "Render, which hosts the app.",
      "Neon, which stores our database.",
      "Brevo, which delivers our emails.",
      "An AI provider, which processes what you send to Syna to produce replies (at the time of writing, Google's Gemini models).",
    ],
    after: [
      "We may also share information if the law requires it or to protect someone's safety.",
    ],
  },
  {
    title: "Young people",
    items: [
      "You must be 13 or older. If we learn that an account belongs to someone under 13, we will delete it.",
      "Accounts for people under 16 start private, with friends-only messages, comments and mentions, downloads off, and no appearance in suggestions.",
      "Parents and guardians can lock safety settings with a PIN and set screen-time limits.",
    ],
  },
  {
    title: "Your choices",
    items: [
      "Change your profile and privacy settings in the app.",
      "Ask us to delete your account and data.",
      "Ask us to stop optional emails.",
      "Contact us if you want a copy of your information or think something is wrong.",
    ],
  },
  {
    title: "How long we keep it",
    paras: [
      "We keep your information while your account exists. When you ask us to delete your account, we delete or anonymize your data, except for what we have to keep for safety or legal reasons.",
    ],
  },
  {
    title: "Security",
    paras: [
      "We protect passwords and PINs by storing them in a scrambled form, and the app uses HTTPS. No service is perfectly secure, so use a strong password and keep it private.",
    ],
  },
  {
    title: "Changes to this policy",
    paras: [
      "We may update this policy. If a change is important, we'll tell you in the app or by email. The date at the top shows when it was last updated.",
    ],
  },
];

export default function PrivacyPage() {
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
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Privacy Policy</h1>
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
          {(s.after || []).map((p, i) => (
            <p key={`a${i}`} style={{ margin: "0 0 10px", fontSize: 14 }}>{p}</p>
          ))}
        </section>
      ))}

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Contact</h2>
        <p style={{ margin: 0, fontSize: 14 }}>
          Questions about your privacy? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent)" }}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </section>
    </main>
  );
}