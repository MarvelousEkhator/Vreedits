"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { UserPlus, Check, X as XIcon, Loader2, MoreVertical, Ban, Flag, Bookmark } from "lucide-react";
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

function ConversationMenu({ friend, open, onClose, onBlock, blocking, onReport }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!open) return null;

  async function submitReport() {
    if (!reason.trim()) return;
    setSubmitting(true);
    const ok = await onReport(friend, reason.trim());
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
              onClick={() => setReportOpen(true)}
              className="flex items-center gap-3 w-full"
              style={{ padding: "12px 10px", background: "none", border: "none", color: "var(--text)", fontSize: 14, fontWeight: 600, textAlign: "left" }}
            >
              <Flag size={17} />
              Report {friend.displayName || friend.username}
            </button>
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
            <p className="text-sm font-semibold mb-2">Why are you reporting {friend.displayName || friend.username}?</p>
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

const INBOX_CSS = `
.ib-label{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted);margin:0 4px 8px}
.ib-row{
  display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:18px;
  background:var(--glass);border:1px solid var(--border);box-shadow:0 4px 14px rgba(0,0,0,.14);
  text-decoration:none;color:var(--text);flex:1;min-width:0;
  transition:transform .1s ease, background .15s ease;
}
.ib-row:active{transform:scale(.985)}
.ib-row.self{background:var(--accent-soft);border-color:var(--accent)}
.ib-badge{
  background:var(--accent-btn);color:#fff;font-size:11px;font-weight:700;border-radius:999px;
  min-width:20px;height:20px;display:flex;align-items:center;justify-content:center;padding:0 6px;
  box-shadow:0 0 10px var(--accent-soft);
}
.ib-strip{display:flex;gap:14px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:none}
.ib-strip::-webkit-scrollbar{display:none}
`;

export default function InboxClient({ currentUserId }) {
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

  // Cancels a request you sent that's still pending.
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

  async function handleReport(friend, reason) {
    const res = await fetch(`/api/users/${friend.id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    return res.ok;
  }

  const filtered = conversations.filter((c) => {
    if (c.isSelf) return true; // "You" always shows, regardless of search
    if (!query.trim()) return true;
    const name = (c.friend.displayName || c.friend.username || "").toLowerCase();
    return name.includes(query.toLowerCase());
  });

  const menuFriend = menuFriendId ? conversations.find((c) => !c.isSelf && c.friend.id === menuFriendId)?.friend : null;
  const onlineFriends = conversations.filter((c) => !c.isSelf && c.friend.online);

  return (
    <div className="p-3">
      <style>{INBOX_CSS}</style>

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
          aria-label="Add friend"
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

      {onlineFriends.length > 0 && !query.trim() && (
        <div className="mb-4">
          <div className="ib-label">Online now</div>
          <div className="ib-strip">
            {onlineFriends.map(({ friend }) => (
              <Link
                key={friend.id}
                href={`/inbox/${friend.username}`}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                  textDecoration: "none", color: "var(--text)", flexShrink: 0, width: 64,
                }}
              >
                <div style={{ position: "relative" }}>
                  <div style={{ padding: 2, borderRadius: "50%", background: "var(--accent-btn)" }}>
                    <div style={{ padding: 2, borderRadius: "50%", background: "var(--surface)", lineHeight: 0 }}>
                      <Avatar user={friend} size={50} />
                    </div>
                  </div>
                  <span
                    style={{
                      position: "absolute", bottom: 2, right: 2, width: 14, height: 14, borderRadius: "50%",
                      background: "var(--success)", border: "2.5px solid var(--surface)",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 11.5, fontWeight: 600, maxWidth: 64, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {friend.displayName || friend.username}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {incoming.length > 0 && (
        <div className="mb-4">
          <div className="ib-label">Friend requests ({incoming.length})</div>
          <div className="space-y-2">
            {incoming.map((r) => (
              <div key={r.id} className="card p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Avatar user={r.sender} size={40} />
                  <span className="text-sm font-semibold">{r.sender.displayName || r.sender.username}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRespond(r.id, "accept")}
                    disabled={respondingId === r.id}
                    aria-label="Accept"
                    style={{ background: "var(--accent-btn)", color: "white", border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 12px var(--accent-soft)" }}
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => handleRespond(r.id, "decline")}
                    disabled={respondingId === r.id}
                    aria-label="Decline"
                    style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <XIcon size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="mb-4">
          <div className="ib-label">Pending ({outgoing.length})</div>
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

      {conversations.length > 0 && <div className="ib-label">Messages</div>}

      {loading ? (
        <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
          {conversations.length === 0 ? "No friends yet — add one to start chatting." : "No matches."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(({ friend, lastMessage, unreadCount, isSelf }) => (
            <div
              key={isSelf ? "self" : friend.id}
              className="flex items-center gap-1"
              onTouchStart={() => !isSelf && handlePressStart(friend.id)}
              onTouchEnd={handlePressEnd}
              onTouchMove={handlePressEnd}
              onMouseDown={() => !isSelf && handlePressStart(friend.id)}
              onMouseUp={handlePressEnd}
              onMouseLeave={handlePressEnd}
              onContextMenu={(e) => { if (!isSelf) { e.preventDefault(); openMenu(friend.id); } }}
            >
              <Link href={`/inbox/${friend.username}`} className={`ib-row ${isSelf ? "self" : ""}`}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar user={friend} size={52} />
                  {isSelf ? (
                    <span
                      style={{
                        position: "absolute", bottom: -1, right: -1, width: 20, height: 20, borderRadius: "50%",
                        border: "2.5px solid var(--surface)", background: "var(--accent)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Bookmark size={10} color="white" fill="white" />
                    </span>
                  ) : (
                    <span
                      style={{
                        position: "absolute", bottom: -1, right: -1, width: 15, height: 15, borderRadius: "50%",
                        border: "2.5px solid var(--surface)",
                        background: friend.online ? "var(--success)" : "var(--text-muted)",
                      }}
                    />
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="flex items-center justify-between gap-2">
                    <span style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {isSelf ? "You" : (friend.displayName || friend.username)}
                    </span>
                    <span className="text-xs" style={{ color: unreadCount > 0 ? "var(--accent)" : "var(--text-muted)", fontWeight: unreadCount > 0 ? 700 : 400, flexShrink: 0 }}>
                      {relativeTime(lastMessage?.createdAt)}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, marginTop: 2, color: unreadCount > 0 ? "var(--text)" : "var(--text-muted)", fontWeight: unreadCount > 0 ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {isSelf ? (lastMessage?.content || "Save a note for later") : (lastMessage?.content || "Say hi 👋")}
                  </p>
                </div>
                {unreadCount > 0 && <span className="ib-badge">{unreadCount}</span>}
              </Link>
              {!isSelf && (
                <button
                  onClick={() => openMenu(friend.id)}
                  aria-label="More options"
                  style={{ background: "none", border: "none", color: "var(--text-muted)", padding: 8, flexShrink: 0 }}
                >
                  <MoreVertical size={17} />
                </button>
              )}
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
          onReport={handleReport}
        />
      )}
    </div>
  );
}