"use client";
import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft, Send, Loader2, Sparkles, AlertCircle,
  History, Plus, Trash2, X, MessageSquare, Paperclip, Camera, ImageIcon,
  File as FileIcon, Copy, Check, ThumbsUp, ThumbsDown, Share2, Home, Pin, Pencil,
} from "lucide-react";
import MarkdownText from "@/components/MarkdownText";

const MAX_ATTACHMENT_BYTES = 4_000_000;
const MAX_ATTACHMENTS = 3; // bump this (and the matching constant in route.js) to allow more
const MAX_TEXTAREA_HEIGHT = 160;

function relativeTime(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getUserDateTime() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const now = new Date();

  return {
    timezone,
    iso: now.toISOString(),
    date: new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "long" }).format(now),
    time: new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeStyle: "long" }).format(now),
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" }).format(now),
  };
}

function parseTimerCommand(text) {
  const match = text.match(
    /(?:set|start)\s+(?:a\s+)?timer\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/i
  );
  const reminderMatch = text.match(
    /remind\s+me\s+in\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/i
  );
  const result = match || reminderMatch;
  if (!result) return null;

  const amount = Number(result[1]);
  const unit = result[2].toLowerCase();
  let seconds = amount;
  if (unit.startsWith("minute") || unit.startsWith("min")) seconds = amount * 60;
  else if (unit.startsWith("hour") || unit.startsWith("hr")) seconds = amount * 60 * 60;

  return { seconds: Math.round(seconds), amount, unit };
}

function formatTimerDuration(seconds) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const remainingMinutes = Math.floor((seconds % 3600) / 60);
  if (remainingMinutes === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours}h ${remainingMinutes}m`;
}

// Renders a message's attachments, whether it's the newer `attachments`
// array (multi-image) or the older singular `attachment` field (kept for
// backward compatibility with conversations persisted before multi-image
// support existed).
function attachmentsOf(m) {
  if (Array.isArray(m?.attachments) && m.attachments.length > 0) return m.attachments;
  if (m?.attachment) return [m.attachment];
  return [];
}

// An attachment counts as an image either because its MIME `type` says so,
// or — for server-generated images (Syna's image-gen/edit replies), which
// don't always set `type` — because its dataUrl itself is an image data URI.
function isImage(att) {
  return att.type?.startsWith("image/") || /^data:image\//i.test(att.dataUrl || "");
}

function AttachmentGrid({ attachments, bubbleText }) {
  if (attachments.length === 0) return null;

  if (attachments.length === 1) {
    const att = attachments[0];
    return isImage(att) ? (
      <img
        src={att.dataUrl}
        alt={att.name}
        style={{ maxWidth: "100%", borderRadius: 10, marginBottom: bubbleText ? 8 : 0, display: "block" }}
      />
    ) : (
      <div
        className="flex items-center gap-2"
        style={{ background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "6px 10px", marginBottom: bubbleText ? 8 : 0, fontSize: 12 }}
      >
        <FileIcon size={14} /> {att.name}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(attachments.length, 3)}, 1fr)`,
        gap: 6,
        marginBottom: bubbleText ? 8 : 0,
      }}
    >
      {attachments.map((att, idx) =>
        isImage(att) ? (
          <img
            key={idx}
            src={att.dataUrl}
            alt={att.name}
            style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 8, display: "block" }}
          />
        ) : (
          <div
            key={idx}
            className="flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.12)", borderRadius: 8, aspectRatio: "1 / 1", fontSize: 11, padding: 4, textAlign: "center" }}
          >
            <FileIcon size={14} />
          </div>
        )
      )}
    </div>
  );
}

