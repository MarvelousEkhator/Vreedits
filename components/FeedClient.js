"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Heart, MessageCircle, Share2, Bookmark, RotateCw, Plus, X, Send,
  Loader2, Search, User as UserIcon, Download, Trash2, Music2,
  Volume2, VolumeX, Check, Play, Pause, Pin, Languages, Copy, ArrowLeft,
  Star, Globe, Lock,
} from "lucide-react";
import CameraCapture from "@/components/CameraCapture";

// Videos are stored inside the database, so keep uploads under this size
// (about 45 million characters of base64, roughly 33 MB of video).
const MAX_MEDIA_CHARS = 45_000_000;

const SUGGESTED_TAGS = ["#fyp", "#viral", "#trending", "#foryou", "#vreedits", "#school"];

function abbreviateCount(n) {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function soundNameFor(author) {
  return `original sound - ${(author?.username || "").toLowerCase()}`;
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
      {(user?.displayName || user?.username)?.slice(0, 2).toUpperCase() || "?"}
    </div>
  );
}

function CommentActionsSheet({ comment, open, canPin, canDelete, onClose, onCopy, onTranslate, onPin, onDelete }) {
  if (!comment) return null;

  const actions = [
    { key: "copy", label: "Copy", icon: Copy, onClick: onCopy },
    { key: "translate", label: "Translate", icon: Languages, onClick: onTranslate },
    ...(canPin ? [{ key: "pin", label: comment.pinned ? "Unpin" : "Pin", icon: Pin, onClick: onPin }] : []),
    ...(canDelete ? [{ key: "delete", label: "Delete", icon: Trash2, danger: true, onClick: onDelete }] : []),
  ];

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease", zIndex: 220,
        }}
      />
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0,
          background: "var(--surface)", borderRadius: "20px 20px 0 0",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.22,1,0.36,1)", zIndex: 221,
          padding: "10px 16px 24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)" }} />
        </div>
        {actions.map((a) => (
          <button
            key={a.key}
            onClick={() => { a.onClick(); onClose(); }}
            className="flex items-center gap-3 w-full text-sm font-medium"
            style={{ padding: "14px 4px", background: "none", border: "none", textAlign: "left", color: a.danger ? "var(--danger, #e55)" : "var(--text)" }}
          >
            <a.icon size={18} /> {a.label}
          </button>
        ))}
      </div>
    </>
  );
}

