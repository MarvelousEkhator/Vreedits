"use client";
import { useState, useEffect, useCallback } from "react";
import { Settings as SettingsIcon, Share2, ChevronDown, Loader2 } from "lucide-react";
import Link from "next/link";

function Avatar({ user, size = 96 }) {
  if (user?.avatarDataUrl) {
    return <img src={user.avatarDataUrl} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "var(--accent-soft)", color: "var(--accent)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 600, fontSize: size * 0.35, fontFamily: "var(--font-display)",
    }}>
      {(user?.displayName || user?.username)?.slice(0, 2).toUpperCase() || "?"}
    </div>
  );
}

export default function ProfileClient({ profileId }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("posts");
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/users/${profileId}`);
    const json = await res.json();
    if (res.ok) setData(json);
    setLoading(false);
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  async function handleFollow() {
    if (!data) return;
    setFollowLoading(true);
    const res = await fetch(`/api/users/${profileId}/follow`, { method: "POST" });
    const json = await res.json();
    setFollowLoading(false);
    if (res.ok) {
      setData((d) => ({
        ...d,
        isFollowedByMe: json.following,
        followerCount: d.followerCount + (json.following ? 1 : -1),
      }));
    }
  }

  if (loading && !data) {
    return <div className="flex items-center justify-center" style={{ height: "100%" }}><Loader2 className="animate-spin" size={24} /></div>;
  }
  if (!data) return null;

  const { profile: user, isOwner, isFollowedByMe, followerCount, followingCount, likeCount, publicPosts, privatePosts } = data;

  const tabs = isOwner
    ? [{ id: "posts", label: "Posts" }, { id: "private", label: "Private" }]
    : [{ id: "posts", label: "Posts" }];

  const posts = tab === "private" ? privatePosts : publicPosts;

  // Display Name (e.g. "Marvy")
  const displayName = user.displayName || user.username;
  // Username strictly in lowercase (e.g. "elenahenry")
  const handle = (user.username || "").toLowerCase();

  return (
    <div className="pt-6 pb-16" style={{ maxWidth: 480, margin: "0 auto" }}>
      {/* Top Header Controls */}
      <div className="flex items-center justify-between mb-4 px-4">
        <div style={{ width: 22 }} />
        <span className="text-xs" style={{ color: "var(--text-muted)" }} />
        <div className="flex items-center gap-3">
          <button aria-label="Share profile" style={{ background: "none", border: "none", color: "var(--text)" }}>
            <Share2 size={22} />
          </button>
          {isOwner && (
            <Link href="/settings/feed" aria-label="Feed settings" style={{ color: "var(--text)" }}>
              <SettingsIcon size={22} />
            </Link>
          )}
        </div>
      </div>

      {/* Centered Profile Avatar + Name Stack */}
      <div className="flex flex-col items-center text-center mb-5 px-4">
        <Avatar user={user} />
        
        {/* Bold Display Name (Marvy) */}
        <div className="flex items-center gap-1 mt-3">
          <h1 className="text-xl font-bold leading-tight">
            {displayName}
          </h1>
          {isOwner && <ChevronDown size={18} style={{ color: "var(--text-muted)", marginTop: 2 }} />}
        </div>

        {/* Small Muted Lowercase Handle (@elenahenry) */}
        <span className="text-sm font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          @{handle}
        </span>
      </div>

      {/* Stats Section */}
      <div className="flex items-center justify-center gap-8 mb-5 px-4">
        <div className="text-center flex flex-col items-center">
          <div className="text-lg font-bold">{followingCount}</div>
          <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Following</div>
        </div>
        <div className="text-center flex flex-col items-center">
          <div className="text-lg font-bold">{followerCount}</div>
          <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Followers</div>
        </div>
        <div className="text-center flex flex-col items-center">
          <div className="text-lg font-bold">{likeCount}</div>
          <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Likes</div>
        </div>
      </div>

      {user.bio && (
        <p className="text-sm text-center mb-5 font-medium px-4" style={{ color: "var(--text)", whiteSpace: "pre-wrap" }}>
          {user.bio}
        </p>
      )}

      {/* Separate Edit Profile / Follow Button Row */}
      <div className="mb-6 px-4 flex justify-center">
        {isOwner ? (
          <Link href="/profile/edit" className="btn-primary block text-center" style={{ padding: "10px 0", width: "100%", maxWidth: 160, background: "var(--surface-2)", color: "var(--text)" }}>
            Edit profile
          </Link>
        ) : (
          <button
            onClick={handleFollow}
            disabled={followLoading}
            className="btn-primary w-full"
            style={{
              maxWidth: 160,
              padding: "10px 0",
              ...(isFollowedByMe ? { background: "var(--surface-2)", color: "var(--text)" } : {})
            }}
          >
            {followLoading ? <Loader2 size={16} className="animate-spin mx-auto" /> : isFollowedByMe ? "Following" : "Follow"}
          </button>
        )}
      </div>

      {/* Profile Tabs */}
      <div className="flex items-center w-full mb-1" style={{ borderBottom: "1px solid var(--border)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="text-sm font-semibold pb-3 pt-1 transition-colors"
            style={{
              background: "none", border: "none", flex: 1,
              color: tab === t.id ? "var(--text)" : "var(--text-muted)",
              borderBottom: tab === t.id ? "2px solid var(--text)" : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Grid Display */}
      {!posts || posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Nothing here yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-0.5">
          {posts.map((p) => (
            <div key={p.id} style={{ aspectRatio: "9/16", background: "var(--surface-2)", position: "relative", overflow: "hidden" }}>
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
  );
}
