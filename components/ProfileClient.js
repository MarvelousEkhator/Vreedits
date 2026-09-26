"use client";
import { useState, useEffect, useCallback } from "react";
import BackButton from "@/components/BackButton";
import { Settings as SettingsIcon, Share2, ChevronDown, Loader2, X, ImageOff } from "lucide-react";
import Link from "next/link";

function Avatar({ user, size = 96 }) {
  const [failed, setFailed] = useState(false);

  if (user?.avatarDataUrl && !failed) {
    return (
      <img
        src={user.avatarDataUrl}
        alt=""
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }}
      />
    );
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

// Grid thumbnail: falls back to a neutral "media unavailable" tile instead
// of a raw broken-image icon or whatever a corrupted source happens to render.
function PostThumb({ post }) {
  const [failed, setFailed] = useState(false);

  if (failed || !post.mediaUrl) {
    return (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center",
          justifyContent: "center", background: "var(--surface-2)", color: "var(--text-muted)",
        }}
      >
        <ImageOff size={22} />
      </div>
    );
  }

  return post.mediaType === "video" ? (
    <video
      src={post.mediaUrl}
      muted
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  ) : (
    <img
      src={post.mediaUrl}
      alt=""
      onError={() => setFailed(true)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}

function UserListSheet({ title, open, onClose, users, loading, error }) {
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
              <div key={u.id} className="flex items-center gap-2.5 py-2">
                <Avatar user={u} size={36} />
                <div>
                  <div className="text-sm font-medium">{u.displayName || u.username}</div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>@{u.username}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default function ProfileClient({ profileId }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("posts");
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);

  const [sheet, setSheet] = useState(null); // "following" | "followers" | null
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [sheetUsers, setSheetUsers] = useState([]);

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

  async function openSheet(type) {
    setSheet(type);
    setSheetError("");
    setSheetLoading(true);
    setSheetUsers([]);
    try {
      const endpoint = type === "following" ? "following-list" : "followers-list";
      const res = await fetch(`/api/users/${profileId}/${endpoint}`);
      const json = await res.json();
      if (res.ok) setSheetUsers(type === "following" ? json.following : json.followers);
      else setSheetError(json.error || "Could not load.");
    } catch {
      setSheetError("Network error.");
    } finally {
      setSheetLoading(false);
    }
  }

  if (loading && !data) {
    return <div className="flex items-center justify-center" style={{ height: "100%" }}><Loader2 className="animate-spin" size={24} /></div>;
  }
  if (!data) return null;

  const {
    profile: user, isOwner, isFollowedByMe, followerCount, followingCount, likeCount,
    publicPosts, privatePosts, savedPosts, likedPosts, likedVisible,
  } = data;

  const tabs = [
    { id: "posts", label: "Posts" },
    ...(isOwner ? [{ id: "private", label: "Private" }] : []),
    ...(isOwner ? [{ id: "saved", label: "Favorites" }] : []),
    ...(likedVisible ? [{ id: "liked", label: "Likes" }] : []),
  ];

  const postsByTab = {
    posts: publicPosts,
    private: privatePosts,
    saved: savedPosts,
    liked: likedPosts,
  };
  const posts = postsByTab[tab] || [];

  const emptyMessage = {
    posts: "Nothing here yet.",
    private: "No private posts yet.",
    saved: "Nothing saved yet — tap the bookmark icon on a post to save it here.",
    liked: isOwner ? "Videos you like will show up here." : "No liked videos to show.",
  }[tab];

  const displayName = user.displayName || user.username;
  const handle = (user.username || "").toLowerCase();

  return (
    <div className="pt-6 pb-16" style={{ maxWidth: 480, margin: "0 auto" }}>
      <div className="flex items-center justify-between mb-4 px-4">
        <BackButton fallbackHref="/feed" label="Exit profile" />
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

      <div className="flex flex-col items-center text-center mb-5 px-4">
        <div
          style={{
            padding: 4, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--accent), transparent 70%)",
          }}
        >
          <Avatar user={user} />
        </div>

        <div className="flex items-center gap-1 mt-3">
          <h1 className="text-xl font-bold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            {displayName}
          </h1>
          {isOwner && <ChevronDown size={18} style={{ color: "var(--text-muted)", marginTop: 2 }} />}
        </div>

        <span className="text-sm font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          @{handle}
        </span>
      </div>

      <div
        className="flex items-center justify-center gap-8 mb-5 mx-4 py-3"
        style={{
          background: "var(--glass)", border: "1px solid var(--border)", borderRadius: 16,
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <button onClick={() => openSheet("following")} className="text-center flex flex-col items-center" style={{ background: "none", border: "none" }}>
          <div className="text-lg font-bold">{followingCount}</div>
          <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Following</div>
        </button>
        <button onClick={() => openSheet("followers")} className="text-center flex flex-col items-center" style={{ background: "none", border: "none" }}>
          <div className="text-lg font-bold">{followerCount}</div>
          <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Followers</div>
        </button>
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

      <div className="flex items-center w-full mb-1" style={{ borderBottom: "1px solid var(--border)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="text-sm font-semibold pb-3 pt-1 transition-colors"
            style={{
              background: "none", border: "none", flex: 1,
              color: tab === t.id ? "var(--accent)" : "var(--text-muted)",
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!posts || posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 px-1.5">
          {posts.map((p) => (
            <div
              key={p.id}
              style={{
                aspectRatio: "9/16", position: "relative", overflow: "hidden",
                borderRadius: 10, border: "1px solid var(--border)",
              }}
            >
              <PostThumb post={p} />
            </div>
          ))}
        </div>
      )}

      <UserListSheet
        title={sheet === "following" ? "Following" : "Followers"}
        open={!!sheet}
        onClose={() => setSheet(null)}
        users={sheetUsers}
        loading={sheetLoading}
        error={sheetError}
      />
    </div>
  );
}