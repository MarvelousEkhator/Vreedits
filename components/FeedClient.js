"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Heart, MessageCircle, Share2, Bookmark, RotateCw, Plus, X, Send,
  Loader2, Search, User as UserIcon, Download, Trash2, Music2,
  Volume2, VolumeX, Check, Play, Pause, Pin, Languages, Copy, ArrowLeft,
  Star, Globe, Lock, Flag, BellOff, Bell, Mic, Upload, Pencil,
} from "lucide-react";
import CameraCapture from "@/components/CameraCapture";
import GlossIcon from "@/components/GlossIcon";

// Videos are stored inside the database, so keep uploads under this size
// (about 45 million characters of base64, roughly 33 MB of video).
const MAX_MEDIA_CHARS = 45_000_000;

// Sounds you upload are smaller: about 10 MB of audio.
const MAX_SOUND_BYTES = 10 * 1024 * 1024;
const MAX_RECORD_SECONDS = 60;

const SUGGESTED_TAGS = ["#fyp", "#viral", "#trending", "#foryou", "#vreedits", "#school"];

const FEED_TABS = [
  { id: "trending", label: "Trending" },
  { id: "explore", label: "Explore" },
  { id: "school", label: "School" },
  { id: "following", label: "Following" },
  { id: "for-you", label: "For You" },
];

function abbreviateCount(n) {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function soundNameFor(author) {
  return `original sound - ${(author?.username || "").toLowerCase()}`;
}

// mm:ss readout for the video scrubber.
function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
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
          padding: "10px 16px calc(24px + var(--safe-b))",
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
          position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "calc(var(--app-h) * 0.7)",
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
        <form onSubmit={handleSend} className="flex items-center gap-2 p-3" style={{ borderTop: "1px solid var(--border)", paddingBottom: "calc(12px + var(--safe-b))" }}>
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

function PostActionsSheet({ post, open, isOwner, muted, onClose, onDownload, onShare, onDelete, onReport, onToggleMute }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!post) return null;

  const canDownload = isOwner || post.author?.allowDownloads !== false;

  async function submitReport() {
    if (!reason.trim()) return;
    setSubmitting(true);
    const ok = await onReport(post, reason.trim());
    setSubmitting(false);
    if (ok) setDone(true);
  }

  function handleClose() {
    setReportOpen(false);
    setReason("");
    setDone(false);
    onClose();
  }

  const actions = [
    ...(canDownload ? [{ key: "download", label: "Save video", icon: Download, onClick: () => onDownload(post) }] : []),
    { key: "share", label: "Share", icon: Share2, onClick: () => onShare(post) },
    ...(!isOwner
      ? [
          { key: "mute", label: muted ? "Unmute creator" : "Mute creator", icon: muted ? Bell : BellOff, onClick: () => onToggleMute(post) },
          { key: "report", label: "Report", icon: Flag, onClick: () => setReportOpen(true) },
        ]
      : []),
    ...(isOwner ? [{ key: "delete", label: "Delete", icon: Trash2, danger: true, onClick: () => onDelete(post) }] : []),
  ];

  return (
    <>
      <div
        onClick={handleClose}
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
          padding: "10px 16px calc(24px + var(--safe-b))",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)" }} />
        </div>

        {!reportOpen ? (
          <>
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

            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {actions.map((a) => (
                <button
                  key={a.key}
                  onClick={() => { if (a.key !== "report") { a.onClick(); handleClose(); } else { a.onClick(); } }}
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
          </>
        ) : done ? (
          <div className="p-3 text-center">
            <p className="text-sm font-medium mb-3">Thanks — we've received your report.</p>
            <button onClick={handleClose} className="btn-primary" style={{ maxWidth: 140, margin: "0 auto" }}>
              Close
            </button>
          </div>
        ) : (
          <div className="p-2">
            <p className="text-sm font-semibold mb-2">Why are you reporting this post?</p>
            <textarea
              className="input pl-3"
              style={{ minHeight: 70, resize: "vertical", fontSize: 13 }}
              placeholder="Tell us what's wrong…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button onClick={submitReport} disabled={submitting || !reason.trim()} className="btn-primary">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : "Submit Report"}
              </button>
              <button
                onClick={() => setReportOpen(false)}
                className="btn-primary"
                style={{ background: "var(--surface-2)", color: "var(--text)" }}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SoundMarquee({ text, avatarUser }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 6, maxWidth: "100%", width: "fit-content",
        background: "rgba(0,0,0,0.35)", borderRadius: 14, padding: "3px 10px 3px 3px",
      }}
    >
      <div
        style={{
          width: 18, height: 18, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
          animation: "vreedits-sound-spin 4s linear infinite",
        }}
      >
        <Avatar user={avatarUser} size={18} />
      </div>
      <Music2 size={12} color="white" style={{ flexShrink: 0 }} />
      <div style={{ overflow: "hidden", flex: 1, minWidth: 0, maxWidth: 160 }}>
        <div style={{ display: "inline-block", whiteSpace: "nowrap", animation: "vreedits-marquee 9s linear infinite" }}>
          <span style={{ color: "white", fontSize: 12 }}>{text}</span>
          <span style={{ color: "white", fontSize: 12, padding: "0 16px" }}>•</span>
          <span style={{ color: "white", fontSize: 12 }}>{text}</span>
          <span style={{ color: "white", fontSize: 12, padding: "0 16px" }}>•</span>
        </div>
      </div>
      <style>{`
        @keyframes vreedits-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes vreedits-sound-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
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

  // Only the person who made a sound can rename it.
  async function handleRename() {
    if (!data?.sound?.isMine) return;
    const next = window.prompt("Rename this sound", data.sound.name);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === data.sound.name) return;
    try {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "renameSound", soundId: data.sound.id, name: trimmed }),
      });
      const json = await res.json();
      if (res.ok) {
        setData((prev) => (prev ? { ...prev, sound: { ...prev.sound, name: json.name } } : prev));
      }
    } catch {}
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
          minHeight: 56, paddingTop: "var(--safe-t)", borderBottom: "1px solid var(--border)",
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
              <div className="flex items-center gap-2">
                <div className="text-base font-bold" style={{ overflowWrap: "anywhere" }}>{sound.name}</div>
                {sound.isMine && (
                  <button
                    onClick={handleRename}
                    aria-label="Rename sound"
                    style={{ background: "none", border: "none", color: "var(--text-muted)", padding: 4, flexShrink: 0 }}
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </div>
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
            {posts.length === 0 && (
              <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>
                No videos use this sound yet.
              </p>
            )}
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

