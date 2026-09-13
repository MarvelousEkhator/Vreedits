"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Settings, Loader2, Play, Lock, Bookmark, Heart, AlertCircle } from "lucide-react";
import NavShell from "@/components/NavShell";

function Avatar({ user, size = 88 }) {
  if (user?.avatarDataUrl) {
    return <img src={user.avatarDataUrl} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />;
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: "var(--accent-soft)", color: "var(--accent)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 600, fontSize: size * 0.35, fontFamily: "var(--font-display)",
      }}
    >
      {user?.username?.slice(0, 2).toUpperCase() || "?"}
    </div>
  );
}

function PostGrid({ posts, emptyLabel }) {
  if (posts.length === 0) {
    return <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>{emptyLabel}</p>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
      {posts.map((post) => (
        <div
          key={post.id}
          style={{
            position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden",
            background: "var(--surface-2)",
          }}
        >
          {post.mediaUrl ? (
            post.mediaType === "video" ? (
              <video src={post.mediaUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <img src={post.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )
          ) : null}
          {post.mediaType === "video" && (
            <Play size={16} color="white" style={{ position: "absolute", top: 6, right: 6 }} fill="white" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("posts");
  const [savedPosts, setSavedPosts] = useState(null);
  const [likedPosts, setLikedPosts] = useState(null);
  const [tabLoading, setTabLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    setError("");
    try {
      const sessionRes = await fetch("/api/auth/session");
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok || !sessionData?.user?.id) {
        throw new Error("Could not load your session.");
      }
      setUser(sessionData.user);

      const profileRes = await fetch(`/api/users/${sessionData.user.id}`);
      const profileData = await profileRes.json();
      if (!profileRes.ok) {
        throw new Error(profileData.error || "Could not load your profile.");
      }
      setData(profileData);
    } catch (err) {
      setError(err.message || "Something went wrong loading your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  async function handleTabChange(nextTab) {
    setTab(nextTab);
    try {
      if (nextTab === "saved" && savedPosts === null) {
        setTabLoading(true);
        const res = await fetch("/api/feed/saved");
        const json = await res.json();
        setSavedPosts(res.ok ? json.posts || [] : []);
        setTabLoading(false);
      }
      if (nextTab === "liked" && likedPosts === null) {
        setTabLoading(true);
        const res = await fetch("/api/feed/liked");
        const json = await res.json();
        setLikedPosts(res.ok ? json.posts || [] : []);
        setTabLoading(false);
      }
    } catch {
      setTabLoading(false);
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

  if (error || !data) {
    return (
      <NavShell user={user}>
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center gap-2" style={{ color: "var(--text-muted)" }}>
          <AlertCircle size={22} />
          <p className="text-sm">{error || "Could not load your profile."}</p>
        </div>
      </NavShell>
    );
  }

  const { profile, followerCount, followingCount, likeCount, publicPosts, privatePosts } = data;

  // Posts vs Videos split — both come from the same publicPosts array,
  // just filtered client-side by mediaType, so no backend change needed.
  const imagePosts = publicPosts.filter((p) => p.mediaType !== "video");
  const videoPosts = publicPosts.filter((p) => p.mediaType === "video");

  const TABS = [
    { key: "posts", label: "Posts", icon: null },
    { key: "videos", label: "Videos", icon: null },
    { key: "private", label: "Private", icon: Lock },
    { key: "saved", label: "Saved", icon: Bookmark },
    { key: "liked", label: "Liked", icon: Heart },
  ];

  return (
    <NavShell user={user}>
      <div className="min-h-screen flex flex-col items-center px-4 pb-16">
        <div className="w-full max-w-[480px] mt-6">
          <div className="flex items-center justify-end mb-2">
            <Link href="/settings/feed" aria-label="Settings and privacy" style={{ color: "var(--text-muted)" }}>
              <Settings size={22} />
            </Link>
          </div>

          <div className="flex flex-col items-center text-center mb-4">
            <Avatar user={profile} />
            <div className="flex items-center gap-2 mt-3">
              <h1 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                {profile.username}
              </h1>
              <Link href="/profile/edit" className="btn-primary" style={{ padding: "5px 14px", fontSize: 13, width: "auto" }}>
                Edit
              </Link>
            </div>

            <div className="flex items-center gap-6 mt-4">
              <div className="text-center">
                <div className="text-sm font-semibold">{followingCount}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Following</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold">{followerCount}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Followers</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold">{likeCount}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Likes</div>
              </div>
            </div>

            {profile.bio && (
              <p className="text-sm mt-3" style={{ color: "var(--text)", overflowWrap: "anywhere" }}>
                {profile.bio}
              </p>
            )}
          </div>

          <div className="flex items-center justify-around mb-4" style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                className="flex items-center justify-center gap-1.5 py-3"
                style={{
                  flex: 1, background: "none", border: "none",
                  borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
                  color: tab === t.key ? "var(--accent)" : "var(--text-muted)",
                }}
                aria-label={t.label}
              >
                {t.icon ? <t.icon size={16} /> : <span className="text-xs font-semibold">{t.label}</span>}
              </button>
            ))}
          </div>

          {tabLoading ? (
            <div className="flex justify-center py-8" style={{ color: "var(--text-muted)" }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : tab === "posts" ? (
            <PostGrid posts={imagePosts} emptyLabel="No posts yet." />
          ) : tab === "videos" ? (
            <PostGrid posts={videoPosts} emptyLabel="No videos yet." />
          ) : tab === "private" ? (
            <PostGrid posts={privatePosts} emptyLabel="No private posts." />
          ) : tab === "saved" ? (
            <PostGrid posts={savedPosts || []} emptyLabel="Nothing saved yet." />
          ) : (
            <PostGrid posts={likedPosts || []} emptyLabel="No liked posts yet." />
          )}
        </div>
      </div>
    </NavShell>
  );
}
