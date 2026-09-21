"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Crown, Users, Loader2, Heart, MessageCircle, Trash2, Send, AlertCircle,
  UserPlus, Link2, X as XIcon, Hash, Plus, Settings, ChevronLeft, ChevronDown,
  ChevronRight, Image as ImageIcon, Shield, ShieldOff, Calendar, ZoomIn, Tag,
  SlidersHorizontal, Flag, Pencil, Reply, CornerUpRight, Copy, BookOpen,
  HelpCircle, ExternalLink, Smile, Sticker,
} from "lucide-react";
import CommunitySettingsPage, { resolveSettingsPage } from "./CommunitySettingsPage";

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

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function Avatar({ user, size = 32 }) {
  if (user?.avatarDataUrl) {
    return <img src={user.avatarDataUrl} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: "var(--accent-soft)", color: "var(--accent)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-display)", fontWeight: 600, fontSize: size * 0.4,
      }}
    >
      {user?.username?.slice(0, 2).toUpperCase() || "?"}
    </div>
  );
}

function PostReactionPills({ postId, currentUserId }) {
  const [grouped, setGrouped] = useState({});
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/posts/${postId}/reactions`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setGrouped(d.grouped || {}); });
    return () => { cancelled = true; };
  }, [postId]);

  async function toggle(emoji) {
    setGrouped((prev) => {
      const next = { ...prev };
      const list = next[emoji] ? [...next[emoji]] : [];
      const idx = list.indexOf(currentUserId);
      if (idx >= 0) list.splice(idx, 1); else list.push(currentUserId);
      if (list.length === 0) delete next[emoji]; else next[emoji] = list;
      return next;
    });
    await fetch(`/api/posts/${postId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
  }

  if (Object.keys(grouped).length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
      {Object.entries(grouped).map(([emoji, userIds]) => (
        <button key={emoji} onClick={() => toggle(emoji)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, fontSize: 12, border: userIds.includes(currentUserId) ? "1px solid var(--accent)" : "1px solid var(--border)", background: userIds.includes(currentUserId) ? "var(--accent-soft)" : "transparent" }}>
          <span>{emoji}</span><span>{userIds.length}</span>
        </button>
      ))}
    </div>
  );
}

function PostActionSheet({ post, currentUserId, onClose, onQuickReact, onReply, onEdit, onDelete, onReport, onToggleThread, reportedIds }) {
  const isOwner = post.author.id === currentUserId;
  function Row({ icon, label, onClick, danger }) {
    return (
      <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "12px 20px", background: "none", border: "none", color: danger ? "var(--danger, #f23f42)" : "var(--text)", fontSize: 15, textAlign: "left" }}>
        <span style={{ width: 20, display: "flex" }}>{icon}</span>{label}
      </button>
    );
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div style={{ width: "100%", background: "var(--surface)", borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 20, maxHeight: "70vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, padding: "16px 12px" }}>
          {["❤️", "😢", "😂", "👍", "💀", "😮"].map((e) => (
            <button key={e} onClick={() => { onQuickReact(e); onClose(); }} style={{ fontSize: 24, background: "none", border: "none" }}>{e}</button>
          ))}
        </div>
        {isOwner && <Row icon={<Pencil size={16} />} label="Edit Message" onClick={() => { onEdit(post); onClose(); }} />}
        <Row icon={<Reply size={16} />} label="Reply" onClick={() => { onReply(post); onClose(); }} />
        <Row icon={<CornerUpRight size={16} />} label="Thread" onClick={() => { onToggleThread(post.id); onClose(); }} />
        <Row icon={<Copy size={16} />} label="Copy Text" onClick={() => { navigator.clipboard?.writeText(post.content || ""); onClose(); }} />
        {!isOwner && <Row icon={<Flag size={16} />} label={reportedIds[post.id] ? "Reported" : "Report"} onClick={() => { if (!reportedIds[post.id]) onReport(post); onClose(); }} />}
        {isOwner && <Row icon={<Trash2 size={16} />} label="Delete Message" danger onClick={() => { onDelete(post.id); onClose(); }} />}
      </div>
    </div>
  );
}

