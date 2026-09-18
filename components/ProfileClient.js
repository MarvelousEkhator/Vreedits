"use client";
import { useState, useEffect, useCallback } from "react";
import { Settings as SettingsIcon, Share2, ChevronDown, Loader2 } from "lucide-react";
import Link from "next/link";

function Avatar({ user, size = 84 }) {
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
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);

  const load = useCallback(async (activeTab) => {
    setLoading(true);
    const res = await fetch(`/api/users/\( {profileId}?tab= \){activeTab}`);
    const json = await res.json();
    if (res.ok) {
      setData(json);
      setPosts(json.posts);
    }
    setLoading(false);
  }, [profileId]);

  useEffect(() => { load(tab); }, [load, tab]);

  async function handleFollow() {
    if (!data) return;
    setFollowLoading(true);
    const res = await fetch(`/api/users/${profileId}/follow`, { method: "POST" });
    const json = await res.json();
    setFollowLoading(false);
    if (res.ok) {
      setData((d) => ({
        ...d,
        isFollowing: json.following,
        stats: { ...d.stats, followerCount: d.stats.followerCount + (json.following ? 1 : -1) },
      }));
    }
  }

  if (loading && !data) {
    return <div className="flex items-center justify-center" style={{ height: "100%" }}><Loader2 className="animate-spin" size={24} /></div>;
  }
  if (!data) return null;

  const { user, isOwner, isFollowing, stats } = data;
  const tabs = isOwner
    ? [{ id: "posts", label: "Posts" }, { id: "private", label: "Private" }, { id: "favorites", label: "Favorites" }, { id: "liked", label: "Liked" }]
    : [{ id: "posts", label: "Posts" }];

  // TikTok-style: Display Name on top, @username (lowercase) underneath
  const displayName = user.displayName || user.username;
  const handle = (user.username || "").toLowerCase();

  return (
    <div className="px-4 pt-6 pb-16" style={{ maxWidth: 480, margin: "0 auto" }}>
      <div className="flex items-center justify-between mb-4">
        {!isOwner ? <div style={{ width: 22 }} /> : <div style={{ width: 22 }} />}
        <span className="text-xs" style={{ color: "var(--text-muted)" }} />
        <div className="flex items-center gap-3">
          <button aria-label="Share profile" style={{ background: "none", border: "none", color: "var(--text)" }}>
            <Share2 size={20} />
          </button>
          {isOwner && (
            <Link href="/settings/feed" aria-label="Feed settings" style={{ color: "var(--text)" }}>
              <SettingsIcon size={20} />
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center text-center mb-4">
        <Avatar user={user} />
        <div className="flex items-center gap-1 mt-3">
          <h1 className="text-lg font-semibold">{displayName}</h1>
          <ChevronDown size={16} style={{ color: "var(--text-muted)" }} />
        </div>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>@{handle}</span>
      </div>

      <div className="flex items-center justify-center gap-8 mb-4">
        <div className="text-center">
          <div className="text-base font-semibold">{stats.followingCount}</div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Following</div>
        </div>
        <div className="text-center">
          <div className="text-base font-semibold">{stats.followerCount}</div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Followers</div>
        </div>
        <div className="text-center">
          <div className="text-base font-semibold">{stats.likeCount}</div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Likes</div>
        </div>
      </div>

      {user.bio && (
        <p className="text-sm text-center mb-4" style={{ color: "var(--text)" }}>{user.bio}</p>
      )}

      <div className="mb-6">
        {isOwner ? (
          <Link href="/profile/edit" className="btn-primary block text-center">Edit profile</Link>
        ) : (
          <button
            onClick={handleFollow}
            disabled={followLoading}
            className="btn-primary w-full"
            style={isFollowing ? { background: "var(--surface-2)", color: "var(--text)" } : undefined}
          >
            {followLoading ? <Loader2 size={15} className="animate-spin" /> : isFollowing ? "Following" : "Follow"}
          </button>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 mb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="text-sm font-medium pb-2"
            style={{
              background: "none", border: "none",
              color: tab === t.id ? "var(--text)" : "var(--text-muted)",
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin" /></div>
      ) : posts.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: "var(--text-muted)" }}>Nothing here yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {posts.map((p) => (
            <div key={p.id} style={{ aspectRatio: "9/16", background: "#111", borderRadius: 6, overflow: "hidden", position: "relative" }}>
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