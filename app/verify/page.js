"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, Loader2, AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") || "";
  const emailFailed = params.get("emailFailed") === "1";

  const [code, setCode] = useState("");
  const [error, setError] = useState(
    emailFailed ? "We couldn't send the email just now. Tap Resend code to try again." : ""
  );
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  // Wait before allowing another email (a code was just sent unless sending failed).
  const [cooldown, setCooldown] = useState(emailFailed ? 0 : 30);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!email) {
      setError("Missing email. Go back and sign up again.");
      return;
    }
    if (code.length < 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Verification failed.");
        setLoading(false);
        return;
      }
      // The verify route signs the user in, so go straight into the app.
      router.push("/feed");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/auth/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "verify" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || "Could not resend code.");
      setCode("");
      setCooldown(60);
      setSuccess("A new code was emailed to you. Check your spam folder too.");
    } catch {
      setError("Network error. Please try again.");
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4">
      <div className="w-full max-w-[420px] card p-7 mt-16">
        <h1 className="text-xl font-semibold mb-1" style={{ fontFamily: "var(--font-display)" }}>
          Verify your email
        </h1>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          {email ? `Enter the code we emailed to ${email}.` : "Enter the code we emailed to you."}
        </p>

        <div
          className="flex items-center gap-2 rounded-xl px-3.5 py-3 mb-4 text-sm"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <ShieldCheck size={17} />
          Check your inbox and your spam or junk folder for a 6-digit code. It can take a few minutes.
        </div>

        {error && <div className="alert alert-error mb-4"><AlertCircle size={15} />{error}</div>}
        {success && <div className="alert alert-success mb-4"><CheckCircle2 size={15} />{success}</div>}

        <form onSubmit={handleVerify} className="space-y-4">
          <input
            className="input pl-3 tracking-[0.2em] font-semibold"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
          />
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading && <Loader2 size={15} className="animate-spin" />}
            Verify
          </button>
        </form>

        <div className="text-center mt-4">
          <button
            className="btn-text inline-flex items-center gap-1.5"
            onClick={handleResend}
            type="button"
            disabled={cooldown > 0}
          >
            <RotateCcw size={13} />
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}