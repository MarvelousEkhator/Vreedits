// app/settings/feedback/page.js
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import StarRating from "@/components/StarRating";

export default function FeedbackSettingsPage() {
  const [status, setStatus] = useState("loading"); // loading | guest | out | ready
  const [name, setName] = useState("");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/feedback", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.guest) setStatus("guest");
        else if (!d.signedIn) setStatus("out");
        else {
          setName(d.name || "");
          setStatus("ready");
        }
      })
      .catch(() => alive && setStatus("ready"));
    return () => {
      alive = false;
    };
  }, []);

  async function submit() {
    if (!rating || sending) return;
    setSending(true);
    setError("");
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, message, source: "settings" }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Something went wrong. Please try again.");
      }
      setSent(true);
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  function again() {
    setRating(0);
    setMessage("");
    setSent(false);
  }

  return (
    <div className="fb">
      <style>{CSS}</style>
      <Link href="/settings" className="fb-back">
        ← Settings
      </Link>
      <h1>Feedback</h1>

      {status === "loading" && <p className="fb-mute">Loading…</p>}

      {status === "guest" && (
        <p className="fb-mute">Feedback is for members. Create an account to share yours.</p>
      )}

      {status === "out" && <p className="fb-mute">Please log in to send feedback.</p>}

      {status === "ready" && !sent && (
        <>
          <p className="fb-mute">
            {name ? `How is Vreedits working for you, ${name}?` : "How is Vreedits working for you?"} Your
            feedback goes straight to the team.
          </p>
          <StarRating value={rating} onChange={setRating} size={40} label="How would you rate Vreedits?" />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
            placeholder="What do you like? What should we fix or add? (optional)"
            aria-label="Your feedback"
          />
          <div className="fb-count">{message.length}/1000</div>
          <button className="fb-send" onClick={submit} disabled={!rating || sending}>
            {sending ? "Sending…" : "Send feedback"}
          </button>
          {!rating && <p className="fb-mute fb-small">Pick a star rating to send.</p>}
          {error && <p className="fb-err">{error}</p>}
        </>
      )}

      {status === "ready" && sent && (
        <>
          <p>Thank you{name ? `, ${name}` : ""}. We read every message.</p>
          <button className="fb-btn" onClick={again}>
            Send another
          </button>
        </>
      )}
    </div>
  );
}

const CSS = `
.fb{max-width:520px;margin:0 auto;padding:20px 16px 56px;color:inherit;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.fb h1{font-size:22px;margin:10px 0 6px}
.fb-back{color:inherit;opacity:.7;text-decoration:none;font-size:14px}
.fb-mute{opacity:.75;margin:0 0 16px}
.fb-small{font-size:13px;margin:10px 0 0;text-align:center}
.fb textarea{width:100%;box-sizing:border-box;margin-top:16px;min-height:120px;resize:vertical;padding:12px;border-radius:10px;
  border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;font:inherit}
.fb-count{text-align:right;font-size:12px;opacity:.6;margin-top:4px}
.fb-send{width:100%;margin-top:10px;padding:12px;border:none;border-radius:10px;background:#0e5a6b;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.fb-send:disabled{opacity:.5;cursor:default}
.fb-btn{padding:10px 16px;border-radius:10px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;font:inherit;cursor:pointer}
.fb-err{color:#c0392b;font-size:14px;margin:10px 0 0}
`;