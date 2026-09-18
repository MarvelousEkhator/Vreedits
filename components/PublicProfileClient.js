"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Lock, Play, Calendar } from "lucide-react";

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
      {(user?.displayName || user?.username)?.slice(0, 2).toUpperCase() || "?"}
    </div>
  );
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

export default function PublicProfileClient({ userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Could not load this profile.");
          return;
        }
        setData(json);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  async function handleFollow() {
    if (!data) return;
    setFollowLoading(true);
    const res = await fetch(`/api/users/${userId}/follow`, { method: "POST" });
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

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center" style={{ color: "var(--text-muted)" }}>
        <p className="text-sm">{error || "Profile not found."}</p>
      </div>
    );
  }

  const { profile, posts, canViewPosts, isFollowedByMe, followerCount, followingCount, likeCount } = data;

  // TikTok-style: Display Name on top, @username (lowercase) underneath
  const displayName = profile.displayName || profile.username;
  const handle = (profile.username || "").toLowerCase();

  return (
    <div className="min-h-screen flex flex-col items-center px-4 pb-16">
      <div className="w-full max-w-[480px] mt-10">
        <Link href="/feed" className="btn-text inline-flex items-center gap-1.5 mb-4">
          <ArrowLeft size={14} /> Back
        </Link>

        <div className="flex flex-col items-center text-center mb-4">
          <Avatar user={profile} />
          <h1 className="text-lg font-semibold mt-3" style={{ fontFamily: "var(--font-display)" }}>
            {displayName}
          </h1>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>@{handle}</span>
        </div>

        <div className="flex items-center justify-center gap-8 mb-4">
          <div className="text-center">
            <div className="text-base font-semibold">{followingCount}</div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Following</div>
          </div>
          <div className="text-center">
            <div className="text-base font-semibold">{followerCount}</div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Followers</div>
          </div>
          <div className="text-center">
            <div className="text-base font-semibold">{likeCount}</div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Likes</div>
          </div>
        </div>

        {profile.bio && (
          <p className="text-sm text-center mb-3" style={{ color: "var(--text)" }}>{profile.bio}</p>
        )}
        <div className="flex items-center justify-center gap-1.5 mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
          <Calendar size={12} /> Joined {formatDate(profile.createdAt)}
        </div>

        <div className="mb-6">
          <button
            onClick={handleFollow}
            disabled={followLoading}
            className="btn-primary w-full"
            style={isFollowedByMe ? { background: "var(--surface-2)", color: "var(--text)" } : undefined}
          >
            {followLoading ? <Loader2 size={15} className="animate-spin" /> : isFollowedByMe ? "Following" : "Follow"}
          </button>
        </div>

        {!canViewPosts ? (
          <div className="card p-6 flex flex-col items-center text-center" style={{ color: "var(--text-muted)" }}>
            <Lock size={22} className="mb-2" />
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>This account is private</p>
            <p className="text-xs mt-1">Only their followers can see their posts.</p>
          </div>
        ) : posts.length === 0 ? (
          <p className="text-sm text-center" style={{ color: "var(--text-muted)" }}>No posts yet.</p>
        ) : (
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
        )}
      </div>
    </div>
  );
}