"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Heart, MessageCircle, Share2, Bookmark, RotateCw, Plus, X, Send,
  Loader2, Search, User as UserIcon, Download, Trash2, Music2,
  Volume2, VolumeX, Check,
} from "lucide-react";
import CameraCapture from "@/components/CameraCapture";

function abbreviateCount(n) {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function Avatar({ user, size = 40 }) {
  if (user?.avatarDataUrl) {
    return <img src={user.avatarDataUrl} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />;
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: "var(--accent-soft)", color: "var(--accent)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 600, fontSize: size * 0.4, fontFamily: "var(--font-display)",
      }}
    >
      {user?.username?.slice(0, 2).toUpperCase() || "?"}
    </div>
  );
}

function CommentsSheet({ postId, open, onClose }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/feed/${postId}/comments`)
      .then((r) => r.json())
      .then((data) => setComments(data.comments || []))
      .finally(() => setLoading(false));
  }, [open, postId]);

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    const res = await fetch(`/api/feed/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: input.trim() }),
    });
    const data = await res.json();
    setSending(false);
    if (res.ok) {
      setComments((prev) => [...prev, data.comment]);
      setInput("");
    }
  }

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
          position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "70vh",
          background: "var(--surface)", borderRadius: "20px 20px 0 0",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.22,1,0.36,1)", zIndex: 201,
          display: "flex", flexDirection: "column",
        }}
      >
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold">Comments</h2>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--text-muted)", background: "none", border: "none" }}>
            <X size={18} />
          </button>
        </div>
        <div className="p-3" style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div className="flex justify-center py-8" style={{ color: "var(--text-muted)" }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>No comments yet.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5 mb-3">
                <Avatar user={c.author} size={28} />
                <div>
                  <span className="text-sm font-semibold mr-1.5">{c.author.username}</span>
                  <span className="text-sm" style={{ overflowWrap: "anywhere" }}>{c.content}</span>
                </div>
              </div>
            ))
          )}
        </div>
        <form onSubmit={handleSend} className="flex items-center gap-2 p-3" style={{ borderTop: "1px solid var(--border)" }}>
          <input
            className="input pl-3"
            placeholder="Add a comment…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--accent)", color: "white", opacity: sending || !input.trim() ? 0.6 : 1 }}
            aria-label="Send comment"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </>
  );
}

function PostActionsSheet({ post, open, isOwner, onClose, onDownload, onShare, onDelete }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease", zIndex: 210,
        }}
      />
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0,
          background: "var(--surface)", borderRadius: "20px 20px 0 0",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.22,1,0.36,1)", zIndex: 211,
          padding: 8,
        }}
      >
        <button
          onClick={() => { onDownload(post); onClose(); }}
          className="flex items-center gap-3 w-full text-sm font-medium"
          style={{ padding: "14px 12px", background: "none", border: "none", textAlign: "left" }}
        >
          <Download size={18} /> Download
        </button>
        <button
          onClick={() => { onShare(post); onClose(); }}
          className="flex items-center gap-3 w-full text-sm font-medium"
          style={{ padding: "14px 12px", background: "none", border: "none", textAlign: "left" }}
        >
          <Share2 size={18} /> Share
        </button>
        {isOwner && (
          <button
            onClick={() => { onDelete(post); onClose(); }}
            className="flex items-center gap-3 w-full text-sm font-medium"
            style={{ padding: "14px 12px", background: "none", border: "none", textAlign: "left", color: "var(--danger)" }}
          >
            <Trash2 size={18} /> Delete post
          </button>
        )}
        <button
          onClick={onClose}
          className="w-full text-sm font-medium"
          style={{ padding: "14px 12px", background: "var(--surface-2)", border: "none", borderRadius: 12, marginTop: 6 }}
        >
          Cancel
        </button>
      </div>
    </>
  );
}

