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

// A nicer toggle than a flat two-tone switch: a spring-y thumb animation
// (slight overshoot on settle) and a soft glow behind the track when on,
// instead of a plain color swap.
function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      style={{
        width: 50, height: 30, borderRadius: 999, border: "none", padding: 3,
        background: checked ? "var(--accent)" : "var(--surface-2)",
        boxShadow: checked
          ? "0 3px 12px rgba(124, 77, 255, 0.45), inset 0 0 0 1px rgba(255,255,255,0.08)"
          : "inset 0 0 0 1px var(--border)",
        transition: "background 0.25s ease, box-shadow 0.25s ease",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        position: "relative",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: "block", width: 24, height: 24, borderRadius: "50%",
          background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
          transform: checked ? "translateX(20px)" : "translateX(0)",
          transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      />
    </button>
  );
}

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

        {/* Account — scoped to feed settings, not the main Vreedits /settings page */}
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
            <ToggleSwitch checked={!profile.isPublic} onChange={(v) => patchField("isPublic", !v)} disabled={saving} />
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
            <ToggleSwitch checked={profile.allowDownloads} onChange={(v) => patchField("allowDownloads", v)} disabled={saving} />
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
