"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, User, HelpCircle, Phone, ChevronRight,
  Mail, ShieldCheck, Calendar, Globe, Languages, Lock, Unlock, Circle, ShieldQuestion,
  LogOut,
} from "lucide-react";
import NavShell from "@/components/NavShell";
import { useLanguage } from "@/components/LanguageProvider";

const LANGUAGES = [
  "English", "Spanish", "French", "Arabic", "Korean", "Chinese",
  "Japanese", "Portuguese", "German", "Hindi", "Russian", "Italian",
];

function SettingsInner({ user, profile, loading, savingLanguage, loggingOut, onLanguageChange, onLogout }) {
  const { t, lang } = useLanguage();

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" });
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 pb-16">
      <div className="w-full max-w-[420px] mt-10">
        <h1 className="text-xl font-semibold mb-6" style={{ fontFamily: "var(--font-display)" }}>
          {t("settings.title")}
        </h1>

        <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>
          {t("settings.accountOverview")}
        </h2>
        <div className="card p-5 mb-6">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2.5">
              <Circle size={10} fill={user?.online ? "var(--success)" : "var(--text-muted)"} style={{ color: "transparent" }} />
              <span>{user?.online ? t("settings.onlineAuto") : t("common.offline")}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Mail size={15} style={{ color: "var(--text-muted)" }} />
              <span>{profile?.email}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={15} style={{ color: "var(--success)" }} />
              <span>{t("settings.emailVerified")}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Calendar size={15} style={{ color: "var(--text-muted)" }} />
              <span>{t("settings.memberSince")} {profile?.createdAt ? formatDate(profile.createdAt) : "—"}</span>
            </div>
            {profile?.country && (
              <div className="flex items-center gap-2.5">
                <Globe size={15} style={{ color: "var(--text-muted)" }} />
                <span>{profile.country}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Languages size={15} style={{ color: "var(--text-muted)" }} />
                <span>{t("settings.language")}</span>
              </div>
              <select
                className="input"
                style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
                value={profile?.language || "English"}
                onChange={onLanguageChange}
                disabled={savingLanguage}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>
            <div
              className="flex items-center gap-2.5"
              style={{
                padding: "8px 12px", borderRadius: 10,
                background: "var(--surface-2)", width: "fit-content",
              }}
            >
              {profile?.isPublic ? (
                <Unlock size={15} style={{ color: "var(--text-muted)" }} />
              ) : (
                <Lock size={15} style={{ color: "var(--accent)" }} />
              )}
              <span>{profile?.isPublic ? t("settings.publicProfile") : t("settings.privateProfile")}</span>
            </div>
          </div>
        </div>

        <div className="card p-5 mb-6">
          <Link href="/profile" className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 text-sm font-medium">
              <User size={16} /> {t("settings.editProfile")}
            </div>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </Link>

          <Link href="/settings/feed" className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldQuestion size={16} /> {t("settings.privacy")}
            </div>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </Link>

          <Link href="/help" className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 text-sm font-medium">
              <HelpCircle size={16} /> {t("settings.helpCenter")}
            </div>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </Link>

          <Link href="/contact" className="flex items-center justify-between py-3" style={{ paddingBottom: 0 }}>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Phone size={16} /> {t("settings.contactUs")}
            </div>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </Link>
        </div>

        <div className="card p-5">
          <button
            onClick={onLogout}
            disabled={loggingOut}
            className="flex items-center gap-2 text-sm font-medium w-full py-1"
            style={{ color: "var(--danger)", background: "none", border: "none", cursor: loggingOut ? "not-allowed" : "pointer" }}
          >
            {loggingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
            {loggingOut ? "…" : t("nav.logout")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { setLang } = useLanguage();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/session").then((r) => r.json()),
      fetch("/api/profile").then((r) => r.json()),
    ]).then(([sessionData, profileData]) => {
      setUser(sessionData.user);
      setProfile(profileData.profile);
      setLoading(false);
    });
  }, []);

  async function handleLanguageChange(e) {
    const language = e.target.value;
    setProfile((p) => ({ ...p, language }));
    setLang(language);
    setSavingLanguage(true);
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
    } finally {
      setSavingLanguage(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <NavShell user={user}>
      <SettingsInner
        user={user}
        profile={profile}
        loading={loading}
        savingLanguage={savingLanguage}
        loggingOut={loggingOut}
        onLanguageChange={handleLanguageChange}
        onLogout={handleLogout}
      />
    </NavShell>
  );
}