function CommentRow({ comment, postId, isReply, isPostOwner, currentUserId, onLike, onReplySubmitted, onPinToggled, onDeleted }) {
  const [replying, setReplying] = useState(false);
  const [replyInput, setReplyInput] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [translated, setTranslated] = useState(null);
  const [translating, setTranslating] = useState(false);
  const pressTimer = useRef(null);

  function startPress() {
    pressTimer.current = setTimeout(() => setActionsOpen(true), 500);
  }
  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }

  async function handleReplySend(e) {
    e.preventDefault();
    if (!replyInput.trim() || sendingReply) return;
    setSendingReply(true);
    const res = await fetch(`/api/feed/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: replyInput.trim(), parentId: comment.id }),
    });
    const data = await res.json();
    setSendingReply(false);
    if (res.ok) {
      onReplySubmitted(comment.id, data.comment);
      setReplyInput("");
      setReplying(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(comment.content);
  }

  async function handleTranslate() {
    if (translated) { setTranslated(null); return; }
    setTranslating(true);
    const res = await fetch(`/api/feed/${postId}/comments/${comment.id}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setTranslating(false);
    if (res.ok) setTranslated(data.translated);
  }

  async function handlePin() {
    const res = await fetch(`/api/feed/${postId}/comments/${comment.id}/pin`, { method: "POST" });
    const data = await res.json();
    if (res.ok) onPinToggled(comment.id, data.pinned);
  }

  async function handleDelete() {
    const res = await fetch(`/api/feed/${postId}/comments/${comment.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(comment.id, isReply);
  }

  const canPin = isPostOwner && !isReply;
  const canDelete = isPostOwner || comment.author.id === currentUserId;

  return (
    <div
      className="flex items-start gap-2.5 mb-3"
      style={{ marginLeft: isReply ? 36 : 0 }}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onContextMenu={(e) => { e.preventDefault(); setActionsOpen(true); }}
    >
      <Avatar user={comment.author} size={isReply ? 24 : 28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {comment.pinned && (
          <div className="flex items-center gap-1 mb-1" style={{ color: "var(--text-muted)" }}>
            <Pin size={11} />
            <span className="text-xs font-semibold">Pinned by creator</span>
          </div>
        )}
        <div>
          <span className="text-sm font-semibold mr-1.5">{comment.author.displayName || comment.author.username}</span>
          <span className="text-sm" style={{ overflowWrap: "anywhere" }}>
            {translated || comment.content}
          </span>
        </div>

        {translating && (
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Translating…</div>
        )}
        {translated && !translating && (
          <button onClick={() => setTranslated(null)} className="text-xs font-medium mt-1" style={{ background: "none", border: "none", color: "var(--text-muted)" }}>
            See original
          </button>
        )}

        <div className="flex items-center gap-3 mt-1">
          {!isReply && (
            <button onClick={() => setReplying((r) => !r)} className="text-xs font-medium" style={{ background: "none", border: "none", color: "var(--text-muted)" }}>
              Reply
            </button>
          )}
        </div>

        {replying && (
          <form onSubmit={handleReplySend} className="flex items-center gap-2 mt-2">
            <input
              className="input pl-3"
              style={{ fontSize: 13, padding: "6px 10px" }}
              placeholder={`Reply to ${comment.author.displayName || comment.author.username}…`}
              value={replyInput}
              onChange={(e) => setReplyInput(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              disabled={sendingReply || !replyInput.trim()}
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--accent)", color: "white", opacity: sendingReply || !replyInput.trim() ? 0.6 : 1 }}
              aria-label="Send reply"
            >
              <Send size={13} />
            </button>
          </form>
        )}

        {!isReply && comment.replies?.length > 0 && (
          <div className="mt-3">
            {comment.replies.map((r) => (
              <CommentRow
                key={r.id}
                comment={r}
                postId={postId}
                isReply
                isPostOwner={isPostOwner}
                currentUserId={currentUserId}
                onLike={onLike}
                onReplySubmitted={onReplySubmitted}
                onPinToggled={onDeleted}
              />
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => onLike(comment.id, isReply, comment.likedByMe)}
        className="flex flex-col items-center gap-0.5 flex-shrink-0"
        style={{ background: "none", border: "none", paddingTop: 2 }}
        aria-label="Like comment"
      >
        <Heart size={14} color={comment.likedByMe ? "#ff4d67" : "var(--text-muted)"} fill={comment.likedByMe ? "#ff4d67" : "none"} />
        {comment.likeCount > 0 && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{comment.likeCount}</span>
        )}
      </button>

      <CommentActionsSheet
        comment={comment}
        open={actionsOpen}
        canPin={canPin}
        canDelete={canDelete}
        onClose={() => setActionsOpen(false)}
        onCopy={handleCopy}
        onTranslate={handleTranslate}
        onPin={handlePin}
        onDelete={handleDelete}
      />
    </div>
  );
}

function CommentsSheet({ postId, postAuthorId, currentUserId, open, onClose }) {
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

  async function handleLikeComment(commentId, isReply, currentlyLiked) {
    setComments((prev) =>
      prev.map((c) => {
        if (!isReply && c.id === commentId) {
          return { ...c, likedByMe: !currentlyLiked, likeCount: c.likeCount + (currentlyLiked ? -1 : 1) };
        }
        if (isReply && c.replies?.some((r) => r.id === commentId)) {
          return {
            ...c,
            replies: c.replies.map((r) =>
              r.id === commentId ? { ...r, likedByMe: !currentlyLiked, likeCount: r.likeCount + (currentlyLiked ? -1 : 1) } : r
            ),
          };
        }
        return c;
      })
    );
    await fetch(`/api/feed/${postId}/comments/${commentId}/like`, { method: "POST" });
  }

  function handleReplySubmitted(parentId, newReply) {
    setComments((prev) => prev.map((c) => (c.id === parentId ? { ...c, replies: [...(c.replies || []), newReply] } : c)));
  }

  function handlePinToggled(commentId, nowPinned) {
    setComments((prev) => {
      const updated = prev.map((c) => ({
        ...c,
        pinned: c.id === commentId ? nowPinned : nowPinned ? false : c.pinned,
      }));
      return [...updated].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    });
  }

  function handleDeleted(commentId, isReply) {
    setComments((prev) => {
      if (!isReply) return prev.filter((c) => c.id !== commentId);
      return prev.map((c) => ({ ...c, replies: c.replies?.filter((r) => r.id !== commentId) }));
    });
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
              <CommentRow
                key={c.id}
                comment={c}
                postId={postId}
                isPostOwner={postAuthorId === currentUserId}
                currentUserId={currentUserId}
                onLike={handleLikeComment}
                onReplySubmitted={handleReplySubmitted}
                onPinToggled={handlePinToggled}
                onDeleted={handleDeleted}
              />
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
  if (!post) return null;

  const actions = [
    { key: "download", label: "Save video", icon: Download, onClick: () => onDownload(post) },
    { key: "share", label: "Share", icon: Share2, onClick: () => onShare(post) },
    ...(isOwner ? [{ key: "delete", label: "Delete", icon: Trash2, danger: true, onClick: () => onDelete(post) }] : []),
  ];

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease", zIndex: 210,
        }}
      >
      </div>
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0,
          background: "var(--surface)", borderRadius: "20px 20px 0 0",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.22,1,0.36,1)", zIndex: 211,
          padding: "10px 16px 24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)" }} />
        </div>

        <div className="flex items-center gap-3 mb-5">
          <div style={{ width: 44, height: 60, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#000" }}>
            {post.mediaUrl ? (
              post.mediaType === "video" ? (
                <video src={post.mediaUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <img src={post.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )
            ) : null}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="text-sm font-semibold" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {post.author.displayName || post.author.username}
            </div>
            {post.caption && (
              <div className="text-xs" style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {post.caption}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          {actions.map((a) => (
            <button
              key={a.key}
              onClick={() => { a.onClick(); onClose(); }}
              className="flex flex-col items-center gap-1.5"
              style={{ background: "none", border: "none", width: 64 }}
            >
              <div
                className="flex items-center justify-center"
                style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "var(--surface-2)",
                  color: a.danger ? "var(--danger, #e55)" : "var(--text)",
                }}
              >
                <a.icon size={20} />
              </div>
              <span className="text-xs" style={{ color: a.danger ? "var(--danger, #e55)" : "var(--text-muted)" }}>
                {a.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}function SoundMarquee({ text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "100%" }}>
      <Music2 size={13} color="white" style={{ flexShrink: 0 }} />
      <div style={{ overflow: "hidden", flex: 1, minWidth: 0 }}>
        <div style={{ display: "inline-block", whiteSpace: "nowrap", animation: "vreedits-marquee 9s linear infinite" }}>
          <span style={{ color: "white", fontSize: 13 }}>{text}</span>
          <span style={{ color: "white", fontSize: 13, padding: "0 20px" }}>•</span>
          <span style={{ color: "white", fontSize: 13 }}>{text}</span>
          <span style={{ color: "white", fontSize: 13, padding: "0 20px" }}>•</span>
        </div>
      </div>
      <style>{`@keyframes vreedits-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </div>
  );
}

function SoundSheet({ soundId, onClose, onOpenProfile, onUseSound }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [favorited, setFavorited] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioElRef = useRef(null);

  const setAudioEl = useCallback((el) => {
    if (el) audioElRef.current = el;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/feed?sound=${encodeURIComponent(soundId)}`)
      .then(async (r) => {
        const json = await r.json();
        if (cancelled) return;
        if (r.ok && json.sound) {
          setData(json);
          setFavorited(!!json.sound.favorited);
        } else {
          setError(json.error || "This sound isn't available.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this sound.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      try { audioElRef.current?.pause(); } catch {}
    };
  }, [soundId]);

  function togglePlay() {
    const v = audioElRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  async function toggleFavorite() {
    if (!data || favBusy) return;
    const previous = favorited;
    setFavBusy(true);
    setFavorited(!previous);
    try {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggleFavoriteSound", soundId: data.sound.id }),
      });
      const json = await res.json();
      if (res.ok) setFavorited(!!json.favorited);
      else setFavorited(previous);
    } catch {
      setFavorited(previous);
    }
    setFavBusy(false);
  }

  function handleClose() {
    try { audioElRef.current?.pause(); } catch {}
    onClose();
  }

  function handleUse() {
    if (!data) return;
    try { audioElRef.current?.pause(); } catch {}
    onUseSound({ id: data.sound.id, name: data.sound.name, mediaUrl: data.sound.mediaUrl });
  }

  const sound = data?.sound;
  const posts = data?.posts || [];
  const handle = (sound?.author?.username || "").toLowerCase();
  const authorName = sound?.author?.displayName || sound?.author?.username;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 260,
        background: "var(--surface)", color: "var(--text)", overflowY: "auto",
      }}
    >
      <div
        className="flex items-center gap-3 px-4"
        style={{
          height: 56, borderBottom: "1px solid var(--border)",
          position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
        }}
      >
        <button onClick={handleClose} aria-label="Back" style={{ background: "none", border: "none", color: "var(--text)" }}>
          <ArrowLeft size={22} />
        </button>
        <h2 className="text-sm font-semibold">Sound</h2>
      </div>

      {loading && (
        <div className="flex justify-center py-16" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-center py-16 px-6" style={{ color: "var(--text-muted)" }}>{error}</p>
      )}

      {!loading && sound && (
        <>
          <div className="flex items-center gap-4 p-4">
            <button
              onClick={togglePlay}
              aria-label={playing ? "Pause sound" : "Play sound"}
              style={{
                position: "relative", width: 110, height: 110, borderRadius: 16,
                overflow: "hidden", border: "none", padding: 0, flexShrink: 0,
                background: "var(--surface-2)",
              }}
            >
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Avatar user={sound.author} size={88} />
              </div>
              <div
                style={{
                  position: "absolute", inset: 0, display: "flex",
                  alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)",
                }}
              >
                {playing ? (
                  <Pause size={30} color="white" fill="white" />
                ) : (
                  <Play size={30} color="white" fill="white" style={{ marginLeft: 3 }} />
                )}
              </div>
            </button>

            <div style={{ minWidth: 0 }}>
              <div className="text-base font-bold" style={{ overflowWrap: "anywhere" }}>{sound.name}</div>
              <button
                onClick={() => onOpenProfile(sound.author.id)}
                className="text-sm"
                style={{ background: "none", border: "none", padding: 0, color: "var(--text-muted)", textAlign: "left" }}
              >
                {authorName} · @{handle}
              </button>
              <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                {sound.count} {sound.count === 1 ? "video" : "videos"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 mb-5">
            <button className="btn-primary" onClick={handleUse} style={{ flex: 1 }}>
              <Music2 size={15} /> Use this sound
            </button>
            <button
              onClick={toggleFavorite}
              disabled={favBusy}
              aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
              className="flex items-center gap-1.5 text-sm font-semibold"
              style={{
                background: "var(--surface-2)", border: "1px solid var(--border)",
                color: favorited ? "#ffc83d" : "var(--text)", borderRadius: 12,
                padding: "0 14px", height: 44, flexShrink: 0,
              }}
            >
              <Star size={17} fill={favorited ? "#ffc83d" : "none"} color={favorited ? "#ffc83d" : "currentColor"} />
              {favorited ? "Favorited" : "Favorite"}
            </button>
          </div>

          <div className="px-4 pb-10">
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
              Videos with this sound
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {posts.map((p) => {
                const src = p.isSource ? sound.mediaUrl : p.mediaUrl;
                return (
                  <div
                    key={p.id}
                    style={{
                      position: "relative", aspectRatio: "9/16", borderRadius: 8,
                      overflow: "hidden", background: "#000",
                    }}
                  >
                    {src ? (
                      p.mediaType === "video" ? (
                        <video src={src} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      )
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <video
            ref={setAudioEl}
            src={sound.mediaUrl}
            loop
            playsInline
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          />
        </>
      )}
    </div>
  );
}

function SoundPicker({ onSelect, onClose }) {
  const [sounds, setSounds] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/feed?favoriteSounds=1")
      .then((r) => r.json())
      .then((d) => setSounds(d.sounds || []))
      .catch(() => setSounds([]));
  }, []);

  async function choose(s) {
    if (busyId) return;
    setBusyId(s.id);
    setError("");
    try {
      const res = await fetch(`/api/feed?sound=${encodeURIComponent(s.id)}`);
      const json = await res.json();
      if (res.ok && json.sound?.mediaUrl) {
        onSelect({ id: json.sound.id, name: json.sound.name, mediaUrl: json.sound.mediaUrl });
        return;
      }
      setError("That sound isn't available anymore.");
    } catch {
      setError("Couldn't load that sound.");
    }
    setBusyId(null);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 520,
        background: "var(--surface)", color: "var(--text)",
        display: "flex", flexDirection: "column",
      }}
    >
      <div
        className="flex items-center gap-3 px-4"
        style={{ height: 56, borderBottom: "1px solid var(--border)", flexShrink: 0 }}
      >
        <button onClick={onClose} aria-label="Back" style={{ background: "none", border: "none", color: "var(--text)" }}>
          <ArrowLeft size={22} />
        </button>
        <h2 className="text-sm font-semibold">Favorite sounds</h2>
      </div>

      <div className="p-4" style={{ flex: 1, overflowY: "auto" }}>
        {error && <div className="alert alert-error mb-3">{error}</div>}

        {sounds === null && (
          <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}

        {sounds && sounds.length === 0 && (
          <p className="text-sm text-center py-10" style={{ color: "var(--text-muted)" }}>
            No favorite sounds yet. Tap the sound disc on any video and choose Favorite.
          </p>
        )}

        {sounds && sounds.map((s) => (
          <button
            key={s.id}
            onClick={() => choose(s)}
            className="flex items-center gap-3 w-full"
            style={{ background: "none", border: "none", padding: "8px 0", textAlign: "left", color: "var(--text)" }}
          >
            <Avatar user={s.author} size={46} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="text-sm font-semibold" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                @{(s.author?.username || "").toLowerCase()}
              </div>
            </div>
            {busyId === s.id && <Loader2 size={16} className="animate-spin" />}
          </button>
        ))}
      </div>
    </div>
  );
}function SearchOverlay({ onClose, onOpenProfile, onOpenSound }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [preview, setPreview] = useState(null);
  const [favSounds, setFavSounds] = useState([]);
  const reqIdRef = useRef(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    fetch("/api/feed?favoriteSounds=1")
      .then((r) => r.json())
      .then((d) => setFavSounds(d.sounds || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = query.trim();
    const myReq = ++reqIdRef.current;
    if (!q) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/feed?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (reqIdRef.current !== myReq) return;
        setResults(
          res.ok
            ? { users: data.users || [], posts: data.posts || [] }
            : { users: [], posts: [] }
        );
      } catch {
        if (reqIdRef.current === myReq) setResults({ users: [], posts: [] });
      } finally {
        if (reqIdRef.current === myReq) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const q = query.trim();
  const noResults = results && results.users.length === 0 && results.posts.length === 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 240,
        background: "var(--surface)", color: "var(--text)",
        display: "flex", flexDirection: "column",
      }}
    >
      <div
        className="flex items-center gap-2 px-3"
        style={{ height: 56, borderBottom: "1px solid var(--border)", flexShrink: 0 }}
      >
        <button onClick={onClose} aria-label="Close search" style={{ background: "none", border: "none", color: "var(--text)" }}>
          <ArrowLeft size={22} />
        </button>
        <div style={{ position: "relative", flex: 1 }}>
          <Search
            size={16}
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
          />
          <input
            ref={inputRef}
            className="input"
            style={{ paddingLeft: 36, paddingRight: 34 }}
            placeholder="Search people, videos, #tags"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear"
              style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", color: "var(--text-muted)",
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="p-4" style={{ flex: 1, overflowY: "auto" }}>
        {!q && (
          <>
            <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>
              Search for people, videos, and hashtags.
            </p>
            {favSounds.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
                  Your favorite sounds
                </h3>
                {favSounds.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onOpenSound(s.id)}
                    className="flex items-center gap-3 w-full"
                    style={{ background: "none", border: "none", padding: "8px 0", textAlign: "left", color: "var(--text)" }}
                  >
                    <Avatar user={s.author} size={44} />
                    <div style={{ minWidth: 0 }}>
                      <div className="text-sm font-semibold" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.name}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        @{(s.author?.username || "").toLowerCase()}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {q && loading && (
          <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}

        {q && !loading && noResults && (
          <p className="text-sm text-center py-10" style={{ color: "var(--text-muted)" }}>
            No results found.
          </p>
        )}

        {q && !loading && results?.users.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
              People
            </h3>
            {results.users.map((u) => (
              <button
                key={u.id}
                onClick={() => onOpenProfile(u.id)}
                className="flex items-center gap-3 w-full"
                style={{ background: "none", border: "none", padding: "8px 0", textAlign: "left", color: "var(--text)" }}
              >
                <Avatar user={u} size={44} />
                <div style={{ minWidth: 0 }}>
                  <div
                    className="text-sm font-semibold"
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {u.displayName || u.username}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    @{(u.username || "").toLowerCase()}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {q && !loading && results?.posts.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
              Videos & posts
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {results.posts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreview(p)}
                  style={{
                    position: "relative", aspectRatio: "9/16", borderRadius: 8,
                    overflow: "hidden", background: "var(--surface-2)", border: "none", padding: 0,
                  }}
                >
                  {p.mediaUrl ? (
                    p.mediaType === "video" ? (
                      <video
                        src={p.mediaUrl}
                        muted
                        playsInline
                        preload="metadata"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <img src={p.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )
                  ) : (
                    <div
                      className="text-xs"
                      style={{
                        width: "100%", height: "100%", padding: 8, color: "var(--text)",
                        background: "linear-gradient(160deg, var(--accent-soft), var(--surface-2))",
                        overflow: "hidden", textAlign: "left",
                      }}
                    >
                      {p.caption}
                    </div>
                  )}
                  {p.mediaType === "video" && (
                    <Play size={14} color="white" fill="white" style={{ position: "absolute", top: 6, right: 6 }} />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {preview && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 250, background: "#000",
            display: "flex", flexDirection: "column",
          }}
        >
          <div className="flex items-center justify-between px-4" style={{ height: 56, flexShrink: 0 }}>
            <button
              onClick={() => onOpenProfile(preview.author.id)}
              className="flex items-center gap-2"
              style={{ background: "none", border: "none", color: "white" }}
            >
              <Avatar user={preview.author} size={30} />
              <span className="text-sm font-semibold">{preview.author.displayName || preview.author.username}</span>
            </button>
            <button
              onClick={() => setPreview(null)}
              aria-label="Close preview"
              style={{ background: "none", border: "none", color: "white" }}
            >
              <X size={22} />
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {preview.mediaUrl ? (
              preview.mediaType === "video" ? (
                <video
                  src={preview.mediaUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                <img src={preview.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              )
            ) : (
              <p className="text-base px-6 text-center" style={{ color: "white" }}>{preview.caption}</p>
            )}
          </div>

          {preview.mediaUrl && preview.caption && (
            <p className="text-sm px-4 py-3" style={{ color: "white", overflowWrap: "anywhere" }}>
              {preview.caption}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CreatePostModal({ open, onClose, onCreated, user, initialSound }) {
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState(null);
  const [sound, setSound] = useState(null);
  const [visibility, setVisibility] = useState("everyone");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const captionRef = useRef(null);

  function resetAll() {
    setCaption("");
    setMedia(null);
    setSound(null);
    setVisibility("everyone");
    setCameraOpen(false);
    setPickerOpen(false);
    setPreviewOpen(false);
    setPosting(false);
    setError("");
  }

  useEffect(() => {
    if (open) {
      resetAll();
      setSound(initialSound || null);
      setCameraOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleCaptured(result) {
    setMedia(result);
    setCameraOpen(false);
    if (result.mediaType !== "video") setSound(null);
  }

  function handleRetake() {
    setMedia(null);
    setCameraOpen(true);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  function addToCaption(text, focus) {
    setCaption((prev) => {
      const base = prev && !/\s$/.test(prev) ? prev + " " : prev;
      return (base + text).slice(0, 500);
    });
    if (focus) setTimeout(() => captionRef.current?.focus(), 0);
  }

  function addTag(tag) {
    if (caption.toLowerCase().includes(tag.toLowerCase())) return;
    addToCaption(tag + " ", false);
  }

  async function handlePost() {
    if (posting) return;
    if (!caption.trim() && !media) {
      setError("Add a caption or capture something first.");
      return;
    }
    if (media?.mediaUrl && media.mediaUrl.length > MAX_MEDIA_CHARS) {
      setError("This file is too big. Try a shorter video.");
      return;
    }
    setPosting(true);
    setError("");
    try {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption,
          mediaUrl: media?.mediaUrl || null,
          mediaType: media?.mediaType || "image",
          isPrivate: visibility === "me",
          soundId: media?.mediaType === "video" && sound ? sound.id : undefined,
        }),
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) {
        setError(data.error || "Could not post.");
        setPosting(false);
        return;
      }
      onCreated(data.post);
      resetAll();
      onClose();
    } catch {
      setError("Could not post. Check your connection and try again.");
      setPosting(false);
    }
  }

  if (!open) return null;

  if (cameraOpen) {
    return (
      <>
        <CameraCapture
          onCapture={handleCaptured}
          onClose={handleClose}
          sound={sound}
          onPickSound={() => setPickerOpen(true)}
          onRemoveSound={() => setSound(null)}
        />
        {pickerOpen && (
          <SoundPicker
            onSelect={(s) => { setSound(s); setPickerOpen(false); }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </>
    );
  }

  const coverSrc = media?.thumbUrl || (media?.mediaType === "image" ? media.mediaUrl : null);
  const isVideo = media?.mediaType === "video";
  const handle = (user?.username || "").toLowerCase();
  const soundLabel = sound ? sound.name : `original sound - ${handle}`;

  const chipStyle = {
    background: "var(--surface-2)", border: "none", color: "var(--text)",
    borderRadius: 16, padding: "6px 12px", fontSize: 13, fontWeight: 600,
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300, background: "var(--surface)", color: "var(--text)",
        display: "flex", flexDirection: "column",
      }}
    >
      <div
        className="flex items-center justify-between px-4"
        style={{ height: 56, borderBottom: "1px solid var(--border)", flexShrink: 0 }}
      >
        <button onClick={handleRetake} aria-label="Back to camera" style={{ background: "none", border: "none", color: "var(--text)" }}>
          <ArrowLeft size={22} />
        </button>
        <h2 className="text-base font-semibold">Post</h2>
        <div style={{ width: 22 }} />
      </div>

      <div className="p-4" style={{ flex: 1, overflowY: "auto" }}>
        <div className="flex items-start gap-3 mb-3">
          <textarea
            ref={captionRef}
            className="input pl-3"
            style={{ flex: 1, minHeight: 128, resize: "none", paddingTop: 10 }}
            placeholder="Describe your post, add hashtags, or mention creators"
            maxLength={500}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
          <button
            onClick={() => media && setPreviewOpen(true)}
            aria-label="Preview"
            style={{
              position: "relative", width: 96, height: 128, borderRadius: 10, overflow: "hidden",
              border: "none", padding: 0, flexShrink: 0, background: "#000",
            }}
          >
            {coverSrc ? (
              <img src={coverSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Play size={26} color="white" fill="white" />
              </div>
            )}
            <span
              style={{
                position: "absolute", left: 0, right: 0, bottom: 0, padding: "4px 0",
                background: "rgba(0,0,0,0.55)", color: "white", fontSize: 11, fontWeight: 600, textAlign: "center",
              }}
            >
              Preview
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => addToCaption("#", true)} style={chipStyle}># Hashtags</button>
          <button onClick={() => addToCaption("@", true)} style={chipStyle}>@ Mention</button>
          <span className="text-xs" style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
            {caption.length}/500
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {SUGGESTED_TAGS.map((t) => (
            <button
              key={t}
              onClick={() => addTag(t)}
              style={{
                background: "none", border: "1px solid var(--border)", color: "var(--text-muted)",
                borderRadius: 16, padding: "4px 10px", fontSize: 12, fontWeight: 600,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {isVideo && (
          <div
            className="flex items-center gap-3"
            style={{ padding: "14px 0", borderTop: "1px solid var(--border)" }}
          >
            <Music2 size={18} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div className="text-sm font-semibold">Sound</div>
              <div className="text-xs" style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {soundLabel}
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: "14px 0", borderTop: "1px solid var(--border)" }}>
          <div className="text-sm font-semibold mb-2">Who can watch this video</div>
          <div className="flex gap-2">
            {[
              { id: "everyone", label: "Everyone", icon: Globe },
              { id: "me", label: "Only me", icon: Lock },
            ].map((o) => (
              <button
                key={o.id}
                onClick={() => setVisibility(o.id)}
                className="flex items-center justify-center gap-2 text-sm font-semibold"
                style={{
                  flex: 1, height: 42, borderRadius: 12,
                  border: visibility === o.id ? "2px solid var(--accent)" : "1px solid var(--border)",
                  background: visibility === o.id ? "var(--accent-soft)" : "var(--surface-2)",
                  color: visibility === o.id ? "var(--accent)" : "var(--text)",
                }}
              >
                <o.icon size={15} /> {o.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="alert alert-error mt-2">{error}</div>}
      </div>

      <div
        className="p-4"
        style={{ borderTop: "1px solid var(--border)", flexShrink: 0, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <button className="btn-primary" onClick={handlePost} disabled={posting}>
          {posting ? <Loader2 size={16} className="animate-spin" /> : "Post"}
        </button>
      </div>

      {previewOpen && media && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 310, background: "#000",
            display: "flex", flexDirection: "column",
          }}
        >
          <div className="flex justify-end px-4" style={{ height: 56, alignItems: "center", flexShrink: 0 }}>
            <button
              onClick={() => setPreviewOpen(false)}
              aria-label="Close preview"
              style={{ background: "none", border: "none", color: "white" }}
            >
              <X size={24} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isVideo ? (
              <video
                src={media.mediaUrl}
                controls
                autoPlay
                loop
                playsInline
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <img src={media.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}function HeartBurst({ x, y }) {
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

function PostCard({ post, isOwner, muted, onLike, onSave, onShare, onFollow, onOpenComments, onLongPress, onOpenProfile, onOpenSound, registerVideoRef }) {
  const pressTimer = useRef(null);
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef(null);
  const videoElRef = useRef(null);
  const touchStartRef = useRef(null);
  const [burst, setBurst] = useState(null);
  const [isPaused, setIsPaused] = useState(false);

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

  // Touch handling: long-press opens the actions sheet,
  // a sideways swipe opens the creator's profile.
  function handleTouchStart(e) {
    const t = e.touches[0];
    touchStartRef.current = t ? { x: t.clientX, y: t.clientY } : null;
    startPress();
  }
  function handleTouchMove() {
    cancelPress();
  }
  function handleTouchCancel() {
    touchStartRef.current = null;
    cancelPress();
  }
  function handleTouchEnd(e) {
    cancelPress();
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      clearTimeout(singleTapTimerRef.current);
      onOpenProfile(post.author.id);
    }
  }

  function combinedVideoRef(el) {
    videoElRef.current = el;
    registerVideoRef(post.id, el);
  }

  useEffect(() => {
    const video = videoElRef.current;
    if (!video) return;
    const onPlay = () => setIsPaused(false);
    const onPause = () => setIsPaused(true);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    setIsPaused(video.paused);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [post.mediaType]);

  function togglePlayback() {
    const video = videoElRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function handleMediaClick(e) {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 300;
    lastTapRef.current = now;

    if (isDoubleTap) {
      clearTimeout(singleTapTimerRef.current);
      const rect = e.currentTarget.getBoundingClientRect();
      setBurst({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: now });
      setTimeout(() => setBurst((b) => (b?.key === now ? null : b)), 700);
      if (!post.likedByMe) onLike(post);
    } else if (post.mediaType === "video") {
      singleTapTimerRef.current = setTimeout(() => {
        togglePlayback();
      }, 300);
    }
  }

  const isVideo = post.mediaType === "video" && !!post.mediaUrl;
  // A video made with someone's sound points back to the original post.
  const soundKey = post.soundId || post.id;
  const soundLabel = soundNameFor(post.soundOwner || post.author);

  return (
    <div
      data-post-id={post.id}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchCancel={handleTouchCancel}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onContextMenu={handleContextMenu}
      onClick={handleMediaClick}
      style={{
        position: "relative", height: "100%", width: "100%", flexShrink: 0,
        scrollSnapAlign: "start", overflow: "hidden", background: "#000",
        touchAction: "pan-y",
      }}
    >
      {post.mediaType === "video" && post.mediaUrl ? (
        <video
          ref={combinedVideoRef}
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

      {post.mediaType === "video" && isPaused && (
        <div
          style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            zIndex: 2, width: 68, height: 68, borderRadius: "50%",
            background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Play size={30} color="white" fill="white" style={{ marginLeft: 4 }} />
        </div>
      )}

      <div
        style={{
          position: "absolute", right: 10, bottom: 90, zIndex: 2,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onOpenProfile(post.author.id); }}
          aria-label={`View profile`}
          style={{ position: "relative", marginBottom: 4, background: "none", border: "none", padding: 0 }}
        >
          <Avatar user={post.author} size={44} />
        </button>
        {!isOwner && (
          <button
            onClick={(e) => { e.stopPropagation(); onFollow(post); }}
            aria-label={post.followedByMe ? "Unfollow" : "Follow"}
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

        {isVideo && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenSound(soundKey); }}
            aria-label="Open sound"
            style={{ background: "none", border: "none", padding: 0, marginTop: 4 }}
          >
            <div
              style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "linear-gradient(135deg, #2a2a2a, #000)",
                border: "2px solid rgba(255,255,255,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: "vreedits-spin 5s linear infinite",
                animationPlayState: isPaused ? "paused" : "running",
              }}
            >
              <div style={{ width: 26, height: 26, borderRadius: "50%", overflow: "hidden" }}>
                <Avatar user={post.author} size={26} />
              </div>
            </div>
          </button>
        )}
        <style>{`@keyframes vreedits-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>

      <div style={{ position: "absolute", left: 14, right: 90, bottom: 40, zIndex: 2 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onOpenProfile(post.author.id); }}
          className="flex flex-col items-start mb-1"
          style={{ background: "none", border: "none", padding: 0, textAlign: "left" }}
        >
          <span className="text-base font-bold drop-shadow-md" style={{ color: "white", lineHeight: 1.2 }}>
            {post.author.displayName || post.author.username}
          </span>
        </button>

        {post.caption && (
          <p className="text-sm drop-shadow-md" style={{ color: "white", overflowWrap: "anywhere", lineHeight: 1.4, marginTop: 2 }}>
            {post.caption}
          </p>
        )}

        {isVideo && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenSound(soundKey); }}
            aria-label="Open sound"
            style={{ background: "none", border: "none", padding: 0, marginTop: 8, width: "100%", textAlign: "left" }}
          >
            <SoundMarquee text={soundLabel} />
          </button>
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
  const wasPlayingBeforeActionsRef = useRef(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [useSound, setUseSound] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [muted, setMuted] = useState(true);
  const [activeTab, setActiveTab] = useState("for-you");
  const [searchOpen, setSearchOpen] = useState(false);
  const [soundTarget, setSoundTarget] = useState(null);
  const overlayPausedRef = useRef([]);
  const overlayDepthRef = useRef(0);
  const hasInteractedRef = useRef(false);
  const scrollRef = useRef(null);
  const videoRefsMap = useRef(new Map());
  const observerRef = useRef(null);

  // Browsers only allow sound after a touch, so the first tap anywhere
  // in the feed turns the sound on automatically.
  function handleFirstTouch(e) {
    if (hasInteractedRef.current) return;
    if (e.target.closest && e.target.closest('[aria-label="Unmute"],[aria-label="Mute"]')) return;
    hasInteractedRef.current = true;
    setMuted(false);
  }

  function handleExit() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  function handleLongPress(post) {
    const video = videoRefsMap.current.get(post.id);
    wasPlayingBeforeActionsRef.current = !!video && !video.paused;
    video?.pause();
    setActionsPost(post);
  }

  function handleCloseActionsSheet() {
    const post = actionsPost;
    setActionsPost(null);
    if (post && wasPlayingBeforeActionsRef.current) {
      videoRefsMap.current.get(post.id)?.play().catch(() => {});
    }
  }

  // Pause the feed while a full-screen overlay is open and resume the same
  // videos once every overlay is closed (overlays can stack).
  function pauseFeedVideos() {
    overlayDepthRef.current += 1;
    if (overlayDepthRef.current > 1) return;
    const ids = [];
    videoRefsMap.current.forEach((video, id) => {
      if (!video.paused) {
        ids.push(id);
        video.pause();
      }
    });
    overlayPausedRef.current = ids;
  }

  function resumeFeedVideos() {
    overlayDepthRef.current = Math.max(0, overlayDepthRef.current - 1);
    if (overlayDepthRef.current > 0) return;
    overlayPausedRef.current.forEach((id) => {
      videoRefsMap.current.get(id)?.play().catch(() => {});
    });
    overlayPausedRef.current = [];
  }

  function openSearch() {
    pauseFeedVideos();
    setSearchOpen(true);
  }

  function closeSearch() {
    setSearchOpen(false);
    resumeFeedVideos();
  }

  function openSound(soundId) {
    pauseFeedVideos();
    setSoundTarget(soundId);
  }

  function closeSound() {
    setSoundTarget(null);
    resumeFeedVideos();
  }

  function openCreate() {
    pauseFeedVideos();
    setUseSound(null);
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
    setUseSound(null);
    resumeFeedVideos();
  }

  // "Use this sound" from the sound screen: open the camera with that sound.
  function handleUseSound(sound) {
    pauseFeedVideos();
    setSoundTarget(null);
    resumeFeedVideos();
    if (searchOpen) {
      setSearchOpen(false);
      resumeFeedVideos();
    }
    setUseSound(sound);
    setCreateOpen(true);
  }

  const loadFeed = useCallback(async (cursor, tab) => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    params.set("tab", tab || activeTab);
    const res = await fetch(`/api/feed?${params.toString()}`);
    const data = await res.json();
    if (res.ok) {
      setPosts((prev) => (cursor ? [...prev, ...data.posts] : data.posts));
      setNextCursor(data.nextCursor);
    }
  }, [activeTab]);

  useEffect(() => {
    setLoading(true);
    setPosts([]);
    setNextCursor(null);
    scrollRef.current?.scrollTo({ top: 0 });
    loadFeed(null, activeTab).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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
            if (overlayDepthRef.current > 0) continue;
            video.currentTime = 0;
            video.play().catch(() => {});
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

  useEffect(() => {
    videoRefsMap.current.forEach((video) => {
      video.muted = muted;
    });
  }, [muted]);

  async function handleRefresh() {
    setRefreshing(true);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    await loadFeed(null, activeTab);
    setRefreshing(false);
  }

  async function handleScroll() {
    const el = scrollRef.current;
    if (!el || loadingMore || !nextCursor) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      setLoadingMore(true);
      await loadFeed(nextCursor, activeTab);
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

    setPosts((prev) =>
      prev.map((p) => (p.author.id === authorId ? { ...p, followedByMe: !wasFollowing } : p))
    );

    const res = await fetch(`/api/users/${authorId}/follow`, { method: "POST" });
    if (!res.ok) {
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
    // "Only me" posts live on your profile, not in the public feed.
    if (newPost.isPrivate) return;
    setPosts((prev) => [newPost, ...prev]);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleOpenProfile(userId) {
    router.push(`/profile/${userId}`);
  }

  return (
    <div
      onPointerUpCapture={handleFirstTouch}
      style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}
    >
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0))",
        }}
      >
        <div className="flex items-center justify-between px-4" style={{ height: 56 }}>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExit}
              aria-label="Exit feed"
              style={{ background: "none", border: "none", color: "white" }}
            >
              <ArrowLeft size={22} />
            </button>
            <Link href="/profile" aria-label="My Profile" style={{ background: "none", border: "none", color: "white" }}>
              <UserIcon size={22} />
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Unmute" : "Mute"}
              className="flex items-center gap-1.5"
              style={{ background: "none", border: "none", color: "white" }}
            >
              {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
              {muted && <span style={{ fontSize: 12, fontWeight: 600 }}>Tap to unmute</span>}
            </button>
            <button
              onClick={openSearch}
              aria-label="Search"
              style={{ background: "none", border: "none", color: "white" }}
            >
              <Search size={22} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-5 pb-2">
          {[
            { id: "school", label: "School" },
            { id: "following", label: "Following" },
            { id: "for-you", label: "For You" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                background: "none", border: "none", padding: "4px 0",
                fontSize: 14, fontWeight: activeTab === t.id ? 700 : 500,
                color: activeTab === t.id ? "white" : "rgba(255,255,255,0.6)",
                borderBottom: activeTab === t.id ? "2px solid white" : "2px solid transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center" style={{ height: "100%", color: "white" }}>
          <Loader2 size={26} className="animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 text-center" style={{ height: "100%", color: "white" }}>
          <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.7)" }}>No posts yet — be the first to share something.</p>
          <button onClick={openCreate} className="btn-primary" style={{ maxWidth: 160 }}>
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
              onLongPress={handleLongPress}
              onOpenProfile={handleOpenProfile}
              onOpenSound={openSound}
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
          onClick={openCreate}
          aria-label="Create post"
          className="flex items-center justify-center"
          style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent)", border: "none", color: "white" }}
        >
          <Plus size={17} />
        </button>
      </div>

      {commentsPost && (
        <CommentsSheet
          postId={commentsPost.id}
          postAuthorId={commentsPost.author.id}
          currentUserId={user?.id}
          open={!!commentsPost}
          onClose={() => setCommentsPost(null)}
        />
      )}
      {actionsPost && (
        <PostActionsSheet
          post={actionsPost}
          open={!!actionsPost}
          isOwner={user?.id === actionsPost.author.id}
          onClose={handleCloseActionsSheet}
          onDownload={handleDownload}
          onShare={handleShare}
          onDelete={handleDeletePost}
        />
      )}
      {soundTarget && (
        <SoundSheet
          soundId={soundTarget}
          onClose={closeSound}
          onOpenProfile={handleOpenProfile}
          onUseSound={handleUseSound}
        />
      )}
      {searchOpen && (
        <SearchOverlay onClose={closeSearch} onOpenProfile={handleOpenProfile} onOpenSound={openSound} />
      )}
      <CreatePostModal
        open={createOpen}
        onClose={closeCreate}
        onCreated={handlePostCreated}
        user={user}
        initialSound={useSound}
      />
    </div>
  );
}