function MessageActions({ text }) {
  const [copied, setCopied] = useState(false);
  const [reaction, setReaction] = useState(null); // "up" | "down" | null

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function toggleReaction(value) {
    setReaction((prev) => (prev === value ? null : value));
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // user cancelled share sheet — no action needed
      }
    } else {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  const btnStyle = {
    color: "var(--text-muted)", background: "none", border: "none",
    display: "flex", alignItems: "center", gap: 4, padding: 4, borderRadius: 6,
  };

  return (
    <div className="flex items-center gap-1" style={{ marginTop: 8 }}>
      <button onClick={handleCopy} style={btnStyle} aria-label="Copy">
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <button
        onClick={() => toggleReaction("up")}
        style={{ ...btnStyle, color: reaction === "up" ? "var(--accent)" : "var(--text-muted)" }}
        aria-label="Good response"
      >
        <ThumbsUp size={13} fill={reaction === "up" ? "var(--accent)" : "none"} />
      </button>
      <button
        onClick={() => toggleReaction("down")}
        style={{ ...btnStyle, color: reaction === "down" ? "var(--danger, #e55)" : "var(--text-muted)" }}
        aria-label="Bad response"
      >
        <ThumbsDown size={13} fill={reaction === "down" ? "var(--danger, #e55)" : "none"} />
      </button>
      <button onClick={handleShare} style={btnStyle} aria-label="Share">
        <Share2 size={13} />
      </button>
    </div>
  );
}

