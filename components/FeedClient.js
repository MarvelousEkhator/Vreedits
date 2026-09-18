"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Heart, MessageCircle, Share2, Bookmark, RotateCw, Plus, X, Send,
  Loader2, Search, User as UserIcon, Download, Trash2, Music2,
  Volume2, VolumeX, Check, Play, Pin, Languages, Copy,
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
    const res = await fetch(`/api/feed/\( {postId}/comments/ \){comment.id}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setTranslating(false);
    if (res.ok) setTranslated(data.translated);
  }

  async function handlePin() {
    const res = await fetch(`/api/feed/\( {postId}/comments/ \){comment.id}/pin`, { method: "POST" });
    const data = await res.json();
    if (res.ok) onPinToggled(comment.id, data.pinned);
  }

  async function handleDelete() {
    const res = await fetch(`/api/feed/\( {postId}/comments/ \){comment.id}`, { method: "DELETE" });
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
                onPinToggled={onPinToggled}
                onDeleted={onDeleted}
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
    await fetch(`/api/feed/\( {postId}/comments/ \){commentId}/like`, { method: "POST" });
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
      />
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
}

// ... (keep the rest of your CreatePostModal and PostCard code exactly as is)

// === ONLY CHANGE THIS PART INSIDE PostCard ===
{/* Bottom-left: display name (top, bold), @username (below, muted), caption */}
<div style={{ position: "absolute", left: 14, right: 90, bottom: 40, zIndex: 2 }}>
  <button
    onClick={(e) => { e.stopPropagation(); onOpenProfile(post.author.id); }}
    className="flex flex-col items-start mb-2"
    style={{ background: "none", border: "none", padding: 0, textAlign: "left" }}
  >
    <span className="text-sm font-semibold" style={{ color: "white", lineHeight: 1.3 }}>
      {post.author.displayName || post.author.username}
    </span>
    <span className="text-xs" style={{ color: "rgba(255,255,255,0.75)", lineHeight: 1.3 }}>
      @{(post.author.username || "").toLowerCase()}
    </span>
  </button>
  {post.caption && (
    <p className="text-sm" style={{ color: "white", overflowWrap: "anywhere", lineHeight: 1.4 }}>
      {post.caption}
    </p>
  )}
</div>