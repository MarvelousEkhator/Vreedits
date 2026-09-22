"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { LanguageProvider, useLanguage } from "@/components/LanguageProvider";

function LoginInner() {
  const router = useRouter();
  const { t } = useLanguage();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
        setLoading(false);
        return;
      }
      if (data.needsVerification) {
        router.push(`/verify?email=${encodeURIComponent(data.email)}`);
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4">
      <div className="w-full max-w-[420px] card p-7 mt-16">
        <h1 className="text-xl font-semibold mb-1" style={{ fontFamily: "var(--font-display)" }}>
          {t("auth.welcomeBack")}
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          {t("auth.logInSubtitle")}
        </p>

        {error && <div className="alert alert-error mb-4"><AlertCircle size={15} />{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
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
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
                autoComplete="email"
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
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button type="button" className="absolute right-2" onClick={() => setShowPw((v) => !v)} aria-label={t("auth.togglePassword")}>
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div className="text-right">
            <Link href="/forgot-password" className="btn-text">{t("auth.forgotPassword")}</Link>
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading && <Loader2 size={15} className="animate-spin" />}
            {t("auth.logInBtn")}
          </button>
        </form>

        <div className="text-center text-sm mt-4" style={{ color: "var(--text-muted)" }}>
          {t("auth.noAccount")}{" "}
          <Link href="/register" className="btn-text">{t("auth.createOne")}</Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <LanguageProvider>
      <LoginInner />
    </LanguageProvider>
  );
}