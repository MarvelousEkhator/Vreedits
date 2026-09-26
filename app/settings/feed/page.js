"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Lock, Loader2, X, Check } from "lucide-react";
import NavShell from "@/components/NavShell";
import { useLanguage } from "@/components/LanguageProvider";

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
  const { t } = useLanguage();
  const options = [
    { id: "everyone", label: t("feedSettings.everyone") },
    { id: "friends", label: t("feedSettings.friends") },
    { id: "none", label: t("feedSettings.noOne") },
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

// TikTok-style row: a settings row that shows its current value inline and
// opens a sheet to change it, instead of a switch — used for choices with
// a human-readable value worth showing at a glance (e.g. "Only you").
function ValueRow({ label, value, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between w-full p-3 rounded-xl text-left"
      style={{ background: "none", border: "none" }}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>{value}</span>
        <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
      </span>
    </button>
  );
}

// Bottom sheet with radio-style options — used for the "Liked videos"
// visibility choice, matching the row-plus-sheet pattern TikTok uses for
// this exact setting instead of a plain on/off switch.
function RadioSheet({ title, open, onClose, options, value, onSelect }) {
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
          position: "fixed", left: 0, right: 0, bottom: 0,
          background: "var(--surface)", borderRadius: "20px 20px 0 0",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.22,1,0.36,1)", zIndex: 201,
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
        }}
      >
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--text-muted)", background: "none", border: "none" }}>
            <X size={18} />
          </button>
        </div>
        <div className="p-2">
          {options.map((opt) => {
            const selected = opt.id === value;
            return (
              <button
                key={opt.id}
                onClick={() => onSelect(opt.id)}
                className="flex items-center justify-between w-full p-3 rounded-xl text-left"
                style={{ background: "none", border: "none" }}
              >
                <span className="text-sm font-medium">{opt.label}</span>
                <span
                  style={{
                    width: 20, height: 20, borderRadius: "50%",
                    border: selected ? "none" : "2px solid var(--border)",
                    background: selected ? "var(--accent)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}
                >
                  {selected && <Check size={13} color="white" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
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
  const { t } = useLanguage();
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
          <button onClick={onClose} aria-label={t("feedSettings.close")} style={{ color: "var(--text-muted)", background: "none", border: "none" }}>
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
            <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>{t("feedSettings.nothingHere")}</p>
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
                    {t("feedSettings.unblock")}
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

function FeedSettingsInner({
  user, profile, privacy, saving,
  sheet, sheetLoading, sheetError, sheetUsers,
  patchField, patchPrivacy, handleShareProfile, openSheet, handleUnblock, setSheet,
}) {
  const { t } = useLanguage();
  const [likedSheetOpen, setLikedSheetOpen] = useState(false);

  const likedValue = privacy.hideLikedVideos ? t("feedSettings.onlyYou") : t("feedSettings.everyone");

  const stillLockedSections = [
    { header: t("feedSettings.activity"), items: [t("feedSettings.contentPreferences"), t("feedSettings.timeWellbeing"), t("feedSettings.familyPairing")] },
    { header: t("feedSettings.account"), items: [t("feedSettings.securityPermissions")] },
    { header: t("feedSettings.contentDisplay"), items: [t("feedSettings.activityCentre"), t("feedSettings.ads")] },
  ];

  return (
    <>
      <div className="px-4 pt-5 pb-16" style={{ maxWidth: 480, margin: "0 auto" }}>
        <div className="flex items-center gap-3 mb-6">
          <Link href="/profile" aria-label={t("feedSettings.back")} style={{ color: "var(--text)" }}>
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-semibold">{t("feedSettings.title")}</h1>
        </div>

        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>{t("feedSettings.activity")}</div>
        <div className="card mb-6" style={{ padding: 6 }}>
          <Link href="/profile" className="flex items-center justify-between p-3 rounded-xl" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-sm font-medium">{t("feedSettings.managePosts")}</span>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </Link>
          <Link href="/notifications" className="flex items-center justify-between p-3 rounded-xl">
            <span className="text-sm font-medium">{t("feedSettings.notifications")}</span>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </Link>
        </div>

        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>{t("feedSettings.account")}</div>
        <div className="card mb-6" style={{ padding: 6 }}>
          <Link href="/settings/feed/account" className="flex items-center justify-between p-3 rounded-xl" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-sm font-medium">{t("feedSettings.account")}</span>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </Link>
          <button onClick={handleShareProfile} className="flex items-center justify-between w-full p-3 rounded-xl text-left" style={{ background: "none", border: "none" }}>
            <span className="text-sm font-medium">{t("feedSettings.shareProfile")}</span>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>{t("feedSettings.visibility")}</div>
        <div className="card mb-6" style={{ padding: 6 }}>
          <div className="flex items-center justify-between p-3 rounded-xl" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="text-sm font-medium">{t("feedSettings.privateAccount")}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{t("feedSettings.privateAccountDesc")}</div>
            </div>
            <ToggleSwitch checked={!profile.isPublic} onChange={(v) => patchField("isPublic", !v)} disabled={saving} />
          </div>
          <button
            onClick={() => openSheet("blocked")}
            className="flex items-center justify-between w-full p-3 rounded-xl text-left"
            style={{ background: "none", border: "none" }}
          >
            <span className="text-sm font-medium">{t("feedSettings.blockedAccounts")}</span>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>{t("feedSettings.interactions")}</div>
        <div className="card mb-6" style={{ padding: 6 }}>
          <div className="flex items-center justify-between p-3 rounded-xl" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="text-sm font-medium">{t("feedSettings.downloads")}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{t("feedSettings.downloadsDesc")}</div>
            </div>
            <ToggleSwitch checked={profile.allowDownloads} onChange={(v) => patchField("allowDownloads", v)} disabled={saving} />
          </div>

          <div className="p-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="text-sm font-medium mb-2">{t("feedSettings.whoCanComment")}</div>
            <SegmentedControl value={privacy.allowComments} onChange={(v) => patchPrivacy("allowComments", v)} disabled={saving} />
          </div>

          <div className="p-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="text-sm font-medium mb-2">{t("feedSettings.whoCanMention")}</div>
            <SegmentedControl value={privacy.allowMentions} onChange={(v) => patchPrivacy("allowMentions", v)} disabled={saving} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="text-sm font-medium">{t("feedSettings.displayProfileLinks")}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{t("feedSettings.displayProfileLinksDesc")}</div>
            </div>
            <ToggleSwitch checked={privacy.shareProfileLinks} onChange={(v) => patchPrivacy("shareProfileLinks", v)} disabled={saving} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="text-sm font-medium">{t("feedSettings.hideFollowing")}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{t("feedSettings.hideFollowingDesc")}</div>
            </div>
            <ToggleSwitch checked={privacy.hideFollowing} onChange={(v) => patchPrivacy("hideFollowing", v)} disabled={saving} />
          </div>
          <button
            onClick={() => openSheet("following")}
            className="flex items-center justify-between w-full p-3 rounded-xl text-left"
            style={{ background: "none", border: "none", borderBottom: "1px solid var(--border)" }}
          >
            <span className="text-sm font-medium">{t("feedSettings.viewFollowing")}</span>
            <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
          </button>

          {/* TikTok-style value row: shows "Only you" / "Everyone" inline and
              opens a radio-choice sheet, replacing the old toggle + separate
              "View liked" button. Viewing your own liked videos is already
              covered by the Likes tab on your profile, so no separate viewer
              is needed here anymore. */}
          <ValueRow
            label={t("feedSettings.likedVideos")}
            value={likedValue}
            onClick={() => setLikedSheetOpen(true)}
          />
        </div>

        {stillLockedSections.map((section) => (
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
        title={sheet === "blocked" ? t("feedSettings.blockedAccounts") : t("feedSettings.following")}
        open={sheet === "blocked" || sheet === "following"}
        onClose={() => setSheet(null)}
        users={sheetUsers}
        loading={sheetLoading}
        error={sheetError}
        onUnblock={sheet === "blocked" ? handleUnblock : null}
      />

      <RadioSheet
        title={t("feedSettings.allowLikedSeenBy")}
        open={likedSheetOpen}
        onClose={() => setLikedSheetOpen(false)}
        options={[
          { id: "everyone", label: t("feedSettings.everyone") },
          { id: "onlyYou", label: t("feedSettings.onlyYou") },
        ]}
        value={privacy.hideLikedVideos ? "onlyYou" : "everyone"}
        onSelect={(id) => {
          patchPrivacy("hideLikedVideos", id === "onlyYou");
          setLikedSheetOpen(false);
        }}
      />
    </>
  );
}

export default function FeedSettingsPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [privacy, setPrivacy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [sheet, setSheet] = useState(null); // "blocked" | "following" | null
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [sheetUsers, setSheetUsers] = useState([]);

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
      <FeedSettingsInner
        user={user}
        profile={profile}
        privacy={privacy}
        saving={saving}
        sheet={sheet}
        sheetLoading={sheetLoading}
        sheetError={sheetError}
        sheetUsers={sheetUsers}
        patchField={patchField}
        patchPrivacy={patchPrivacy}
        handleShareProfile={handleShareProfile}
        openSheet={openSheet}
        handleUnblock={handleUnblock}
        setSheet={setSheet}
      />
    </NavShell>
  );
}