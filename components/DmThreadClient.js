"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Send, Loader2, MoreVertical, Flag, Ban, BellOff, Bell, Trash2, X as XIcon,
  Smile, ImagePlus, Pin, PinOff, Copy,
} from "lucide-react";
import EmojiPicker from "@/components/EmojiPicker";
import { TapUser } from "@/components/FramedAvatar";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const LONG_PRESS_MS = 420;

// Pictures, reactions and the pin are stored together in message.attachments.
function extras(m) {
  const a = m && m.attachments;
  if (!a || Array.isArray(a) || typeof a !== "object") return { images: [], reactions: {}, pinned: false };
  return {
    images: Array.isArray(a.images) ? a.images : [],
    reactions: a.reactions && typeof a.reactions === "object" ? a.reactions : {},
    pinned: !!a.pinned,
  };
}

// Shrinks a photo before sending so chats stay fast.
function shrinkImage(file, maxSide = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// The menu that opens when you press and hold a message.
function MessageSheet({ message, mine, onClose, onReact, onPin, onCopy, onDelete }) {
  const [moreEmoji, setMoreEmoji] = useState(false);
  const ex = extras(message);
  const hasText = message.content && !(ex.images.length && message.content === "\u{1F4F7} Photo");
  const row = { padding: "12px 10px", background: "none", border: "none", color: "var(--text)", fontSize: 14.5, fontWeight: 600, textAlign: "left" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200 }} />
      <div className="card" style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 201, padding: 8, maxWidth: 420, margin: "0 auto", maxHeight: "80vh", overflowY: "auto" }}>
        {moreEmoji ? (
          <EmojiPicker height={280} onPickUnicode={(ch) => { onReact(ch); onClose(); }} />
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "8px 4px 10px" }}>
              {QUICK_EMOJIS.map((e) => (
                <button key={e} onClick={() => { onReact(e); onClose(); }} aria-label={`React ${e}`} style={{ fontSize: 27, background: "none", border: "none", padding: 4 }}>
                  {e}
                </button>
              ))}
              <button onClick={() => setMoreEmoji(true)} aria-label="More emojis" style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--surface-2)", color: "var(--text-muted)", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Smile size={18} />
              </button>
            </div>
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 4 }}>
              <button onClick={() => { onPin(); onClose(); }} className="flex items-center gap-3 w-full" style={row}>
                {ex.pinned ? <PinOff size={17} /> : <Pin size={17} />}
                {ex.pinned ? "Unpin message" : "Pin message"}
              </button>
              {hasText && (
                <button onClick={() => { onCopy(); onClose(); }} className="flex items-center gap-3 w-full" style={row}>
                  <Copy size={17} /> Copy text
                </button>
              )}
              {mine && (
                <button onClick={() => { onDelete(); onClose(); }} className="flex items-center gap-3 w-full" style={{ ...row, color: "var(--danger)" }}>
                  <Trash2 size={17} /> Delete message
                </button>
              )}
              <button onClick={onClose} className="flex items-center gap-3 w-full" style={{ ...row, color: "var(--text-muted)", fontWeight: 500 }}>
                <XIcon size={17} /> Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Avatar({ user, size = 32 }) {
  if (user?.avatarDataUrl) {
    return <img src={user.avatarDataUrl} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: size * 0.4 }}>
      {(user?.displayName || user?.username || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

function ThreadMenu({ otherUser, isSelf, open, onClose, muted, onToggleMute, onBlock, blocking, onReport, onDelete, deleting }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!open) return null;

  async function submitReport() {
    if (!reason.trim()) return;
    setSubmitting(true);
    const ok = await onReport(reason.trim());
    setSubmitting(false);
    if (ok) setDone(true);
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200 }}
      />
      <div
        className="card"
        style={{
          position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 201,
          padding: 8, maxWidth: 420, margin: "0 auto",
        }}
      >
        {!reportOpen ? (
          <>
            {!isSelf && (
              <button
                onClick={onToggleMute}
                className="flex items-center gap-3 w-full"
                style={{ padding: "12px 10px", background: "none", border: "none", color: "var(--text)", fontSize: 14, fontWeight: 600, textAlign: "left" }}
              >
                {muted ? <Bell size={17} /> : <BellOff size={17} />}
                {muted ? "Unmute" : "Mute"} {otherUser.displayName || otherUser.username}
              </button>
            )}
            <button
              onClick={onDelete}
              disabled={deleting}
              className="flex items-center gap-3 w-full"
              style={{ padding: "12px 10px", background: "none", border: "none", color: "var(--text)", fontSize: 14, fontWeight: 600, textAlign: "left" }}
            >
              {deleting ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
              {isSelf ? "Clear notes" : "Delete conversation"}
            </button>
            {!isSelf && (
              <>
                <button
                  onClick={() => setReportOpen(true)}
                  className="flex items-center gap-3 w-full"
                  style={{ padding: "12px 10px", background: "none", border: "none", color: "var(--text)", fontSize: 14, fontWeight: 600, textAlign: "left" }}
                >
                  <Flag size={17} />
                  Report {otherUser.displayName || otherUser.username}
                </button>
                <button
                  onClick={onBlock}
                  disabled={blocking}
                  className="flex items-center gap-3 w-full"
                  style={{ padding: "12px 10px", background: "none", border: "none", color: "var(--danger)", fontSize: 14, fontWeight: 600, textAlign: "left" }}
                >
                  {blocking ? <Loader2 size={17} className="animate-spin" /> : <Ban size={17} />}
                  Block {otherUser.displayName || otherUser.username}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="flex items-center gap-3 w-full"
              style={{ padding: "12px 10px", background: "none", border: "none", color: "var(--text-muted)", fontSize: 14, fontWeight: 500, textAlign: "left" }}
            >
              <XIcon size={17} />
              Cancel
            </button>
          </>
        ) : done ? (
          <div className="p-3 text-center">
            <p className="text-sm font-medium mb-3">Thanks — we've received your report.</p>
            <button onClick={onClose} className="btn-primary" style={{ maxWidth: 140, margin: "0 auto" }}>
              Close
            </button>
          </div>
        ) : (
          <div className="p-2">
            <p className="text-sm font-semibold mb-2">Why are you reporting {otherUser.displayName || otherUser.username}?</p>
            <textarea
              className="input pl-3"
              style={{ minHeight: 70, resize: "vertical", fontSize: 13 }}
              placeholder="Tell us what happened…"
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

export default function DmThreadClient({ currentUserId, otherUsername }) {
  const router = useRouter();
  const [otherUser, setOtherUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const pressRef = useRef({ timer: null, x: 0, y: 0 });
  const [sheetMsg, setSheetMsg] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pending, setPending] = useState([]); // photos waiting to be sent
  const [photoError, setPhotoError] = useState("");
  const [viewer, setViewer] = useState(null); // full-screen photo

  const isSelf = otherUser?.id === currentUserId;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const res = await fetch(`/api/dm/${otherUsername}`);
    const data = await res.json();
    if (!res.ok) {
      setLoadError(data.error || "Could not load conversation.");
      setLoading(false);
      return;
    }
    setOtherUser(data.otherUser);
    setMessages(data.messages || []);
    setLoading(false);
  }, [otherUsername]);

  useEffect(() => { load(); }, [load]);

  // Mute has no backend yet (no per-conversation settings table), so it's
  // remembered on this device only, keyed by the other person's username.
  useEffect(() => {
    try {
      setMuted(localStorage.getItem(`vreedits-muted-${otherUsername}`) === "1");
    } catch {}
  }, [otherUsername]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    try {
      if (next) localStorage.setItem(`vreedits-muted-${otherUsername}`, "1");
      else localStorage.removeItem(`vreedits-muted-${otherUsername}`);
    } catch {}
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, pending.length]);

  // Quietly pick up new messages, reactions and pins from the other person.
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible" || sheetMsg) return;
      try {
        const res = await fetch(`/api/dm/${otherUsername}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.messages)) setMessages(data.messages);
      } catch {}
    }, 6000);
    return () => clearInterval(id);
  }, [otherUsername, sheetMsg]);

  async function handleSend(e) {
    e.preventDefault();
    const content = draft.trim();
    if (!content && pending.length === 0) return;
    setSending(true);
    setEmojiOpen(false);
    const images = pending;
    setDraft("");
    setPending([]);
    const res = await fetch(`/api/dm/${otherUsername}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, images }),
    });
    const data = await res.json();
    setSending(false);
    if (res.ok) {
      setMessages((prev) => [...prev, data.message]);
    } else {
      // Put it back so nothing is lost.
      setDraft(content);
      setPending(images);
      setPhotoError(data.error || "Could not send.");
    }
  }

  async function handlePhotos(e) {
    const files = Array.from(e.target.files || []).slice(0, 4 - pending.length);
    e.target.value = "";
    if (files.length === 0) return;
    setPhotoError("");
    try {
      const shrunk = [];
      for (const f of files) {
        if (!f.type.startsWith("image/")) continue;
        shrunk.push(await shrinkImage(f));
      }
      setPending((p) => [...p, ...shrunk].slice(0, 4));
    } catch {
      setPhotoError("Could not read that photo.");
    }
  }

  function insertEmoji(ch) {
    setDraft((d) => d + ch);
  }

  // Press and hold a message (or right-click on a computer).
  function pressStart(m, ev) {
    const t = ev.touches ? ev.touches[0] : ev;
    pressRef.current.x = t.clientX;
    pressRef.current.y = t.clientY;
    clearTimeout(pressRef.current.timer);
    pressRef.current.timer = setTimeout(() => {
      try { navigator.vibrate && navigator.vibrate(12); } catch {}
      setSheetMsg(m);
    }, LONG_PRESS_MS);
  }
  function pressMove(ev) {
    const t = ev.touches ? ev.touches[0] : ev;
    if (Math.abs(t.clientX - pressRef.current.x) > 10 || Math.abs(t.clientY - pressRef.current.y) > 10) {
      clearTimeout(pressRef.current.timer);
    }
  }
  function pressEnd() {
    clearTimeout(pressRef.current.timer);
  }

  async function reactTo(m, emoji) {
    // Show it straight away, then let the server confirm.
    setMessages((prev) => prev.map((x) => {
      if (x.id !== m.id) return x;
      const ex = extras(x);
      const list = Array.isArray(ex.reactions[emoji]) ? [...ex.reactions[emoji]] : [];
      const at = list.indexOf(currentUserId);
      if (at >= 0) list.splice(at, 1); else list.push(currentUserId);
      const reactions = { ...ex.reactions };
      if (list.length) reactions[emoji] = list; else delete reactions[emoji];
      return { ...x, attachments: { ...ex, reactions } };
    }));
    const res = await fetch(`/api/dm/${otherUsername}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: m.id, action: "react", emoji }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.message) setMessages((prev) => prev.map((x) => (x.id === m.id ? data.message : x)));
  }

  async function togglePin(m) {
    const res = await fetch(`/api/dm/${otherUsername}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: m.id, action: "pin" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.message) setMessages((prev) => prev.map((x) => (x.id === m.id ? data.message : x)));
  }

  async function deleteMessage(m) {
    if (!window.confirm("Delete this message for both of you?")) return;
    const res = await fetch(`/api/dm/${otherUsername}?messageId=${m.id}`, { method: "DELETE" });
    if (res.ok) setMessages((prev) => prev.filter((x) => x.id !== m.id));
  }

  function copyText(m) {
    try { navigator.clipboard && navigator.clipboard.writeText(m.content || ""); } catch {}
  }

  function jumpTo(id) {
    const el = scrollRef.current && scrollRef.current.querySelector(`[data-mid="${id}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function handleReport(reason) {
    if (!otherUser) return false;
    const res = await fetch(`/api/users/${otherUser.id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    return res.ok;
  }

  async function handleBlock() {
    if (!otherUser) return;
    if (!window.confirm(`Block ${otherUser.displayName || otherUser.username}? They won't be able to message you, and this ends your friendship.`)) {
      return;
    }
    setBlocking(true);
    try {
      const res = await fetch(`/api/users/${otherUser.id}/block`, { method: "POST" });
      if (res.ok) {
        router.push("/inbox");
      }
    } finally {
      setBlocking(false);
    }
  }

  async function handleDelete() {
    const message = isSelf
      ? "Clear all your notes to self? This can't be undone."
      : "Delete this conversation? It'll be removed from your inbox, but the other person still has their copy.";
    if (!window.confirm(message)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/dm/${otherUsername}`, { method: "DELETE" });
      if (res.ok) {
        if (isSelf) {
          setMessages([]);
          setMenuOpen(false);
        } else {
          router.push("/inbox");
        }
      }
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (loadError || !otherUser) {
    return (
      <div className="text-sm text-center py-10" style={{ color: "var(--danger, #e55)" }}>
        {loadError || "Conversation not found."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="flex items-center gap-3 p-4" style={{ borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <TapUser user={isSelf ? null : otherUser}><Avatar user={otherUser} size={32} /></TapUser>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            {isSelf ? "You" : (otherUser.displayName || otherUser.username)}
            {muted && !isSelf && <BellOff size={12} style={{ color: "var(--text-muted)" }} />}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            {isSelf ? "Notes only you can see" : (otherUser.online ? "Online" : "Offline")}
          </div>
        </div>
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="More options"
          style={{ background: "none", border: "none", color: "var(--text-muted)", padding: 6, flexShrink: 0 }}
        >
          <MoreVertical size={19} />
        </button>
      </div>

      {(() => {
        const pins = messages.filter((m) => extras(m).pinned);
        if (pins.length === 0) return null;
        const last = pins[pins.length - 1];
        const label = last.content === "\u{1F4F7} Photo" ? "\u{1F4F7} Photo" : last.content;
        return (
          <button
            onClick={() => jumpTo(last.id)}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "var(--surface-2)", border: "none", borderBottom: "1px solid var(--border)", color: "var(--text)", textAlign: "left", flexShrink: 0 }}
          >
            <Pin size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{label}</span>
            {pins.length > 1 && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{pins.length} pinned</span>}
          </button>
        );
      })()}

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }} className="p-3">
        {messages.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
            {isSelf ? "Jot down anything you want to remember 📝" : `Say hi to ${otherUser.displayName || otherUser.username} 👋`}
          </p>
        )}
        {messages.map((m, i) => {
          const isMine = m.senderId === currentUserId;
          const prev = messages[i - 1];
          const grouped = prev && prev.senderId === m.senderId &&
            (new Date(m.createdAt) - new Date(prev.createdAt)) < 5 * 60 * 1000;
          const ex = extras(m);
          const photoOnly = ex.images.length > 0 && m.content === "\u{1F4F7} Photo";
          const mineSide = !isSelf && isMine;
          const reactionEntries = Object.entries(ex.reactions).filter(([, ids]) => Array.isArray(ids) && ids.length);
          return (
            <div key={m.id} data-mid={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isSelf ? "flex-start" : (isMine ? "flex-end" : "flex-start"), marginTop: grouped ? 2 : 10 }}>
              <div
                onTouchStart={(ev) => pressStart(m, ev)}
                onTouchMove={pressMove}
                onTouchEnd={pressEnd}
                onTouchCancel={pressEnd}
                onContextMenu={(ev) => { ev.preventDefault(); pressEnd(); setSheetMsg(m); }}
                style={{
                  maxWidth: "75%",
                  padding: photoOnly ? 4 : "8px 12px",
                  borderRadius: 16,
                  background: isSelf ? "var(--surface-2)" : (isMine ? "var(--accent)" : "var(--surface-2)"),
                  color: isSelf ? "var(--text)" : (isMine ? "white" : "var(--text)"),
                  WebkitTouchCallout: "none",
                  WebkitUserSelect: "none",
                  userSelect: "none",
                  outline: ex.pinned ? "1.5px solid var(--accent)" : "none",
                  outlineOffset: 1,
                }}
              >
                {ex.pinned && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, opacity: 0.85, marginBottom: 3, paddingLeft: photoOnly ? 6 : 0 }}>
                    <Pin size={10} /> Pinned
                  </div>
                )}
                {ex.images.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: ex.images.length > 1 ? "1fr 1fr" : "1fr", gap: 3 }}>
                    {ex.images.map((src, k) => (
                      <img
                        key={k}
                        src={src}
                        alt="Photo"
                        onClick={() => setViewer(src)}
                        style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 12, display: "block" }}
                      />
                    ))}
                  </div>
                )}
                {!photoOnly && m.content && (
                  <p className="text-sm" style={{ overflowWrap: "anywhere", lineHeight: 1.4, marginTop: ex.images.length ? 6 : 0 }}>{m.content}</p>
                )}
              </div>
              {reactionEntries.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3, justifyContent: mineSide ? "flex-end" : "flex-start", maxWidth: "75%" }}>
                  {reactionEntries.map(([emoji, ids]) => {
                    const me = ids.includes(currentUserId);
                    return (
                      <button
                        key={emoji}
                        onClick={() => reactTo(m, emoji)}
                        style={{
                          display: "flex", alignItems: "center", gap: 4, padding: "1px 8px", borderRadius: 12, fontSize: 13,
                          border: me ? "1px solid var(--accent)" : "1px solid var(--border)",
                          background: me ? "var(--accent-soft)" : "var(--surface-2)", color: "var(--text)",
                        }}
                      >
                        <span>{emoji}</span><span style={{ fontSize: 11.5 }}>{ids.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {emojiOpen && (
        <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)" }}>
          <EmojiPicker height={250} onPickUnicode={insertEmoji} />
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ display: "flex", gap: 8, padding: "8px 12px 0", flexShrink: 0, overflowX: "auto" }}>
          {pending.map((src, k) => (
            <div key={k} style={{ position: "relative", flexShrink: 0 }}>
              <img src={src} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 12, display: "block" }} />
              <button
                type="button"
                onClick={() => setPending((p) => p.filter((_, j) => j !== k))}
                aria-label="Remove photo"
                style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <XIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {photoError && <p style={{ fontSize: 12, color: "var(--danger, #e55)", padding: "6px 14px 0", flexShrink: 0 }}>{photoError}</p>}

      <form onSubmit={handleSend} className="flex items-center gap-2 p-3" style={{ borderTop: pending.length || emojiOpen ? "none" : "1px solid var(--border)", flexShrink: 0 }}>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handlePhotos} style={{ display: "none" }} />
        <button
          type="button"
          onClick={() => fileRef.current && fileRef.current.click()}
          aria-label="Send a photo"
          style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: "var(--surface-2)", color: "var(--text-muted)", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ImagePlus size={18} />
        </button>
        <button
          type="button"
          onClick={() => setEmojiOpen((v) => !v)}
          aria-label="Emojis"
          style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: emojiOpen ? "var(--accent-soft)" : "var(--surface-2)", color: emojiOpen ? "var(--accent)" : "var(--text-muted)", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Smile size={19} />
        </button>
        <input
          className="input pl-4"
          style={{ flex: 1, minWidth: 0, borderRadius: 999, height: 46, background: "var(--surface-2)", border: "1px solid var(--border)" }}
          placeholder={isSelf ? "Write a note to yourself…" : `Message @${otherUser.username}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={sending || (!draft.trim() && pending.length === 0)}
          style={{
            width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
            background: "var(--accent)", color: "white", border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: sending || (!draft.trim() && pending.length === 0) ? 0.5 : 1,
          }}
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>

      {sheetMsg && (
        <MessageSheet
          message={sheetMsg}
          mine={sheetMsg.senderId === currentUserId}
          onClose={() => setSheetMsg(null)}
          onReact={(emoji) => reactTo(sheetMsg, emoji)}
          onPin={() => togglePin(sheetMsg)}
          onCopy={() => copyText(sheetMsg)}
          onDelete={() => deleteMessage(sheetMsg)}
        />
      )}

      {viewer && (
        <div onClick={() => setViewer(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <img src={viewer} alt="Photo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
          <button onClick={() => setViewer(null)} aria-label="Close" style={{ position: "absolute", top: 14, right: 14, width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <XIcon size={20} />
          </button>
        </div>
      )}

      <ThreadMenu
        otherUser={otherUser}
        isSelf={isSelf}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        muted={muted}
        onToggleMute={toggleMute}
        onBlock={handleBlock}
        blocking={blocking}
        onReport={handleReport}
        onDelete={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}