function CropModal({ image, aspect, shape, onCancel, onConfirm }) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  const dragRef = useRef(null);
  const frameRef = useRef(null);

  function handlePointerDown(e) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origPos: pos };
  }
  function handlePointerMove(e) {
    if (!dragRef.current || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragRef.current.startX) / rect.width;
    const dy = (e.clientY - dragRef.current.startY) / rect.height;
    setPos({
      x: Math.min(1, Math.max(0, dragRef.current.origPos.x - dx)),
      y: Math.min(1, Math.max(0, dragRef.current.origPos.y - dy)),
    });
  }
  function handlePointerUp() {
    dragRef.current = null;
  }

  function confirm() {
    const img = new window.Image();
    img.onload = () => {
      const outW = aspect >= 1 ? 800 : 400;
      const outH = Math.round(outW / aspect);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");

      const scale = Math.max(outW / img.width, outH / img.height) * zoom;
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = outW / 2 - pos.x * drawW;
      const drawY = outH / 2 - pos.y * drawH;

      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      onConfirm(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.src = image;
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div className="card p-4" style={{ maxWidth: 380, width: "100%" }}>
        <h3 className="text-sm font-semibold mb-3">Adjust image</h3>
        <div
          ref={frameRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            width: "100%",
            aspectRatio: aspect,
            borderRadius: shape === "circle" ? "50%" : 12,
            overflow: "hidden",
            position: "relative",
            background: "var(--surface-2)",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <img
            src={image}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              top: `${pos.y * 100}%`,
              left: `${pos.x * 100}%`,
              transform: `translate(-50%, -50%) scale(${zoom})`,
              minWidth: "100%",
              minHeight: "100%",
              width: "auto",
              height: "auto",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        </div>
        <div className="flex items-center gap-2 mt-3">
          <ZoomIn size={14} style={{ color: "var(--text-muted)" }} />
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={confirm} className="btn-primary">Apply</button>
          <button onClick={onCancel} className="btn-primary" style={{ background: "var(--surface-2)", color: "var(--text)" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function OnboardingFlowModal({ data, channels, onClose, onSubmit, submitting }) {
  const [answers, setAnswers] = useState({});

  function setAnswer(questionId, value) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }
  function toggleMulti(questionId, optionId) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      return { ...prev, [questionId]: next };
    });
  }

  const recommendedChannels = channels.filter((c) => data.recommendedChannelIds?.includes(c.id));

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--surface)", zIndex: 250, display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div className="p-5" style={{ flex: 1, maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <h1 className="text-xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>
          {data.welcomeTitle || "Welcome!"}
        </h1>
        {data.welcomeBody && (
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}>{data.welcomeBody}</p>
        )}

        {recommendedChannels.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>Recommended channels</h3>
            <div className="space-y-1">
              {recommendedChannels.map((c) => (
                <div key={c.id} className="flex items-center gap-1.5 text-sm">
                  <Hash size={14} style={{ color: "var(--text-muted)" }} /> {c.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {(data.questions || []).map((q) => (
          <div key={q.id} className="mb-4">
            <p className="text-sm font-semibold mb-2">{q.text}</p>
            {q.type === "text" && (
              <input
                className="input pl-3"
                value={answers[q.id] || ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
              />
            )}
            {q.type === "single" && (
              <div className="space-y-1.5">
                {q.options.map((opt) => (
                  <label key={opt.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === opt.id}
                      onChange={() => setAnswer(q.id, opt.id)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            )}
            {q.type === "multi" && (
              <div className="space-y-1.5">
                {q.options.map((opt) => (
                  <label key={opt.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Array.isArray(answers[q.id]) && answers[q.id].includes(opt.id)}
                      onChange={() => toggleMulti(q.id, opt.id)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}

        {data.requireRulesAck && (
          <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
            By continuing you agree to follow this community's rules. You can review them any time from Settings → Rules.
          </p>
        )}

        <div className="flex gap-2 mt-2">
          <button onClick={() => onSubmit(answers)} className="btn-primary" disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : "Get Started"}
          </button>
          <button onClick={onClose} className="btn-primary" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

const ROLE_COLORS = ["#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#3B82F6", "#EF4444"];
const ACCENT_COLORS = ["#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#3B82F6", "#EF4444", "#14B8A6", "#F472B6"];
const CATEGORY_OPTIONS = ["Gaming", "Education", "Technology", "Art", "Business", "Music", "Photography", "AI", "Writing", "General"];

const SETTINGS_NAV = [
  {
    group: "Community",
    items: [
      { key: "overview", label: "Overview" },
      { key: "members", label: "Members" },
      { key: "roles", label: "Roles" },
      { key: "invites", label: "Invites" },
    ],
  },
  {
    group: "Structure",
    items: [
      { key: "channels", label: "Categories & Channels" },
      { key: "channel-permissions", label: "Channel Permissions" },
      { key: "threads", label: "Threads" },
    ],
  },
  {
    group: "Community Settings",
    items: [
      { key: "rules", label: "Rules" },
      { key: "onboarding", label: "Onboarding" },
      { key: "community-guide", label: "Community Guide" },
      { key: "emojis-stickers", label: "Emojis & Stickers" },
    ],
  },
  {
    group: "Moderation",
    items: [
      { key: "safety-moderation", label: "Safety & Moderation" },
      { key: "automod", label: "AutoMod" },
      { key: "audit-log", label: "Audit Log" },
    ],
  },
  {
    group: "Integrations",
    items: [
      { key: "integrations", label: "Integrations" },
      { key: "webhooks", label: "Webhooks" },
    ],
  },
  {
    group: "Advanced",
    items: [
      { key: "server-analytics", label: "Server Analytics" },
      { key: "widget", label: "Widget" },
    ],
  },
  {
    group: "Danger Zone",
    items: [
      { key: "danger", label: "Danger Zone", danger: true },
    ],
  },
];

const SETTINGS_TITLES = {
  overview: "Overview",
  members: "Members",
  roles: "Roles",
  invites: "Invites",
  channels: "Categories & Channels",

  "channel-permissions": "Channel Permissions",
  threads: "Threads",

  rules: "Rules",
  onboarding: "Onboarding",
  "community-guide": "Community Guide",
  "emojis-stickers": "Emojis & Stickers",

  "safety-moderation": "Safety & Moderation",
  automod: "AutoMod",
  "audit-log": "Audit Log",

  integrations: "Integrations",
  webhooks: "Webhooks",

  "server-analytics": "Server Analytics",
  widget: "Widget",

  danger: "Danger Zone",
};

function SettingsSidebar({ settingsPage, setSettingsPage, isOwner }) {
  return (
    <div className="space-y-4">
      {SETTINGS_NAV.map((section) => (
        <div key={section.group}>
          <div className="text-xs font-semibold mb-1 px-2" style={{ color: "var(--text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
            {section.group}
          </div>
          {section.items.map((item) => {
            if (item.key === "danger" && !isOwner) return null;
            return (
              <button
                key={item.key}
                onClick={() => setSettingsPage(item.key)}
                className="w-full text-left text-sm px-3 py-2 rounded-lg mb-0.5"
                style={{
                  background: settingsPage === item.key ? "var(--accent-soft)" : "transparent",
                  color: item.danger ? "var(--danger, #e55)" : settingsPage === item.key ? "var(--accent)" : "var(--text)",
                  border: "none",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
