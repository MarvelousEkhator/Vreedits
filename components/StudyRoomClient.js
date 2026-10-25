"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, AlertCircle, Users, Timer, Send, UserPlus,
  X, Coffee, BookOpen, LogOut, StopCircle,
} from "lucide-react";
import { TapUser } from "@/components/FramedAvatar";

const POLL_MS = 4000;

function formatRemaining(ms) {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
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

function displayNameOf(u) {
  return u?.displayName || u?.username || "";
}

function groupMessages(messages) {
  const groups = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    if (last && last.userId === msg.userId) {
      last.messages.push(msg);
    } else {
      groups.push({ userId: msg.userId, username: displayNameOf(msg.user), user: msg.user, messages: [msg] });
    }
  }
  return groups;
}

export default function StudyRoomClient({ roomId }) {
  const router = useRouter();
  const [room, setRoom] = useState(null);
  const [myStatus, setMyStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  const [timerOpen, setTimerOpen] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(25);
  const [now, setNow] = useState(Date.now());

  const [chatText, setChatText] = useState("");
  const chatEndRef = useRef(null);

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/study-rooms/${roomId}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setRoom(data.room);
        setMyStatus(data.myStatus);
        setError("");
      } else if (!silent) {
        setError(data.error || "Could not load this room.");
      }
    } catch {
      if (!silent) setError("Network error. Please try again.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { load(false); }, [load]);

  useEffect(() => {
    const interval = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room?.messages?.length]);

  async function updateStatus(status) {
    setMyStatus(status);
    await fetch(`/api/study-rooms/${roomId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load(true);
  }

  async function handleLeave() {
    if (!window.confirm("Leave this study room?")) return;
    await updateStatus("left");
    router.push("/tools/school/study-room");
  }

  async function handleEndRoom() {
    if (!window.confirm("End this room for everyone?")) return;
    await fetch(`/api/study-rooms/${roomId}`, { method: "DELETE" });
    router.push("/tools/school/study-room");
  }

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteUsername.trim()) return;
    setInviting(true);
    setInviteError("");
    const res = await fetch(`/api/study-rooms/${roomId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: inviteUsername }),
    });
    const data = await res.json();
    setInviting(false);
    if (!res.ok) { setInviteError(data.error || "Could not invite that user."); return; }
    setInviteUsername("");
    setInviteOpen(false);
    load(true);
  }

  async function handleStartTimer(e) {
    e.preventDefault();
    await fetch(`/api/study-rooms/${roomId}/timer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationMinutes: Number(timerMinutes) }),
    });
    setTimerOpen(false);
    load(true);
  }

  async function handleStopTimer() {
    await fetch(`/api/study-rooms/${roomId}/timer`, { method: "DELETE" });
    load(true);
  }

  async function handleSendMessage(e) {
    e.preventDefault();
    const text = chatText.trim();
    if (!text) return;
    setChatText("");
    await fetch(`/api/study-rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    load(true);
  }

  if (loading) {
    return <div className="flex justify-center py-16" style={{ color: "var(--text-muted)" }}><Loader2 size={22} className="animate-spin" /></div>;
  }

  if (error || !room) {
    return (
      <div className="min-h-screen flex flex-col items-center px-4 pb-16">
        <div className="w-full max-w-[480px] mt-10">
          <button onClick={() => router.push("/tools/school/study-room")} className="btn-text inline-flex items-center gap-1.5 mb-4">
            <ArrowLeft size={14} /> Study Rooms
          </button>
          <div className="alert alert-error"><AlertCircle size={15} />{error || "Room not found."}</div>
        </div>
      </div>
    );
  }

  const remainingMs = room.timerStartedAt
    ? room.timerDurationMinutes * 60000 - (now - new Date(room.timerStartedAt).getTime())
    : null;

  const statusConfig = {
    studying: { icon: BookOpen, color: "var(--success, #4ade80)", label: "Studying" },
    break: { icon: Coffee, color: "var(--accent)", label: "On break" },
    invited: { icon: Users, color: "var(--text-muted)", label: "Invited" },
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 pb-16">
      <div className="w-full max-w-[480px] mt-10">
        <button onClick={() => router.push("/tools/school/study-room")} className="btn-text inline-flex items-center gap-1.5 mb-4">
          <ArrowLeft size={14} /> Study Rooms
        </button>

        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {room.name}
          </h1>
          {room.hostId === room.host.id && (
            <button onClick={handleEndRoom} aria-label="End room" style={{ color: "var(--danger, #e55)", background: "none", border: "none" }} title="End room (host only)">
              <StopCircle size={18} />
            </button>
          )}
        </div>
        {room.subject && <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>{room.subject}</p>}

        {myStatus === "invited" && (
          <div className="card p-4 mb-4">
            <p className="text-sm mb-3">{displayNameOf(room.host)} invited you to this study room.</p>
            <div className="flex gap-2">
              <button onClick={() => updateStatus("studying")} className="btn-primary">Join</button>
              <button onClick={handleLeave} className="btn-primary" style={{ background: "var(--surface-2)", color: "var(--text)" }}>Decline</button>
            </div>
          </div>
        )}

        {myStatus !== "invited" && (
          <>
            {/* Timer */}
            <div className="card p-4 mb-4 text-center">
              {room.timerStartedAt && remainingMs > 0 ? (
                <>
                  <div className="text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                    {formatRemaining(remainingMs)}
                  </div>
                  <button onClick={handleStopTimer} className="btn-text text-xs mt-2">Stop timer</button>
                </>
              ) : !timerOpen ? (
                <button onClick={() => setTimerOpen(true)} className="btn-primary" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
                  <Timer size={14} /> Start a Timer
                </button>
              ) : (
                <form onSubmit={handleStartTimer} className="flex items-center gap-2 justify-center">
                  <input
                    type="number" min="1" max="240" value={timerMinutes}
                    onChange={(e) => setTimerMinutes(e.target.value)}
                    className="input pl-3" style={{ width: 80, textAlign: "center" }}
                  />
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>min</span>
                  <button type="submit" className="btn-primary" style={{ width: "auto", padding: "8px 14px" }}>Start</button>
                </form>
              )}
            </div>

            {/* My status */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => updateStatus("studying")}
                className="btn-primary"
                style={myStatus !== "studying" ? { background: "var(--surface-2)", color: "var(--text)" } : {}}
              >
                <BookOpen size={13} /> Studying
              </button>
              <button
                onClick={() => updateStatus("break")}
                className="btn-primary"
                style={myStatus !== "break" ? { background: "var(--surface-2)", color: "var(--text)" } : {}}
              >
                <Coffee size={13} /> Break
              </button>
              <button onClick={handleLeave} aria-label="Leave room" className="btn-primary" style={{ background: "var(--surface-2)", color: "var(--danger, #e55)", width: "auto", padding: "10px 12px" }}>
                <LogOut size={14} />
              </button>
            </div>

            {/* Members */}
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                Members ({room.members.length})
              </h2>
              {!inviteOpen ? (
                <button onClick={() => setInviteOpen(true)} aria-label="Invite" style={{ color: "var(--accent)", background: "none", border: "none" }}>
                  <UserPlus size={16} />
                </button>
              ) : (
                <button onClick={() => setInviteOpen(false)} aria-label="Close invite" style={{ color: "var(--text-muted)", background: "none", border: "none" }}>
                  <X size={16} />
                </button>
              )}
            </div>

            {inviteOpen && (
              <form onSubmit={handleInvite} className="card p-3 mb-3 space-y-2">
                {inviteError && <div className="alert alert-error"><AlertCircle size={13} />{inviteError}</div>}
                <div className="flex gap-2">
                  <input
                    className="input pl-3" placeholder="Username"
                    value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} autoFocus
                  />
                  <button type="submit" disabled={inviting || !inviteUsername.trim()} className="btn-primary" style={{ width: "auto", padding: "0 16px" }}>
                    {inviting ? <Loader2 size={14} className="animate-spin" /> : "Invite"}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-1.5 mb-6">
              {room.members.map((m) => {
                const cfg = statusConfig[m.status] || statusConfig.studying;
                const Icon = cfg.icon;
                return (
                  <div key={m.id} className="card p-2.5 flex items-center gap-2">
                    <Icon size={14} style={{ color: cfg.color, flexShrink: 0 }} />
                    <TapUser user={m.user} style={{ flex: 1, alignItems: "center", gap: 8 }}>
                      {m.user?.avatarDataUrl ? (
                        <img src={m.user.avatarDataUrl} alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      ) : (
                        <span style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: "var(--accent-soft)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>
                          {displayNameOf(m.user).slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="text-sm font-medium">
                        {displayNameOf(m.user)}{m.userId === room.hostId ? " (host)" : ""}
                      </span>
                    </TapUser>
                    <span className="text-xs" style={{ color: cfg.color }}>{cfg.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Chat */}
            <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--text-muted)" }}>Chat</h2>
            <div className="card mb-3" style={{ maxHeight: 320, overflowY: "auto" }}>
              <div className="p-3 space-y-3">
                {room.messages.length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: "var(--text-muted)" }}>No messages yet — say hi.</p>
                ) : (
                  groupMessages(room.messages).map((group, gi) => (
                    <div key={gi} className="flex items-start gap-2.5">
                      <TapUser user={group.user} style={{ marginTop: 2 }}>
                        {group.user?.avatarDataUrl ? (
                          <img src={group.user.avatarDataUrl} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-display)" }}>
                            {group.username.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </TapUser>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-baseline gap-2">
                          <TapUser user={group.user}><span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>{group.username}</span></TapUser>
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{relativeTime(group.messages[0].createdAt)}</span>
                        </div>
                        {group.messages.map((msg) => (
                          <div key={msg.id} className="text-sm" style={{ overflowWrap: "anywhere", lineHeight: 1.5 }}>
                            {msg.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
            </div>
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                className="input pl-3" placeholder="Message the room…"
                value={chatText} onChange={(e) => setChatText(e.target.value)}
              />
              <button type="submit" disabled={!chatText.trim()} className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--accent)", color: "white" }}>
                <Send size={16} />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
