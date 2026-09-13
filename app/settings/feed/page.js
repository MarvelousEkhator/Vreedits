"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Lock, Loader2 } from "lucide-react";
import NavShell from "@/components/NavShell";

const LOCKED_SECTIONS = [
  { header: "Activity", items: ["Content preferences", "Time and well-being", "Family Pairing"] },
  { header: "Account", items: ["Security and permissions"] },
  { header: "Visibility", items: ["Blocked accounts"] },
  { header: "Interactions", items: ["Comments", "Mentions", "Display profile when sharing links", "Following list", "Liked videos", "Viewers"] },
  { header: "Content & display", items: ["Activity centre", "Ads"] },
];

export default function FeedSettingsPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/auth/session").then((r) => r.json()), fetch("/api/profile").then((r) => r.json())])
      .then(([session, profileData]) => {
        setUser(session.user);
        setProfile(profileData.profile);
      })
      .finally(() => setLoading(false));
  }, []);

  async function patchField(field, value) {
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) setProfile(data.profile);
  }

  async function handleShareProfile() {
    if (!user) return;
    const url = `${window.location.origin}/u/${user.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${user.username} on Vreedits`, url });
      } catch {}
    } else {
      navigator.clipboard.writeText(url);
    }
  }

  if (loading) {
    return (
      <NavShell user={user}>
        <div className="flex items-center justify-center" style={{ height: "60vh" }}>
          <Loader2 className="animate-spin" size={22} />
        </div>
      </NavShell>
    );
  }

  return (
    <NavShell user={user}>
      <div className="px-4 pt-5 pb-16" style={{ maxWidth: 480, margin: "0 auto" }}>
        <div className="flex items-center gap-3 mb-6">
          <Link href="/profile" aria-label="Back" style={{ color: "var(--text)" }}>
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-semibold">Settings and privacy</h1>
        </div>

        {/* Activity */}
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Activity</div>
        <div className="card mb-6" style={{ padding: 6 }}>
          <Link href="/profile" className="flex items-center justify-between p-3 rounded-xl" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-sm font-medium">Manage posts</span>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </Link>
          <Link href="/notifications" className="flex items-center justify-between p-3 rounded-xl">
            <span className="text-sm font-medium">Notifications</span>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </Link>
        </div>

        {/* Account — now scoped to feed settings, not the main Vreedits
            /settings page, so this stays self-contained. */}
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Account</div>
        <div className="card mb-6" style={{ padding: 6 }}>
          <Link href="/settings/feed/account" className="flex items-center justify-between p-3 rounded-xl" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-sm font-medium">Account</span>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </Link>
          <button onClick={handleShareProfile} className="flex items-center justify-between w-full p-3 rounded-xl text-left" style={{ background: "none", border: "none" }}>
            <span className="text-sm font-medium">Share profile</span>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        {/* Visibility */}
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Visibility</div>
        <div className="card mb-6" style={{ padding: 6 }}>
          <div className="flex items-center justify-between p-3 rounded-xl">
            <div>
              <div className="text-sm font-medium">Private account</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>Only approved followers see your posts</div>
            </div>
            <button
              onClick={() => patchField("isPublic", !profile.isPublic)}
              disabled={saving}
              className="w-11 h-6 rounded-full relative transition-colors"
              style={{ background: !profile.isPublic ? "var(--accent)" : "var(--border)" }}
            >
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: !profile.isPublic ? "translateX(22px)" : "translateX(2px)" }} />
            </button>
          </div>
        </div>

        {/* Interactions */}
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Interactions</div>
        <div className="card mb-6" style={{ padding: 6 }}>
          <div className="flex items-center justify-between p-3 rounded-xl">
            <div>
              <div className="text-sm font-medium">Downloads</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>Let others download your posts</div>
            </div>
            <button
              onClick={() => patchField("allowDownloads", !profile.allowDownloads)}
              disabled={saving}
              className="w-11 h-6 rounded-full relative transition-colors"
              style={{ background: profile.allowDownloads ? "var(--accent)" : "var(--border)" }}
            >
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: profile.allowDownloads ? "translateX(22px)" : "translateX(2px)" }} />
            </button>
          </div>
        </div>

        {/* Locked / coming soon sections */}
        {LOCKED_SECTIONS.map((section) => (
          <div key={section.header}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>{section.header}</div>
            <div className="card mb-6" style={{ padding: 6 }}>
              {section.items.map((label, i) => (
                <div
                  key={label}
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{ opacity: 0.4, borderBottom: i < section.items.length - 1 ? "1px solid var(--border)" : "none" }}
                  title="Coming in a later phase"
                >
                  <span className="text-sm font-medium">{label}</span>
                  <Lock size={14} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </NavShell>
  );
}
