"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus, Check, X as XIcon, Loader2, MoreVertical, Ban, Trash2 } from "lucide-react";
import GlossIcon from "@/components/GlossIcon";

function Avatar({ user, size = 44 }) {
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
  if (!dateStr) return "";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function ConversationMenu({ friend, open, onClose, onBlock, blocking }) {
  if (!open) return null;
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
        <button
          onClick={() => onBlock(friend)}
          disabled={blocking}
          className="flex items-center gap-3 w-full"
          style={{ padding: "12px 10px", background: "none", border: "none", color: "var(--danger)", fontSize: 14, fontWeight: 600, textAlign: "left" }}
        >
          {blocking ? <Loader2 size={17} className="animate-spin" /> : <Ban size={17} />}
          Block {friend.displayName || friend.username}
        </button>
        <button
          onClick={onClose}
          className="flex items-center gap-3 w-full"
          style={{ padding: "12px 10px", background: "none", border: "none", color: "var(--text-muted)", fontSize: 14, fontWeight: 500, textAlign: "left" }}
        >
          <XIcon size={17} />
          Cancel
        </button>
      </div>
    </>
  );
}

export default function InboxClient({ currentUserId }) {
  const router = useRouter();
  const [conversations, setConversations] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addUsername, setAddUsername] = useState("");
  const [addStatus, setAddStatus] = useState("");
  const [adding, setAdding] = useState(false);
  const [respondingId, setRespondingId] = useState(null);
  const [unsendingId, setUnsendingId] = useState(null);

  const [menuFriendId, setMenuFriendId] = useState(null);
  const [blockingId, setBlockingId] = useState(null);
  const pressTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [inboxRes, reqRes] = await Promise.all([
      fetch("/api/inbox"),
      fetch("/api/friends/requests"),
    ]);
    const inboxData = await inboxRes.json();
    const reqData = await reqRes.json();
    if (inboxRes.ok) setConversations(inboxData.conversations || []);
    if (reqRes.ok) {
      setIncoming(reqData.incoming || []);
      setOutgoing(reqData.outgoing || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAddFriend(e) {
    e.preventDefault();
    const username = addUsername.trim();
    if (!username) return;
    setAdding(true);
    setAddStatus("");
    const res = await fetch("/api/friends/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiverUsername: username }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) {
      setAddStatus(data.error || "Could not send request.");
      return;
    }
    setAddStatus("Friend request sent!");
    setAddUsername("");
    load();
  }

  async function handleRespond(requestId, action) {
    setRespondingId(requestId);
    await fetch(`/api/friends/requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setRespondingId(null);
    load();
  }

  // Cancels a request you sent that's still pending. Removes it from your
  // own outgoing list only — nothing is sent to the other person.
  async function handleUnsend(requestId) {
    setUnsendingId(requestId);
    setOutgoing((prev) => prev.filter((r) => r.id !== requestId));
    try {
      await fetch(`/api/friends/requests/${requestId}`, { method: "DELETE" });
    } finally {
      setUnsendingId(null);
      load();
    }
  }

  function openMenu(friendId) {
    setMenuFriendId(friendId);
  }
  function handlePressStart(friendId) {
    pressTimer.current = setTimeout(() => openMenu(friendId), 450);
  }
  function handlePressEnd() {
    clearTimeout(pressTimer.current);
  }

  async function handleBlock(friend) {
    if (!window.confirm(`Block ${friend.displayName || friend.username}? They won't be able to message you, and this removes them from your friends.`)) {
      return;
    }
    setBlockingId(friend.id);
    try {
      const res = await fetch(`/api/users/${friend.id}/block`, { method: "POST" });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.friend.id !== friend.id));
        setMenuFriendId(null);
      }
    } finally {
      setBlockingId(null);
    }
  }

  const filtered = conversations.filter((c) => {
    if (!query.trim()) return true;
    const name = (c.friend.displayName || c.friend.username || "").toLowerCase();
    return name.includes(query.toLowerCase());
  });

  const menuFriend = menuFriendId ? conversations.find((c) => c.friend.id === menuFriendId)?.friend : null;

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3">
        <div className="v-search" style={{ flex: 1, minWidth: 0 }}>
          <GlossIcon name="search" size={34} fallback={UserPlus} />
          <input
            type="text"
            placeholder="Search friends…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          onClick={() => setAddOpen((v) => !v)}
          className="btn-primary"
          style={{ width: "auto", padding: "10px 14px" }}
        >
          <UserPlus size={16} />
        </button>
      </div>

      {addOpen && (
        <form onSubmit={handleAddFriend} className="card p-3 mb-3 space-y-2">
          <input
            className="input pl-3"
            style={{ fontSize: 13 }}
            placeholder="Enter a username"
            value={addUsername}
            onChange={(e) => setAddUsername(e.target.value)}
          />
          {addStatus && <div className="text-xs" style={{ color: "var(--text-muted)" }}>{addStatus}</div>}
          <button type="submit" className="btn-primary" disabled={adding || !addUsername.trim()}>
            {adding ? <Loader2 size={14} className="animate-spin" /> : "Send Friend Request"}
          </button>
        </form>
      )}

      {incoming.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold mb-2 px-1" style={{ color: "var(--text-muted)" }}>
            Friend Requests ({incoming.length})
          </div>
          <div className="space-y-2">
            {incoming.map((r) => (
              <div key={r.id} className="card p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Avatar user={r.sender} size={36} />
                  <span className="text-sm font-semibold">{r.sender.displayName || r.sender.username}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRespond(r.id, "accept")}
                    disabled={respondingId === r.id}
                    aria-label="Accept"
                    style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <Check size={15} />
                  </button>
                  <button
                    onClick={() => handleRespond(r.id, "decline")}
                    disabled={respondingId === r.id}
                    aria-label="Decline"
                    style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "none", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <XIcon size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold mb-2 px-1" style={{ color: "var(--text-muted)" }}>
            Pending ({outgoing.length})
          </div>
          <div className="space-y-1">
            {outgoing.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2.5 px-1 py-1.5">
                <div className="flex items-center gap-2.5" style={{ minWidth: 0 }}>
                  <Avatar user={r.receiver} size={28} />
                  <span className="text-xs" style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Waiting for {r.receiver.displayName || r.receiver.username}
                  </span>
                </div>
                <button
                  onClick={() => handleUnsend(r.id)}
                  disabled={unsendingId === r.id}
                  className="text-xs font-semibold flex-shrink-0"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "none", borderRadius: 999, padding: "5px 10px" }}
                >
                  {unsendingId === r.id ? <Loader2 size={12} className="animate-spin" /> : "Unsend"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
          {conversations.length === 0 ? "No friends yet — add one to start chatting." : "No matches."}
        </p>
      ) : (
        <div className="space-y-1">
          {filtered.map(({ friend, lastMessage, unreadCount }) => (
            <div
              key={friend.id}
              className="flex items-center gap-1"
              onTouchStart={() => handlePressStart(friend.id)}
              onTouchEnd={handlePressEnd}
              onTouchMove={handlePressEnd}
              onMouseDown={() => handlePressStart(friend.id)}
              onMouseUp={handlePressEnd}
              onMouseLeave={handlePressEnd}
              onContextMenu={(e) => { e.preventDefault(); openMenu(friend.id); }}
            >
              <Link
                href={`/inbox/${friend.username}`}
                className="flex items-center gap-3 p-2.5 rounded-xl"
                style={{ textDecoration: "none", color: "var(--text)", flex: 1, minWidth: 0 }}
              >
                <div style={{ position: "relative" }}>
                  <Avatar user={friend} size={48} />
                  <span
                    style={{
                      position: "absolute", bottom: -1, right: -1, width: 13, height: 13, borderRadius: "50%",
                      border: "2.5px solid var(--surface)",
                      background: friend.online ? "var(--success)" : "var(--text-muted)",
                    }}
                  />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{friend.displayName || friend.username}</span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{relativeTime(lastMessage?.createdAt)}</span>
                  </div>
                  <p className="text-xs" style={{ color: unreadCount > 0 ? "var(--text)" : "var(--text-muted)", fontWeight: unreadCount > 0 ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {lastMessage?.content || "Say hi 👋"}
                  </p>
                </div>
                {unreadCount > 0 && (
                  <span style={{ background: "var(--accent)", color: "white", fontSize: 11, fontWeight: 700, borderRadius: 999, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                    {unreadCount}
                  </span>
                )}
              </Link>
              <button
                onClick={() => openMenu(friend.id)}
                aria-label="More options"
                style={{ background: "none", border: "none", color: "var(--text-muted)", padding: 8, flexShrink: 0 }}
              >
                <MoreVertical size={17} />
              </button>
            </div>
          ))}
        </div>
      )}

      {menuFriend && (
        <ConversationMenu
          friend={menuFriend}
          open={!!menuFriend}
          onClose={() => setMenuFriendId(null)}
          onBlock={handleBlock}
          blocking={blockingId === menuFriend.id}
        />
      )}
    </div>
  );
}