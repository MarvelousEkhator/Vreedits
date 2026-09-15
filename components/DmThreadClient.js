"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Send, Loader2 } from "lucide-react";

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

export default function DmThreadClient({ currentUserId, otherUsername }) {
  const router = useRouter();
  const [otherUser, setOtherUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
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
        <button onClick={() => router.push("/inbox")} aria-label="Back" style={{ background: "none", border: "none", color: "var(--text)" }}>
          <ChevronLeft size={22} />
        </button>
        <Avatar user={otherUser} size={32} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="text-sm font-semibold">{otherUser.displayName || otherUser.username}</div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>{otherUser.online ? "Online" : "Offline"}</div>
        </div>
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
    </div>
  );
}