"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Plus, Trash2, Copy, RefreshCw, Lock, ShieldAlert, ScrollText,
  Bot, Webhook as WebhookIcon, Plug, BarChart3, LayoutTemplate, PartyPopper,
  Inbox, Users2,
} from "lucide-react";

// Same permission picker used elsewhere in the community settings.
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

// ─────────────────────────────────────────────
// Which settings-menu keys open which page.
// Keys are compared after lowercasing and stripping symbols,
// so "audit-log", "auditLog" and "Audit Log" all match.
// ─────────────────────────────────────────────
const PAGE_ALIASES = {
  "channel-permissions": ["channelpermissions", "channelpermission", "permissions", "channelperms"],
  safety: ["safety", "safetymoderation", "safetyandmoderation", "moderation"],
  automod: ["automod", "automoderation"],
  audit: ["audit", "auditlog", "auditlogs"],
  integrations: ["integrations", "integration"],
  webhooks: ["webhooks", "webhook"],
  analytics: ["analytics", "serveranalytics", "insights"],
  widget: ["widget", "widgets"],
};

export function resolveSettingsPage(key) {
  const norm = String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [page, aliases] of Object.entries(PAGE_ALIASES)) {
    if (aliases.includes(norm)) return page;
  }
  return null;
}

// ─────────────────────────────────────────────
// Small shared helpers (data layer — unchanged)
// ─────────────────────────────────────────────
const base = (communityId, feature) => `/api/communities/${communityId}/manage/${feature}`;

async function request(url, method = "GET", body) {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (err) {
    return { ok: false, data: { error: "Network error." } };
  }
}

function useFeature(communityId, feature) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(
    async (silent) => {
      if (!silent) setLoading(true);
      const r = await request(base(communityId, feature));
      if (r.ok) {
        setData(r.data);
        setError("");
      } else {
        setError(r.data.error || "Could not load this page.");
      }
      setLoading(false);
    },
    [communityId, feature]
  );

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}

function useChannels(communityId) {
  const [channels, setChannels] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await request(`/api/communities/${communityId}/channels`);
      if (alive && r.ok) setChannels(r.data.channels || []);
    })();
    return () => {
      alive = false;
    };
  }, [communityId]);
  return channels;
}

function fmtTime(value) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function copyText(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(text);
}

// ─────────────────────────────────────────────
// Redesigned shared primitives
// ─────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
      <Loader2 size={22} className="animate-spin" />
    </div>
  );
}

// Page header: icon badge + title-ish description, sits above everything on every page.
function PageIntro({ icon, children }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div
        style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: "var(--accent-soft)", color: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <p className="text-sm" style={{ color: "var(--text-muted)", lineHeight: 1.5, paddingTop: 6 }}>
        {children}
      </p>
    </div>
  );
}

// Groups related fields/content in a bordered card with its own small header,
// replacing the old bare <Heading> + loose stacked children.
function SectionCard({ title, action, children, tight }) {
  return (
    <div className="card mb-4" style={{ padding: tight ? 12 : 16 }}>
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold" style={{ color: "var(--text-muted)", letterSpacing: 0.3, textTransform: "uppercase" }}>
            {title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// Real empty state: icon + a friendlier line, instead of one gray sentence.
function EmptyState({ icon, children }) {
  return (
    <div className="text-center py-6">
      <div style={{ color: "var(--text-muted)", opacity: 0.6, marginBottom: 6 }}>{icon}</div>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{children}</p>
    </div>
  );
}

function Status({ text, tone = "muted" }) {
  if (!text) return null;
  return (
    <div
      className="text-xs mt-2"
      style={{ color: tone === "danger" ? "var(--danger, #e55)" : "var(--text-muted)" }}
    >
      {text}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-2 text-sm py-1.5" style={{ cursor: "pointer" }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2 }} />
      <span>
        {label}
        {hint && <span className="block text-xs" style={{ color: "var(--text-muted)" }}>{hint}</span>}
      </span>
    </label>
  );
}

function IconButton({ onClick, label, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </button>
  );
}

// Small colored status pill — used for on/off, open/resolved, etc.
function Pill({ tone = "neutral", children }) {
  const tones = {
    on: { background: "var(--accent)", color: "white" },
    neutral: { background: "var(--surface-2)", color: "var(--text)" },
    open: { background: "var(--accent-soft)", color: "var(--accent)" },
    resolved: { background: "var(--surface-2)", color: "var(--text-muted)" },
    danger: { background: "var(--danger-soft)", color: "var(--danger)" },
  };
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ ...tones[tone], whiteSpace: "nowrap" }}
    >
      {children}
    </span>
  );
}

