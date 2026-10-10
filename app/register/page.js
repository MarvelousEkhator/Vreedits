"use client";
import BirthdayPicker from "@/components/BirthdayPicker";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, User, Eye, EyeOff, Loader2, AlertCircle, ChevronLeft, X } from "lucide-react";
import { PasswordRequirement, UsernameStatus } from "@/components/AuthWidgets";
import { LanguageProvider, useLanguage } from "@/components/LanguageProvider";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Set to false if you don't want to require opening both documents
// before the "I agree" checkbox unlocks.
const REQUIRE_OPENING_DOCS = true;

// Age from a "YYYY-MM-DD" string, or null if it isn't one.
function ageFromDobString(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age--;
  return age;
}

function RegisterInner() {
  const router = useRouter();
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirm: "",
    displayName: "",
    username: "",
    dateOfBirth: "",
    guardianPin: "",
    guardianPin2: "",
    guardianEmail: "",
    termsAccepted: false,
  });
  const [showPw, setShowPw] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState("idle");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Terms / Privacy reader (opens on top of the form so nothing typed is lost)
  const [reader, setReader] = useState(null); // "terms" | "privacy" | null
  const [opened, setOpened] = useState({ terms: false, privacy: false });

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

  // Under 18 gets an extra step for a parent or guardian.
  const age = ageFromDobString(form.dateOfBirth);
  const minor = age !== null && age >= 13 && age < 18;
  const under16 = age !== null && age >= 13 && age < 16;
  const steps = minor
    ? ["account", "identity", "birthday", "parent", "terms"]
    : ["account", "identity", "birthday", "terms"];

  const readAll = !REQUIRE_OPENING_DOCS || (opened.terms && opened.privacy);

  function openReader(which) {
    setReader(which);
    setOpened((o) => ({ ...o, [which]: true }));
  }

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function digitsOnly(key) {
    return (e) => updateField(key, e.target.value.replace(/\D/g, "").slice(0, 4));
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
    const current = steps[step];

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

    if (current === "parent") {
      const pin = form.guardianPin;
      const email = form.guardianEmail.trim();
      const wantsPin = under16 || pin || form.guardianPin2 || email;
      if (wantsPin) {
        if (!/^\d{4}$/.test(pin)) return "The parent PIN must be 4 digits.";
        if (pin !== form.guardianPin2) return "The two PINs don't match.";
      }
      if (email) {
        if (!EMAIL_PATTERN.test(email)) return "Enter a valid parent email.";
        if (email.toLowerCase() === form.email.trim().toLowerCase()) {
          return "Use a different email from the account's own email.";
        }
      }
    }

    if (current === "terms") {
      if (!readAll) return "Please open and read both the Terms and the Privacy Policy first.";
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

  async function handleGuest() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/guest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't start guest session.");
        setLoading(false);
        return;
      }
      router.push("/"); // TODO: adjust to wherever a logged-in user should land
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
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
      const payload = {
        username: form.username,
        displayName: form.displayName,
        email: form.email,
        password: form.password,
        dateOfBirth: form.dateOfBirth,
        termsAccepted: form.termsAccepted,
      };
      if (minor) {
        if (form.guardianPin) payload.guardianPin = form.guardianPin;
        if (form.guardianEmail.trim()) payload.guardianEmail = form.guardianEmail.trim();
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      // Email verification is paused: the account is ready and already signed in.
      if (data.verified) {
        if (data.signedIn) {
          router.push("/feed");
          router.refresh();
        } else {
          router.push("/login");
        }
        return;
      }

      // Email verification is on: the verify page tells them to check spam.
      const flag = data.emailError ? "&emailFailed=1" : "";
      router.push(`/verify?email=${encodeURIComponent(data.email)}${flag}`);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  const current = steps[step];
  const isLastStep = step === steps.length - 1;

  return (
    <div className="min-h-screen flex flex-col items-center px-4">
      <div className="w-full max-w-[420px] card p-7 mt-16">
        <div className="flex items-center gap-2 mb-1">
          {step > 0 && (
            <button onClick={handleBack} aria-label={t("auth.back")} style={{ background: "none", border: "none", color: "var(--text-muted)" }}>
              <ChevronLeft size={18} />
            </button>
          )}
          <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {t("auth.createAccount")}
          </h1>
        </div>
        <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
          {t("auth.stepOf", { n: step + 1, total: steps.length })}
        </p>

        <div className="flex gap-1.5 mb-6">
          {steps.map((s, i) => (
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
                  {t("auth.email")}
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
                  {t("auth.password")}
                </label>
                <div className="relative flex items-center">
                  <Lock size={15} className="absolute left-3" style={{ color: "var(--text-muted)" }} />
                  <input
                    className="input pr-9"
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    placeholder={t("auth.createPassword")}
                    autoComplete="new-password"
                  />
                  <button type="button" className="absolute right-2" onClick={() => setShowPw((v) => !v)} aria-label={t("auth.togglePassword")}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <div className="mt-1.5">
                  <PasswordRequirement met={form.password.length >= 8} label={t("auth.atLeast8")} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  {t("auth.confirmPassword")}
                </label>
                <div className="relative flex items-center">
                  <Lock size={15} className="absolute left-3" style={{ color: "var(--text-muted)" }} />
                  <input
                    className="input"
                    type={showPw ? "text" : "password"}
                    value={form.confirm}
                    onChange={(e) => updateField("confirm", e.target.value)}
                    placeholder={t("auth.repeatPassword")}
                    autoComplete="new-password"
                  />
                </div>
                {form.confirm.length > 0 && (
                  <div className="mt-1.5">
                    <PasswordRequirement met={form.confirm === form.password} label={t("auth.passwordsMatch")} />
                  </div>
                )}
              </div>
            </>
          )}

          {current === "identity" && (
            <>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  {t("auth.displayName")}
                </label>
                <div className="relative flex items-center">
                  <User size={15} className="absolute left-3" style={{ color: "var(--text-muted)" }} />
                  <input
                    className="input"
                    value={form.displayName}
                    onChange={(e) => updateField("displayName", e.target.value)}
                    placeholder={t("auth.displayNamePlaceholder")}
                    autoFocus
                  />
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {t("auth.displayNameOptional")}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  {t("auth.username")}
                </label>
                <div className="relative flex items-center">
                  <User size={15} className="absolute left-3" style={{ color: "var(--text-muted)" }} />
                  <input
                    className="input"
                    value={form.username}
                    onChange={(e) => updateField("username", e.target.value)}
                    placeholder={t("auth.usernamePlaceholder")}
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
                {t("auth.dateOfBirth")}
              </label>
              <BirthdayPicker value={form.dateOfBirth} onChange={(v) => updateField("dateOfBirth", v)} />
              <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                {t("auth.ageRequirement")}
              </p>
            </div>
          )}

          {current === "parent" && (
            <>
              <div className="alert" style={{ background: "var(--accent-soft)", color: "var(--text)" }}>
                Because this account is for someone under 18, a parent or guardian should complete
                this step.
                {under16 ? " A PIN is required for under 16." : " You can leave it empty and set it up later in Settings."}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Parent PIN
                </label>
                <div className="relative flex items-center">
                  <Lock size={15} className="absolute left-3" style={{ color: "var(--text-muted)" }} />
                  <input
                    className="input"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={form.guardianPin}
                    onChange={digitsOnly("guardianPin")}
                    placeholder="Choose a 4-digit PIN"
                    autoComplete="off"
                  />
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  This PIN locks the safety settings, like screen time and who can message.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Confirm PIN
                </label>
                <div className="relative flex items-center">
                  <Lock size={15} className="absolute left-3" style={{ color: "var(--text-muted)" }} />
                  <input
                    className="input"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={form.guardianPin2}
                    onChange={digitsOnly("guardianPin2")}
                    placeholder="Type it again"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Parent's email (recommended)
                </label>
                <div className="relative flex items-center">
                  <Mail size={15} className="absolute left-3" style={{ color: "var(--text-muted)" }} />
                  <input
                    className="input"
                    type="email"
                    value={form.guardianEmail}
                    onChange={(e) => updateField("guardianEmail", e.target.value)}
                    placeholder="parent@example.com"
                    autoComplete="off"
                  />
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Used only to reset the PIN if it's forgotten. Use an email the parent controls and
                  the teen can't open, different from the account's own email. Without one, a
                  forgotten PIN can't be reset.
                </p>
              </div>
            </>
          )}

          {current === "terms" && (
            <div>
              <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
                Please read these before you agree. They open on top of this page, so nothing you've
                typed is lost.
              </p>

              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => openReader("terms")}
                  style={{ flex: 1, background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                >
                  {opened.terms ? "✓ " : ""}Read Terms
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => openReader("privacy")}
                  style={{ flex: 1, background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                >
                  {opened.privacy ? "✓ " : ""}Read Privacy
                </button>
              </div>

              {!readAll && (
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                  Open and read both to unlock the checkbox.
                </p>
              )}

              <label className="flex items-start gap-2.5" style={{ cursor: readAll ? "pointer" : "not-allowed", opacity: readAll ? 1 : 0.55 }}>
                <input
                  type="checkbox"
                  checked={form.termsAccepted}
                  disabled={!readAll}
                  onChange={(e) => updateField("termsAccepted", e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span className="text-sm">
                  {t("auth.agreeToPrefix")} {t("auth.termsOfService")} {t("auth.and")} {t("auth.privacyPolicy")}.
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
            {isLastStep ? t("auth.createAccountBtn") : t("auth.continue")}
          </button>
        </form>

        {step === 0 && (
          <>
            <div className="text-center text-sm mt-4" style={{ color: "var(--text-muted)" }}>
              {t("auth.alreadyHaveAccount")}{" "}
              <Link href="/login" className="btn-text">{t("auth.logIn")}</Link>
            </div>

            <div className="flex items-center gap-2 my-4">
              <div style={{ flex: 1, height: 1, background: "var(--surface-2)" }} />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{t("auth.or")}</span>
              <div style={{ flex: 1, height: 1, background: "var(--surface-2)" }} />
            </div>

            <button
              type="button"
              onClick={handleGuest}
              disabled={loading}
              className="btn-text text-center text-sm w-full"
            >
              {loading ? t("auth.starting") : t("auth.continueAsGuest")}
            </button>
          </>
        )}
      </div>

      {/* Terms / Privacy reader */}
      {reader && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "var(--surface)", color: "var(--text)",
            display: "flex", flexDirection: "column",
          }}
        >
          <div
            className="flex items-center justify-between px-4"
            style={{ height: 56, borderBottom: "1px solid var(--border)", flexShrink: 0 }}
          >
            <div className="flex gap-4 text-sm font-semibold">
              <button
                type="button"
                onClick={() => openReader("terms")}
                style={{
                  background: "none", border: "none", padding: "4px 0", color: "var(--text)",
                  borderBottom: reader === "terms" ? "2px solid var(--accent)" : "2px solid transparent",
                }}
              >
                Terms
              </button>
              <button
                type="button"
                onClick={() => openReader("privacy")}
                style={{
                  background: "none", border: "none", padding: "4px 0", color: "var(--text)",
                  borderBottom: reader === "privacy" ? "2px solid var(--accent)" : "2px solid transparent",
                }}
              >
                Privacy
              </button>
            </div>
            <button
              type="button"
              onClick={() => setReader(null)}
              aria-label="Close"
              style={{ background: "none", border: "none", color: "var(--text)", display: "flex" }}
            >
              <X size={22} />
            </button>
          </div>

          <iframe
            key={reader}
            src={reader === "terms" ? "/terms" : "/privacy"}
            title={reader === "terms" ? "Terms of Service" : "Privacy Policy"}
            style={{ flex: 1, width: "100%", border: "none", background: "var(--surface)" }}
          />

          <div
            className="flex items-center gap-3 p-3"
            style={{ borderTop: "1px solid var(--border)", flexShrink: 0 }}
          >
            <button type="button" className="btn-primary" onClick={() => setReader(null)} style={{ flex: 1 }}>
              Done
            </button>
            <a
              href={reader === "terms" ? "/terms" : "/privacy"}
              target="_blank"
              rel="noreferrer"
              className="btn-text text-sm"
            >
              Open in new tab
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <LanguageProvider>
      <RegisterInner />
    </LanguageProvider>
  );
}