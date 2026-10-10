// components/GuestGate.js
"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, X, Loader2, AlertCircle, Sparkles } from "lucide-react";
import BirthdayPicker from "@/components/BirthdayPicker";

const PROMPT_AFTER_MS = 3 * 60 * 1000; // total guest use before the first prompt
const SNOOZE_MS = 30 * 60 * 1000; // quiet time after the prompt is dismissed
const TICK_MS = 15 * 1000;
const USERNAME_PATTERN = /^[a-z0-9_.]+$/;

const GENERIC_GATE_TEXT =
  "Create a free account to do this. Everything you've done as a guest comes with you.";

// Shown in the popup when a component says which action the guest tried.
// To open the popup from any component:
//   window.dispatchEvent(new CustomEvent("vreedits:guest-blocked", { detail: { action: "share" } }));
const ACTION_TEXT = {
  like: "Sign up free to like posts. Everything you've done as a guest comes with you.",
  comment: "Sign up free to comment. Everything you've done as a guest comes with you.",
  share: "Sign up free to share posts. Everything you've done as a guest comes with you.",
  save: "Sign up free to save posts to your favourites. Everything you've done as a guest comes with you.",
  follow: "Sign up free to follow people. Everything you've done as a guest comes with you.",
  post: "Sign up free to post. Everything you've done as a guest comes with you.",
  report: "Sign up free to report content. Everything you've done as a guest comes with you.",
};

// Guests can use the AI tools page, the Syna chat, and look around the feed.
function isAllowedForGuest(path) {
  return (
    path === "/ai-tools" ||
    path.startsWith("/ai-tools/chat") ||
    path === "/feed" ||
    path.startsWith("/feed/")
  );
}

function readNum(key) {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

function writeNum(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

function SignupForm({ onClose }) {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    username: "",
    displayName: "",
    dateOfBirth: "",
    termsAccepted: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate() {
    if (!form.email.trim()) return "Email is required.";
    const uname = form.username.trim().toLowerCase();
    if (uname.length < 3) return "Username must be at least 3 characters.";
    if (!USERNAME_PATTERN.test(uname)) {
      return "Username can only use small letters, numbers, underscores and periods (no spaces).";
    }
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    if (!form.dateOfBirth) return "Date of birth is required.";
    if (!form.termsAccepted) return "You must accept the Terms and Privacy Policy.";
    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          username: form.username,
          displayName: form.displayName,
          password: form.password,
          dateOfBirth: form.dateOfBirth,
          termsAccepted: form.termsAccepted,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }
      try {
        localStorage.removeItem("guest_used_ms");
        localStorage.removeItem("guest_snooze_until");
      } catch {}
      if (data.verified) {
        // Email verification is off: the account is ready, so reload as a full member.
        window.location.reload();
        return;
      }
      router.push(`/verify?email=${encodeURIComponent(data.email)}`);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000, overflowY: "auto",
        background: "var(--surface)", color: "var(--text)",
      }}
    >
      <div
        className="flex items-center justify-between px-4"
        style={{
          height: 56, borderBottom: "1px solid var(--border)",
          position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
        }}
      >
        <h2 className="text-sm font-semibold">Create your account</h2>
        <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "var(--text-muted)" }}>
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4" style={{ maxWidth: 420, margin: "0 auto", paddingBottom: 40 }}>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Everything you've done as a guest, like your Syna chats, stays with your new account.
        </p>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>Email</label>
          <input
            className="input pl-3"
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>Username</label>
          <input
            className="input pl-3"
            value={form.username}
            onChange={(e) => setField("username", e.target.value)}
            placeholder="small letters, numbers, _ and ."
            autoComplete="username"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
            Display name (optional)
          </label>
          <input
            className="input pl-3"
            value={form.displayName}
            onChange={(e) => setField("displayName", e.target.value)}
            placeholder="How your name appears"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>Password</label>
          <input
            className="input pl-3"
            type="password"
            value={form.password}
            onChange={(e) => setField("password", e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>Date of birth</label>
          <BirthdayPicker value={form.dateOfBirth} onChange={(v) => setField("dateOfBirth", v)} />
          <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
            You must be at least 13 years old to use Vreedits.
          </p>
        </div>

        <label className="flex items-start gap-2.5" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.termsAccepted}
            onChange={(e) => setField("termsAccepted", e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span className="text-sm">
            I agree to the{" "}
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className="btn-text">Terms of Service</Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="btn-text">Privacy Policy</Link>.
          </span>
        </label>

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : "Create account"}
        </button>
      </form>
    </div>
  );
}