function CreatePostModal({ open, onClose, onCreated }) {
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && !media) setCameraOpen(true);
  }, [open, media]);

  function handleCaptured(result) {
    setMedia(result);
    setCameraOpen(false);
  }

  function handleRetake() {
    setMedia(null);
    setCameraOpen(true);
  }

  async function handlePost() {
    if (!caption.trim() && !media) {
      setError("Add a caption or capture something first.");
      return;
    }
    setPosting(true);
    setError("");
    const res = await fetch("/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caption,
        mediaUrl: media?.mediaUrl || null,
        mediaType: media?.mediaType || "image",
      }),
    });
    const data = await res.json();
    setPosting(false);
    if (!res.ok) {
      setError(data.error || "Could not post.");
      return;
    }
    onCreated(data.post);
    setCaption("");
    setMedia(null);
    onClose();
  }

  function handleClose() {
    setCaption("");
    setMedia(null);
    setCameraOpen(false);
    onClose();
  }

  if (!open) return null;

  if (cameraOpen) {
    return <CameraCapture onCapture={handleCaptured} onClose={handleClose} />;
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={handleClose}
    >
      <div
        className="card p-4"
        style={{ width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">New Post</h2>
          <button onClick={handleClose} aria-label="Close" style={{ color: "var(--text-muted)", background: "none", border: "none" }}>
            <X size={18} />
          </button>
        </div>

        {error && <div className="alert alert-error mb-2">{error}</div>}

        {media && (
          <div style={{ position: "relative", marginBottom: 12 }}>
            {media.mediaType === "video" ? (
              <video src={media.mediaUrl} controls style={{ width: "100%", borderRadius: 12, maxHeight: 300, objectFit: "cover" }} />
            ) : (
              <img src={media.mediaUrl} alt="" style={{ width: "100%", borderRadius: 12, maxHeight: 300, objectFit: "cover" }} />
            )}
            <button
              onClick={handleRetake}
              aria-label="Retake"
              style={{
                position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)",
                color: "white", borderRadius: 20, padding: "6px 12px", border: "none",
                display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
              }}
            >
              Retake
            </button>
          </div>
        )}

        <textarea
          className="input pl-3 mb-3"
          style={{ minHeight: 80, resize: "vertical", paddingTop: 10 }}
          placeholder="What's on your mind?"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />

        <button className="btn-primary" onClick={handlePost} disabled={posting}>
          {posting ? <Loader2 size={15} className="animate-spin" /> : "Post"}
        </button>
      </div>
    </div>
  );
}

