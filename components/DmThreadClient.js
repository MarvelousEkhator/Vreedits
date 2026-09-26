"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, MoreVertical, Flag, Ban, BellOff, Bell, Trash2, X as XIcon } from "lucide-react";
import BackButton from "@/components/BackButton";

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

function relativeTime(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ThreadMenu({ otherUser, open, onClose, muted, onToggleMute, onBlock, blocking, onReport, onDelete, deleting }) {
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
            <button
              onClick={onToggleMute}
              className="flex items-center gap-3 w-full"
              style={{ padding: "12px 10px", background: "none", border: "none", color: "var(--text)", fontSize: 14, fontWeight: 600, textAlign: "left" }}
            >
              {muted ? <Bell size={17} /> : <BellOff size={17} />}
              {muted ? "Unmute" : "Mute"} {otherUser.displayName || otherUser.username}
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="flex items-center gap-3 w-full"
              style={{ padding: "12px 10px", background: "none", border: "none", color: "var(--text)", fontSize: 14, fontWeight: 600, textAlign: "left" }}
            >
              {deleting ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
              Delete conversation
            </button>
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
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setSending(true);
    setDraft("");
    const res = await fetch(`/api/dm/${otherUsername}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    setSending(false);
    if (res.ok) {
      setMessages((prev) => [...prev, data.message]);
    }
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
    if (!window.confirm("Delete this conversation? It'll be removed from your inbox, but the other person still has their copy.")) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/dm/${otherUsername}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/inbox");
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
        <BackButton fallbackHref="/inbox" />
        <Avatar user={otherUser} size={32} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            {otherUser.displayName || otherUser.username}
            {muted && <BellOff size={12} style={{ color: "var(--text-muted)" }} />}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>{otherUser.online ? "Online" : "Offline"}</div>
        </div>
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="More options"
          style={{ background: "none", border: "none", color: "var(--text-muted)", padding: 6, flexShrink: 0 }}
        >
          <MoreVertical size={19} />
        </button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }} className="p-3">
        {messages.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
            Say hi to {otherUser.displayName || otherUser.username} 👋
          </p>
        )}
        {messages.map((m, i) => {
          const isMine = m.senderId === currentUserId;
          const prev = messages[i - 1];
          const grouped = prev && prev.senderId === m.senderId &&
            (new Date(m.createdAt) - new Date(prev.createdAt)) < 5 * 60 * 1000;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginTop: grouped ? 2 : 10 }}>
              <div
                style={{
                  maxWidth: "75%",
                  padding: "8px 12px",
                  borderRadius: 16,
                  background: isMine ? "var(--accent)" : "var(--surface-2)",
                  color: isMine ? "white" : "var(--text)",
                }}
              >
                <p className="text-sm" style={{ overflowWrap: "anywhere", lineHeight: 1.4 }}>{m.content}</p>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 p-3" style={{ borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <input
          className="input pl-4"
          style={{ flex: 1, borderRadius: 999, height: 46, background: "var(--surface-2)", border: "1px solid var(--border)" }}
          placeholder={`Message @${otherUser.username}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={sending || !draft.trim()}
          style={{
            width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
            background: "var(--accent)", color: "white", border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: sending || !draft.trim() ? 0.5 : 1,
          }}
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>

      <ThreadMenu
        otherUser={otherUser}
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