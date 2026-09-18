"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Crown, Loader2, Trash2, UserPlus, Link2, X as XIcon, Hash, Plus,
  ChevronLeft, Shield, ShieldOff, Tag, SlidersHorizontal, Flag,
} from "lucide-react";
import {
  Avatar, SettingsSidebar, AccessControlRow,
  ROLE_COLORS, ACCENT_COLORS, CATEGORY_OPTIONS, SETTINGS_TITLES, genId,
} from "./CommunityDetailShared";

export default function CommunitySettingsOverlay({
  community,
  communityId,
  currentUserId,
  canManage,
  settingsPage,
  setSettingsPage,
  handleSettingsBack,
  load,
  channels,
  setChannels,
  sections,
  setSections,
  handleDeleteCommunity,
}) {
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [rules, setRules] = useState([]);
  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [invites, setInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(false);

  // Settings form state
  const [settingsName, setSettingsName] = useState(community?.name || "");
  const [settingsDescription, setSettingsDescription] = useState(community?.description || "");
  const [settingsSlug, setSettingsSlug] = useState(community?.slug || "");
  const [settingsCategory, setSettingsCategory] = useState(community?.category || "");
  const [settingsTagsInput, setSettingsTagsInput] = useState((community?.tags || []).join(", "));
  const [settingsAccentColor, setSettingsAccentColor] = useState(community?.accentColor || "");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");

  // Members & Invites
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [inviting, setInviting] = useState(false);
  const [newInviteMaxUses, setNewInviteMaxUses] = useState("");
  const [newInviteExpiresAt, setNewInviteExpiresAt] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteCreateError, setInviteCreateError] = useState("");
  const [copiedInviteId, setCopiedInviteId] = useState(null);

  // Channels & Sections
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

  // Roles & Rules
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState(ROLE_COLORS[0]);
  const [creatingRole, setCreatingRole] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [expandedRoleId, setExpandedRoleId] = useState(null);
  const [newRuleText, setNewRuleText] = useState("");
  const [creatingRule, setCreatingRule] = useState(false);
  const [ruleTextError, setRuleTextError] = useState("");
  const [acknowledging, setAcknowledging] = useState(false);

  // Onboarding Config
  const [onboardingConfigLoading, setOnboardingConfigLoading] = useState(false);
  const [onboardingEnabled, setOnboardingEnabled] = useState(false);
  const [onboardingWelcomeTitle, setOnboardingWelcomeTitle] = useState("");
  const [onboardingWelcomeBody, setOnboardingWelcomeBody] = useState("");
  const [onboardingQuestions, setOnboardingQuestions] = useState([]);
  const [onboardingRecommendedChannelIds, setOnboardingRecommendedChannelIds] = useState([]);
  const [onboardingRequireRulesAck, setOnboardingRequireRulesAck] = useState(false);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [onboardingSaveStatus, setOnboardingSaveStatus] = useState("");

  // Guide Config
  const [guideConfigLoading, setGuideConfigLoading] = useState(false);
  const [guideIntroduction, setGuideIntroduction] = useState("");
  const [guideImportantInfo, setGuideImportantInfo] = useState("");
  const [guideRecommendedChannelIds, setGuideRecommendedChannelIds] = useState([]);
  const [guideFaqs, setGuideFaqs] = useState([]);
  const [guideResources, setGuideResources] = useState([]);
  const [savingGuide, setSavingGuide] = useState(false);
  const [guideSaveStatus, setGuideSaveStatus] = useState("");

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/communities/${communityId}/members`);
      const data = await res.json();
      if (res.ok) setMembers(data.members || []);
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

  useEffect(() => {
    if (settingsPage === "roles" || settingsPage === "members" || settingsPage === "channels") {
      loadRoles();
      loadMembers();
    }
    if (settingsPage === "threads") loadThreads();
    if (settingsPage === "rules") loadRules();
    if (settingsPage === "invites") loadInvites();
    if (settingsPage === "onboarding") {
      loadRoles();
      loadOnboardingConfig();
    }
    if (settingsPage === "community-guide") loadGuideConfig();
  }, [settingsPage, loadRoles, loadMembers, loadThreads, loadRules, loadInvites, loadOnboardingConfig, loadGuideConfig]);

  async function handleSaveSettings(e) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsStatus("");
    const tags = settingsTagsInput.split(",").map((t) => t.trim()).filter(Boolean);

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

  return (
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
              <label className="text-xs" style={{ color: "var(--text-muted)" }}>Category</label>
              <select className="input pl-3 mt-1" value={settingsCategory} onChange={(e) => setSettingsCategory(e.target.value)}>
                <option value="">No category</option>
                {CATEGORY_OPTIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            {settingsStatus && <div className="text-xs" style={{ color: "var(--text-muted)" }}>{settingsStatus}</div>}
            <button type="submit" className="btn-primary" disabled={savingSettings}>
              {savingSettings ? <Loader2 size={14} className="animate-spin" /> : "Save"}
            </button>
          </form>
        )}

        {settingsPage === "danger" && community.isOwner && (
          <div>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Deleting this community removes all channels, posts, and comments permanently.
            </p>
            <button onClick={handleDeleteCommunity} className="btn-primary" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
              <Trash2 size={14} /> Delete Community
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
"use client";
import { Loader2, Heart, Trash2, Send, Flag, ChevronLeft, Hash } from "lucide-react";
import { Avatar, relativeTime } from "./CommunityDetailShared";

export default function CommunityChannelView({
  activeChannel,
  posts,
  postsLoading,
  openForumPostId,
  setOpenForumPostId,
  currentUserId,
  community,
  handleLike,
  handleDeletePost,
  handleReportPost,
  handleReportComment,
  commentDrafts,
  setCommentDrafts,
  handleAddComment,
  reportingId,
  reportedIds,
  setChannelViewOpen,
  setShowNewPostForm,
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "var(--surface)", zIndex: 150,
        display: "flex", flexDirection: "column",
      }}
    >
      <div
        className="flex items-center gap-3 p-4"
        style={{ borderBottom: "1px solid var(--border)", flexShrink: 0 }}
      >
        <button
          onClick={() => {
            if (openForumPostId) {
              setOpenForumPostId(null);
            } else {
              setChannelViewOpen(false);
              setOpenForumPostId(null);
              setShowNewPostForm(false);
            }
          }}
          aria-label="Back"
          style={{ background: "none", border: "none", color: "var(--text)" }}
        >
          <ChevronLeft size={22} />
        </button>
        <Hash size={16} style={{ color: "var(--text-muted)" }} />
        <h1 className="text-base font-semibold" style={{ flex: 1 }}>{activeChannel.name}</h1>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }} className="p-3">
        {postsLoading ? (
          <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : activeChannel.type === "forum" ? (
          openForumPostId ? (
            (() => {
              const post = posts.find((p) => p.id === openForumPostId);
              if (!post) {
                return <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>Post not found.</p>;
              }
              return (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold mb-2">{post.title}</h2>
                    <div className="flex items-center gap-2 mb-3">
                      <Avatar user={post.author} size={28} />
                      <span className="text-sm font-semibold">{post.author.username}</span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{relativeTime(post.createdAt)}</span>
                    </div>
                    <p className="text-sm mb-3" style={{ overflowWrap: "anywhere", lineHeight: 1.5 }}>{post.content}</p>
                    <div className="flex items-center gap-3 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      <button onClick={() => handleLike(post)} className="flex items-center gap-1 text-xs" style={{ color: post.likedByMe ? "var(--danger)" : "var(--text-muted)", background: "none", border: "none" }}>
                        <Heart size={13} fill={post.likedByMe ? "var(--danger)" : "none"} /> {post.likeCount > 0 && post.likeCount}
                      </button>
                      {post.author.id === currentUserId ? (
                        <button onClick={() => { handleDeletePost(post.id); setOpenForumPostId(null); }} aria-label="Delete post" style={{ color: "var(--text-muted)", background: "none", border: "none" }}>
                          <Trash2 size={13} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReportPost(post)}
                          disabled={reportingId === post.id || reportedIds[post.id]}
                          aria-label="Report post"
                          className="flex items-center gap-1 text-xs"
                          style={{ color: "var(--text-muted)", background: "none", border: "none" }}
                        >
                          <Flag size={13} /> {reportedIds[post.id] ? "Reported" : "Report"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                      Replies ({post.comments?.length || 0})
                    </h3>
                    {post.comments?.map((c) => (
                      <div key={c.id} className="flex items-start gap-2.5 card p-2.5">
                        <Avatar user={c.author} size={24} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-xs font-semibold">{c.author.username}</span>
                            {c.author.id !== currentUserId && (
                              <button
                                onClick={() => handleReportComment(c)}
                                disabled={reportingId === c.id || reportedIds[c.id]}
                                aria-label="Report reply"
                                style={{ color: "var(--text-muted)", background: "none", border: "none" }}
                              >
                                <Flag size={11} />
                              </button>
                            )}
                          </div>
                          <p className="text-xs" style={{ overflowWrap: "anywhere" }}>{c.content}</p>
                        </div>
                      </div>
                    ))}

                    {community.isMember && (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          className="input pl-3"
                          style={{ padding: "8px 12px", fontSize: 13, flex: 1 }}
                          placeholder="Write a reply…"
                          value={commentDrafts[post.id] || ""}
                          onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && handleAddComment(post.id)}
                        />
                        <button onClick={() => handleAddComment(post.id)} className="btn-primary" style={{ width: "auto", padding: "8px 14px" }}>
                          <Send size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="space-y-2">
              {posts.length === 0 && (
                <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>No posts yet.</p>
              )}
              {posts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => setOpenForumPostId(post.id)}
                  className="card p-3 transition-opacity hover:opacity-90"
                  style={{ cursor: "pointer" }}
                >
                  <h3 className="text-sm font-semibold mb-1">{post.title || "Untitled Post"}</h3>
                  <p className="text-xs mb-2 line-clamp-2" style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}>{post.content}</p>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Crown, Users, Loader2, Link2, Hash, Settings, ChevronLeft, Image as ImageIcon, Calendar, BookOpen, ExternalLink, HelpCircle } from "lucide-react";
import { Avatar, PostActionSheet, CropModal, OnboardingFlowModal } from "./CommunityDetailShared";
import CommunitySettingsOverlay from "./CommunitySettingsOverlay";
import CommunityChannelView from "./CommunityChannelView";

export default function CommunityDetailClient({ communityId, currentUserId }) {
  const router = useRouter();
  const bannerInputRef = useRef(null);
  const iconInputRef = useRef(null);

  const [community, setCommunity] = useState(null);
  const [sections, setSections] = useState([]);
  const [channels, setChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [posts, setPosts] = useState([]);
  const [events, setEvents] = useState([]);
  const [rules, setRules] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [postsLoading, setPostsLoading] = useState(false);
  const [channelViewOpen, setChannelViewOpen] = useState(false);

  const [view, setView] = useState("feed");
  const [settingsPage, setSettingsPage] = useState(null);
  const [actionSheetPostId, setActionSheetPostId] = useState(null);
  const [cropTarget, setCropTarget] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [openForumPostId, setOpenForumPostId] = useState(null);
  const [showNewPostForm, setShowNewPostForm] = useState(false);

  const [commentDrafts, setCommentDrafts] = useState({});
  const [reportingId, setReportingId] = useState(null);
  const [reportedIds, setReportedIds] = useState({});

  const [onboardingStatus, setOnboardingStatus] = useState({ enabled: false, completed: false });
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [submittingOnboarding, setSubmittingOnboarding] = useState(false);

  const [guideLoading, setGuideLoading] = useState(false);
  const [guideData, setGuideData] = useState({});

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
        return;
      }
      const chData = await chRes.json();
      const secData = await secRes.json();
      const obData = obRes.ok ? await obRes.json() : null;

      setCommunity(cData.community || null);
      setChannels(chRes.ok ? (chData.channels || []) : []);
      setSections(secRes.ok ? (secData.sections || []) : []);
      setActiveChannelId((prev) => prev || (chData.channels?.[0]?.id || null));
      if (obData?.onboarding) setOnboardingStatus({ ...obData.onboarding, completed: !!obData.completed });
    } catch (err) {
      setLoadError("Network error loading community.");
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  const loadPosts = useCallback(async (channelId) => {
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/posts?channelId=${channelId}`);
      const data = await res.json();
      if (res.ok) setPosts(data.posts || []);
    } catch (err) {
    } finally {
      setPostsLoading(false);
    }
  }, [communityId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeChannelId) loadPosts(activeChannelId); }, [activeChannelId, loadPosts]);

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

  function handleSettingsBack() {
    if (settingsPage) setSettingsPage(null);
    else setView("feed");
  }

  function openChannel(channelId) {
    setActiveChannelId(channelId);
    setChannelViewOpen(true);
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin" /></div>;
  if (loadError || !community) return <div className="text-sm text-center py-10">{loadError || "Community not found."}</div>;

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  return (
    <div>
      {view === "settings" && canManage && (
        <CommunitySettingsOverlay
          community={community}
          communityId={communityId}
          currentUserId={currentUserId}
          canManage={canManage}
          settingsPage={settingsPage}
          setSettingsPage={setSettingsPage}
          handleSettingsBack={handleSettingsBack}
          load={load}
          channels={channels}
          setChannels={setChannels}
          sections={sections}
          setSections={setSections}
          handleDeleteCommunity={handleDeleteCommunity}
        />
      )}

      {/* Main Header / Banner / Info Section */}
      <div className="mb-4" style={{ borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)" }}>
        <div style={{ height: 110, background: community.bannerDataUrl ? `url("${community.bannerDataUrl}") center/cover` : "var(--surface-2)" }} />
        <div className="card p-4">
          <div className="flex items-center gap-3 mb-3">
            <Avatar user={{ username: community.name, avatarDataUrl: community.iconDataUrl }} size={52} />
            <div style={{ flex: 1 }}>
              <h1 className="text-lg font-semibold">{community.name}</h1>
              <p className="text-xs text-muted"><Users size={12} /> {community.memberCount} members</p>
            </div>
            {canManage && (
              <button onClick={() => { setView("settings"); setSettingsPage(null); }}>
                <Settings size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Channel Feed View */}
      {view === "feed" && !channelViewOpen && (
        <div className="card p-2 mb-4">
          {channels.map((c) => (
            <button key={c.id} onClick={() => openChannel(c.id)} className="flex items-center gap-2 w-full text-sm py-2 px-2">
              <Hash size={15} /> {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Channel Full Screen View Overlay */}
      {view === "feed" && channelViewOpen && activeChannel && (
        <CommunityChannelView
          activeChannel={activeChannel}
          posts={posts}
          postsLoading={postsLoading}
          openForumPostId={openForumPostId}
          setOpenForumPostId={setOpenForumPostId}
          currentUserId={currentUserId}
          community={community}
          handleLike={() => {}}
          handleDeletePost={() => {}}
          handleReportPost={() => {}}
          handleReportComment={() => {}}
          commentDrafts={commentDrafts}
          setCommentDrafts={setCommentDrafts}
          handleAddComment={() => {}}
          reportingId={reportingId}
          reportedIds={reportedIds}
          setChannelViewOpen={setChannelViewOpen}
          setShowNewPostForm={setShowNewPostForm}
        />
      )}
    </div>
  );
}
