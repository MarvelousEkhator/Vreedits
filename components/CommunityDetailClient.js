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

function AccessControlRow({ label, value, onChange, roles }) {
  function updateType(type) {
    onChange({ type, roleIds: type === "roles" ? value.roleIds : [] });
  }
  function toggleRole(roleId) {
    const has = value.roleIds.includes(roleId);
    onChange({ ...value, roleIds: has ? value.roleIds.filter((id) => id !== roleId) : [...value.roleIds, roleId] });
  }

  return (
    <div className="mb-2">
      <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>{label}</div>
      <select
        className="input pl-3"
        style={{ padding: "8px 10px", fontSize: 13 }}
        value={value.type}
        onChange={(e) => updateType(e.target.value)}
      >
        <option value="everyone">Everyone</option>
        <option value="roles">Specific roles</option>
        <option value="moderators">Moderators</option>
        <option value="administrators">Administrators</option>
        <option value="owner">Owner only</option>
      </select>
      {value.type === "roles" && (
        <div className="mt-1 pl-2 space-y-1">
          {roles.length === 0 && <p className="text-xs" style={{ color: "var(--text-muted)" }}>No roles created yet.</p>}
          {roles.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-xs py-0.5">
              <input type="checkbox" checked={value.roleIds.includes(r.id)} onChange={() => toggleRole(r.id)} />
              <span style={{ color: r.color || "var(--text)" }}>{r.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
export default function CommunityDetailClient({ communityId, currentUserId }) {
  const router = useRouter();
  const bannerInputRef = useRef(null);
  const iconInputRef = useRef(null);
  const pressTimers = useRef({});

  const [community, setCommunity] = useState(null);
  const [sections, setSections] = useState([]);
  const [channels, setChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [posts, setPosts] = useState([]);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [roles, setRoles] = useState([]);
  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [rules, setRules] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [postsLoading, setPostsLoading] = useState(false);
  const [channelViewOpen, setChannelViewOpen] = useState(false);

  const [view, setView] = useState("feed");
  const [settingsPage, setSettingsPage] = useState(null);

  const [newPost, setNewPost] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [openThreads, setOpenThreads] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});

  const [newPostTitle, setNewPostTitle] = useState("");
  const [showNewPostForm, setShowNewPostForm] = useState(false);
  const [openForumPostId, setOpenForumPostId] = useState(null);

  const [replyingTo, setReplyingTo] = useState(null);
  const [editingPostId, setEditingPostId] = useState(null);
  const [editContent, setEditContent] = useState("");

  const [actionSheetPostId, setActionSheetPostId] = useState(null);

  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [inviting, setInviting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const [invites, setInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [newInviteMaxUses, setNewInviteMaxUses] = useState("");
  const [newInviteExpiresAt, setNewInviteExpiresAt] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteCreateError, setInviteCreateError] = useState("");
  const [copiedInviteId, setCopiedInviteId] = useState(null);

  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelSection, setNewChannelSection] = useState("");
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [channelError, setChannelError] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  const [creatingSection, setCreatingSection] = useState(false);

  const [newChannelType, setNewChannelType] = useState("text");
  const [newChannelView, setNewChannelView] = useState({ type: "everyone", roleIds: [] });
  const [newChannelSend, setNewChannelSend] = useState({ type: "everyone", roleIds: [] });
  const [newChannelThreads, setNewChannelThreads] = useState({ type: "everyone", roleIds: [] });
  const [newChannelManage, setNewChannelManage] = useState({ type: "administrators", roleIds: [] });

  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsSlug, setSettingsSlug] = useState("");
  const [settingsCategory, setSettingsCategory] = useState("");
  const [settingsTagsInput, setSettingsTagsInput] = useState("");
  const [settingsAccentColor, setSettingsAccentColor] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");

  const [cropTarget, setCropTarget] = useState(null);

  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventTime, setNewEventTime] = useState("");
  const [newEventDesc, setNewEventDesc] = useState("");
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [eventError, setEventError] = useState("");

  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState(ROLE_COLORS[0]);
  const [creatingRole, setCreatingRole] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [expandedRoleId, setExpandedRoleId] = useState(null);

  const [newRuleText, setNewRuleText] = useState("");
  const [creatingRule, setCreatingRule] = useState(false);
  const [ruleTextError, setRuleTextError] = useState("");
  const [acknowledging, setAcknowledging] = useState(false);

  const [reportingId, setReportingId] = useState(null);
  const [reportedIds, setReportedIds] = useState({});

  // ── Onboarding (member-facing status, loaded with the rest of the community) ──
  const [onboardingStatus, setOnboardingStatus] = useState({
    enabled: false,
    completed: false,
    welcomeTitle: "",
    welcomeBody: "",
    questions: [],
    recommendedChannelIds: [],
    requireRulesAck: false,
  });
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [submittingOnboarding, setSubmittingOnboarding] = useState(false);

  // ── Onboarding (admin config editor, loaded only when Settings → Onboarding is open) ──
  const [onboardingConfigLoading, setOnboardingConfigLoading] = useState(false);
  const [onboardingEnabled, setOnboardingEnabled] = useState(false);
  const [onboardingWelcomeTitle, setOnboardingWelcomeTitle] = useState("");
  const [onboardingWelcomeBody, setOnboardingWelcomeBody] = useState("");
  const [onboardingQuestions, setOnboardingQuestions] = useState([]);
  const [onboardingRecommendedChannelIds, setOnboardingRecommendedChannelIds] = useState([]);
  const [onboardingRequireRulesAck, setOnboardingRequireRulesAck] = useState(false);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [onboardingSaveStatus, setOnboardingSaveStatus] = useState("");

  // ── Community Guide (member-facing view, loaded when the Guide view is open) ──
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideData, setGuideData] = useState({
    introduction: "",
    importantInfo: "",
    recommendedChannelIds: [],
    faqs: [],
    resources: [],
  });

  // ── Community Guide (admin config editor, loaded only when Settings → Community Guide is open) ──
  const [guideConfigLoading, setGuideConfigLoading] = useState(false);
  const [guideIntroduction, setGuideIntroduction] = useState("");
  const [guideImportantInfo, setGuideImportantInfo] = useState("");
  const [guideRecommendedChannelIds, setGuideRecommendedChannelIds] = useState([]);
  const [guideFaqs, setGuideFaqs] = useState([]);
  const [guideResources, setGuideResources] = useState([]);
  const [savingGuide, setSavingGuide] = useState(false);
  const [guideSaveStatus, setGuideSaveStatus] = useState("");

  // ── Emojis & Stickers (loaded with the rest of the community; used by both settings and the composer picker) ──
  const [emojis, setEmojis] = useState([]);
  const [emojisLoading, setEmojisLoading] = useState(false);
  const emojiFileInputRef = useRef(null);
  const [newEmojiName, setNewEmojiName] = useState("");
  const [newEmojiType, setNewEmojiType] = useState("emoji");
  const [newEmojiImage, setNewEmojiImage] = useState(null);
  const [creatingEmoji, setCreatingEmoji] = useState(false);
  const [emojiError, setEmojiError] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const canManage = community && (community.isOwner || community.isAdmin);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [cRes, chRes, secRes, obRes] = await Promise.all([
        fetch(`/api/communities/${communityId}`),
        fetch(`/api/communities/${communityId}/channels`),
        fetch(`/api/communities/${communityId}/sections`),
        fetch(`/api/communities/${communityId}/onboarding`),
      ]);
      const cData = await cRes.json();

      if (!cRes.ok) {
        setLoadError(cData.error || `Failed to load community (${cRes.status})`);
        setCommunity(null);
        setLoading(false);
        return;
      }

      const chData = await chRes.json();
      const secData = await secRes.json();
      const obData = obRes.ok ? await obRes.json() : null;
      const loadedChannels = chRes.ok ? (chData.channels || []) : [];
      const loadedSections = secRes.ok ? (secData.sections || []) : [];

      setCommunity(cData.community || null);
      setSettingsName(cData.community?.name || "");
      setSettingsDescription(cData.community?.description || "");
      setSettingsSlug(cData.community?.slug || "");
      setSettingsCategory(cData.community?.category || "");
      setSettingsTagsInput((cData.community?.tags || []).join(", "));
      setSettingsAccentColor(cData.community?.accentColor || "");
      setChannels(loadedChannels);
      setSections(loadedSections);
      setActiveChannelId((prev) => prev || loadedChannels[0]?.id || null);
      if (obData?.onboarding) {
        setOnboardingStatus({ ...obData.onboarding, completed: !!obData.completed });
      }
    } catch (err) {
      setLoadError("Network error loading community.");
      setCommunity(null);
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  const loadPosts = useCallback(async (channelId) => {
    setPostsLoading(true);
    try {
      const url = channelId
        ? `/api/communities/${communityId}/posts?channelId=${channelId}`
        : `/api/communities/${communityId}/posts`;
      const res = await fetch(url);
      const data = await res.json();
      // The API returns posts newest-first (orderBy createdAt desc), but the
      // feed renders top-to-bottom oldest-first — and newly-sent posts get
      // appended to the end of this array. Reversing here once, right after
      // the fetch, keeps the array's order consistent everywhere downstream
      // (grouping consecutive messages from the same author, forum listing,
      // etc.) instead of mixing two different orderings.
      if (res.ok) setPosts((data.posts || []).slice().reverse());
    } catch (err) {
    } finally {
      setPostsLoading(false);
    }
  }, [communityId]);

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/communities/${communityId}/members`);
      const data = await res.json();
      if (res.ok) setMembers(data.members || []);
    } catch (err) {}
  }, [communityId]);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/communities/${communityId}/events`);
      const data = await res.json();
      if (res.ok) setEvents(data.events || []);
    } catch (err) {}
  }, [communityId]);

  const loadRoles = useCallback(async () => {
    try {
      const res = await fetch(`/api/communities/${communityId}/roles`);
      const data = await res.json();
      if (res.ok) setRoles(data.roles || []);
    } catch (err) {}
  }, [communityId]);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/threads`);
      const data = await res.json();
      if (res.ok) setThreads(data.threads || []);
    } catch (err) {
    } finally {
      setThreadsLoading(false);
    }
  }, [communityId]);

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch(`/api/communities/${communityId}/rules`);
      const data = await res.json();
      if (res.ok) setRules(data.rules || []);
    } catch (err) {}
  }, [communityId]);

  const loadInvites = useCallback(async () => {
    setInvitesLoading(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/invites`);
      const data = await res.json();
      if (res.ok) setInvites(data.invites || []);
    } catch (err) {
    } finally {
      setInvitesLoading(false);
    }
  }, [communityId]);

  const loadOnboardingConfig = useCallback(async () => {
    setOnboardingConfigLoading(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/onboarding`);
      const data = await res.json();
      if (res.ok && data.onboarding) {
        setOnboardingEnabled(data.onboarding.enabled);
        setOnboardingWelcomeTitle(data.onboarding.welcomeTitle || "");
        setOnboardingWelcomeBody(data.onboarding.welcomeBody || "");
        setOnboardingQuestions(data.onboarding.questions || []);
        setOnboardingRecommendedChannelIds(data.onboarding.recommendedChannelIds || []);
        setOnboardingRequireRulesAck(!!data.onboarding.requireRulesAck);
      }
    } catch (err) {
    } finally {
      setOnboardingConfigLoading(false);
    }
  }, [communityId]);

  const loadGuide = useCallback(async () => {
    setGuideLoading(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/guide`);
      const data = await res.json();
      if (res.ok && data.guide) setGuideData(data.guide);
    } catch (err) {
    } finally {
      setGuideLoading(false);
    }
  }, [communityId]);

  const loadGuideConfig = useCallback(async () => {
    setGuideConfigLoading(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/guide`);
      const data = await res.json();
      if (res.ok && data.guide) {
        setGuideIntroduction(data.guide.introduction || "");
        setGuideImportantInfo(data.guide.importantInfo || "");
        setGuideRecommendedChannelIds(data.guide.recommendedChannelIds || []);
        setGuideFaqs(data.guide.faqs || []);
        setGuideResources(data.guide.resources || []);
      }
    } catch (err) {
    } finally {
      setGuideConfigLoading(false);
    }
  }, [communityId]);

  const loadEmojis = useCallback(async () => {
    setEmojisLoading(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/emojis`);
      const data = await res.json();
      if (res.ok) setEmojis(data.emojis || []);
    } catch (err) {
    } finally {
      setEmojisLoading(false);
    }
  }, [communityId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadEmojis(); }, [loadEmojis]);
  useEffect(() => { if (activeChannelId) loadPosts(activeChannelId); }, [activeChannelId, loadPosts]);
  useEffect(() => { if (view === "events") loadEvents(); }, [view, loadEvents]);
  useEffect(() => { if (view === "guide") loadGuide(); }, [view, loadGuide]);
  useEffect(() => {
    if (settingsPage === "roles" || settingsPage === "members" || settingsPage === "channels") {
      loadRoles();
      loadMembers();
    }
  }, [settingsPage, loadRoles, loadMembers]);
  useEffect(() => { if (settingsPage === "threads") loadThreads(); }, [settingsPage, loadThreads]);
  useEffect(() => { if (settingsPage === "rules") loadRules(); }, [settingsPage, loadRules]);
  useEffect(() => { if (settingsPage === "invites") loadInvites(); }, [settingsPage, loadInvites]);
  useEffect(() => {
    if (settingsPage === "onboarding") {
      loadRoles();
      loadOnboardingConfig();
    }
  }, [settingsPage, loadRoles, loadOnboardingConfig]);
  useEffect(() => {
    if (settingsPage === "community-guide") loadGuideConfig();
  }, [settingsPage, loadGuideConfig]);
  async function toggleMembership() {
    if (community.isMember) {
      await fetch(`/api/communities/${communityId}/membership`, { method: "DELETE" });
    } else {
      await fetch(`/api/communities/${communityId}/membership`, { method: "POST" });
    }
    load();
  }

  async function handleDeleteCommunity() {
    if (!window.confirm(`Delete "${community.name}"? This can't be undone.`)) return;
    await fetch(`/api/communities/${communityId}`, { method: "DELETE" });
    router.push("/communities");
  }

  async function handlePost(e) {
    e.preventDefault();
    const content = newPost.trim();
    const title = newPostTitle.trim();
    const activeChannel = channels.find((c) => c.id === activeChannelId);
    const isForum = activeChannel?.type === "forum";
    if (!content || !activeChannelId) return;
    if (isForum && !title) return;
    setError("");
    setPosting(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          channelId: activeChannelId,
          ...(isForum ? { title } : {}),
          ...(replyingTo ? { replyToId: replyingTo.id } : {}),
        }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        setError(`Server error (${res.status}). Please try again.`);
        return;
      }
      if (!res.ok) {
        setError(data.error || `Could not post (${res.status}).`);
        return;
      }
      setNewPost("");
      setNewPostTitle("");
      setShowNewPostForm(false);
      setReplyingTo(null);
      setPosts((prev) => [...prev, data.post]);
      if (isForum) setOpenForumPostId(data.post.id);
    } catch (err) {
      setError("Network error — check your connection and try again.");
    } finally {
      setPosting(false);
    }
  }

  async function handleLike(post) {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
          : p
      )
    );
    await fetch(`/api/posts/${post.id}/like`, { method: "POST" });
  }

  async function handleDeletePost(id) {
    if (!window.confirm("Delete this message?")) return;
    await fetch(`/api/posts/${id}`, { method: "DELETE" });
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleEditPost(postId) {
    const content = editContent.trim();
    if (!content) return;
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (res.ok) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, content: data.post.content } : p)));
        setEditingPostId(null);
      } else {
        setError(data.error || "Could not save edit.");
      }
    } catch (err) {
      setError("Network error — could not save edit.");
    }
  }

  function startEdit(post) {
    setEditingPostId(post.id);
    setEditContent(post.content);
  }

  async function handleAddComment(postId) {
    const content = (commentDrafts[postId] || "").trim();
    if (!content) return;
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (res.ok) {
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, comments: [...p.comments, data.comment] } : p))
        );
        setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
      } else {
        setError(data.error || "Could not send reply.");
      }
    } catch (err) {
      setError("Network error — could not send reply.");
    }
  }

  function handleOpenThreadFromSettings(thread) {
    if (!thread.channelId) return;
    setSettingsPage(null);
    setView("feed");
    setActiveChannelId(thread.channelId);
    setChannelViewOpen(true);
    setOpenThreads((prev) => ({ ...prev, [thread.postId]: true }));
  }

  async function handleInvite(e) {
    e.preventDefault();
    const username = inviteUsername.trim();
    if (!username) return;
    setInviteStatus("");
    setInviting(true);
    const res = await fetch(`/api/communities/${communityId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    setInviting(false);
    if (!res.ok) {
      setInviteStatus(data.error || "Could not invite that user.");
      return;
    }
    setInviteStatus(`Added @${data.username}.`);
    setInviteUsername("");
    loadMembers();
    load();
  }

  async function handleRemoveMember(memberId) {
    if (!window.confirm("Remove this member from the community?")) return;
    await fetch(`/api/communities/${communityId}/members/${memberId}`, { method: "DELETE" });
    loadMembers();
    load();
  }

  async function handleToggleAdmin(member) {
    const current = community.adminIds || [];
    const nextAdmins = current.includes(member.id)
      ? current.filter((id) => id !== member.id)
      : [...current, member.id];

    await fetch(`/api/communities/${communityId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminIds: nextAdmins }),
    });
    load();
    loadMembers();
  }

  function handleCopyLink() {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }

  async function handleCreateInvite(e) {
    e.preventDefault();
    setInviteCreateError("");
    setCreatingInvite(true);
    const body = {};
    if (newInviteMaxUses.trim()) body.maxUses = parseInt(newInviteMaxUses, 10);
    if (newInviteExpiresAt) body.expiresAt = new Date(newInviteExpiresAt).toISOString();
    const res = await fetch(`/api/communities/${communityId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setCreatingInvite(false);
    if (!res.ok) {
      setInviteCreateError(data.error || "Could not create invite.");
      return;
    }
    setInvites((prev) => [data.invite, ...prev]);
    setNewInviteMaxUses("");
    setNewInviteExpiresAt("");
  }

  async function handleRevokeInvite(invite) {
    if (!window.confirm("Revoke this invite link? It will stop working immediately.")) return;
    await fetch(`/api/communities/${communityId}/invites/${invite.id}`, { method: "DELETE" });
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  function handleCopyInviteLink(invite) {
    const url = `${window.location.origin}/invite/${invite.code}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedInviteId(invite.id);
      setTimeout(() => setCopiedInviteId(null), 2000);
    }
  }

  async function handleCreateSection(e) {
    e.preventDefault();
    const name = newSectionName.trim();
    if (!name) return;
    setCreatingSection(true);
    const res = await fetch(`/api/communities/${communityId}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setCreatingSection(false);
    if (res.ok) {
      setSections((prev) => [...prev, data.section]);
      setNewSectionName("");
    }
  }

  async function handleDeleteSection(section) {
    if (!window.confirm(`Delete section "${section.name}"? Channels inside will become uncategorized.`)) return;
    await fetch(`/api/communities/${communityId}/sections/${section.id}`, { method: "DELETE" });
    setSections((prev) => prev.filter((s) => s.id !== section.id));
    setChannels((prev) => prev.map((c) => (c.sectionId === section.id ? { ...c, sectionId: null } : c)));
  }

  async function handleCreateChannel(e) {
    e.preventDefault();
    const name = newChannelName.trim();
    if (!name) return;
    setChannelError("");
    setCreatingChannel(true);
    const res = await fetch(`/api/communities/${communityId}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        sectionId: newChannelSection || null,
        type: newChannelType,
        viewAccess: newChannelView,
        sendAccess: newChannelSend,
        threadAccess: newChannelThreads,
        manageAccess: newChannelManage,
      }),
    });
    const data = await res.json();
    setCreatingChannel(false);
    if (!res.ok) {
      setChannelError(data.error || "Could not create channel.");
      return;
    }
    setNewChannelName("");
    setChannels((prev) => [...prev, data.channel]);
    setActiveChannelId(data.channel.id);
  }

  async function handleDeleteChannel(channel) {
    if (!window.confirm(`Delete #${channel.name}? All messages in it will be deleted.`)) return;
    await fetch(`/api/communities/${communityId}/channels/${channel.id}`, { method: "DELETE" });
    const remaining = channels.filter((c) => c.id !== channel.id);
    setChannels(remaining);
    if (activeChannelId === channel.id) {
      setActiveChannelId(remaining[0]?.id || null);
      setChannelViewOpen(false);
    }
  }

  function pickImage(target) {
    const input = target === "banner" ? bannerInputRef.current : iconInputRef.current;
    input?.click();
  }

  function handleImageFileChange(e, target) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropTarget({ type: target, image: reader.result });
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleCropConfirm(dataUrl) {
    const field = cropTarget.type === "banner" ? "bannerDataUrl" : "iconDataUrl";
    setCropTarget(null);
    setSavingSettings(true);
    const res = await fetch(`/api/communities/${communityId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: dataUrl }),
    });
    setSavingSettings(false);
    if (res.ok) load();
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsStatus("");
    const tags = settingsTagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const res = await fetch(`/api/communities/${communityId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: settingsName,
        description: settingsDescription,
        slug: settingsSlug,
        category: settingsCategory,
        tags,
        accentColor: settingsAccentColor,
      }),
    });
    const data = await res.json();
    setSavingSettings(false);
    if (!res.ok) {
      setSettingsStatus(data.error || "Could not save settings.");
      return;
    }
    setSettingsStatus("Saved.");
    load();
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    const title = newEventTitle.trim();
    if (!title || !newEventTime) return;
    setEventError("");
    setCreatingEvent(true);
    const res = await fetch(`/api/communities/${communityId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description: newEventDesc, startTime: newEventTime }),
    });
    const data = await res.json();
    setCreatingEvent(false);
    if (!res.ok) {
      setEventError(data.error || "Could not create event.");
      return;
    }
    setNewEventTitle("");
    setNewEventTime("");
    setNewEventDesc("");
    setEvents((prev) => [...prev, data.event].sort((a, b) => new Date(a.startTime) - new Date(b.startTime)));
  }

  async function handleRsvp(event) {
    const res = await fetch(`/api/events/${event.id}/rsvp`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setEvents((prev) =>
        prev.map((e) => (e.id === event.id ? { ...e, isAttending: data.isAttending, attendeeCount: data.attendeeCount } : e))
      );
    }
  }

  async function handleCreateRole(e) {
    e.preventDefault();
    const name = newRoleName.trim();
    if (!name) return;
    setRoleError("");
    setCreatingRole(true);
    const res = await fetch(`/api/communities/${communityId}/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color: newRoleColor, permissions: [] }),
    });
    const data = await res.json();
    setCreatingRole(false);
    if (!res.ok) {
      setRoleError(data.error || "Could not create role.");
      return;
    }
    setNewRoleName("");
    setRoles((prev) => [...prev, data.role]);
  }

  async function handleDeleteRole(role) {
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    await fetch(`/api/communities/${communityId}/roles/${role.id}`, { method: "DELETE" });
    setRoles((prev) => prev.filter((r) => r.id !== role.id));
  }

  async function handleToggleRoleMember(role, memberId) {
    const has = role.memberIds.includes(memberId);
    const memberIds = has ? role.memberIds.filter((id) => id !== memberId) : [...role.memberIds, memberId];
    const res = await fetch(`/api/communities/${communityId}/roles/${role.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds }),
    });
    const data = await res.json();
    if (res.ok) {
      setRoles((prev) => prev.map((r) => (r.id === role.id ? data.role : r)));
    }
  }

  async function handleCreateRule(e) {
    e.preventDefault();
    const text = newRuleText.trim();
    if (!text) return;
    setRuleTextError("");
    setCreatingRule(true);
    const res = await fetch(`/api/communities/${communityId}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    setCreatingRule(false);
    if (!res.ok) {
      setRuleTextError(data.error || "Could not add rule.");
      return;
    }
    setNewRuleText("");
    setRules((prev) => [...prev, data.rule]);
  }

  async function handleDeleteRule(rule) {
    if (!window.confirm("Delete this rule?")) return;
    await fetch(`/api/communities/${communityId}/rules/${rule.id}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    load();
  }

  async function handleAcknowledgeRules() {
    setAcknowledging(true);
    await fetch(`/api/communities/${communityId}/rules/acknowledge`, { method: "POST" });
    setAcknowledging(false);
    load();
  }

  async function handleReportPost(post) {
    const reason = window.prompt("Why are you reporting this post?");
    if (!reason || !reason.trim()) return;
    setReportingId(post.id);
    const res = await fetch(`/api/communities/${communityId}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: "post", targetId: post.id, reason: reason.trim() }),
    });
    setReportingId(null);
    if (res.ok) {
      setReportedIds((prev) => ({ ...prev, [post.id]: true }));
    }
  }

  async function handleReportComment(comment) {
    const reason = window.prompt("Why are you reporting this reply?");
    if (!reason || !reason.trim()) return;
    setReportingId(comment.id);
    const res = await fetch(`/api/communities/${communityId}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: "comment", targetId: comment.id, reason: reason.trim() }),
    });
    setReportingId(null);
    if (res.ok) {
      setReportedIds((prev) => ({ ...prev, [comment.id]: true }));
    }
  }

  async function handleReportMember(member) {
    const reason = window.prompt(`Why are you reporting @${member.username}?`);
    if (!reason || !reason.trim()) return;
    setReportingId(member.id);
    const res = await fetch(`/api/communities/${communityId}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: "member", targetId: member.id, reason: reason.trim() }),
    });
    setReportingId(null);
    if (res.ok) {
      setReportedIds((prev) => ({ ...prev, [member.id]: true }));
    }
  }

  function handlePressStart(postId) {
    pressTimers.current[postId] = setTimeout(() => setActionSheetPostId(postId), 400);
  }
  function handlePressEnd(postId) {
    clearTimeout(pressTimers.current[postId]);
  }

  // ── Onboarding: admin config editor helpers ──
  function addOnboardingQuestion() {
    setOnboardingQuestions((prev) => [
      ...prev,
      { id: genId(), text: "", type: "single", options: [{ id: genId(), label: "", roleId: null }] },
    ]);
  }
  function removeOnboardingQuestion(id) {
    setOnboardingQuestions((prev) => prev.filter((q) => q.id !== id));
  }
  function updateOnboardingQuestion(id, patch) {
    setOnboardingQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }
  function addOnboardingOption(questionId) {
    setOnboardingQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId ? { ...q, options: [...q.options, { id: genId(), label: "", roleId: null }] } : q
      )
    );
  }
  function removeOnboardingOption(questionId, optionId) {
    setOnboardingQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId ? { ...q, options: q.options.filter((o) => o.id !== optionId) } : q
      )
    );
  }
  function updateOnboardingOption(questionId, optionId, patch) {
    setOnboardingQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? { ...q, options: q.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)) }
          : q
      )
    );
  }
  function toggleRecommendedChannel(channelId) {
    setOnboardingRecommendedChannelIds((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId]
    );
  }

  async function handleSaveOnboarding(e) {
    e.preventDefault();
    setSavingOnboarding(true);
    setOnboardingSaveStatus("");
    const res = await fetch(`/api/communities/${communityId}/onboarding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: onboardingEnabled,
        welcomeTitle: onboardingWelcomeTitle,
        welcomeBody: onboardingWelcomeBody,
        questions: onboardingQuestions,
        recommendedChannelIds: onboardingRecommendedChannelIds,
        requireRulesAck: onboardingRequireRulesAck,
      }),
    });
    const data = await res.json();
    setSavingOnboarding(false);
    if (!res.ok) {
      setOnboardingSaveStatus(data.error || "Could not save onboarding.");
      return;
    }
    setOnboardingSaveStatus("Saved.");
    if (data.onboarding) {
      setOnboardingStatus((prev) => ({ ...prev, ...data.onboarding }));
    }
  }

  // ── Onboarding: member-facing flow ──
  async function handleSubmitOnboarding(answers) {
    setSubmittingOnboarding(true);
    const res = await fetch(`/api/communities/${communityId}/onboarding/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    setSubmittingOnboarding(false);
    if (res.ok) {
      setOnboardingStatus((prev) => ({ ...prev, completed: true }));
      setOnboardingDismissed(true);
      loadRoles();
    }
  }

  // ── Community Guide: admin config editor helpers ──
  function toggleGuideRecommendedChannel(channelId) {
    setGuideRecommendedChannelIds((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId]
    );
  }
  function addGuideFaq() {
    setGuideFaqs((prev) => [...prev, { id: genId(), question: "", answer: "" }]);
  }
  function removeGuideFaq(id) {
    setGuideFaqs((prev) => prev.filter((f) => f.id !== id));
  }
  function updateGuideFaq(id, patch) {
    setGuideFaqs((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function addGuideResource() {
    setGuideResources((prev) => [...prev, { id: genId(), label: "", url: "" }]);
  }
  function removeGuideResource(id) {
    setGuideResources((prev) => prev.filter((r) => r.id !== id));
  }
  function updateGuideResource(id, patch) {
    setGuideResources((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function handleSaveGuide(e) {
    e.preventDefault();
    setSavingGuide(true);
    setGuideSaveStatus("");
    const res = await fetch(`/api/communities/${communityId}/guide`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        introduction: guideIntroduction,
        importantInfo: guideImportantInfo,
        recommendedChannelIds: guideRecommendedChannelIds,
        faqs: guideFaqs,
        resources: guideResources,
      }),
    });
    const data = await res.json();
    setSavingGuide(false);
    if (!res.ok) {
      setGuideSaveStatus(data.error || "Could not save the community guide.");
      return;
    }
    setGuideSaveStatus("Saved.");
    if (data.guide) setGuideData(data.guide);
  }

  // ── Emojis & Stickers ──
  function pickEmojiFile() {
    emojiFileInputRef.current?.click();
  }

  function handleEmojiFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setEmojiError("Image must be under 1MB.");
      return;
    }
    setEmojiError("");
    const reader = new FileReader();
    reader.onload = () => setNewEmojiImage(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleCreateEmoji(e) {
    e.preventDefault();
    const name = newEmojiName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!name) {
      setEmojiError("Give it a name using only letters, numbers, and underscores.");
      return;
    }
    if (!newEmojiImage) {
      setEmojiError("Choose an image to upload.");
      return;
    }
    setEmojiError("");
    setCreatingEmoji(true);
    const res = await fetch(`/api/communities/${communityId}/emojis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type: newEmojiType, imageDataUrl: newEmojiImage }),
    });
    const data = await res.json();
    setCreatingEmoji(false);
    if (!res.ok) {
      setEmojiError(data.error || "Could not upload.");
      return;
    }
    setEmojis((prev) => [...prev, data.emoji]);
    setNewEmojiName("");
    setNewEmojiImage(null);
  }

  async function handleDeleteEmoji(emoji) {
    if (!window.confirm(`Delete "${emoji.name}"?`)) return;
    await fetch(`/api/communities/${communityId}/emojis/${emoji.id}`, { method: "DELETE" });
    setEmojis((prev) => prev.filter((e) => e.id !== emoji.id));
  }

  function insertEmojiShortcode(emoji) {
    setNewPost((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}:${emoji.name}:`);
    setEmojiPickerOpen(false);
  }
  if (loading) {
    return (
      <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (loadError || !community) {
    return (
      <div className="text-sm text-center py-10" style={{ color: "var(--danger, #e55)" }}>
        {loadError || "Community not found."}
      </div>
    );
  }

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const uncategorized = channels.filter((c) => !c.sectionId || !sections.find((s) => s.id === c.sectionId));
  const mustAcknowledgeRules = community.isMember && community.hasRules && !community.hasAcknowledgedRules && !community.isOwner;
  const actionSheetPost = actionSheetPostId ? posts.find((p) => p.id === actionSheetPostId) : null;
  const showOnboardingFlow =
    community.isMember &&
    !community.isOwner &&
    onboardingStatus.enabled &&
    !onboardingStatus.completed &&
    !onboardingDismissed;

  function handleSettingsBack() {
    if (settingsPage) {
      setSettingsPage(null);
    } else {
      setView("feed");
    }
  }

  function openChannel(channelId) {
    setActiveChannelId(channelId);
    setChannelViewOpen(true);
  }
  return (
    <div>
      {cropTarget && (
        <CropModal
          image={cropTarget.image}
          aspect={cropTarget.type === "banner" ? 3 : 1}
          shape={cropTarget.type === "icon" ? "circle" : "square"}
          onCancel={() => setCropTarget(null)}
          onConfirm={handleCropConfirm}
        />
      )}
      <input ref={bannerInputRef} type="file" accept="image/*" onChange={(e) => handleImageFileChange(e, "banner")} style={{ display: "none" }} />
      <input ref={iconInputRef} type="file" accept="image/*" onChange={(e) => handleImageFileChange(e, "icon")} style={{ display: "none" }} />

      {showOnboardingFlow && (
        <OnboardingFlowModal
          data={onboardingStatus}
          channels={channels}
          onClose={() => setOnboardingDismissed(true)}
          onSubmit={handleSubmitOnboarding}
          submitting={submittingOnboarding}
        />
      )}

      {actionSheetPost && (
        <PostActionSheet
          post={actionSheetPost}
          currentUserId={currentUserId}
          onClose={() => setActionSheetPostId(null)}
          onQuickReact={(emoji) => {
            if (emoji === "❤️") { handleLike(actionSheetPost); return; }
            fetch(`/api/posts/${actionSheetPost.id}/reactions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ emoji }),
            });
          }}
          onReply={(post) => setReplyingTo(post)}
          onEdit={(post) => startEdit(post)}
          onDelete={(id) => handleDeletePost(id)}
          onReport={(post) => handleReportPost(post)}
          onToggleThread={(postId) => setOpenThreads((prev) => ({ ...prev, [postId]: !prev[postId] }))}
          reportedIds={reportedIds}
        />
      )}

      {view === "settings" && canManage && (
        <div
          style={{
            position: "fixed", inset: 0, background: "var(--surface)", zIndex: 150,
            display: "flex", flexDirection: "column", overflowY: "auto",
          }}
        >
          <div
            className="flex items-center gap-3 p-4"
            style={{ borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}
          >
            <button onClick={handleSettingsBack} aria-label="Back" style={{ background: "none", border: "none", color: "var(--text)" }}>
              <ChevronLeft size={22} />
            </button>
            <h1 className="text-base font-semibold">
              {settingsPage ? SETTINGS_TITLES[settingsPage] : "Community Settings"}
            </h1>
          </div>

          <div className="p-4" style={{ flex: 1 }}>
            {!settingsPage && (
              <SettingsSidebar settingsPage={settingsPage || ""} setSettingsPage={setSettingsPage} isOwner={community.isOwner} />
            )}

            {settingsPage === "overview" && (
              <form onSubmit={handleSaveSettings} className="space-y-3">
                <div>
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>Name</label>
                  <input className="input pl-3 mt-1" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>Description</label>
                  <input className="input pl-3 mt-1" value={settingsDescription} onChange={(e) => setSettingsDescription(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>Community URL</label>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>/c/</span>
                    <input
                      className="input pl-3"
                      placeholder="your-community-name"
                      value={settingsSlug}
                      onChange={(e) => setSettingsSlug(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>Category</label>
                  <select
                    className="input pl-3 mt-1"
                    value={settingsCategory}
                    onChange={(e) => setSettingsCategory(e.target.value)}
                  >
                    <option value="">No category</option>
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>Tags (comma separated)</label>
                  <input
                    className="input pl-3 mt-1"
                    placeholder="e.g. beginners, weekly-events, chill"
                    value={settingsTagsInput}
                    onChange={(e) => setSettingsTagsInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>Accent Color</label>
                  <div className="flex items-center gap-2 mt-1">
                    {ACCENT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSettingsAccentColor(c)}
                        style={{
                          width: 26, height: 26, borderRadius: "50%", background: c,
                          border: settingsAccentColor === c ? "2px solid var(--text)" : "2px solid transparent",
                        }}
                        aria-label={`Accent color ${c}`}
                      />
                    ))}
                  </div>
                </div>
                {settingsStatus && <div className="text-xs" style={{ color: "var(--text-muted)" }}>{settingsStatus}</div>}
                <button type="submit" className="btn-primary" disabled={savingSettings}>
                  {savingSettings ? <Loader2 size={14} className="animate-spin" /> : "Save"}
                </button>
              </form>
            )}

            {settingsPage === "members" && (
              <div>
                <form onSubmit={handleInvite} className="flex items-center gap-2 mb-3">
                  <input
                    className="input pl-3"
                    style={{ padding: "8px 10px", fontSize: 13 }}
                    placeholder="Invite by username…"
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                  />
                  <button type="submit" className="btn-primary" style={{ maxWidth: 100 }} disabled={inviting || !inviteUsername.trim()}>
                    {inviting ? <Loader2 size={14} className="animate-spin" /> : <><UserPlus size={14} /> Invite</>}
                  </button>
                </form>
                {inviteStatus && <div className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{inviteStatus}</div>}
                <div className="space-y-2">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar user={m} size={28} />
                        <span className="text-sm">{m.username}</span>
                        {m.isOwner && <Crown size={12} style={{ color: "#F0B75E" }} />}
                        {!m.isOwner && community.adminIds?.includes(m.id) && (
                          <span className="text-xs" style={{ color: "var(--accent)" }}>Admin</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {!m.isOwner && m.id !== currentUserId && (
                          <button
                            onClick={() => handleReportMember(m)}
                            disabled={reportingId === m.id || reportedIds[m.id]}
                            aria-label={`Report ${m.username}`}
                            style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                          >
                            <Flag size={15} />
                          </button>
                        )}
                        {community.isOwner && !m.isOwner && (
                          <>
                            <button
                              onClick={() => handleToggleAdmin(m)}
                              aria-label={community.adminIds?.includes(m.id) ? `Remove admin from ${m.username}` : `Make ${m.username} admin`}
                              style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                            >
                              {community.adminIds?.includes(m.id) ? <ShieldOff size={15} /> : <Shield size={15} />}
                            </button>
                            <button
                              onClick={() => handleRemoveMember(m.id)}
                              aria-label={`Remove ${m.username}`}
                              style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                            >
                              <XIcon size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {members.length === 0 && <p className="text-xs" style={{ color: "var(--text-muted)" }}>No members loaded yet.</p>}
                </div>
              </div>
            )}

            {settingsPage === "invites" && (
              <div>
                {invitesLoading ? (
                  <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
                    <Loader2 size={22} className="animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2 mb-4">
                    {invites.map((inv) => {
                      const expired = inv.expiresAt && new Date(inv.expiresAt) < new Date();
                      const exhausted = inv.maxUses !== null && inv.useCount >= inv.maxUses;
                      const status = expired ? "Expired" : exhausted ? "Exhausted" : "Active";
                      return (
                        <div key={inv.id} className="card p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold" style={{ fontFamily: "monospace", letterSpacing: 1 }}>{inv.code}</span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                background: status === "Active" ? "var(--accent-soft)" : "var(--surface-2)",
                                color: status === "Active" ? "var(--accent)" : "var(--text-muted)",
                              }}
                            >
                              {status}
                            </span>
                          </div>
                          <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                            {inv.useCount} use{inv.useCount === 1 ? "" : "s"}{inv.maxUses !== null ? ` / ${inv.maxUses}` : ""}
                            {inv.expiresAt && ` · expires ${new Date(inv.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleCopyInviteLink(inv)}
                              className="btn-primary"
                              style={{ background: "var(--surface-2)", color: "var(--text)", maxWidth: 160 }}
                            >
                              <Link2 size={13} /> {copiedInviteId === inv.id ? "Copied!" : "Copy link"}
                            </button>
                            {canManage && (
                              <button
                                onClick={() => handleRevokeInvite(inv)}
                                style={{ background: "none", border: "none", color: "var(--text-muted)" }}
                                aria-label="Revoke invite"
                              >
                                <XIcon size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {invites.length === 0 && <p className="text-xs" style={{ color: "var(--text-muted)" }}>No invite links yet.</p>}
                  </div>
                )}

                {canManage && (
                  <form onSubmit={handleCreateInvite} className="space-y-2">
                    {inviteCreateError && <div className="text-xs" style={{ color: "var(--danger, #e55)" }}>{inviteCreateError}</div>}
                    <div>
                      <label className="text-xs" style={{ color: "var(--text-muted)" }}>Max uses (optional)</label>
                      <input
                        className="input pl-3 mt-1"
                        style={{ padding: "8px 10px", fontSize: 13 }}
                        type="number"
                        min="1"
                        placeholder="Unlimited"
                        value={newInviteMaxUses}
                        onChange={(e) => setNewInviteMaxUses(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs" style={{ color: "var(--text-muted)" }}>Expires (optional)</label>
                      <input
                        className="input pl-3 mt-1"
                        style={{ padding: "8px 10px", fontSize: 13 }}
                        type="datetime-local"
                        value={newInviteExpiresAt}
                        onChange={(e) => setNewInviteExpiresAt(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn-primary" disabled={creatingInvite}>
                      {creatingInvite ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Create Invite</>}
                    </button>
                  </form>
                )}
              </div>
            )}

            {settingsPage === "channels" && (
              <div>
                <h3 className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>Categories</h3>
                <div className="space-y-1 mb-2">
                  {sections.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm py-1">
                      <span>{s.name}</span>
                      <button onClick={() => handleDeleteSection(s)} style={{ background: "none", border: "none", color: "var(--text-muted)" }} aria-label={`Delete section ${s.name}`}>
                        <XIcon size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleCreateSection} className="flex items-center gap-2 mb-4">
                  <input
                    className="input pl-3"
                    style={{ padding: "8px 10px", fontSize: 13 }}
                    placeholder="New category name"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                  />
                  <button type="submit" className="btn-primary" style={{ maxWidth: 90 }} disabled={creatingSection || !newSectionName.trim()}>
                    {creatingSection ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Add</>}
                  </button>
                </form>

                <h3 className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>Channels</h3>
                <div className="space-y-1 mb-3">
                  {channels.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm py-1">
                      <span className="flex items-center gap-1">
                        <Hash size={13} /> {c.name}
                        <span className="text-xs" style={{ color: "var(--text-muted)", textTransform: "capitalize" }}>· {c.type}</span>
                        {c.sectionId && (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            · {sections.find((s) => s.id === c.sectionId)?.name}
                          </span>
                        )}
                      </span>
                      {channels.length > 1 && (
                        <button onClick={() => handleDeleteChannel(c)} style={{ background: "none", border: "none", color: "var(--text-muted)" }} aria-label={`Delete #${c.name}`}>
                          <XIcon size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <h3 className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>Create Channel</h3>
                  <form onSubmit={handleCreateChannel} className="space-y-2">
                    {channelError && <div className="text-xs" style={{ color: "var(--danger, #e55)" }}>{channelError}</div>}
                    <input
                      className="input pl-3"
                      style={{ padding: "8px 10px", fontSize: 13 }}
                      placeholder="new-channel-name"
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value)}
                    />
                    {sections.length > 0 && (
                      <select
                        className="input pl-3"
                        style={{ padding: "8px 10px", fontSize: 13 }}
                        value={newChannelSection}
                        onChange={(e) => setNewChannelSection(e.target.value)}
                      >
                        <option value="">No category</option>
                        {sections.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    )}

                    <div className="text-xs font-semibold mt-2" style={{ color: "var(--text-muted)" }}>Channel Type</div>
                    <select
                      className="input pl-3"
                      style={{ padding: "8px 10px", fontSize: 13 }}
                      value={newChannelType}
                      onChange={(e) => setNewChannelType(e.target.value)}
                    >
                      <option value="text">Text — send messages, share media and chat</option>
                      <option value="forum">Forum / Posts — create posts and have discussions</option>
                      <option value="announcement">Announcement — share important updates</option>
                      <option value="voice">Voice — talk live with your community</option>
                      <option value="event">Event — schedule and manage events</option>
                    </select>

                    <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                      <AccessControlRow label="Who can view this channel?" value={newChannelView} onChange={setNewChannelView} roles={roles} />
                      <AccessControlRow label="Who can send messages?" value={newChannelSend} onChange={setNewChannelSend} roles={roles} />
                      <AccessControlRow label="Who can create threads?" value={newChannelThreads} onChange={setNewChannelThreads} roles={roles} />
                      <AccessControlRow label="Who can manage this channel?" value={newChannelManage} onChange={setNewChannelManage} roles={roles} />
                    </div>

                    <button type="submit" className="btn-primary" disabled={creatingChannel || !newChannelName.trim()}>
                      {creatingChannel ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Add Channel</>}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {settingsPage === "roles" && (
              <div>
                <div className="space-y-2 mb-4">
                  {roles.map((role) => (
                    <div key={role.id} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                      <button
                        onClick={() => setExpandedRoleId(expandedRoleId === role.id ? null : role.id)}
                        className="flex items-center justify-between w-full p-3"
                        style={{ background: "none", border: "none", textAlign: "left" }}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <Tag size={13} style={{ color: role.color || "var(--accent)" }} />
                          {role.name}
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>({role.memberIds.length})</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteRole(role); }}
                            style={{ background: "none", border: "none", color: "var(--text-muted)" }}
                            aria-label={`Delete role ${role.name}`}
                          >
                            <XIcon size={14} />
                          </button>
                          <ChevronDown size={14} style={{ transform: expandedRoleId === role.id ? "rotate(180deg)" : "none" }} />
                        </div>
                      </button>
                      {expandedRoleId === role.id && (
                        <div className="p-3 pt-0">
                          <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Members with this role</div>
                          <div className="space-y-1">
                            {members.map((m) => (
                              <label key={m.id} className="flex items-center gap-2 text-sm py-1">
                                <input
                                  type="checkbox"
                                  checked={role.memberIds.includes(m.id)}
                                  onChange={() => handleToggleRoleMember(role, m.id)}
                                />
                                {m.username}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {roles.length === 0 && <p className="text-xs" style={{ color: "var(--text-muted)" }}>No custom roles yet.</p>}
                </div>

                <form onSubmit={handleCreateRole} className="space-y-2">
                  {roleError && <div className="text-xs" style={{ color: "var(--danger, #e55)" }}>{roleError}</div>}
                  <input
                    className="input pl-3"
                    style={{ padding: "8px 10px", fontSize: 13 }}
                    placeholder="Role name"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    {ROLE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewRoleColor(c)}
                        style={{
                          width: 24, height: 24, borderRadius: "50%", background: c,
                          border: newRoleColor === c ? "2px solid var(--text)" : "2px solid transparent",
                        }}
                        aria-label={`Color ${c}`}
                      />
                    ))}
                  </div>
                  <button type="submit" className="btn-primary" disabled={creatingRole || !newRoleName.trim()}>
                    {creatingRole ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Create Role</>}
                  </button>
                </form>
              </div>
            )}

            {settingsPage === "threads" && (
              <div>
                {threadsLoading ? (
                  <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
                    <Loader2 size={22} className="animate-spin" />
                  </div>
                ) : threads.length === 0 ? (
                  <p className="text-xs text-center py-8" style={{ color: "var(--text-muted)" }}>
                    No active threads yet. Threads appear here once members start replying to messages.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {threads.map((t) => (
                      <button
                        key={t.postId}
                        onClick={() => handleOpenThreadFromSettings(t)}
                        className="card p-3 w-full text-left"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Hash size={12} style={{ color: "var(--text-muted)" }} />
                          <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{t.channelName || "unknown-channel"}</span>
                        </div>
                        {t.title && <div className="text-sm font-semibold mb-0.5">{t.title}</div>}
                        <p className="text-xs mb-2" style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                          {t.preview?.slice(0, 100)}{t.preview?.length > 100 ? "…" : ""}
                        </p>
                        <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                          <span className="flex items-center gap-1"><Avatar user={t.author} size={16} /> {t.author.username}</span>
                          <span className="flex items-center gap-1"><MessageCircle size={12} /> {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {settingsPage === "rules" && (
              <div>
                <div className="space-y-2 mb-4">
                  {rules.map((rule, i) => (
                    <div key={rule.id} className="card p-3 flex items-start gap-2">
                      <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{i + 1}.</span>
                      <p className="text-sm flex-1" style={{ overflowWrap: "anywhere" }}>{rule.text}</p>
                      {canManage && (
                        <button onClick={() => handleDeleteRule(rule)} style={{ background: "none", border: "none", color: "var(--text-muted)" }} aria-label="Delete rule">
                          <XIcon size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {rules.length === 0 && <p className="text-xs" style={{ color: "var(--text-muted)" }}>No rules yet.</p>}
                </div>

                {canManage && (
                  <form onSubmit={handleCreateRule} className="space-y-2">
                    {ruleTextError && <div className="text-xs" style={{ color: "var(--danger, #e55)" }}>{ruleTextError}</div>}
                    <textarea
                      className="input pl-3"
                      style={{ padding: "9px 10px", fontSize: 13, minHeight: 60, resize: "vertical" }}
                      placeholder="e.g. Be respectful to other members"
                      value={newRuleText}
                      onChange={(e) => setNewRuleText(e.target.value)}
                    />
                    <button type="submit" className="btn-primary" disabled={creatingRule || !newRuleText.trim()}>
                      {creatingRule ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Add Rule</>}
                    </button>
                  </form>
                )}

                {community.isMember && !community.isOwner && rules.length > 0 && (
                  <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                    <button onClick={handleAcknowledgeRules} className="btn-primary" disabled={acknowledging || community.hasAcknowledgedRules}>
                      {acknowledging ? <Loader2 size={14} className="animate-spin" /> : community.hasAcknowledgedRules ? "✓ Rules acknowledged" : "I've read the rules"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {settingsPage === "onboarding" && (
              <div>
                {onboardingConfigLoading ? (
                  <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
                    <Loader2 size={22} className="animate-spin" />
                  </div>
                ) : (
                  <form onSubmit={handleSaveOnboarding} className="space-y-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={onboardingEnabled}
                        onChange={(e) => setOnboardingEnabled(e.target.checked)}
                      />
                      Enable onboarding for new members
                    </label>

                    <div>
                      <label className="text-xs" style={{ color: "var(--text-muted)" }}>Welcome title</label>
                      <input
                        className="input pl-3 mt-1"
                        placeholder="Welcome to the community!"
                        value={onboardingWelcomeTitle}
                        onChange={(e) => setOnboardingWelcomeTitle(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs" style={{ color: "var(--text-muted)" }}>Welcome message</label>
                      <textarea
                        className="input pl-3 mt-1"
                        style={{ minHeight: 70, resize: "vertical" }}
                        placeholder="Tell new members what this community is about…"
                        value={onboardingWelcomeBody}
                        onChange={(e) => setOnboardingWelcomeBody(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Recommended channels</label>
                      <div className="space-y-1 mt-1">
                        {channels.length === 0 && <p className="text-xs" style={{ color: "var(--text-muted)" }}>No channels yet.</p>}
                        {channels.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 text-xs py-0.5">
                            <input
                              type="checkbox"
                              checked={onboardingRecommendedChannelIds.includes(c.id)}
                              onChange={() => toggleRecommendedChannel(c.id)}
                            />
                            <Hash size={12} /> {c.name}
                          </label>
                        ))}
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={onboardingRequireRulesAck}
                        onChange={(e) => setOnboardingRequireRulesAck(e.target.checked)}
                      />
                      Require members to acknowledge rules during onboarding
                    </label>

                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Questions</h3>
                        <button
                          type="button"
                          onClick={addOnboardingQuestion}
                          className="btn-primary"
                          style={{ maxWidth: 130, padding: "6px 10px" }}
                        >
                          <Plus size={13} /> Add question
                        </button>
                      </div>

                      {onboardingQuestions.length === 0 && (
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          No questions yet. Add one to ask new members during onboarding.
                        </p>
                      )}

                      <div className="space-y-3">
                        {onboardingQuestions.map((q) => (
                          <div key={q.id} className="card p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <input
                                className="input pl-3"
                                style={{ padding: "6px 10px", fontSize: 13, flex: 1 }}
                                placeholder="Question text"
                                value={q.text}
                                onChange={(e) => updateOnboardingQuestion(q.id, { text: e.target.value })}
                              />
                              <select
                                className="input pl-2"
                                style={{ padding: "6px 8px", fontSize: 12, maxWidth: 120 }}
                                value={q.type}
                                onChange={(e) => updateOnboardingQuestion(q.id, { type: e.target.value })}
                              >
                                <option value="single">Single choice</option>
                                <option value="multi">Multi choice</option>
                                <option value="text">Free text</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => removeOnboardingQuestion(q.id)}
                                style={{ background: "none", border: "none", color: "var(--text-muted)" }}
                                aria-label="Delete question"
                              >
                                <XIcon size={14} />
                              </button>
                            </div>

                            {q.type !== "text" && (
                              <div className="space-y-1.5 pl-2">
                                {q.options.map((opt) => (
                                  <div key={opt.id} className="flex items-center gap-2">
                                    <input
                                      className="input pl-3"
                                      style={{ padding: "5px 8px", fontSize: 12, flex: 1 }}
                                      placeholder="Option label"
                                      value={opt.label}
                                      onChange={(e) => updateOnboardingOption(q.id, opt.id, { label: e.target.value })}
                                    />
                                    <select
                                      className="input pl-2"
                                      style={{ padding: "5px 8px", fontSize: 12, maxWidth: 140 }}
                                      value={opt.roleId || ""}
                                      onChange={(e) => updateOnboardingOption(q.id, opt.id, { roleId: e.target.value || null })}
                                    >
                                      <option value="">No role</option>
                                      {roles.map((r) => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => removeOnboardingOption(q.id, opt.id)}
                                      style={{ background: "none", border: "none", color: "var(--text-muted)" }}
                                      aria-label="Delete option"
                                    >
                                      <XIcon size={12} />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => addOnboardingOption(q.id)}
                                  className="text-xs"
                                  style={{ background: "none", border: "none", color: "var(--accent)", padding: "2px 0" }}
                                >
                                  + Add option
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {onboardingSaveStatus && <div className="text-xs" style={{ color: "var(--text-muted)" }}>{onboardingSaveStatus}</div>}
                    <button type="submit" className="btn-primary" disabled={savingOnboarding}>
                      {savingOnboarding ? <Loader2 size={14} className="animate-spin" /> : "Save Onboarding"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {settingsPage === "community-guide" && (
              <div>
                {guideConfigLoading ? (
                  <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
                    <Loader2 size={22} className="animate-spin" />
                  </div>
                ) : (
                  <form onSubmit={handleSaveGuide} className="space-y-3">
                    <div>
                      <label className="text-xs" style={{ color: "var(--text-muted)" }}>Introduction</label>
                      <textarea
                        className="input pl-3 mt-1"
                        style={{ minHeight: 70, resize: "vertical" }}
                        placeholder="What is this community about?"
                        value={guideIntroduction}
                        onChange={(e) => setGuideIntroduction(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs" style={{ color: "var(--text-muted)" }}>Important information</label>
                      <textarea
                        className="input pl-3 mt-1"
                        style={{ minHeight: 70, resize: "vertical" }}
                        placeholder="Anything members should know upfront…"
                        value={guideImportantInfo}
                        onChange={(e) => setGuideImportantInfo(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Recommended channels</label>
                      <div className="space-y-1 mt-1">
                        {channels.length === 0 && <p className="text-xs" style={{ color: "var(--text-muted)" }}>No channels yet.</p>}
                        {channels.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 text-xs py-0.5">
                            <input
                              type="checkbox"
                              checked={guideRecommendedChannelIds.includes(c.id)}
                              onChange={() => toggleGuideRecommendedChannel(c.id)}
                            />
                            <Hash size={12} /> {c.name}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>FAQ</h3>
                        <button type="button" onClick={addGuideFaq} className="btn-primary" style={{ maxWidth: 100, padding: "6px 10px" }}>
                          <Plus size={13} /> Add FAQ
                        </button>
                      </div>
                      {guideFaqs.length === 0 && (
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>No frequently asked questions yet.</p>
                      )}
                      <div className="space-y-2">
                        {guideFaqs.map((f) => (
                          <div key={f.id} className="card p-3">
                            <div className="flex items-center gap-2 mb-1.5">
                              <input
                                className="input pl-3"
                                style={{ padding: "6px 10px", fontSize: 13, flex: 1 }}
                                placeholder="Question"
                                value={f.question}
                                onChange={(e) => updateGuideFaq(f.id, { question: e.target.value })}
                              />
                              <button type="button" onClick={() => removeGuideFaq(f.id)} style={{ background: "none", border: "none", color: "var(--text-muted)" }} aria-label="Delete FAQ">
                                <XIcon size={14} />
                              </button>
                            </div>
                            <textarea
                              className="input pl-3"
                              style={{ padding: "6px 10px", fontSize: 13, minHeight: 50, resize: "vertical" }}
