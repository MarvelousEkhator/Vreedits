"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, User, Eye, EyeOff, Loader2, AlertCircle, ChevronLeft, Calendar } from "lucide-react";
import { PasswordRequirement, UsernameStatus } from "@/components/AuthWidgets";

const STEPS = ["account", "identity", "birthday", "terms"];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirm: "",
    displayName: "",
    username: "",
    dateOfBirth: "",
    termsAccepted: false,
  });
  const [showPw, setShowPw] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState("idle");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const uname = form.username.trim();
    if (uname.length < 3) {
      setUsernameStatus("idle");
      return;
    }
    setUsernameStatus("checking");
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/username-check?username=${encodeURIComponent(uname)}`);
        const data = await res.json();
        setUsernameStatus(data.status);
      } catch {
        setUsernameStatus("idle");
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [form.username]);

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function isOldEnoughClientSide(dobString) {
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return false;
    const thirteenYearsAgo = new Date();
    thirteenYearsAgo.setFullYear(thirteenYearsAgo.getFullYear() - 13);
    return dob <= thirteenYearsAgo;
  }

  function validateStep() {
    setError("");
    const current = STEPS[step];

    if (current === "account") {
      if (!form.email.trim()) return "Email is required.";
      if (form.password.length < 8) return "Password must be at least 8 characters.";
      if (form.password !== form.confirm) return "Passwords do not match.";
    }

    if (current === "identity") {
      if (form.username.trim().length < 3) return "Username must be at least 3 characters.";
      if (usernameStatus === "taken") return "That username is already taken.";
      if (usernameStatus === "checking") return "Still checking username availability…";
    }

    if (current === "birthday") {
      if (!form.dateOfBirth) return "Date of birth is required.";
      if (!isOldEnoughClientSide(form.dateOfBirth)) return "You must be at least 13 years old to sign up.";
    }

    if (current === "terms") {
      if (!form.termsAccepted) return "You must accept the Terms and Privacy Policy.";
    }

    return "";
  }

  function handleNext(e) {
    e.preventDefault();
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setStep((s) => s + 1);
  }

  function handleBack() {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          displayName: form.displayName,
          email: form.email,
          password: form.password,
          dateOfBirth: form.dateOfBirth,
          termsAccepted: form.termsAccepted,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }
      router.push(`/verify?email=${encodeURIComponent(data.email)}`);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  const current = STEPS[step];
  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="min-h-screen flex flex-col items-center px-4">
      <div className="w-full max-w-[420px] card p-7 mt-16">
        <div className="flex items-center gap-2 mb-1">
          {step > 0 && (
            <button onClick={handleBack} aria-label="Back" style={{ background: "none", border: "none", color: "var(--text-muted)" }}>
              <ChevronLeft size={18} />
            </button>
          )}
          <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Create your account
          </h1>
        </div>
        <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
          Step {step + 1} of {STEPS.length}
        </p>

        <div className="flex gap-1.5 mb-6">
          {STEPS.map((s, i) => (
            <div
              key={s}
              style={{
                height: 3, flex: 1, borderRadius: 2,
                background: i <= step ? "var(--accent)" : "var(--surface-2)",
              }}
            />
          ))}
        </div>

        {error && (
          <div className="alert alert-error mb-4">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        <form onSubmit={isLastStep ? handleSubmit : handleNext} className="space-y-4">
          {current === "account" && (
            <>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Email
                </label>
                <div className="relative flex items-center">
                  <Mail size={15} className="absolute left-3" style={{ color: "var(--text-muted)" }} />
                  <input
                    className="input"
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Password
                </label>
                <div className="relative flex items-center">
                  <Lock size={15} className="absolute left-3" style={{ color: "var(--text-muted)" }} />
                  <input
                    className="input pr-9"
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    placeholder="Create a password"
                    autoComplete="new-password"
                  />
                  <button type="button" className="absolute right-2" onClick={() => setShowPw((v) => !v)} aria-label="Toggle password visibility">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <div className="mt-1.5">
                  <PasswordRequirement met={form.password.length >= 8} label="At least 8 characters" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Confirm Password
                </label>
                <div className="relative flex items-center">
                  <Lock size={15} className="absolute left-3" style={{ color: "var(--text-muted)" }} />
                  <input
                    className="input"
                    type={showPw ? "text" : "password"}
                    value={form.confirm}
                    onChange={(e) => updateField("confirm", e.target.value)}
                    placeholder="Repeat password"
                    autoComplete="new-password"
                  />
                </div>
                {form.confirm.length > 0 && (
                  <div className="mt-1.5">
                    <PasswordRequirement met={form.confirm === form.password} label="Passwords match" />
                  </div>
                )}
              </div>
            </>
          )}

          {current === "identity" && (
            <>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Display Name
                </label>
                <div className="relative flex items-center">
                  <User size={15} className="absolute left-3" style={{ color: "var(--text-muted)" }} />
                  <input
                    className="input"
                    value={form.displayName}
                    onChange={(e) => updateField("displayName", e.target.value)}
                    placeholder="How others will see you"
                    autoFocus
                  />
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Optional — defaults to your username if left blank.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Username
                </label>
                <div className="relative flex items-center">
                  <User size={15} className="absolute left-3" style={{ color: "var(--text-muted)" }} />
                  <input
                    className="input"
                    value={form.username}
                    onChange={(e) => updateField("username", e.target.value)}
                    placeholder="yourname"
                    autoComplete="username"
                  />
                </div>
                {form.username.trim().length > 0 && (
                  <div className="mt-1.5">
                    <UsernameStatus status={usernameStatus} />
                  </div>
                )}
              </div>
            </>
          )}

          {current === "birthday" && (
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                Date of Birth
              </label>
              <div className="relative flex items-center">
                <Calendar size={15} className="absolute left-3" style={{ color: "var(--text-muted)" }} />
                <input
                  className="input"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => updateField("dateOfBirth", e.target.value)}
                  autoFocus
                />
              </div>
              <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                You must be at least 13 years old to use Vreedits.
              </p>
            </div>
          )}

          {current === "terms" && (
            <div>
              <label className="flex items-start gap-2.5" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.termsAccepted}
                  onChange={(e) => updateField("termsAccepted", e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span className="text-sm">
                  I agree to Vreedits' <Link href="/terms" className="btn-text">Terms of Service</Link> and{" "}
                  <Link href="/privacy" className="btn-text">Privacy Policy</Link>.
                </span>
              </label>
            </div>
          )}

          <button
            className="btn-primary"
            type="submit"
            disabled={
              loading ||
              (current === "identity" && (usernameStatus === "checking" || usernameStatus === "taken"))
            }
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {isLastStep ? "Create Account" : "Continue"}
          </button>
        </form>

        {step === 0 && (
          <div className="text-center text-sm mt-4" style={{ color: "var(--text-muted)" }}>
            Already have an account?{" "}
            <Link href="/login" className="btn-text">Log in</Link>
          </div>
        )}
      </div>
    </div>
  );
}