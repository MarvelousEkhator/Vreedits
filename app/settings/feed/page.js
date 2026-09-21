"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Lock, Loader2, X } from "lucide-react";
import NavShell from "@/components/NavShell";

const STILL_LOCKED_SECTIONS = [
  { header: "Activity", items: ["Content preferences", "Time and well-being", "Family Pairing"] },
  { header: "Account", items: ["Security and permissions"] },
  { header: "Content & display", items: ["Activity centre", "Ads"] },
];

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

function SegmentedControl({ value, onChange, disabled }) {
  const options = [
    { id: "everyone", label: "Everyone" },
    { id: "friends", label: "Friends" },
    { id: "none", label: "No one" },
  ];
  return (
    <div className="flex items-center gap-1 p-1 rounded-full" style={{ background: "var(--surface-2)" }}>
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          disabled={disabled}
          className="text-xs font-medium rounded-full"
          style={{
            padding: "6px 10px", border: "none",
            background: value === opt.id ? "var(--accent)" : "transparent",
            color: value === opt.id ? "white" : "var(--text-muted)",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Avatar({ user, size = 36 }) {
  if (user?.avatarDataUrl) {
    return <img src={user.avatarDataUrl} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />;
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: "var(--accent-soft)", color: "var(--accent)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 600, fontSize: size * 0.4,
      }}
    >
      {(user?.displayName || user?.username)?.slice(0, 2).toUpperCase() || "?"}
    </div>
  );
}

function UserListSheet({ title, open, onClose, users, loading, error, onUnblock }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease", zIndex: 200,
        }}
      />
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "75vh",
          background: "var(--surface)", borderRadius: "20px 20px 0 0",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.22,1,0.36,1)", zIndex: 201,
          display: "flex", flexDirection: "column",
        }}
      >
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--text-muted)", background: "none", border: "none" }}>
            <X size={18} />
          </button>
        </div>
        <div className="p-3" style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div className="flex justify-center py-8" style={{ color: "var(--text-muted)" }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>{error}</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>Nothing here yet.</p>
          ) : (
            users.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2.5">
                  <Avatar user={u} />
                  <div>
                    <div className="text-sm font-medium">{u.displayName || u.username}</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>@{u.username}</div>
                  </div>
                </div>
                {onUnblock && (
                  <button
                    onClick={() => onUnblock(u.id)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full"
                    style={{ background: "var(--surface-2)", color: "var(--text)", border: "none" }}
                  >
                    Unblock
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function VideoGridSheet({ title, open, onClose, posts, loading, error }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease", zIndex: 200,
        }}
      />
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "75vh",
          background: "var(--surface)", borderRadius: "20px 20px 0 0",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.22,1,0.36,1)", zIndex: 201,
          display: "flex", flexDirection: "column",
        }}
      >
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--text-muted)", background: "none", border: "none" }}>
            <X size={18} />
          </button>
        </div>
        <div className="p-3" style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div className="flex justify-center py-8" style={{ color: "var(--text-muted)" }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>{error}</p>
          ) : posts.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>Nothing here yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {posts.map((p) => (
                <div key={p.id} style={{ aspectRatio: "9/16", background: "#111", borderRadius: 6, overflow: "hidden" }}>
                  {p.mediaType === "video" ? (
                    <video src={p.mediaUrl} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : p.mediaUrl ? (
                    <img src={p.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}export default function FeedSettingsPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [privacy, setPrivacy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [sheet, setSheet] = useState(null); // "blocked" | "following" | "liked" | null
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [sheetUsers, setSheetUsers] = useState([]);
  const [sheetPosts, setSheetPosts] = useState([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/session").then((r) => r.json()),
      fetch("/api/profile").then((r) => r.json()),
      fetch("/api/settings/privacy").then((r) => r.json()),
    ])
      .then(([session, profileData, privacyData]) => {
        setUser(session.user);
        setProfile(profileData.profile);
        setPrivacy(privacyData.settings);
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

  async function patchPrivacy(field, value) {
    setSaving(true);
    setPrivacy((prev) => ({ ...prev, [field]: value })); // optimistic
    const res = await fetch("/api/settings/privacy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) setPrivacy(data.settings);
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

  async function openSheet(type) {
    setSheet(type);
    setSheetError("");
    setSheetLoading(true);
    setSheetUsers([]);
    setSheetPosts([]);
    try {
      if (type === "blocked") {
        const res = await fetch("/api/users/blocked");
        const data = await res.json();
        if (res.ok) setSheetUsers(data.blocked);
        else setSheetError(data.error || "Could not load.");
      } else if (type === "following") {
        const res = await fetch(`/api/users/${user.id}/following-list`);
        const data = await res.json();
        if (res.ok) setSheetUsers(data.following);
        else setSheetError(data.error || "Could not load.");
      } else if (type === "liked") {
        const res = await fetch(`/api/users/${user.id}/liked-videos`);
        const data = await res.json();
        if (res.ok) setSheetPosts(data.posts);
        else setSheetError(data.error || "Could not load.");
      }
    } catch {
      setSheetError("Network error.");
    } finally {
      setSheetLoading(false);
    }
  }

  async function handleUnblock(targetId) {
    setSheetUsers((prev) => prev.filter((u) => u.id !== targetId));
    await fetch(`/api/users/${targetId}/block`, { method: "POST" });
  }

  if (loading || !privacy) {
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

        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Visibility</div>
        <div className="card mb-6" style={{ padding: 6 }}>
          <div className="flex items-center justify-between p-3 rounded-xl" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="text-sm font-medium">Private account</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>Only approved followers see your posts</div>
            </div>
            <ToggleSwitch checked={!profile.isPublic} onChange={(v) => patchField("isPublic", !v)} disabled={saving} />
          </div>
          <button
            onClick={() => openSheet("blocked")}
            className="flex items-center justify-between w-full p-3 rounded-xl text-left"
            style={{ background: "none", border: "none" }}
          >
            <span className="text-sm font-medium">Blocked accounts</span>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Interactions</div>
        <div className="card mb-6" style={{ padding: 6 }}>
          <div className="flex items-center justify-between p-3 rounded-xl" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="text-sm font-medium">Downloads</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>Let others download your posts</div>
            </div>
            <ToggleSwitch checked={profile.allowDownloads} onChange={(v) => patchField("allowDownloads", v)} disabled={saving} />
          </div>

          <div className="p-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="text-sm font-medium mb-2">Who can comment</div>
            <SegmentedControl value={privacy.allowComments} onChange={(v) => patchPrivacy("allowComments", v)} disabled={saving} />
          </div>

          <div className="p-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="text-sm font-medium mb-2">Who can mention you</div>
            <SegmentedControl value={privacy.allowMentions} onChange={(v) => patchPrivacy("allowMentions", v)} disabled={saving} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="text-sm font-medium">Display profile when sharing links</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>Show a preview card when your profile link is shared</div>
            </div>
            <ToggleSwitch checked={privacy.shareProfileLinks} onChange={(v) => patchPrivacy("shareProfileLinks", v)} disabled={saving} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="text-sm font-medium">Hide following list</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>Only you can see who you follow</div>
            </div>
            <ToggleSwitch checked={privacy.hideFollowing} onChange={(v) => patchPrivacy("hideFollowing", v)} disabled={saving} />
          </div>
          <button
            onClick={() => openSheet("following")}
            className="flex items-center justify-between w-full p-3 rounded-xl text-left"
            style={{ background: "none", border: "none", borderBottom: "1px solid var(--border)" }}
          >
            <span className="text-sm font-medium">View following list</span>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </button>

          <div className="flex items-center justify-between p-3 rounded-xl" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="text-sm font-medium">Hide liked videos</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>Only you can see your liked videos</div>
            </div>
            <ToggleSwitch checked={privacy.hideLikedVideos} onChange={(v) => patchPrivacy("hideLikedVideos", v)} disabled={saving} />
          </div>
          <button
            onClick={() => openSheet("liked")}
            className="flex items-center justify-between w-full p-3 rounded-xl text-left"
            style={{ background: "none", border: "none" }}
          >
            <span className="text-sm font-medium">View liked videos</span>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        {STILL_LOCKED_SECTIONS.map((section) => (
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

      <UserListSheet
        title={sheet === "blocked" ? "Blocked accounts" : "Following"}
        open={sheet === "blocked" || sheet === "following"}
        onClose={() => setSheet(null)}
        users={sheetUsers}
        loading={sheetLoading}
        error={sheetError}
        onUnblock={sheet === "blocked" ? handleUnblock : null}
      />
      <VideoGridSheet
        title="Liked videos"
        open={sheet === "liked"}
        onClose={() => setSheet(null)}
        posts={sheetPosts}
        loading={sheetLoading}
        error={sheetError}
      />
    </NavShell>
  );
}