export default function GuestGate({ user, children }) {
  const pathname = usePathname();
  const isGuest = !!user?.isGuest;
  const [formOpen, setFormOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [gateText, setGateText] = useState(null); // set while the "sign up to do this" popup is open

  // Counts guest time (across visits) and shows the prompt after a while.
  useEffect(() => {
    if (!isGuest) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const used = readNum("guest_used_ms") + TICK_MS;
      writeNum("guest_used_ms", used);
      if (used >= PROMPT_AFTER_MS && Date.now() > readNum("guest_snooze_until")) {
        setPromptOpen(true);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [isGuest]);

  // The profile menu in NavShell opens the form through this event.
  useEffect(() => {
    if (!isGuest) return;
    function open() {
      setPromptOpen(false);
      setGateText(null);
      setFormOpen(true);
    }
    window.addEventListener("vreedits:open-signup", open);
    return () => window.removeEventListener("vreedits:open-signup", open);
  }, [isGuest]);

  // Opens the "sign up to do this" popup. Any component can trigger it:
  //   window.dispatchEvent(new CustomEvent("vreedits:guest-blocked", { detail: { action: "like" } }));
  useEffect(() => {
    if (!isGuest) return;
    function onBlocked(e) {
      setPromptOpen(false);
      setGateText(ACTION_TEXT[e?.detail?.action] || GENERIC_GATE_TEXT);
    }
    window.addEventListener("vreedits:guest-blocked", onBlocked);
    return () => window.removeEventListener("vreedits:guest-blocked", onBlocked);
  }, [isGuest]);

  // Watches server replies: when a route answers "guestBlocked" (the reply from
  // guestBlockedResponse), the popup opens by itself. No changes are needed in
  // the components that made the request.
  useEffect(() => {
    if (!isGuest) return;
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      try {
        if (res.status === 403) {
          const type = res.headers.get("content-type") || "";
          if (type.includes("application/json")) {
            const data = await res.clone().json();
            if (data && data.guestBlocked) {
              window.dispatchEvent(new CustomEvent("vreedits:guest-blocked", { detail: {} }));
            }
          }
        }
      } catch {}
      return res;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [isGuest]);

  if (!isGuest) return children;

  const blocked = !isAllowedForGuest(pathname);

  function dismissPrompt() {
    setPromptOpen(false);
    writeNum("guest_snooze_until", Date.now() + SNOOZE_MS);
  }

  function startSignup() {
    setGateText(null);
    setPromptOpen(false);
    setFormOpen(true);
  }

  return (
    <>
      {blocked ? (
        <div
          className="flex flex-col items-center justify-center text-center px-6"
          style={{ minHeight: "100%", padding: "48px 24px" }}
        >
          <div
            style={{
              width: 64, height: 64, borderRadius: "50%", background: "var(--accent-soft)",
              display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
            }}
          >
            <Lock size={28} style={{ color: "var(--accent)" }} />
          </div>
          <h2 className="text-lg font-semibold mb-2">Create a free account</h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)", maxWidth: 320 }}>
            As a guest you can chat with Syna AI and browse the feed. Create an account to use the
            rest of Vreedits, and everything you've done so far will be kept.
          </p>
          <div className="flex flex-col gap-2" style={{ width: "100%", maxWidth: 260 }}>
            <button className="btn-primary" onClick={startSignup}>Create account</button>
            <Link
              href="/ai-tools/chat"
              className="btn-primary"
              style={{ background: "var(--surface-2)", color: "var(--text)", textAlign: "center" }}
            >
              Go to Syna AI
            </Link>
          </div>
        </div>
      ) : (
        children
      )}

      {/* Timed prompt */}
      {!blocked && promptOpen && !formOpen && !gateText && (
        <div
          className="card"
          style={{
            position: "fixed", left: 12, right: 12, bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)",
            zIndex: 8000, maxWidth: 420, margin: "0 auto", padding: 14,
            display: "flex", alignItems: "center", gap: 12,
          }}
        >
          <Sparkles size={20} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="text-sm font-semibold">Get the full Vreedits experience</div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              Sign up free to post, join communities, and message friends. Everything you've done as
              a guest comes with you.
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={startSignup}
            style={{ width: "auto", padding: "8px 14px", flexShrink: 0 }}
          >
            Sign up
          </button>
          <button
            onClick={dismissPrompt}
            aria-label="Not now"
            style={{ background: "none", border: "none", color: "var(--text-muted)", flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* "Sign up to do this" popup (like, comment, share, save, follow...) */}
      {gateText && !formOpen && (
        <div
          onClick={() => setGateText(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 8500, background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 360, padding: 22, textAlign: "center" }}
          >
            <div
              style={{
                width: 52, height: 52, borderRadius: "50%", background: "var(--accent-soft)",
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
              }}
            >
              <Sparkles size={24} style={{ color: "var(--accent)" }} />
            </div>
            <h3 className="text-base font-semibold mb-2">Join Vreedits to do this</h3>
            <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>{gateText}</p>
            <button className="btn-primary mb-2" onClick={startSignup}>Create free account</button>
            <button
              onClick={() => setGateText(null)}
              className="btn-text text-sm"
              style={{ background: "none", border: "none" }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {formOpen && <SignupForm onClose={() => setFormOpen(false)} />}
    </>
  );
}