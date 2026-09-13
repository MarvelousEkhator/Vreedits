// app/settings/feed/account/page.js
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Mail, ShieldCheck, Calendar, Globe, Languages,
  Lock, Unlock, Circle,
} from "lucide-react";
import NavShell from "@/components/NavShell";

const LANGUAGES = [
  "English", "Spanish", "French", "Arabic", "Korean", "Chinese",
  "Japanese", "Portuguese", "German", "Hindi", "Russian", "Italian",
];

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// Feed's own account overview — deliberately separate from the main
// Vreedits /settings page, so feed settings stay self-contained rather
// than routing out into the main app's account settings.
export default function FeedAccountPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingLanguage, setSavingLanguage] = useState(false);

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

  if (loading) {
    return (
      <NavShell user={user}>
        <div className="min-h-[60vh] flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      </NavShell>
    );
  }

  return (
    <NavShell user={user}>
      <div className="px-4 pt-5 pb-16" style={{ maxWidth: 480, margin: "0 auto" }}>
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings/feed" aria-label="Back" style={{ color: "var(--text)" }}>
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-semibold">Account</h1>
        </div>

        <div className="card p-5">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2.5">
              <Circle size={10} fill={user?.online ? "var(--success)" : "var(--text-muted)"} style={{ color: "transparent" }} />
              <span>{user?.online ? "Online now — detected automatically" : "Offline"}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Mail size={15} style={{ color: "var(--text-muted)" }} />
              <span>{profile?.email}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={15} style={{ color: "var(--success)" }} />
              <span>Email verified</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Calendar size={15} style={{ color: "var(--text-muted)" }} />
              <span>Member since {profile?.createdAt ? formatDate(profile.createdAt) : "—"}</span>
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
                <span>Language</span>
              </div>
              <select
                className="input"
                style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
                value={profile?.language || "English"}
                onChange={handleLanguageChange}
                disabled={savingLanguage}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2.5">
              {profile?.isPublic ? (
                <Unlock size={15} style={{ color: "var(--text-muted)" }} />
              ) : (
                <Lock size={15} style={{ color: "var(--text-muted)" }} />
              )}
              <span>{profile?.isPublic ? "Public profile" : "Private profile"}</span>
            </div>
          </div>
        </div>
      </div>
    </NavShell>
  );
}
