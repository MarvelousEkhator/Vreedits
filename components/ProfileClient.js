"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import BackButton from "@/components/BackButton";
import { Settings as SettingsIcon, Share2, ChevronDown, Loader2, X, ImageOff, Eye, Heart, MessageCircle, BookOpen, Moon, Brain, Trophy, Crown } from "lucide-react";
import Link from "next/link";

// 1,200 -> 1.2K, 3,400,000 -> 3.4M (same style as the feed counters).
function abbreviateCount(n) {
  const num = Number(n) || 0;
  if (num < 1000) return `${num}`;
  if (num < 1_000_000) return `${(num / 1000).toFixed(num % 1000 >= 100 ? 1 : 0)}K`;
  return `${(num / 1_000_000).toFixed(1)}M`;
}

// Remember which picture files load, so a missing file never leaves a blank gap.
const sheetState = {};
function useSheetOk(file) {
  const [ok, setOk] = useState(file && sheetState[file] !== undefined ? sheetState[file] : null);
  useEffect(() => {
    if (!file) return;
    if (sheetState[file] !== undefined) { setOk(sheetState[file]); return; }
    const im = new Image();
    im.onload = () => { sheetState[file] = true; setOk(true); };
    im.onerror = () => { sheetState[file] = false; setOk(false); };
    im.src = file;
  }, [file]);
  return ok;
}

// Every picture in the shop is one square of a bigger image file (public/*.webp) laid out as a grid.
function spriteBg(sheet, sprite) {
  const col = sprite % sheet.cols, row = Math.floor(sprite / sheet.cols);
  return {
    backgroundImage: `url(${sheet.file})`, backgroundRepeat: "no-repeat",
    backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
    backgroundPosition: `${sheet.cols > 1 ? (col / (sheet.cols - 1)) * 100 : 0}% ${sheet.rows > 1 ? (row / (sheet.rows - 1)) * 100 : 0}%`,
  };
}

// A round photo with a shop frame around it (picture frames, or the older gradient rings).
function FramedAvatar({ frame, size = 48, children }) {
  if (frame && frame.sheet && frame.sprite != null) {
    const fit = Math.max(frame.fit || 0.6, 0.5);
    const O = Math.round(size / fit);
    const m = Math.round((O - size) / 2);
    return (
      <span style={{ position: "relative", display: "inline-flex", width: size, height: size, margin: m, flexShrink: 0 }}>
        {children}
        <span aria-hidden="true" style={{ position: "absolute", left: (size - O) / 2, top: (size - O) / 2, width: O, height: O, pointerEvents: "none", ...spriteBg(frame.sheet, frame.sprite) }} />
      </span>
    );
  }
  if (frame && frame.ring) {
    return <span style={{ display: "inline-flex", padding: 3, borderRadius: "50%", background: frame.ring, flexShrink: 0 }}>{children}</span>;
  }
  return <span style={{ display: "inline-flex", flexShrink: 0 }}>{children}</span>;
}

// Little icons for the badges from the shop.
const BADGE_ICONS = { book: BookOpen, moon: Moon, brain: Brain, trophy: Trophy };

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

