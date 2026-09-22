"use client";
import BirthdayPicker from "@/components/BirthdayPicker";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, User, Eye, EyeOff, Loader2, AlertCircle, ChevronLeft } from "lucide-react";
import { PasswordRequirement, UsernameStatus } from "@/components/AuthWidgets";
import { LanguageProvider, useLanguage } from "@/components/LanguageProvider";

const STEPS = ["account", "identity", "birthday", "terms"];

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
            <button onClick={handleBack} aria-label={t("auth.back")} style={{ background: "none", border: "none", color: "var(--text-muted)" }}>
              <ChevronLeft size={18} />
            </button>
          )}
          <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {t("auth.createAccount")}
          </h1>
        </div>
        <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
          {t("auth.stepOf", { n: step + 1, total: STEPS.length })}
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
                  {t("auth.agreeToPrefix")} <Link href="/terms" className="btn-text">{t("auth.termsOfService")}</Link>{" "}
                  {t("auth.and")} <Link href="/privacy" className="btn-text">{t("auth.privacyPolicy")}</Link>.
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