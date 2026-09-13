"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Loader2, User, HelpCircle, Phone, ChevronRight,
  Mail, ShieldCheck, Calendar, Globe, Languages, Lock, Unlock, Circle, ShieldQuestion,
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

export default function SettingsPage() {
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
      <div className="min-h-screen flex flex-col items-center px-4 pb-16">
        <div className="w-full max-w-[420px] mt-10">
          <h1 className="text-xl font-semibold mb-6" style={{ fontFamily: "var(--font-display)" }}>
            Settings
          </h1>

          <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>
            Account overview
          </h2>
          <div className="card p-5 mb-6">
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
                <span>{profile?.isPublic ? "Public profile" : "Private profile"}</span>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <Link href="/profile" className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <User size={16} /> Edit Profile
              </div>
              <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
            </Link>

            <Link href="/settings/feed" className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldQuestion size={16} /> Privacy
              </div>
              <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
            </Link>

            <Link href="/help" className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <HelpCircle size={16} /> Help Center
              </div>
              <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
            </Link>

            <Link href="/contact" className="flex items-center justify-between py-3" style={{ paddingBottom: 0 }}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Phone size={16} /> Contact Us
              </div>
              <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
            </Link>
          </div>
        </div>
      </div>
    </NavShell>
  );
}