function ToggleButton({ on, onClick, onLabel = "On", offLabel = "Off" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-semibold px-3 py-1 rounded-full"
      style={on ? { background: "var(--accent)", color: "white", border: "none" } : { background: "var(--surface-2)", color: "var(--text)", border: "none" }}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}

// ─────────────────────────────────────────────
// 1. Channel Permissions
// ─────────────────────────────────────────────
function ChannelPermissionsPage({ communityId }) {
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [channelId, setChannelId] = useState("");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, r] = await Promise.all([
        request(`/api/communities/${communityId}/channels`),
        request(`/api/communities/${communityId}/roles`),
      ]);
      if (!alive) return;
      setChannels(c.data.channels || []);
      setRoles(r.data.roles || []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [communityId]);

  function pick(id) {
    setChannelId(id);
    setStatus("");
    const c = channels.find((x) => x.id === id);
    if (!c) {
      setDraft(null);
      return;
    }
    setDraft({
      viewAccess: c.viewAccess || { type: "everyone", roleIds: [] },
      sendAccess: c.sendAccess || { type: "everyone", roleIds: [] },
      threadAccess: c.threadAccess || { type: "everyone", roleIds: [] },
      manageAccess: c.manageAccess || { type: "administrators", roleIds: [] },
    });
  }

  async function save() {
    setSaving(true);
    setStatus("");
    const r = await request(`/api/communities/${communityId}/channels/${channelId}`, "PATCH", draft);
    setSaving(false);
    if (!r.ok) {
      setStatus(r.data.error || "Could not save permissions.");
      return;
    }
    setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, ...(r.data.channel || draft) } : c)));
    setStatus("Saved.");
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageIntro icon={<Lock size={17} />}>
        Choose who can see, post in, thread on, and manage each channel individually.
      </PageIntro>

      <SectionCard title="Channel">
        <select className="input pl-3" value={channelId} onChange={(e) => pick(e.target.value)}>
          <option value="">Select a channel…</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </select>
      </SectionCard>

      {draft && (
        <SectionCard title="Access">
          <AccessControlRow label="Who can view this channel?" value={draft.viewAccess} onChange={(v) => setDraft((p) => ({ ...p, viewAccess: v }))} roles={roles} />
          <AccessControlRow label="Who can send messages?" value={draft.sendAccess} onChange={(v) => setDraft((p) => ({ ...p, sendAccess: v }))} roles={roles} />
          <AccessControlRow label="Who can create threads?" value={draft.threadAccess} onChange={(v) => setDraft((p) => ({ ...p, threadAccess: v }))} roles={roles} />
          <AccessControlRow label="Who can manage this channel?" value={draft.manageAccess} onChange={(v) => setDraft((p) => ({ ...p, manageAccess: v }))} roles={roles} />
          <Status text={status} />
          <button onClick={save} className="btn-primary mt-3" disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : "Save Permissions"}
          </button>
        </SectionCard>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 2. Safety & Moderation
// ─────────────────────────────────────────────
function SafetyPage({ communityId }) {
  const { data, loading, error, reload } = useFeature(communityId, "safety");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (data && data.settings && !form) setForm(data.settings);
  }, [data, form]);

  async function saveSettings() {
    setSaving(true);
    setStatus("");
    const r = await request(base(communityId, "safety"), "PATCH", { settings: form });
    setSaving(false);
    setStatus(r.ok ? "Saved." : r.data.error || "Could not save.");
  }

  async function actOnReport(reportId, payload) {
    setBusyId(reportId);
    const r = await request(base(communityId, "safety"), "PATCH", { reportId, ...payload });
    setBusyId(null);
    if (r.ok) reload(true);
    else setStatus(r.data.error || "That didn't work.");
  }

  if (loading) return <Spinner />;
  if (error) return <Status text={error} tone="danger" />;
  if (!form) return <Spinner />;

  const openReports = data.reports.filter((r) => r.status === "open");
  const closedReports = data.reports.filter((r) => r.status !== "open");

  return (
    <div>
      <PageIntro icon={<ShieldAlert size={17} />}>
        Protection settings, open reports, and recent moderation activity for this community.
      </PageIntro>

      <SectionCard title="Protection">
        <Field label="Verification level">
          <select
            className="input pl-3"
            value={form.verificationLevel}
            onChange={(e) => setForm({ ...form, verificationLevel: e.target.value })}
          >
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
        <Toggle
          checked={form.raidProtectionOn}
          onChange={(v) => setForm({ ...form, raidProtectionOn: v })}
          label="Raid protection"
          hint="Slows down and flags sudden bursts of new joins."
        />
        <Toggle
          checked={form.joinLockdown}
          onChange={(v) => setForm({ ...form, joinLockdown: v })}
          label="Lock down joining"
          hint="No new members can join while this is on."
        />
        <Field label="Max @mentions per message">
          <input
            className="input pl-3"
            type="number"
            min="1"
            max="50"
            value={form.maxMentionsPerMsg}
            onChange={(e) => setForm({ ...form, maxMentionsPerMsg: e.target.value })}
          />
        </Field>
        <Status text={status} />
        <button onClick={saveSettings} className="btn-primary mt-2" disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : "Save Safety Settings"}
        </button>
      </SectionCard>

      <SectionCard title={`Open Reports (${openReports.length})`}>
        {openReports.length === 0 ? (
          <EmptyState icon={<PartyPopper size={26} />}>Nothing open — you're all caught up.</EmptyState>
        ) : (
          <div className="space-y-2">
            {openReports.map((r) => (
              <div key={r.id} className="card p-3" style={{ background: "var(--surface-2)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ textTransform: "capitalize" }}>
                    {r.targetType} report
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {fmtTime(r.createdAt)}
                  </span>
                </div>
                <p className="text-sm mb-1" style={{ overflowWrap: "anywhere" }}>
                  “{r.preview}”
                </p>
                <p className="text-xs mb-2" style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                  @{r.reporter}: {r.reason}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-primary"
                    style={{ width: "auto", padding: "6px 12px" }}
                    disabled={busyId === r.id}
                    onClick={() => actOnReport(r.id, { status: "resolved" })}
                  >
                    Resolve
                  </button>
                  <button
                    className="btn-primary"
                    style={{ width: "auto", padding: "6px 12px", background: "var(--surface)", color: "var(--text)" }}
                    disabled={busyId === r.id}
                    onClick={() => actOnReport(r.id, { status: "dismissed" })}
                  >
                    Dismiss
                  </button>
                  {(r.targetType === "post" || r.targetType === "comment") && (
                    <button
                      className="btn-primary"
                      style={{ width: "auto", padding: "6px 12px", background: "var(--danger-soft)", color: "var(--danger)" }}
                      disabled={busyId === r.id}
                      onClick={() => {
                        if (window.confirm("Delete the reported content and resolve this report?")) {
                          actOnReport(r.id, { removeContent: true });
                        }
                      }}
                    >
                      Remove content
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {closedReports.length > 0 && (
        <SectionCard title="Closed Reports" tight>
          <div className="space-y-1.5">
            {closedReports.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <span style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                  {r.targetType}: {r.preview.slice(0, 40)}
                </span>
                <Pill tone="resolved">{r.status}</Pill>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {data.joins.length > 0 && (
        <SectionCard title="Recent Flagged Joins" tight>
          <div className="space-y-1.5">
            {data.joins.map((j) => (
              <div key={j.id} className="flex items-center justify-between text-xs">
                <span>@{j.username}</span>
                <span style={{ color: "var(--text-muted)" }}>
                  account {j.accountAgeDays}d old · risk {j.riskScore}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {data.actions.length > 0 && (
        <SectionCard title="Recent Moderation Actions" tight>
          <div className="space-y-1.5">
            {data.actions.map((a) => (
              <div key={a.id} className="text-xs" style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                {a.moderator} → @{a.target}: {a.action}
                {a.reason ? ` (${a.reason})` : ""} · {fmtTime(a.createdAt)}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 3. Audit Log
// ─────────────────────────────────────────────
function AuditLogPage({ communityId }) {
  const { data, loading, error, reload } = useFeature(communityId, "audit");

  if (loading) return <Spinner />;
  if (error) return <Status text={error} tone="danger" />;

  return (
    <div>
      <PageIntro icon={<ScrollText size={17} />}>Recent admin and moderation activity, newest first.</PageIntro>

      <div className="flex justify-end mb-2">
        <IconButton onClick={() => reload(true)} label="Refresh">
          <RefreshCw size={15} />
        </IconButton>
      </div>

      {data.entries.length === 0 ? (
        <EmptyState icon={<ScrollText size={26} />}>Nothing has been logged yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {data.entries.map((e) => (
            <div key={e.source + e.id} className="card p-3">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-semibold">{e.action}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {fmtTime(e.createdAt)}
                </span>
              </div>
              <p className="text-sm" style={{ overflowWrap: "anywhere" }}>
                {e.summary}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                by @{e.actor}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 4. AutoMod
// ─────────────────────────────────────────────
const RULE_TYPES = {
  keywords: "Blocked words",
  links: "Links",
  caps: "Excessive CAPS",
  mentions: "Mention spam",
  spam: "Repeated characters",
};

function describeRule(rule) {
  const c = rule.config || {};
  if (rule.type === "keywords") return `Words: ${(c.words || []).join(", ")}`;
  if (rule.type === "links") {
    return c.allowedDomains && c.allowedDomains.length
      ? `Blocks links except: ${c.allowedDomains.join(", ")}`
      : "Blocks all links";
  }
  if (rule.type === "caps") return `${c.maxPercent || 70}% or more capital letters`;
  if (rule.type === "mentions") return `More than ${c.max || 5} @mentions`;
  return `${c.maxRepeat || 6}+ repeated characters in a row`;
}

function AutoModPage({ communityId }) {
  const { data, loading, error, reload } = useFeature(communityId, "automod");
  const [name, setName] = useState("");
  const [type, setType] = useState("keywords");
  const [action, setAction] = useState("block");
  const [words, setWords] = useState("");
  const [allowed, setAllowed] = useState("");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  function buildConfig() {
    const list = (s) => s.split(",").map((w) => w.trim()).filter(Boolean);
    if (type === "keywords") return { words: list(words) };
    if (type === "links") return { allowedDomains: list(allowed) };
    if (type === "caps") return { maxPercent: Number(number) || 70 };
    if (type === "mentions") return { max: Number(number) || 5 };
    return { maxRepeat: Number(number) || 6 };
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    const r = await request(base(communityId, "automod"), "POST", {
      name,
      type,
      action,
      config: buildConfig(),
    });
    setBusy(false);
    if (!r.ok) {
      setStatus(r.data.error || "Could not create the rule.");
      return;
    }
    setName("");
    setWords("");
    setAllowed("");
    setNumber("");
    reload(true);
  }

  async function toggle(rule) {
    await request(base(communityId, "automod"), "PATCH", { ruleId: rule.id, enabled: !rule.enabled });
    reload(true);
  }

  async function remove(rule) {
    if (!window.confirm(`Delete the rule "${rule.name}"?`)) return;
    await request(`${base(communityId, "automod")}?id=${rule.id}`, "DELETE");
    reload(true);
  }

  if (loading) return <Spinner />;
  if (error) return <Status text={error} tone="danger" />;

  return (
    <div>
      <PageIntro icon={<Bot size={17} />}>
        Rules are checked against new messages. “Block” stops the message; “Flag” only records it.
      </PageIntro>

      <SectionCard title={`Rules (${data.rules.length})`}>
        {data.rules.length === 0 ? (
          <EmptyState icon={<Bot size={26} />}>No AutoMod rules yet — add one below.</EmptyState>
        ) : (
          <div className="space-y-2">
            {data.rules.map((rule) => (
              <div key={rule.id} className="card p-3" style={{ background: "var(--surface-2)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">{rule.name}</span>
                  <div className="flex items-center gap-2">
                    <ToggleButton on={rule.enabled} onClick={() => toggle(rule)} />
                    <IconButton onClick={() => remove(rule)} label="Delete rule">
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                  {RULE_TYPES[rule.type] || rule.type} · {rule.action === "flag" ? "Flag" : "Block"}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                  {describeRule(rule)}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="New Rule">
        <form onSubmit={create}>
          <Field label="Name">
            <input className="input pl-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. No slurs" />
          </Field>
          <Field label="What to catch">
            <select className="input pl-3" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(RULE_TYPES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {type === "keywords" && (
            <Field label="Words (comma separated)">
              <textarea
                className="input pl-3"
                style={{ minHeight: 60, resize: "vertical" }}
                value={words}
                onChange={(e) => setWords(e.target.value)}
              />
            </Field>
          )}
          {type === "links" && (
            <Field label="Allowed domains (optional, comma separated)">
              <input className="input pl-3" value={allowed} onChange={(e) => setAllowed(e.target.value)} placeholder="youtube.com, github.com" />
            </Field>
          )}
          {type === "caps" && (
            <Field label="Max % capital letters (default 70)">
              <input className="input pl-3" type="number" value={number} onChange={(e) => setNumber(e.target.value)} />
            </Field>
          )}
          {type === "mentions" && (
            <Field label="Max @mentions (default 5)">
              <input className="input pl-3" type="number" value={number} onChange={(e) => setNumber(e.target.value)} />
            </Field>
          )}
          {type === "spam" && (
            <Field label="Max repeated characters in a row (default 6)">
              <input className="input pl-3" type="number" value={number} onChange={(e) => setNumber(e.target.value)} />
            </Field>
          )}
          <Field label="Action">
            <select className="input pl-3" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="block">Block the message</option>
              <option value="flag">Flag only</option>
            </select>
          </Field>
          <Status text={status} />
          <button type="submit" className="btn-primary mt-1" disabled={busy || !name.trim()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Add Rule</>}
          </button>
        </form>
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────
// 5. Webhooks
// ─────────────────────────────────────────────
function WebhooksPage({ communityId }) {
  const { data, loading, error, reload } = useFeature(communityId, "webhooks");
  const channels = useChannels(communityId);
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    const r = await request(base(communityId, "webhooks"), "POST", { name, channelId });
    setBusy(false);
    if (!r.ok) {
      setStatus(r.data.error || "Could not create the webhook.");
      return;
    }
    setName("");
    reload(true);
  }

  async function regenerate(w) {
    if (!window.confirm("Make a new URL? The old one will stop working.")) return;
    await request(base(communityId, "webhooks"), "PATCH", { webhookId: w.id, regenerate: true });
    reload(true);
  }

  async function remove(w) {
    if (!window.confirm(`Delete the webhook "${w.name}"?`)) return;
    await request(`${base(communityId, "webhooks")}?id=${w.id}`, "DELETE");
    reload(true);
  }

  function copyUrl(w) {
    copyText(`${origin}/api/webhooks/${w.id}/${w.token}`);
    setCopiedId(w.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) return <Spinner />;
  if (error) return <Status text={error} tone="danger" />;

  const channelName = (id) => (channels.find((c) => c.id === id) || {}).name || "deleted-channel";

  return (
    <div>
      <PageIntro icon={<WebhookIcon size={17} />}>
        A webhook lets another app post into a channel — send a POST request with JSON like
        {' {"content": "Hello"} '} to the webhook URL. Treat the URL like a password.
      </PageIntro>

      <SectionCard title={`Webhooks (${data.webhooks.length})`}>
        {data.webhooks.length === 0 ? (
          <EmptyState icon={<WebhookIcon size={26} />}>No webhooks yet — create one below.</EmptyState>
        ) : (
          <div className="space-y-2">
            {data.webhooks.map((w) => (
              <div key={w.id} className="card p-3" style={{ background: "var(--surface-2)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">{w.name}</span>
                  <Pill>#{channelName(w.channelId)}</Pill>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => copyUrl(w)}
                    className="btn-primary"
                    style={{ width: "auto", padding: "6px 12px", background: "var(--surface)", color: "var(--text)" }}
                  >
                    <Copy size={13} /> {copiedId === w.id ? "Copied!" : "Copy URL"}
                  </button>
                  <IconButton onClick={() => regenerate(w)} label="Regenerate URL">
                    <RefreshCw size={14} />
                  </IconButton>
                  <IconButton onClick={() => remove(w)} label="Delete webhook">
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="New Webhook">
        <form onSubmit={create}>
          <Field label="Name">
            <input className="input pl-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="GitHub updates" />
          </Field>
          <Field label="Post into">
            <select className="input pl-3" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">Select a channel…</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </Field>
          <Status text={status} />
          <button type="submit" className="btn-primary mt-1" disabled={busy || !name.trim() || !channelId}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Create Webhook</>}
          </button>
        </form>
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────
// 6. Integrations
// ─────────────────────────────────────────────
const PROVIDER_LABELS = {
  github: "GitHub",
  youtube: "YouTube",
  twitch: "Twitch",
  twitter: "X / Twitter",
  rss: "RSS feed",
};

function IntegrationsPage({ communityId }) {
  const { data, loading, error, reload } = useFeature(communityId, "integrations");
  const channels = useChannels(communityId);
  const [provider, setProvider] = useState("github");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [channelId, setChannelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    const r = await request(base(communityId, "integrations"), "POST", { provider, label, url, channelId });
    setBusy(false);
    if (!r.ok) {
      setStatus(r.data.error || "Could not save the integration.");
      return;
    }
    setLabel("");
    setUrl("");
    reload(true);
  }

  async function toggle(i) {
    await request(base(communityId, "integrations"), "PATCH", { integrationId: i.id, enabled: !i.enabled });
    reload(true);
  }

  async function remove(i) {
    if (!window.confirm(`Remove "${i.label}"?`)) return;
    await request(`${base(communityId, "integrations")}?id=${i.id}`, "DELETE");
    reload(true);
  }

  if (loading) return <Spinner />;
  if (error) return <Status text={error} tone="danger" />;

  const channelName = (id) => (channels.find((c) => c.id === id) || {}).name;

  return (
    <div>
      <PageIntro icon={<Plug size={17} />}>
        Save the accounts and feeds you want linked to this community. Automatic posting of new
        items into channels isn't switched on yet, so for now this stores the links.
      </PageIntro>

      <SectionCard title={`Integrations (${data.integrations.length})`}>
        {data.integrations.length === 0 ? (
          <EmptyState icon={<Plug size={26} />}>No integrations yet — add one below.</EmptyState>
        ) : (
          <div className="space-y-2">
            {data.integrations.map((i) => (
              <div key={i.id} className="card p-3" style={{ background: "var(--surface-2)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">{i.label}</span>
                  <div className="flex items-center gap-2">
                    <ToggleButton on={i.enabled} onClick={() => toggle(i)} onLabel="On" offLabel="Paused" />
                    <IconButton onClick={() => remove(i)} label="Remove integration">
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                  {PROVIDER_LABELS[i.provider] || i.provider}
                  {i.channelId && channelName(i.channelId) ? ` · #${channelName(i.channelId)}` : ""}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                  {i.url}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Add Integration">
        <form onSubmit={create}>
          <Field label="Service">
            <select className="input pl-3" value={provider} onChange={(e) => setProvider(e.target.value)}>
              {Object.entries(PROVIDER_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Label">
            <input className="input pl-3" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Our GitHub repo" />
          </Field>
          <Field label="Link or feed URL">
            <input className="input pl-3" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Channel (optional)">
            <select className="input pl-3" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">No channel</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </Field>
          <Status text={status} />
          <button type="submit" className="btn-primary mt-1" disabled={busy || !label.trim() || !url.trim()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Add Integration</>}
          </button>
        </form>
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────
// 7. Server Analytics
// ─────────────────────────────────────────────
function Bars({ items }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex items-end gap-1" style={{ height: 80 }}>
      {items.map((i) => (
        <div
          key={i.label}
          title={`${i.label}: ${i.value}`}
          style={{
            flex: 1,
            height: `${Math.max(4, (i.value / max) * 100)}%`,
            background: "var(--accent)",
            borderRadius: 3,
            opacity: i.value ? 1 : 0.25,
          }}
        />
      ))}
    </div>
  );
}

function AnalyticsPage({ communityId }) {
  const { data, loading, error } = useFeature(communityId, "analytics");

  if (loading) return <Spinner />;
  if (error) return <Status text={error} tone="danger" />;

  const t = data.totals;
  const stats = [
    ["Members", t.members],
    ["Channels", t.channels],
    ["Roles", t.roles],
    ["Messages (30d)", t.posts30d],
    ["Joins (30d)", t.joins30d],
    ["Invite uses", t.inviteUses],
    ["Open reports", t.openReports],
    ["Upcoming events", t.upcomingEvents],
  ];

  return (
    <div>
      <PageIntro icon={<BarChart3 size={17} />}>A snapshot of activity across this community.</PageIntro>

      <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {stats.map(([label, value]) => (
          <div key={label} className="card p-3">
            <div className="text-xl font-semibold">{value}</div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      <SectionCard title="Messages Per Day (Last 14 Days)">
        <Bars items={data.postsByDay} />
      </SectionCard>

      <SectionCard title="New Members Per Day (Last 14 Days)">
        <Bars items={data.joinsByDay} />
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          Counts joins that were recorded by the join system.
        </p>
      </SectionCard>

      <SectionCard title="Most Active Channels" tight>
        {data.topChannels.length === 0 ? (
          <EmptyState icon={<BarChart3 size={22} />}>No messages in the last 30 days.</EmptyState>
        ) : (
          <div className="space-y-1.5">
            {data.topChannels.map((c) => (
              <div key={c.name} className="flex items-center justify-between text-sm">
                <span>#{c.name}</span>
                <span style={{ color: "var(--text-muted)" }}>{c.count}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Top Posters" tight>
        {data.topPosters.length === 0 ? (
          <EmptyState icon={<Users2 size={22} />}>No posts yet.</EmptyState>
        ) : (
          <div className="space-y-1.5">
            {data.topPosters.map((p) => (
              <div key={p.username} className="flex items-center justify-between text-sm">
                <span>@{p.username}</span>
                <span style={{ color: "var(--text-muted)" }}>{p.count}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────
// 8. Widget
// ─────────────────────────────────────────────
function WidgetPage({ communityId }) {
  const { data, loading, error } = useFeature(communityId, "widget");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (data && data.widget && !form) setForm(data.widget);
  }, [data, form]);

  async function save() {
    setSaving(true);
    setStatus("");
    const r = await request(base(communityId, "widget"), "PATCH", {
      enabled: form.enabled,
      theme: form.theme,
      showMembers: form.showMembers,
      inviteCode: form.inviteCode || null,
    });
    setSaving(false);
    setStatus(r.ok ? "Saved." : r.data.error || "Could not save.");
  }

  if (loading) return <Spinner />;
  if (error) return <Status text={error} tone="danger" />;
  if (!form) return <Spinner />;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const widgetUrl = `${origin}/widget/${communityId}`;
  const embed = `<iframe src="${widgetUrl}" width="350" height="420" style="border:0;border-radius:12px" title="Community widget"></iframe>`;

  return (
    <div>
      <PageIntro icon={<LayoutTemplate size={17} />}>Put a small join card for this community on any website.</PageIntro>

      <SectionCard title="Settings">
        <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="Enable the widget" />
        <Toggle checked={form.showMembers} onChange={(v) => setForm({ ...form, showMembers: v })} label="Show member count" />
        <Field label="Theme">
          <select className="input pl-3" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </Field>
        <Field label="Join button uses invite">
          <select
            className="input pl-3"
            value={form.inviteCode || ""}
            onChange={(e) => setForm({ ...form, inviteCode: e.target.value })}
          >
            <option value="">Community page (no invite)</option>
            {data.invites.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>
        <Status text={status} />
        <button onClick={save} className="btn-primary mt-1" disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : "Save Widget"}
        </button>
      </SectionCard>

      <SectionCard title="Embed Code">
        <textarea
          readOnly
          className="input pl-3"
          style={{ minHeight: 80, fontSize: 12, fontFamily: "monospace" }}
          value={embed}
        />
        <button
          onClick={() => {
            copyText(embed);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="btn-primary mt-2"
          style={{ background: "var(--surface-2)", color: "var(--text)" }}
        >
          <Copy size={14} /> {copied ? "Copied!" : "Copy embed code"}
        </button>
      </SectionCard>

      {form.enabled && (
        <SectionCard title="Preview (save first to see changes)">
          <iframe
            src={widgetUrl}
            title="Widget preview"
            style={{ width: "100%", maxWidth: 350, height: 420, border: 0, borderRadius: 12 }}
          />
        </SectionCard>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Entry point used by CommunityDetailClient
// ─────────────────────────────────────────────
export default function CommunitySettingsPage({ page, communityId }) {
  if (page === "channel-permissions") return <ChannelPermissionsPage communityId={communityId} />;
  if (page === "safety") return <SafetyPage communityId={communityId} />;
  if (page === "audit") return <AuditLogPage communityId={communityId} />;
  if (page === "automod") return <AutoModPage communityId={communityId} />;
  if (page === "webhooks") return <WebhooksPage communityId={communityId} />;
  if (page === "integrations") return <IntegrationsPage communityId={communityId} />;
  if (page === "analytics") return <AnalyticsPage communityId={communityId} />;
  if (page === "widget") return <WidgetPage communityId={communityId} />;
  return null;
}
