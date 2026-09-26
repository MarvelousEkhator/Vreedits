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
import { LANGUAGES } from "@/lib/i18n";

function SettingsInner({ user, profile, loading, savingLanguage, loggingOut, onLanguageChange, onLogout }) {
  // This useLanguage() call is inside NavShell's provider (SettingsInner is
  // rendered as NavShell's child), so setLang here actually switches the
  // app for real, everywhere.
  const { t, lang, setLang } = useLanguage();

  // The dropdown must reflect what's actually on screen right now (`lang`),
  // not the saved database value (`profile.language`) — those two can
  // disagree (e.g. this device switched language locally, or the save to
  // the account never went through). Binding the dropdown to the database
  // value instead of the live value was the actual bug: if the dropdown
  // already displayed "English" while the app was really running in
  // Portuguese, picking "English" again was a no-op as far as the browser
  // was concerned — a <select> only fires onChange when its value changes,
  // so nothing happened until a different language was picked first.
  const currentLanguageName =
    LANGUAGES.find((l) => l.code === lang)?.name || "English";

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" });
  }

  function handleSelectChange(e) {
    setLang(e.target.value);
    onLanguageChange(e);
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
                value={currentLanguageName}
                onChange={handleSelectChange}
                disabled={savingLanguage}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.name}>{l.name}</option>
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

  // The live language switch happens inside SettingsInner (via its own
  // useLanguage() call, which is inside NavShell's provider). This handler
  // only updates local state and persists the choice to the account.
  async function handleLanguageChange(e) {
    const language = e.target.value;
    setProfile((p) => ({ ...p, language }));
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