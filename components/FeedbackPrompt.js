// components/FeedbackPrompt.js
"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import StarRating from "./StarRating";

const NEED_SECONDS = 180; // about 3 minutes of real use
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // "×" hides it for a week

export default function FeedbackPrompt() {
  const pathname = usePathname();
  const [me, setMe] = useState(null); // { username, name } when eligible
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | thanks
  const [error, setError] = useState("");
  const secsRef = useRef(0);

  // Who is this, and should they be asked at all? (guests never are)
  useEffect(() => {
    let alive = true;
    fetch("/api/feedback", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.eligible) setMe({ username: d.username, name: d.name });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Count time spent in the app (only while the tab is visible).
  useEffect(() => {
    if (!me || open) return;
    const secKey = `vre_fb_secs_${me.username}`;
    const snoozeKey = `vre_fb_snooze_${me.username}`;

    let snoozedUntil = 0;
    let secs = 0;
    try {
      snoozedUntil = Number(localStorage.getItem(snoozeKey) || 0);
      secs = Number(localStorage.getItem(secKey) || 0);
    } catch {}
    if (Date.now() < snoozedUntil) return;

    secsRef.current = secs;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      secsRef.current += 1;
      if (secsRef.current % 5 === 0) {
        try {
          localStorage.setItem(secKey, String(secsRef.current));
        } catch {}
      }
      if (secsRef.current >= NEED_SECONDS) {
        clearInterval(timer);
        setOpen(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [me, open]);

  function dismiss() {
    if (me) {
      try {
        localStorage.setItem(`vre_fb_snooze_${me.username}`, String(Date.now() + SNOOZE_MS));
        localStorage.removeItem(`vre_fb_secs_${me.username}`);
      } catch {}
    }
    setOpen(false);
  }

  async function send() {
    if (!rating || state === "sending") return;
    setState("sending");
    setError("");
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, message, source: "popup" }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Something went wrong. Please try again.");
      }
      setState("thanks");
      setTimeout(() => {
        setOpen(false);
        setMe(null);
      }, 2200);
    } catch (e) {
      setError(e.message || "Something went wrong.");
      setState("idle");
    }
  }

  if (!me || !open) return null;
  if (pathname && pathname.startsWith("/settings/feedback")) return null;

  return (
    <div className="fbp" role="dialog" aria-live="polite" aria-label="Feedback">
      <style>{CSS}</style>
      {state === "thanks" ? (
        <h3>Thanks, {me.name}. That really helps.</h3>
      ) : (
        <>
          <button className="fbp-x" onClick={dismiss} aria-label="Close">
            ×
          </button>
          <h3>How are you enjoying Vreedits so far, {me.name}?</h3>
          <p>We'd love your feedback.</p>
          <StarRating value={rating} onChange={setRating} label="How would you rate Vreedits?" />
          {rating > 0 && (
            <>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                placeholder="Anything you'd like to tell us? (optional)"
                aria-label="Your feedback"
              />
              <button className="fbp-send" onClick={send} disabled={state === "sending"}>
                {state === "sending" ? "Sending…" : "Send feedback"}
              </button>
            </>
          )}
          {error && <div className="fbp-err">{error}</div>}
        </>
      )}
    </div>
  );
}

const CSS = `
.fbp{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 80px);transform:translateX(-50%);
  width:min(92vw,380px);z-index:9999;background:#fff;color:#13202a;border:1px solid #d8e0e6;border-radius:16px;
  box-shadow:0 10px 30px rgba(0,0,0,.18);padding:18px 18px 16px;
  font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){.fbp{background:#17222b;color:#e6edf2;border-color:#25343f}}
.fbp h3{margin:0 24px 4px 0;font-size:16px}
.fbp p{margin:0 0 12px;font-size:13.5px;opacity:.75}
.fbp-x{position:absolute;top:8px;right:10px;background:none;border:none;color:inherit;opacity:.6;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px}
.fbp textarea{width:100%;box-sizing:border-box;margin-top:12px;min-height:70px;resize:vertical;padding:10px;border-radius:10px;
  border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;font:inherit}
.fbp-send{width:100%;margin-top:10px;padding:10px;border:none;border-radius:10px;background:#0e5a6b;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.fbp-send:disabled{opacity:.6;cursor:default}
.fbp-err{color:#c0392b;font-size:13px;margin:8px 0 0}
`;