function SynaChatInner() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [fallbackActive, setFallbackActive] = useState(false);

  const [timerEndAt, setTimerEndAt] = useState(null);
  const [timerRemaining, setTimerRemaining] = useState(0);

  const bottomRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT) + "px";
  }, [input]);

  useEffect(() => {
    if (!timerEndAt) return;

    const updateTimer = () => {
      const remaining = Math.max(0, timerEndAt - Date.now());
      setTimerRemaining(remaining);

      if (remaining <= 0) {
        setTimerEndAt(null);
        setTimerRemaining(0);
        setMessages((prev) => [...prev, { role: "assistant", text: "⏰ Your timer is finished!" }]);

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Syna Timer", { body: "⏰ Your timer is finished!" });
        } else {
          try { alert("⏰ Your timer is finished!"); } catch {}
        }
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 250);
    return () => clearInterval(interval);
  }, [timerEndAt]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const loadConversations = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/ai/conversations");
      const data = await res.json();
      setConversations(data.conversations || []);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const openConversation = useCallback(async (id) => {
    try {
      const res = await fetch(`/api/ai/conversations/${id}`);
      const data = await res.json();
      if (res.ok) {
        setMessages(data.conversation.messages);
        setConversationId(data.conversation.id);
        setError("");
      }
    } finally {
      setHistoryOpen(false);
    }
  }, []);

  useEffect(() => {
    const idFromUrl = searchParams.get("id");
    if (idFromUrl) openConversation(idFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persist(fullMessages) {
    try {
      if (!conversationId) {
        const res = await fetch("/api/ai/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: fullMessages }),
        });
        const data = await res.json();
        if (res.ok) {
          setConversationId(data.conversation.id);
          loadConversations();
        }
      } else {
        await fetch(`/api/ai/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: fullMessages }),
        });
        loadConversations();
      }
    } catch {}
  }

  // Handles one or more files picked at once (gallery supports multi-select;
  // camera/file inputs typically hand back one at a time, which this
  // still supports fine). Respects the MAX_ATTACHMENTS cap across whatever
  // is already pending.
  function handleFilePicked(e) {
    const files = Array.from(e.target.files || []);
    setAttachMenuOpen(false);
    if (files.length === 0) return;
    setError("");

    setPendingAttachments((prev) => {
      const room = MAX_ATTACHMENTS - prev.length;
      if (room <= 0) {
        setError(`You can attach up to ${MAX_ATTACHMENTS} files at a time.`);
        return prev;
      }

      const toAdd = files.slice(0, room);
      if (files.length > room) {
        setError(`Only added ${room} — you can attach up to ${MAX_ATTACHMENTS} files at a time.`);
      }

      for (const file of toAdd) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setError("One of your files is too large — please choose files under 4MB.");
          continue;
        }
        const reader = new FileReader();
        reader.onload = () => {
          setPendingAttachments((current) => [
            ...current,
            { dataUrl: reader.result, name: file.name, type: file.type },
          ]);
        };
        reader.readAsDataURL(file);
      }

      return prev; // actual additions happen asynchronously above as each file loads
    });

    e.target.value = "";
  }

  function removePendingAttachment(idx) {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if ((!text && pendingAttachments.length === 0) || loading) return;

    setError("");

    const timer = text ? parseTimerCommand(text) : null;

    if (timer && pendingAttachments.length === 0) {
      const durationText = formatTimerDuration(timer.seconds);
      const userMsg = { role: "user", text };
      const timerReply = { role: "assistant", text: `⏱️ Timer set for **${durationText}**. I'll let you know when it's finished.` };
      const timerMessages = [...messages, userMsg, timerReply];

      setMessages(timerMessages);
      setInput("");
      setPendingAttachments([]);

      const endAt = Date.now() + timer.seconds * 1000;
      setTimerEndAt(endAt);
      setTimerRemaining(timer.seconds * 1000);

      persist(timerMessages);
      return;
    }

    const userMsg = {
      role: "user",
      text,
      attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setPendingAttachments([]);
    setLoading(true);

    try {
      const clientDateTime = getUserDateTime();
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, clientDateTime }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      setFallbackActive(!!data.reply?.usedFallback);

      // NOTE: the API returns `reply` as a full message object
      // ({ role, text, attachment? }), not a plain string — so it
      // gets spread in directly rather than wrapped in a new object.
      // Wrapping it (e.g. `{ role: "assistant", text: data.reply }`)
      // put the whole object into `text`, which crashed ReactMarkdown
      // when it tried to render a non-string child.
      const finalMessages = [...nextMessages, data.reply];
      setMessages(finalMessages);
      persist(finalMessages);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  function startNewChat() {
    setMessages([]);
    setConversationId(null);
    setError("");
    setPendingAttachments([]);
    setHistoryOpen(false);
    setShareCopied(false);
    setFallbackActive(false);
  }

  async function deleteConversation(id, e) {
    e.stopPropagation();
    await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
    setConversations((c) => c.filter((conv) => conv.id !== id));
    if (id === conversationId) startNewChat();
  }

  async function togglePin(c, e) {
    e.stopPropagation();
    await fetch(`/api/ai/conversations/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !c.pinned }),
    });
    loadConversations();
  }

  function startRename(c, e) {
    e.stopPropagation();
    setRenamingId(c.id);
    setRenameValue(c.title);
  }

  async function confirmRename(id, e) {
    e.stopPropagation();
    if (!renameValue.trim()) return;
    await fetch(`/api/ai/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: renameValue.trim() }),
    });
    setRenamingId(null);
    loadConversations();
  }

  async function handleShareConversation() {
    if (!conversationId) return;
    const res = await fetch(`/api/ai/conversations/${conversationId}/share`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError("Could not create share link.");
      return;
    }
    const url = `${window.location.origin}/share/${data.shareToken}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "Chat with Syna", url });
      } catch {
        // user cancelled the share sheet — no action needed
      }
    } else {
      navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "var(--surface)" }}>
      <div className="px-4 pt-6 pb-3" style={{ flexShrink: 0, maxWidth: 720, margin: "0 auto", width: "100%" }}>
        <div className="flex items-center justify-between mb-3">
          <Link
            href="/ai-tools"
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "var(--surface-2)", color: "var(--text)" }}
            aria-label="Back to AI Tools"
          >
            <ArrowLeft size={16} />
          </Link>
          <Link
            href="/dashboard"
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "var(--surface-2)", color: "var(--text)" }}
            aria-label="Exit to Home"
          >
            <Home size={16} />
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={18} style={{ color: "var(--accent)" }} />
            <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Chat with Syna
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {conversationId && (
              <button
                onClick={handleShareConversation}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: "var(--surface-2)", color: shareCopied ? "var(--accent)" : "var(--text)" }}
                aria-label="Share this chat"
              >
                {shareCopied ? <Check size={16} /> : <Share2 size={16} />}
              </button>
            )}
            <button
              onClick={startNewChat}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "var(--surface-2)", color: "var(--text)" }}
              aria-label="New chat"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "var(--surface-2)", color: "var(--text)" }}
              aria-label="Recent chats"
            >
              <History size={16} />
            </button>
          </div>
        </div>
      </div>

      <div
        className="px-4"
        style={{
          flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20,
          maxWidth: 720, margin: "0 auto", width: "100%",
        }}
      >
        {messages.length === 0 && (
          <p className="text-sm text-center mt-10" style={{ color: "var(--text-muted)" }}>
            Ask Syna anything, or attach up to {MAX_ATTACHMENTS} photos or files to get started.
          </p>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div
              key={i}
              style={{
                alignSelf: "flex-end",
                maxWidth: "85%",
                minWidth: 0,
                background: "var(--accent)",
                color: "white",
                borderRadius: 16,
                padding: "10px 16px",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              <AttachmentGrid attachments={attachmentsOf(m)} bubbleText={m.text} />
              {m.text && (
                <span style={{ fontSize: 14, lineHeight: 1.5, overflowWrap: "anywhere", wordBreak: "break-word" }}>
                  {m.text}
                </span>
              )}
            </div>
          ) : (
            <div
              key={i}
              style={{
                alignSelf: "flex-start",
                width: "100%",
                minWidth: 0,
                color: "var(--text)",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              <AttachmentGrid attachments={attachmentsOf(m)} bubbleText={m.text} />
              {m.text && (
                <>
                  <MarkdownText text={m.text} />
                  <MessageActions text={m.text} />
                </>
              )}
            </div>
          )
        )}

        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            <Loader2 size={14} className="animate-spin" /> Syna is thinking…
          </div>
        )}

        {error && <div className="alert alert-error"><AlertCircle size={15} />{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-4" style={{ flexShrink: 0, maxWidth: 720, margin: "0 auto", width: "100%" }}>
        {fallbackActive && (
          <div
            className="flex items-center gap-2 mb-2 p-2 rounded-xl text-xs"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
          >
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            Running on backup AI while Gemini recovers — responses (including image understanding) may be a little different for now.
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingAttachments.map((att, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 rounded-xl"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                {att.type?.startsWith("image/") ? (
                  <img src={att.dataUrl} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />
                ) : (
                  <FileIcon size={18} style={{ color: "var(--text-muted)" }} />
                )}
                <span className="text-xs" style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {att.name}
                </span>
                <button onClick={() => removePendingAttachment(idx)} aria-label="Remove attachment" style={{ color: "var(--text-muted)" }}>
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-end gap-2 pt-2">
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setAttachMenuOpen((v) => !v)}
              disabled={pendingAttachments.length >= MAX_ATTACHMENTS}
              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: "var(--surface-2)",
                color: "var(--text)",
                opacity: pendingAttachments.length >= MAX_ATTACHMENTS ? 0.5 : 1,
                cursor: pendingAttachments.length >= MAX_ATTACHMENTS ? "not-allowed" : "pointer",
              }}
              aria-label="Attach"
              title={pendingAttachments.length >= MAX_ATTACHMENTS ? `Up to ${MAX_ATTACHMENTS} attachments at a time` : undefined}
            >
              <Plus size={18} />
            </button>
            {attachMenuOpen && (
              <div
                className="card"
                style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, width: 190, padding: 6, zIndex: 20 }}
              >
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex items-center gap-2.5 w-full p-2.5 rounded-lg text-sm"
                  style={{ textAlign: "left" }}
                >
                  <ImageIcon size={16} /> Photo from gallery
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center gap-2.5 w-full p-2.5 rounded-lg text-sm"
                  style={{ textAlign: "left" }}
                >
                  <Camera size={16} /> Take a photo
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2.5 w-full p-2.5 rounded-lg text-sm"
                  style={{ textAlign: "left" }}
                >
                  <Paperclip size={16} /> Send a file
                </button>
              </div>
            )}
            <input ref={galleryInputRef} type="file" accept="image/*" multiple onChange={handleFilePicked} style={{ display: "none" }} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFilePicked} style={{ display: "none" }} />
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.doc,.docx,.txt" multiple onChange={handleFilePicked} style={{ display: "none" }} />
          </div>

          <textarea
            ref={textareaRef}
            className="input pl-3"
            placeholder="Message Syna…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={1}
            style={{
              resize: "none",
              maxHeight: MAX_TEXTAREA_HEIGHT,
              overflowY: "auto",
              paddingTop: 12,
              paddingBottom: 12,
              lineHeight: 1.4,
            }}
          />
          <button
            type="submit"
            disabled={loading || (!input.trim() && pendingAttachments.length === 0)}
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: "var(--accent)", color: "white",
              opacity: loading || (!input.trim() && pendingAttachments.length === 0) ? 0.6 : 1,
            }}
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </form>

        {timerEndAt && (
          <div className="text-center text-xs mt-2" style={{ color: "var(--accent)", fontWeight: 600 }}>
            ⏱️ Timer: {formatTimerDuration(Math.ceil(timerRemaining / 1000))} remaining
          </div>
        )}
      </div>

      <div
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          opacity: historyOpen ? 1 : 0, pointerEvents: historyOpen ? "auto" : "none",
          transition: "opacity 0.2s ease", zIndex: 90,
        }}
        onClick={() => setHistoryOpen(false)}
      />
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: "min(320px, 86vw)",
          background: "var(--surface)", borderLeft: "1px solid var(--border)",
          transform: historyOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.22,1,0.36,1)", zIndex: 91,
          display: "flex", flexDirection: "column", overflowY: "auto",
        }}
      >
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold">Recent Chats</h2>
          <button onClick={() => setHistoryOpen(false)} aria-label="Close" style={{ color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>

        <button
          onClick={startNewChat}
          className="flex items-center gap-2 m-3 p-3 rounded-xl text-sm font-medium"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <Plus size={15} /> New Chat
        </button>

        <div className="px-2 pb-4">
          {loadingHistory && (
            <div className="flex justify-center py-6" style={{ color: "var(--text-muted)" }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}
          {!loadingHistory && conversations.length === 0 && (
            <p className="text-xs text-center mt-6 px-4" style={{ color: "var(--text-muted)" }}>
              No conversations yet.
            </p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className="rounded-xl mb-1"
              style={{ background: c.id === conversationId ? "var(--surface-2)" : "transparent" }}
            >
              {renamingId === c.id ? (
                <div className="flex items-center gap-2 p-3">
                  <input
                    className="input pl-2"
                    style={{ padding: "6px 8px", fontSize: 13 }}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                  />
                  <button onClick={(e) => confirmRename(c.id, e)} style={{ color: "var(--accent)", background: "none", border: "none" }} aria-label="Save name">
                    <Check size={16} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setRenamingId(null); }} style={{ color: "var(--text-muted)", background: "none", border: "none" }} aria-label="Cancel rename">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => openConversation(c.id)}
                  className="flex items-center justify-between gap-2 p-3 cursor-pointer"
                  style={{ minWidth: 0 }}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {c.pinned ? (
                      <Pin size={15} style={{ color: "var(--accent)", marginTop: 2, flexShrink: 0 }} fill="var(--accent)" />
                    ) : (
                      <MessageSquare size={15} style={{ color: "var(--text-muted)", marginTop: 2, flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div className="text-sm font-medium" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.title}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {relativeTime(c.updatedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={(e) => togglePin(c, e)} aria-label="Pin conversation" style={{ color: c.pinned ? "var(--accent)" : "var(--text-muted)", background: "none", border: "none" }}>
                      <Pin size={13} fill={c.pinned ? "var(--accent)" : "none"} />
                    </button>
                    <button onClick={(e) => startRename(c, e)} aria-label="Rename conversation" style={{ color: "var(--text-muted)", background: "none", border: "none" }}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={(e) => deleteConversation(c.id, e)} aria-label="Delete conversation" style={{ color: "var(--text-muted)", background: "none", border: "none" }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SynaChat() {
  return (
    <Suspense fallback={null}>
      <SynaChatInner />
    </Suspense>
  );
}