// Full-screen view of a post opened from the grid. The picture or video is
// already on screen from the grid; the caption, counts, and the rest of a
// photo carousel are loaded from the server when it opens.
function PostViewer({ post, onClose }) {
  const [details, setDetails] = useState(null);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/feed/${post.id}/details`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json?.post) setDetails(json.post);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [post.id]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const photos = details?.mediaUrls && details.mediaUrls.length > 1 ? details.mediaUrls : null;
  const views = details ? details.viewCount : post.viewCount;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300, background: "#000",
        display: "flex", flexDirection: "column",
      }}
    >
      <div
        className="flex items-center justify-between px-4"
        style={{ minHeight: 56, flexShrink: 0, paddingTop: "var(--safe-t)" }}
      >
        <div className="flex items-center gap-3" style={{ color: "white" }}>
          <div className="flex items-center gap-1.5">
            <Eye size={16} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{abbreviateCount(views)}</span>
          </div>
          {photos && (
            <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.8 }}>
              {slide + 1}/{photos.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.15)",
            border: "none", color: "white", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {photos ? (
          <div
            onScroll={(e) => {
              const el = e.currentTarget;
              setSlide(Math.round(el.scrollLeft / (el.clientWidth || 1)));
            }}
            style={{
              display: "flex", width: "100%", height: "100%", overflowX: "auto",
              scrollSnapType: "x mandatory", scrollbarWidth: "none",
            }}
          >
            {photos.map((src, i) => (
              <div key={i} style={{ flex: "0 0 100%", height: "100%", scrollSnapAlign: "start" }}>
                <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </div>
            ))}
          </div>
        ) : post.mediaUrl ? (
          post.mediaType === "video" ? (
            <video
              src={post.mediaUrl}
              controls
              autoPlay
              loop
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <img src={post.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          )
        ) : (
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>This post isn't available.</p>
        )}
      </div>

      {details && (
        <div
          style={{
            flexShrink: 0, padding: "12px 16px", color: "white",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          }}
        >
          {details.caption && (
            <p className="text-sm mb-2" style={{ overflowWrap: "anywhere", lineHeight: 1.4 }}>
              {details.caption}
            </p>
          )}
          <div className="flex items-center gap-4" style={{ fontSize: 13, fontWeight: 600 }}>
            <span className="flex items-center gap-1.5">
              <Heart size={15} /> {abbreviateCount(details.likeCount)}
            </span>
            <span className="flex items-center gap-1.5">
              <MessageCircle size={15} /> {abbreviateCount(details.commentCount)}
            </span>
          </div>
        </div>
      )}
    </div>
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
          position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "calc(var(--app-h) * 0.75)",
          background: "var(--surface)", borderRadius: "20px 20px 0 0",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.22,1,0.36,1)", zIndex: 201,
          display: "flex", flexDirection: "column", paddingBottom: "var(--safe-b)",
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
  const [likedHintDismissed, setLikedHintDismissed] = useState(false);
  const [viewerPost, setViewerPost] = useState(null);
  const [notice, setNotice] = useState("");
  const [worn, setWorn] = useState({ frame: null, badge: null }); // shop items this person is wearing
  const frameOk = useSheetOk(worn.frame && worn.frame.sheet ? worn.frame.sheet.file : null);
  const plateOk = useSheetOk(worn.nameplate && worn.nameplate.sheet ? worn.nameplate.sheet.file : null);
  const effectOk = useSheetOk(worn.effect && worn.effect.sheet ? worn.effect.sheet.file : null);
  const badgeOk = useSheetOk(worn.badge && worn.badge.sheet ? worn.badge.sheet.file : null);
  const noticeTimerRef = useRef(null);

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

  // The frame and badge this person chose in the shop. Quietly skipped if it can't be loaded.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store?userId=${encodeURIComponent(profileId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j && j.equipped) setWorn(j.equipped); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [profileId]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  function showNotice(text) {
    setNotice(text);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(""), 2200);
  }

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

  // Opens the phone's share sheet; on browsers without one, copies the link.
  async function handleShareProfile() {
    if (!data) return;
    const url = `${window.location.origin}/profile/${profileId}`;
    const name = data.profile.displayName || data.profile.username;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${name} on Vreedits`, url });
      } catch {
        // The person closed the share sheet — nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showNotice("Link copied");
    } catch {
      showNotice("Couldn't copy the link");
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

  // Only the owner, on their own Likes tab, sees the hint that their
  // liked-videos list is currently hidden from everyone else — same
  // moment TikTok shows it, and it links straight to the setting.
  const showLikedHint = tab === "liked" && isOwner && user.hideLikedVideos && !likedHintDismissed;

  const displayName = user.displayName || user.username;
  const handle = (user.username || "").toLowerCase();

  return (
    <div className="pt-6 pb-16" style={{ maxWidth: 480, margin: "0 auto" }}>
      <div className="flex items-center justify-between mb-4 px-4">
        <BackButton fallbackHref="/feed" label="Exit profile" />
        <span className="text-xs" style={{ color: "var(--text-muted)" }} />
        <div className="flex items-center gap-3">
          <button
            onClick={handleShareProfile}
            aria-label="Share profile"
            style={{ background: "none", border: "none", color: "var(--text)" }}
          >
            <Share2 size={22} />
          </button>
          {isOwner && (
            <Link href="/settings/feed" aria-label="Feed settings" style={{ color: "var(--text)" }}>
              <SettingsIcon size={22} />
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center text-center mb-5 px-4" style={{ position: "relative", isolation: "isolate", paddingTop: worn.effect && worn.effect.sheet && effectOk ? 40 : 0 }}>
        {worn.effect && worn.effect.sheet && effectOk && (
          <span aria-hidden="true" style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "min(380px, 100%)", aspectRatio: "1.8", zIndex: -1, pointerEvents: "none", ...spriteBg(worn.effect.sheet, worn.effect.sprite) }} />
        )}
        {worn.frame && (!worn.frame.sheet || frameOk) ? (
          <FramedAvatar frame={worn.frame} size={96}><Avatar user={user} /></FramedAvatar>
        ) : (
          <div style={{ padding: 4, borderRadius: "50%", background: "linear-gradient(135deg, var(--accent), transparent 70%)" }}>
            <Avatar user={user} />
          </div>
        )}

        {worn.nameplate && worn.nameplate.sheet && plateOk ? (
          <div className="mt-2" style={{ position: "relative", width: "min(300px, 94%)", aspectRatio: "2.5", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span aria-hidden="true" style={{ position: "absolute", inset: "18% 8%", borderRadius: 999, background: "rgba(8,5,16,.92)" }} />
            <span aria-hidden="true" style={{ position: "absolute", inset: 0, ...spriteBg(worn.nameplate.sheet, worn.nameplate.sprite) }} />
            <h1 className="text-xl font-bold leading-tight" style={{ position: "relative", fontFamily: "var(--font-display)", color: "#fff", textShadow: "0 1px 3px #000, 0 0 8px #000", maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayName}
            </h1>
          </div>
        ) : (
          <div className="flex items-center gap-1 mt-3">
            <h1 className="text-xl font-bold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
              {displayName}
            </h1>
            {isOwner && <ChevronDown size={18} style={{ color: "var(--text-muted)", marginTop: 2 }} />}
          </div>
        )}

        {worn.premium && (
          <span
            className="flex items-center gap-1 mt-1"
            style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "var(--accent)", color: "#fff" }}
          >
            <Crown size={13} /> Premium
          </span>
        )}

        {worn.badge && worn.badge.sheet && badgeOk && (
          <span title={worn.badge.name} aria-label={worn.badge.name} className="mt-1" style={{ width: 84, height: 84, display: "block", ...spriteBg(worn.badge.sheet, worn.badge.sprite) }} />
        )}

        {worn.badge && (!worn.badge.sheet || badgeOk === false) && (() => {
          const BadgeIcon = BADGE_ICONS[worn.badge.icon];
          return (
            <span
              className="flex items-center gap-1 mt-1"
              style={{
                fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                background: "var(--accent-soft)", color: "var(--accent)",
              }}
            >
              {BadgeIcon && <BadgeIcon size={13} />} {worn.badge.name}
            </span>
          );
        })()}

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

      <div className="flex items-center w-full" style={{ borderBottom: "1px solid var(--border)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="text-sm font-semibold pb-2.5 pt-1 transition-colors"
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

      {showLikedHint && (
        <div
          className="flex items-start justify-between gap-3 mx-1.5 mt-1.5 p-3"
          style={{ background: "var(--surface-2)", borderRadius: 10, fontSize: 13, lineHeight: 1.4 }}
        >
          <p style={{ color: "var(--text-muted)" }}>
            You can make liked videos public in{" "}
            <Link href="/settings/feed" style={{ color: "var(--accent)", fontWeight: 600 }}>
              Privacy settings
            </Link>
          </p>
          <button
            onClick={() => setLikedHintDismissed(true)}
            aria-label="Dismiss"
            style={{ background: "none", border: "none", color: "var(--text-muted)", flexShrink: 0, padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {!posts || posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 px-6 text-center">
          <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 px-1.5 pt-1.5">
          {posts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setViewerPost(p)}
              aria-label="Open post"
              style={{
                aspectRatio: "9/16", position: "relative", overflow: "hidden",
                borderRadius: 10, border: "1px solid var(--border)",
                padding: 0, background: "none", display: "block", width: "100%",
              }}
            >
              <PostThumb post={p} />

              {/* View count, bottom-left, over a soft shadow so it's readable
                  on any picture. */}
              <div
                style={{
                  position: "absolute", left: 0, right: 0, bottom: 0,
                  padding: "14px 6px 5px",
                  background: "linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0))",
                  display: "flex", alignItems: "center", gap: 4,
                  pointerEvents: "none",
                }}
              >
                <Eye size={13} color="white" />
                <span style={{ color: "white", fontSize: 12, fontWeight: 600 }}>
                  {abbreviateCount(p.viewCount)}
                </span>
              </div>
            </button>
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

      {viewerPost && <PostViewer post={viewerPost} onClose={() => setViewerPost(null)} />}

      {notice && (
        <div
          style={{
            position: "fixed", left: "50%", top: "calc(var(--safe-t) + 90px)", transform: "translateX(-50%)", zIndex: 400,
            background: "rgba(0,0,0,0.8)", color: "white", fontSize: 13, fontWeight: 600,
            padding: "8px 16px", borderRadius: 16, pointerEvents: "none",
          }}
        >
          {notice}
        </div>
      )}
    </div>
  );
}
