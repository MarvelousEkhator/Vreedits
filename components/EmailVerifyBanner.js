// components/EmailVerifyBanner.js
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

const DISMISS_KEY = "email_banner_dismissed";

export default function EmailVerifyBanner() {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {}
    let cancelled = false;
    fetch("/api/auth/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setStatus(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  if (!status || !status.signedIn || status.isGuest || status.emailVerified) return null;

  function hideForNow() {
    setDismissed(true);
    setOpen(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  async function handleVerify(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setMsg("");
    if (code.length < 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: status.email, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Verification failed.");
        setBusy(false);
        return;
      }
      setStatus((s) => ({ ...s, emailVerified: true }));
      setOpen(false);
      setBusy(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || busy) return;
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: status.email, purpose: "verify" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not resend the code.");
        setBusy(false);
        return;
      }
      if (data.alreadyVerified) {
        setStatus((s) => ({ ...s, emailVerified: true }));
        setBusy(false);
        return;
      }
      setCode("");
      setCooldown(60);
      setMsg(`We emailed a new code to ${status.emailMasked}. Check your spam folder too.`);
    } catch {
      setError("Network error. Please try again.");
    }
    setBusy(false);
  }

  return (
    <>
      {!dismissed && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
            padding: "8px 14px", background: "var(--accent-soft)", color: "var(--text)",
            borderBottom: "1px solid var(--border)", fontSize: 13,
          }}
        >
          <Mail size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>Verify your email to keep your account safe.</span>
          <button
            onClick={() => setOpen(true)}
            className="font-semibold"
            style={{ background: "none", border: "none", color: "var(--accent)", padding: 0, flexShrink: 0 }}
          >
            Verify
          </button>
          <button
            onClick={hideForNow}
            aria-label="Later"
            style={{ background: "none", border: "none", color: "var(--text-muted)", display: "flex", flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 8800, background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <form
            onSubmit={handleVerify}
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: "100%", maxWidth: 380, padding: 22 }}
          >
            <h3 className="text-base font-semibold mb-1">Verify your email</h3>
            <p className="text-sm mb-1" style={{ color: "var(--text-muted)" }}>
              We sent a 6-digit code to {status.emailMasked}.
            </p>
            <p className="text-sm font-semibold mb-4">
              Check your inbox and your spam or junk folder. It can take a few minutes.
            </p>

            {error && (
              <div className="alert alert-error mb-3">
                <AlertCircle size={15} /> {error}
              </div>
            )}
            {msg && (
              <div className="alert alert-success mb-3">
                <CheckCircle2 size={15} /> {msg}
              </div>
            )}

            <input
              className="input pl-3 mb-3"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              style={{ textAlign: "center", letterSpacing: 6, fontWeight: 600 }}
            />
            <button className="btn-primary mb-3" type="submit" disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : "Verify"}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || busy}
                className="font-semibold"
                style={{ background: "none", border: "none", color: "var(--accent)", padding: 0, opacity: cooldown > 0 ? 0.6 : 1 }}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", padding: 0 }}
              >
                Later
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}