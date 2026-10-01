"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Heart, Loader2, Send } from "lucide-react";

// The popup appears once a guest has spent this long actively using the app.
const SHOW_AFTER_SECONDS = 180;
// "Not now" snoozes it for a day, and it stops asking after two snoozes.
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const MAX_DISMISSALS = 2;
const STORAGE_KEY = "vreedits_feedback_v1";

// Pages where a popup would get in the way.
const QUIET_PATHS = ["/login", "/signup", "/register", "/verify", "/forgot", "/reset", "/terms", "/privacy", "/admin"];

const CATEGORIES = [
  "Feed & videos",
  "Camera",
  "Sounds",
  "Inbox",
  "Communities",
  "AI Tools",
  "Speed & bugs",
  "Design",
  "Other",
];

function readState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      seconds: Number(raw.seconds) || 0,
      dismissals: Number(raw.dismissals) || 0,
      snoozedUntil: Number(raw.snoozedUntil) || 0,
    };
  } catch {
    return { seconds: 0, dismissals: 0, snoozedUntil: 0 };
  }
}

function writeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

// Mount this once, somewhere that shows on every page (NavShell).
// It only does anything for guests, and a thank-you card for anyone you've
// thanked from the admin page.
export default function FeedbackPrompt() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const [stage, setStage] = useState(null); // null | "ask" | "done" | "thanks"
  const stageRef = useRef(null);
  const [eligible, setEligible] = useState(false);
  const [thanks, setThanks] = useState(null);
  const [picked, setPicked] = useState([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  // Ask the server who this is: a guest who should be asked, and/or someone
  // with a thank-you waiting.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/feedback")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setEligible(!!d.eligible);
        if (d.thanks) setThanks(d.thanks);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Thank-you card shows a couple of seconds after the app opens.
  useEffect(() => {
    if (!thanks) return;
    const t = setTimeout(() => {
      if (!stageRef.current) setStage("thanks");
    }, 2000);
    return () => clearTimeout(t);
  }, [thanks]);

  // Counts the time spent actively using the app, then asks.
  useEffect(() => {
    if (!eligible) return;
    const state = readState();
    if (state.dismissals >= MAX_DISMISSALS) return;

    let ticks = 0;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      state.seconds += 1;
      ticks += 1;
      if (ticks % 10 === 0) writeState(state);

      if (state.seconds < SHOW_AFTER_SECONDS) return;
      if (stageRef.current) return;
      if (Date.now() < state.snoozedUntil) return;
      if (QUIET_PATHS.some((p) => pathRef.current?.startsWith(p))) return;
      // Never interrupt someone who is recording or taking a photo.
      if (document.querySelector('[aria-label="Take photo"],[aria-label="Start recording"],[aria-label="Stop recording"]')) return;

      writeState(state);
      setStage("ask");
    }, 1000);

    return () => {
      clearInterval(timer);
      writeState(state);
    };
  }, [eligible]);

  function toggle(c) {
    setPicked((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function notNow() {
    const state = readState();
    state.dismissals += 1;
    state.snoozedUntil = Date.now() + SNOOZE_MS;
    state.seconds = 0;
    writeState(state);
    setStage(null);
  }

  async function send() {
    if (sending) return;
    if (message.trim().length < 3) {
      setError("Tell us a little more.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, categories: picked, page: pathname }),
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) {
        setError(data.error || "Couldn't send. Try again.");
        setSending(false);
        return;
      }
      // Done for good: never ask this device again.
      writeState({ seconds: 0, dismissals: MAX_DISMISSALS, snoozedUntil: Date.now() + 365 * SNOOZE_MS });
      setEligible(false);
      setSending(false);
      setStage("done");
      setTimeout(() => setStage((s) => (s === "done" ? null : s)), 3000);
    } catch {
      setError("Couldn't send. Check your connection and try again.");
      setSending(false);
    }
  }

  async function closeThanks() {
    const id = thanks?.id;
    setStage(null);
    setThanks(null);
    if (id) {
      fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seenThanks", id }),
      }).catch(() => {});
    }
  }

  if (!stage) return null;

  return (
    <>
      <div
        onClick={stage === "ask" ? notNow : stage === "thanks" ? closeThanks : () => setStage(null)}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 900 }}
      />
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 901,
          background: "var(--surface)", color: "var(--text)",
          borderRadius: "20px 20px 0 0", padding: "12px 16px",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
          maxHeight: "88vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)" }} />
        </div>

        {stage === "ask" && (
          <>
            <h2 className="text-base font-bold mb-1">What should we improve?</h2>
            <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
              The Vreedits team reads every message. Tell us what you'd like better.
            </p>

            <div className="flex flex-wrap gap-2 mb-3">
              {CATEGORIES.map((c) => {
                const on = picked.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggle(c)}
                    style={{
                      borderRadius: 16, padding: "6px 12px", fontSize: 13, fontWeight: 600,
                      border: on ? "2px solid var(--accent)" : "1px solid var(--border)",
                      background: on ? "var(--accent-soft)" : "var(--surface-2)",
                      color: on ? "var(--accent)" : "var(--text)",
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>

            <textarea
              className="input pl-3"
              style={{ minHeight: 100, resize: "none", paddingTop: 10 }}
              placeholder="What do you want the Vreedits team to improve?"
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="text-xs mt-1 mb-3" style={{ color: "var(--text-muted)", textAlign: "right" }}>
              {message.length}/1000
            </div>

            {error && <div className="alert alert-error mb-3">{error}</div>}

            <div className="flex gap-3">
              <button
                onClick={notNow}
                className="btn-primary"
                style={{ flex: 1, background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
              >
                Not now
              </button>
              <button onClick={send} disabled={sending} className="btn-primary" style={{ flex: 1 }}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : (<><Send size={15} /> Send</>)}
              </button>
            </div>
          </>
        )}

        {stage === "done" && (
          <div className="text-center py-6">
            <Heart size={34} color="var(--accent)" fill="var(--accent)" style={{ margin: "0 auto 10px" }} />
            <h2 className="text-base font-bold mb-1">Thank you!</h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Your feedback went straight to the Vreedits team.
            </p>
          </div>
        )}

        {stage === "thanks" && thanks && (
          <div className="text-center py-3">
            <Heart size={34} color="var(--accent)" fill="var(--accent)" style={{ margin: "0 auto 10px" }} />
            <h2 className="text-base font-bold mb-2">A message from the Vreedits team</h2>
            <p className="text-sm mb-4" style={{ overflowWrap: "anywhere" }}>{thanks.message}</p>
            <button onClick={closeThanks} className="btn-primary" style={{ maxWidth: 160, margin: "0 auto" }}>
              Close
            </button>
          </div>
        )}
      </div>
    </>
  );
}