// Absolute-positioned heart that scales up and fades out, shown briefly
// at the tap location after a double-tap-to-like.
function HeartBurst({ x, y }) {
  return (
    <div
      style={{
        position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)",
        zIndex: 3, pointerEvents: "none", animation: "vreedits-heart-burst 700ms ease-out forwards",
      }}
    >
      <Heart size={90} color="#ff4d67" fill="#ff4d67" />
      <style>{`
        @keyframes vreedits-heart-burst {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
          25% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
          40% { transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  );
}

function PostCard({ post, isOwner, muted, onLike, onSave, onShare, onFollow, onOpenComments, onLongPress, onOpenProfile, registerVideoRef }) {
  const pressTimer = useRef(null);
  const lastTapRef = useRef(0);
  const [burst, setBurst] = useState(null); // { x, y, key } | null

  function startPress() {
    pressTimer.current = setTimeout(() => onLongPress(post), 500);
  }
  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }
  function handleContextMenu(e) {
    e.preventDefault();
    onLongPress(post);
  }

  // Double-tap-to-like: two taps within 300ms on the media area (not the
  // action rail, which has its own buttons) triggers a like (only if not
  // already liked) plus a heart animation at the tap location.
  function handleMediaClick(e) {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 300;
    lastTapRef.current = now;

    if (isDoubleTap) {
      const rect = e.currentTarget.getBoundingClientRect();
      setBurst({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: now });
      setTimeout(() => setBurst((b) => (b?.key === now ? null : b)), 700);
      if (!post.likedByMe) onLike(post);
    }
  }

  return (
    <div
      data-post-id={post.id}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onContextMenu={handleContextMenu}
      onClick={handleMediaClick}
      style={{
        position: "relative", height: "100%", width: "100%", flexShrink: 0,
        scrollSnapAlign: "start", overflow: "hidden", background: "#000",
      }}
    >
      {post.mediaType === "video" && post.mediaUrl ? (
        <video
          ref={(el) => registerVideoRef(post.id, el)}
          src={post.mediaUrl}
          loop
          muted={muted}
          playsInline
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : post.mediaUrl ? (
        <img
          src={post.mediaUrl}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(160deg, var(--accent-soft), var(--surface-2))",
          }}
        />
      )}
      <div
        style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0) 40%)",
        }}
      />

      {burst && <HeartBurst x={burst.x} y={burst.y} />}

      {/* Right-side action rail — TikTok style: avatar+follow, like, comment, save, share, sound disc */}
      <div
        style={{
          position: "absolute", right: 10, bottom: 90, zIndex: 2,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onOpenProfile(post.author.id); }}
          aria-label={`View ${post.author.username}'s profile`}
          style={{ position: "relative", marginBottom: 4, background: "none", border: "none", padding: 0 }}
        >
          <Avatar user={post.author} size={44} />
        </button>
        {!isOwner && (
          <button
            onClick={(e) => { e.stopPropagation(); onFollow(post); }}
            aria-label={post.followedByMe ? `Unfollow ${post.author.username}` : `Follow ${post.author.username}`}
            style={{
              position: "relative", marginTop: -16, marginBottom: 4,
              width: 18, height: 18, borderRadius: "50%",
              background: post.followedByMe ? "var(--surface-2)" : "var(--accent)",
              color: "white", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, border: "2px solid #000", lineHeight: 1, padding: 0,
            }}
          >
            {post.followedByMe ? <Check size={11} /> : "+"}
          </button>
        )}

        <button onClick={(e) => { e.stopPropagation(); onLike(post); }} aria-label="Like" style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <Heart size={30} color="white" fill={post.likedByMe ? "#ff4d67" : "none"} stroke={post.likedByMe ? "#ff4d67" : "white"} />
          <span style={{ color: "white", fontSize: 12, fontWeight: 600 }}>{abbreviateCount(post.likeCount)}</span>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onOpenComments(post); }} aria-label="Comments" style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <MessageCircle size={30} color="white" />
          <span style={{ color: "white", fontSize: 12, fontWeight: 600 }}>{abbreviateCount(post.commentCount)}</span>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onSave(post); }} aria-label="Save" style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <Bookmark size={28} color="white" fill={post.savedByMe ? "white" : "none"} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onShare(post); }} aria-label="Share" style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <Share2 size={28} color="white" />
        </button>

        {/* Decorative sound disc — purely visual, there's no real "sound" entity in the backend to attach */}
        <div
          style={{
            width: 36, height: 36, borderRadius: "50%", overflow: "hidden",
            border: "2px solid rgba(255,255,255,0.8)", marginTop: 4,
            animation: "vreedits-spin 4s linear infinite",
          }}
        >
          {post.mediaType !== "video" && post.mediaUrl ? (
            <img src={post.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Music2 size={14} color="var(--accent)" />
            </div>
          )}
        </div>
        <style>{`@keyframes vreedits-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* Bottom-left: username (clickable), caption */}
      <div style={{ position: "absolute", left: 14, right: 90, bottom: 40, zIndex: 2 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onOpenProfile(post.author.id); }}
          className="flex items-center gap-2.5 mb-2"
          style={{ background: "none", border: "none", padding: 0 }}
        >
          <span className="text-sm font-semibold" style={{ color: "white" }}>{post.author.username}</span>
        </button>
        {post.caption && (
          <p className="text-sm" style={{ color: "white", overflowWrap: "anywhere", lineHeight: 1.4 }}>
            {post.caption}
          </p>
        )}
      </div>
    </div>
  );
}

export default function FeedClient({ user }) {
  const router = useRouter();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [commentsPost, setCommentsPost] = useState(null);
  const [actionsPost, setActionsPost] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [muted, setMuted] = useState(true); // global sound toggle, TikTok-style
  const scrollRef = useRef(null);
  const videoRefsMap = useRef(new Map()); // postId -> <video> element
  const observerRef = useRef(null);

  const loadFeed = useCallback(async (cursor) => {
    const url = cursor ? `/api/feed?cursor=${cursor}` : "/api/feed";
    const res = await fetch(url);
    const data = await res.json();
    if (res.ok) {
      setPosts((prev) => (cursor ? [...prev, ...data.posts] : data.posts));
      setNextCursor(data.nextCursor);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadFeed(null).finally(() => setLoading(false));
  }, [loadFeed]);

  // Registers/unregisters each post's <video> element so the
  // IntersectionObserver below can play only the one centered on screen
  // and pause the rest — without this, every video autoplays at once.
  const registerVideoRef = useCallback((postId, el) => {
    if (el) videoRefsMap.current.set(postId, el);
    else videoRefsMap.current.delete(postId);
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const postId = entry.target.getAttribute("data-post-id");
          const video = videoRefsMap.current.get(postId);
          if (!video) continue;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            video.currentTime = 0;
            video.play().catch(() => {}); // autoplay can be blocked before any user gesture
          } else {
            video.pause();
          }
        }
      },
      { root: container, threshold: [0, 0.6, 1] }
    );

    const cards = container.querySelectorAll("[data-post-id]");
    cards.forEach((card) => observer.observe(card));
    observerRef.current = observer;

    return () => observer.disconnect();
  }, [posts]);

  // Applying the global mute toggle to whichever video is currently playing.
  useEffect(() => {
    videoRefsMap.current.forEach((video) => {
      video.muted = muted;
    });
  }, [muted]);

  async function handleRefresh() {
    setRefreshing(true);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    await loadFeed(null);
    setRefreshing(false);
  }

  async function handleScroll() {
    const el = scrollRef.current;
    if (!el || loadingMore || !nextCursor) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      setLoadingMore(true);
      await loadFeed(nextCursor);
      setLoadingMore(false);
    }
  }

  async function handleLike(post) {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
          : p
      )
    );
    await fetch(`/api/feed/${post.id}/like`, { method: "POST" });
  }

  async function handleSave(post) {
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, savedByMe: !p.savedByMe } : p)));
    await fetch(`/api/feed/${post.id}/save`, { method: "POST" });
  }

  async function handleFollow(post) {
    const authorId = post.author.id;
    const wasFollowing = post.followedByMe;

    // Optimistically flip followedByMe on every post from this author,
    // not just the one that was tapped, so the badge stays consistent
    // if the same author appears more than once in the feed.
    setPosts((prev) =>
      prev.map((p) => (p.author.id === authorId ? { ...p, followedByMe: !wasFollowing } : p))
    );

    const res = await fetch(`/api/users/${authorId}/follow`, { method: "POST" });
    if (!res.ok) {
      // Revert on failure.
      setPosts((prev) =>
        prev.map((p) => (p.author.id === authorId ? { ...p, followedByMe: wasFollowing } : p))
      );
    }
  }

  function handleDownload(post) {
    if (!post.mediaUrl) return;
    const ext = post.mediaType === "video" ? "webm" : "jpg";
    const a = document.createElement("a");
    a.href = post.mediaUrl;
    a.download = `vreedits-${post.id}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleShare(post) {
    const url = `${window.location.origin}/feed/${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${post.author.username}'s post`, url });
      } catch {}
    } else {
      navigator.clipboard.writeText(url);
    }
  }

  async function handleDeletePost(post) {
    const confirmed = window.confirm("Delete this post? This can't be undone.");
    if (!confirmed) return;
    const res = await fetch(`/api/feed/${post.id}`, { method: "DELETE" });
    if (res.ok) {
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    }
  }

  function handlePostCreated(newPost) {
    setPosts((prev) => [newPost, ...prev]);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleOpenProfile(userId) {
    router.push(`/profile/${userId}`);
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
      <div
        className="flex items-center justify-between px-4"
        style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, height: 56,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0))",
        }}
      >
        <Link href="/profile" aria-label="My Profile" style={{ background: "none", border: "none", color: "white" }}>
          <UserIcon size={22} />
        </Link>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute" : "Mute"}
            style={{ background: "none", border: "none", color: "white" }}
          >
            {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
          </button>
          <button aria-label="Search" style={{ background: "none", border: "none", color: "white" }}>
            <Search size={22} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center" style={{ height: "100%", color: "white" }}>
          <Loader2 size={26} className="animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 text-center" style={{ height: "100%", color: "white" }}>
          <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.7)" }}>No posts yet — be the first to share something.</p>
          <button onClick={() => setCreateOpen(true)} className="btn-primary" style={{ maxWidth: 160 }}>
            <Plus size={14} /> Create Post
          </button>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            height: "100%", overflowY: "scroll", scrollSnapType: "y mandatory",
          }}
        >
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isOwner={user?.id === post.author.id}
              muted={muted}
              onLike={handleLike}
              onSave={handleSave}
              onShare={handleShare}
              onFollow={handleFollow}
              onOpenComments={setCommentsPost}
              onLongPress={setActionsPost}
              onOpenProfile={handleOpenProfile}
              registerVideoRef={registerVideoRef}
            />
          ))}
          {loadingMore && (
            <div className="flex items-center justify-center" style={{ height: 60, color: "white" }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}
        </div>
      )}

      <div
        className="flex items-center justify-center gap-3"
        style={{ position: "absolute", bottom: 20, left: 0, right: 0, zIndex: 10 }}
      >
        <button
          onClick={handleRefresh}
          aria-label="Refresh feed"
          className="flex items-center justify-center"
          style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "white" }}
        >
          <RotateCw size={15} className={refreshing ? "animate-spin" : ""} />
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          aria-label="Create post"
          className="flex items-center justify-center"
          style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent)", border: "none", color: "white" }}
        >
          <Plus size={17} />
        </button>
      </div>

      {commentsPost && (
        <CommentsSheet postId={commentsPost.id} open={!!commentsPost} onClose={() => setCommentsPost(null)} />
      )}
      {actionsPost && (
        <PostActionsSheet
          post={actionsPost}
          open={!!actionsPost}
          isOwner={user?.id === actionsPost.author.id}
          onClose={() => setActionsPost(null)}
          onDownload={handleDownload}
          onShare={handleShare}
          onDelete={handleDeletePost}
        />
      )}
      <CreatePostModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handlePostCreated} />
    </div>
  );
}
