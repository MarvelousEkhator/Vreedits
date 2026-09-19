"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Trash2, Copy, RefreshCw } from "lucide-react";

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
// Small shared helpers
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

function Spinner() {
  return (
    <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
      <Loader2 size={22} className="animate-spin" />
    </div>
  );
}

function Note({ children }) {
  return (
    <p className="text-xs mb-3" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

function Heading({ children }) {
  return (
    <h3 className="text-xs font-semibold mb-2 mt-4" style={{ color: "var(--text-muted)" }}>
      {children}
    </h3>
  );
}

function Status({ text }) {
  if (!text) return null;
  return (
    <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
      {text}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 text-sm py-1">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
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
      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
    >
      {children}
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
      <Note>Choose who can see, post in, thread on and manage each channel.</Note>
      <Field label="Channel">
        <select className="input pl-3" value={channelId} onChange={(e) => pick(e.target.value)}>
          <option value="">Select a channel…</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </select>
      </Field>

      {draft && (
        <div>
          <AccessControlRow label="Who can view this channel?" value={draft.viewAccess} onChange={(v) => setDraft((p) => ({ ...p, viewAccess: v }))} roles={roles} />
          <AccessControlRow label="Who can send messages?" value={draft.sendAccess} onChange={(v) => setDraft((p) => ({ ...p, sendAccess: v }))} roles={roles} />
          <AccessControlRow label="Who can create threads?" value={draft.threadAccess} onChange={(v) => setDraft((p) => ({ ...p, threadAccess: v }))} roles={roles} />
          <AccessControlRow label="Who can manage this channel?" value={draft.manageAccess} onChange={(v) => setDraft((p) => ({ ...p, manageAccess: v }))} roles={roles} />
          <Status text={status} />
          <button onClick={save} className="btn-primary mt-3" disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : "Save Permissions"}
          </button>
        </div>
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
  if (error) return <Status text={error} />;
  if (!form) return <Spinner />;

  const openReports = data.reports.filter((r) => r.status === "open");
  const closedReports = data.reports.filter((r) => r.status !== "open");

  return (
    <div>
      <Heading>Protection</Heading>
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
      />
      <Toggle
        checked={form.joinLockdown}
        onChange={(v) => setForm({ ...form, joinLockdown: v })}
        label="Lock down joining (no new members)"
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
      <button onClick={saveSettings} className="btn-primary" disabled={saving}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : "Save Safety Settings"}
      </button>
      <Status text={status} />

      <Heading>Open reports ({openReports.length})</Heading>
      {openReports.length === 0 && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          No open reports. 🎉
        </p>
      )}
      <div className="space-y-2">
        {openReports.map((r) => (
          <div key={r.id} className="card p-3">
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
                style={{ width: "auto", padding: "6px 12px", background: "var(--surface-2)", color: "var(--text)" }}
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

      {closedReports.length > 0 && (
        <div>
          <Heading>Closed reports</Heading>
          <div className="space-y-1">
            {closedReports.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                <span style={{ overflowWrap: "anywhere" }}>
                  {r.targetType}: {r.preview.slice(0, 40)}
                </span>
                <span style={{ textTransform: "capitalize" }}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.joins.length > 0 && (
        <div>
          <Heading>Recent flagged joins</Heading>
          <div className="space-y-1">
            {data.joins.map((j) => (
              <div key={j.id} className="flex items-center justify-between text-xs">
                <span>@{j.username}</span>
                <span style={{ color: "var(--text-muted)" }}>
                  account {j.accountAgeDays}d old · risk {j.riskScore}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.actions.length > 0 && (
        <div>
          <Heading>Recent moderation actions</Heading>
          <div className="space-y-1">
            {data.actions.map((a) => (
              <div key={a.id} className="text-xs" style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                {a.moderator} → @{a.target}: {a.action}
                {a.reason ? ` (${a.reason})` : ""} · {fmtTime(a.createdAt)}
              </div>
            ))}
          </div>
        </div>
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
  if (error) return <Status text={error} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Note>Recent admin and moderation activity.</Note>
        <IconButton onClick={() => reload(true)} label="Refresh">
          <RefreshCw size={15} />
        </IconButton>
      </div>
      {data.entries.length === 0 && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Nothing has been logged yet.
        </p>
      )}
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
  if (error) return <Status text={error} />;

  return (
    <div>
      <Note>Rules are checked against new messages. “Block” stops the message; “Flag” only records it.</Note>
      <div className="space-y-2 mb-4">
        {data.rules.length === 0 && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            No AutoMod rules yet.
          </p>
        )}
        {data.rules.map((rule) => (
          <div key={rule.id} className="card p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{rule.name}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggle(rule)}
                  className="text-xs font-semibold px-3 py-1 rounded-full"
                  style={
                    rule.enabled
                      ? { background: "var(--accent)", color: "white" }
                      : { background: "var(--surface-2)", color: "var(--text)" }
                  }
                >
                  {rule.enabled ? "On" : "Off"}
                </button>
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

      <Heading>New rule</Heading>
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
        <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Add Rule</>}
        </button>
        <Status text={status} />
      </form>
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
  if (error) return <Status text={error} />;

  const channelName = (id) => (channels.find((c) => c.id === id) || {}).name || "deleted-channel";

  return (
    <div>
      <Note>
        A webhook lets another app post into a channel. Send a POST request with JSON like
        {' {"content": "Hello"}'} to the webhook URL. Treat the URL like a password.
      </Note>

      <div className="space-y-2 mb-4">
        {data.webhooks.length === 0 && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            No webhooks yet.
          </p>
        )}
        {data.webhooks.map((w) => (
          <div key={w.id} className="card p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{w.name}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                #{channelName(w.channelId)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => copyUrl(w)}
                className="btn-primary"
                style={{ width: "auto", padding: "6px 12px", background: "var(--surface-2)", color: "var(--text)" }}
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

      <Heading>New webhook</Heading>
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
        <button type="submit" className="btn-primary" disabled={busy || !name.trim() || !channelId}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Create Webhook</>}
        </button>
        <Status text={status} />
      </form>
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
  if (error) return <Status text={error} />;

  const channelName = (id) => (channels.find((c) => c.id === id) || {}).name;

  return (
    <div>
      <Note>
        Save the accounts and feeds you want linked to this community. Automatic posting of new
        items into channels isn't switched on yet, so for now this stores the links.
      </Note>

      <div className="space-y-2 mb-4">
        {data.integrations.length === 0 && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            No integrations yet.
          </p>
        )}
        {data.integrations.map((i) => (
          <div key={i.id} className="card p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{i.label}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggle(i)}
                  className="text-xs font-semibold px-3 py-1 rounded-full"
                  style={
                    i.enabled
                      ? { background: "var(--accent)", color: "white" }
                      : { background: "var(--surface-2)", color: "var(--text)" }
                  }
                >
                  {i.enabled ? "On" : "Paused"}
                </button>
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

      <Heading>Add integration</Heading>
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
        <button type="submit" className="btn-primary" disabled={busy || !label.trim() || !url.trim()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Add Integration</>}
        </button>
        <Status text={status} />
      </form>
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
  if (error) return <Status text={error} />;

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

      <Heading>Messages per day (last 14 days)</Heading>
      <div className="card p-3 mb-2">
        <Bars items={data.postsByDay} />
      </div>

      <Heading>New members per day (last 14 days)</Heading>
      <div className="card p-3 mb-2">
        <Bars items={data.joinsByDay} />
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          Counts joins that were recorded by the join system.
        </p>
      </div>

      <Heading>Most active channels</Heading>
      <div className="space-y-1">
        {data.topChannels.length === 0 && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            No messages in the last 30 days.
          </p>
        )}
        {data.topChannels.map((c) => (
          <div key={c.name} className="flex items-center justify-between text-sm">
            <span>#{c.name}</span>
            <span style={{ color: "var(--text-muted)" }}>{c.count}</span>
          </div>
        ))}
      </div>

      <Heading>Top posters</Heading>
      <div className="space-y-1">
        {data.topPosters.map((p) => (
          <div key={p.username} className="flex items-center justify-between text-sm">
            <span>@{p.username}</span>
            <span style={{ color: "var(--text-muted)" }}>{p.count}</span>
          </div>
        ))}
      </div>
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
  if (error) return <Status text={error} />;
  if (!form) return <Spinner />;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const widgetUrl = `${origin}/widget/${communityId}`;
  const embed = `<iframe src="${widgetUrl}" width="350" height="420" style="border:0;border-radius:12px" title="Community widget"></iframe>`;

  return (
    <div>
      <Note>Put a small join card for this community on any website.</Note>
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
      <button onClick={save} className="btn-primary" disabled={saving}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : "Save Widget"}
      </button>
      <Status text={status} />

      <Heading>Embed code</Heading>
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

      {form.enabled && (
        <div>
          <Heading>Preview (save first to see changes)</Heading>
          <iframe
            src={widgetUrl}
            title="Widget preview"
            style={{ width: "100%", maxWidth: 350, height: 420, border: 0, borderRadius: 12 }}
          />
        </div>
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
{emojisLoading ? (
                  <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
                    <Loader2 size={22} className="animate-spin" />
                  </div>
                ) : (
                  <>
                    <h3 className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
                      Emojis ({emojis.filter((e) => e.type === "emoji").length})
                    </h3>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {emojis.filter((e) => e.type === "emoji").map((e) => (
                        <div key={e.id} className="card p-2 text-center" style={{ width: 76 }}>
                          <img src={e.imageDataUrl} alt={e.name} style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 6, margin: "0 auto" }} />
                          <div className="text-xs mt-1" style={{ overflowWrap: "anywhere" }}>{e.name}</div>
                          <button
                            onClick={() => handleDeleteEmoji(e)}
                            style={{ background: "none", border: "none", color: "var(--text-muted)" }}
                            aria-label={`Delete ${e.name}`}
                          >
                            <XIcon size={12} />
                          </button>
                        </div>
                      ))}
                      {emojis.filter((e) => e.type === "emoji").length === 0 && (
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>No custom emojis yet.</p>
                      )}
                    </div>

                    <h3 className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
                      Stickers ({emojis.filter((e) => e.type === "sticker").length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {emojis.filter((e) => e.type === "sticker").map((e) => (
                        <div key={e.id} className="card p-2 text-center" style={{ width: 92 }}>
                          <img src={e.imageDataUrl} alt={e.name} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, margin: "0 auto" }} />
                          <div className="text-xs mt-1" style={{ overflowWrap: "anywhere" }}>{e.name}</div>
                          <button
                            onClick={() => handleDeleteEmoji(e)}
                            style={{ background: "none", border: "none", color: "var(--text-muted)" }}
                            aria-label={`Delete ${e.name}`}
                          >
                            <XIcon size={12} />
                          </button>
                        </div>
                      ))}
                      {emojis.filter((e) => e.type === "sticker").length === 0 && (
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>No stickers yet.</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {resolveSettingsPage(settingsPage) && (
              <CommunitySettingsPage page={resolveSettingsPage(settingsPage)} communityId={communityId} />
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

            {settingsPage && !resolveSettingsPage(settingsPage) && !["overview", "members", "invites", "channels", "roles", "danger", "threads", "rules", "onboarding", "community-guide", "emojis-stickers"].includes(settingsPage) && (
              <div className="card p-6 text-center space-y-2" style={{ background: "var(--surface-2)" }}>
                <SlidersHorizontal size={24} className="mx-auto" style={{ color: "var(--text-muted)" }} />
                <h3 className="text-sm font-semibold">{SETTINGS_TITLES[settingsPage]}</h3>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Settings and controls for {SETTINGS_TITLES[settingsPage]?.toLowerCase()} will be available here.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
<div className="mb-4" style={{ borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)" }}>
        <div
          onClick={() => canManage && pickImage("banner")}
          style={{
            height: 110,
            cursor: canManage ? "pointer" : "default",
            background: community.bannerDataUrl
              ? `url("${community.bannerDataUrl}") center/cover`
              : `linear-gradient(135deg, ${community.accentColor || "var(--accent-soft)"}, var(--surface-2))`,
            position: "relative",
          }}
        >
          {canManage && (
            <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.5)", borderRadius: 8, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}>
              <ImageIcon size={12} color="white" />
              <span style={{ fontSize: 11, color: "white" }}>{community.bannerDataUrl ? "Change" : "Add banner"}</span>
            </div>
          )}
        </div>
        <div className="card p-4" style={{ borderRadius: 0, borderTop: "none", marginTop: -1 }}>
          <div className="flex items-center gap-3 mb-3">
            <div onClick={() => canManage && pickImage("icon")} style={{ cursor: canManage ? "pointer" : "default", position: "relative" }}>
              <Avatar user={{ username: community.name, avatarDataUrl: community.iconDataUrl }} size={52} />
              {canManage && (
                <div style={{ position: "absolute", bottom: -2, right: -2, background: "var(--accent)", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ImageIcon size={10} color="white" />
                </div>
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="flex items-center gap-1.5">
                <h1 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>{community.name}</h1>
                {community.isOwner && <Crown size={14} style={{ color: "#F0B75E" }} />}
              </div>
              <button
                onClick={() => { setView("settings"); setSettingsPage(canManage ? "members" : null); }}
                className="text-xs flex items-center gap-1"
                style={{ color: "var(--text-muted)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                <Users size={12} /> {community.memberCount} member{community.memberCount === 1 ? "" : "s"}
              </button>
            </div>
            <button
              onClick={() => setView(view === "guide" ? "feed" : "guide")}
              aria-label="Community Guide"
              style={{ color: "var(--text-muted)", background: "var(--surface-2)", border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <BookOpen size={16} />
            </button>
            <button
              onClick={() => setView(view === "events" ? "feed" : "events")}
              aria-label="Events"
              style={{ color: "var(--text-muted)", background: "var(--surface-2)", border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Calendar size={16} />
            </button>
            {canManage && (
              <button
                onClick={() => { setView("settings"); setSettingsPage(null); }}
                aria-label="Community settings"
                style={{ color: "var(--text-muted)", background: "var(--surface-2)", border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Settings size={16} />
              </button>
            )}
          </div>
          {community.description && <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>{community.description}</p>}
          {community.tags && community.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {community.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {!community.isOwner && (
              <button
                onClick={toggleMembership}
                className="btn-primary"
                style={community.isMember ? { background: "var(--surface-2)", color: "var(--text)" } : {}}
              >
                {community.isMember ? "Leave" : "Join"}
              </button>
            )}
            <button
              onClick={handleCopyLink}
              className="btn-primary"
              style={{ background: "var(--surface-2)", color: "var(--text)", maxWidth: 180 }}
            >
              <Link2 size={14} /> {linkCopied ? "Link copied!" : "Copy invite link"}
            </button>
          </div>
        </div>
      </div>

      {mustAcknowledgeRules && (
        <div className="card p-4 mb-4" style={{ border: "1px solid var(--accent)" }}>
          <p className="text-sm font-semibold mb-1">Please review the community rules</p>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            You need to acknowledge this community's rules before you can participate.
          </p>
          <button
            onClick={() => { setView("settings"); setSettingsPage("rules"); }}
            className="btn-primary"
            style={{ maxWidth: 160 }}
          >
            View Rules
          </button>
        </div>
      )}

      {view === "events" && (
        <div className="card p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => setView("feed")} aria-label="Back" style={{ background: "none", border: "none", color: "var(--text-muted)" }}>
              <ChevronLeft size={18} />
            </button>
            <h2 className="text-sm font-semibold">Events</h2>
          </div>

          {community.isMember && (
            <form onSubmit={handleCreateEvent} className="space-y-2 mb-4 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
              {eventError && <div className="text-xs" style={{ color: "var(--danger, #e55)" }}>{eventError}</div>}
              <input
                className="input pl-3"
                style={{ fontSize: 13 }}
                placeholder="Event title"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
              />
              <input
                className="input pl-3"
                style={{ fontSize: 13 }}
                type="datetime-local"
                value={newEventTime}
                onChange={(e) => setNewEventTime(e.target.value)}
              />
              <input
                className="input pl-3"
                style={{ fontSize: 13 }}
                placeholder="Description (optional)"
                value={newEventDesc}
                onChange={(e) => setNewEventDesc(e.target.value)}
              />
              <button type="submit" className="btn-primary" disabled={creatingEvent || !newEventTitle.trim() || !newEventTime}>
                {creatingEvent ? <Loader2 size={14} className="animate-spin" /> : "Create Event"}
              </button>
            </form>
          )}

          <div className="space-y-2">
            {events.map((ev) => (
              <div key={ev.id} className="card p-3">
                <div className="text-sm font-semibold">{ev.title}</div>
                <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                  {new Date(ev.startTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
                {ev.description && <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>{ev.description}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{ev.attendeeCount} going</span>
                  <button
                    onClick={() => handleRsvp(ev)}
                    className="text-xs font-semibold px-3 py-1 rounded-full"
                    style={ev.isAttending ? { background: "var(--surface-2)", color: "var(--text)" } : { background: "var(--accent)", color: "white" }}
                  >
                    {ev.isAttending ? "Going" : "RSVP"}
                  </button>
                </div>
              </div>
            ))}
            {events.length === 0 && <p className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>No events yet.</p>}
          </div>
        </div>
      )}

      {view === "guide" && (
        <div className="card p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => setView("feed")} aria-label="Back" style={{ background: "none", border: "none", color: "var(--text-muted)" }}>
              <ChevronLeft size={18} />
            </button>
            <h2 className="text-sm font-semibold">Community Guide</h2>
          </div>

          {guideLoading ? (
            <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {guideData.introduction && (
                <p className="text-sm" style={{ overflowWrap: "anywhere", lineHeight: 1.5 }}>{guideData.introduction}</p>
              )}

              {guideData.importantInfo && (
                <div className="card p-3" style={{ background: "var(--surface-2)" }}>
                  <h3 className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Important information</h3>
                  <p className="text-sm" style={{ overflowWrap: "anywhere", lineHeight: 1.5 }}>{guideData.importantInfo}</p>
                </div>
              )}

              {guideData.recommendedChannelIds?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>Recommended channels</h3>
                  <div className="space-y-1">
                    {channels
                      .filter((c) => guideData.recommendedChannelIds.includes(c.id))
                      .map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { setView("feed"); openChannel(c.id); }}
                          className="flex items-center gap-1.5 text-sm"
                          style={{ background: "none", border: "none", color: "var(--text)", padding: "2px 0" }}
                        >
                          <Hash size={14} style={{ color: "var(--text-muted)" }} /> {c.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {rules.length > 0 && (
                <button
                  onClick={() => { setView("settings"); setSettingsPage("rules"); }}
                  className="text-xs"
                  style={{ background: "none", border: "none", color: "var(--accent)", padding: 0 }}
                >
                  View community rules →
                </button>
              )}

              {guideData.faqs?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>FAQ</h3>
                  <div className="space-y-2">
                    {guideData.faqs.map((f) => (
                      <div key={f.id} className="card p-3">
                        <div className="flex items-start gap-2 mb-1">
                          <HelpCircle size={14} style={{ color: "var(--accent)", marginTop: 2, flexShrink: 0 }} />
                          <p className="text-sm font-semibold" style={{ overflowWrap: "anywhere" }}>{f.question}</p>
                        </div>
                        <p className="text-xs" style={{ color: "var(--text-muted)", overflowWrap: "anywhere", lineHeight: 1.5 }}>{f.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {guideData.resources?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>Resources & links</h3>
                  <div className="space-y-1">
                    {guideData.resources.map((r) => (
                      <a
                        key={r.id}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm"
                        style={{ color: "var(--accent)" }}
                      >
                        <ExternalLink size={13} /> {r.label || r.url}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {!guideData.introduction &&
                !guideData.importantInfo &&
                !guideData.faqs?.length &&
                !guideData.resources?.length &&
                !guideData.recommendedChannelIds?.length && (
                  <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>
                    {canManage
                      ? "This community doesn't have a guide yet. Add one from Settings → Community Guide."
                      : "This community hasn't set up a guide yet."}
                  </p>
                )}
            </div>
          )}
        </div>
      )}

      {view === "feed" && !channelViewOpen && (
        <div className="card p-2 mb-4">
          {sections.map((s) => {
            const secChannels = channels.filter((c) => c.sectionId === s.id);
            if (secChannels.length === 0) return null;
            return (
              <div key={s.id} className="mb-2">
                <div className="text-xs font-semibold px-2 py-1" style={{ color: "var(--text-muted)" }}>{s.name}</div>
                {secChannels.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openChannel(c.id)}
                    className="flex items-center gap-2 w-full text-sm py-2 px-2 rounded-lg"
                    style={{ background: "transparent", color: "var(--text)", border: "none", textAlign: "left" }}
                  >
                    <Hash size={15} style={{ color: "var(--text-muted)" }} /> {c.name}
                  </button>
                ))}
              </div>
            );
          })}
          {uncategorized.length > 0 && (
            <div>
              {sections.length > 0 && <div className="text-xs font-semibold px-2 py-1" style={{ color: "var(--text-muted)" }}>Channels</div>}
              {uncategorized.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openChannel(c.id)}
                  className="flex items-center gap-2 w-full text-sm py-2 px-2 rounded-lg"
                  style={{ background: "transparent", color: "var(--text)", border: "none", textAlign: "left" }}
                >
                  <Hash size={15} style={{ color: "var(--text-muted)" }} /> {c.name}
                </button>
              ))}
            </div>
          )}
          {channels.length === 0 && (
            <p className="text-xs p-2" style={{ color: "var(--text-muted)" }}>
              No channels yet.{canManage ? " Add one from Settings." : ""}
            </p>
          )}
        </div>
      )}
{view === "feed" && channelViewOpen && activeChannel && (
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
                              style={{ color: reportedIds[post.id] ? "var(--text-muted)" : "var(--text-muted)", background: "none", border: "none" }}
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
                      <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                        <div className="flex items-center gap-1.5">
                          <Avatar user={post.author} size={18} />
                          <span>{post.author.username}</span>
                          <span>·</span>
                          <span>{relativeTime(post.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1"><Heart size={12} /> {post.likeCount}</span>
                          <span className="flex items-center gap-1"><MessageCircle size={12} /> {post.comments?.length || 0}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (<>
                {posts.length === 0 && (
                  <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>No messages yet.</p>
                )}
                {posts.map((post, i) => {
                  const prev = posts[i - 1];
                  const grouped = prev && prev.author.id === post.author.id &&
                    (new Date(post.createdAt) - new Date(prev.createdAt)) < 5 * 60 * 1000;
                  return (
                    <div key={post.id} className="px-1" style={{ marginTop: grouped ? 2 : 14 }}>
                      <div className="flex items-start gap-2.5">
                        <div style={{ width: 36, flexShrink: 0 }}>
                          {!grouped && <Avatar user={post.author} size={36} />}
                        </div>
                        <div
                          style={{ minWidth: 0, flex: 1 }}
                          onTouchStart={() => handlePressStart(post.id)}
                          onTouchEnd={() => handlePressEnd(post.id)}
                          onMouseDown={() => handlePressStart(post.id)}
                          onMouseUp={() => handlePressEnd(post.id)}
                          onMouseLeave={() => handlePressEnd(post.id)}
                        >
                          {!grouped && (
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-semibold">{post.author.username}</span>
                              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{relativeTime(post.createdAt)}</span>
                            </div>
                          )}

                          {post.replyTo && (
                            <div className="text-xs mb-1 px-2 py-1" style={{ borderLeft: "2px solid var(--accent)", color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                              <span className="font-semibold">{post.replyTo.author?.username}</span> {post.replyTo.content?.slice(0, 80)}
                            </div>
                          )}

                          {editingPostId === post.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                className="input pl-3"
                                style={{ padding: "6px 10px", fontSize: 13, flex: 1 }}
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleEditPost(post.id)}
                                autoFocus
                              />
                              <button onClick={() => handleEditPost(post.id)} style={{ color: "var(--accent)", background: "none", border: "none" }} aria-label="Save edit">
                                <Send size={14} />
                              </button>
                              <button onClick={() => setEditingPostId(null)} style={{ color: "var(--text-muted)", background: "none", border: "none" }} aria-label="Cancel edit">
                                <XIcon size={14} />
                              </button>
                            </div>
                          ) : (
                            <p className="text-sm" style={{ overflowWrap: "anywhere", lineHeight: 1.45 }}>{post.content}</p>
                          )}

                          <PostReactionPills postId={post.id} currentUserId={currentUserId} />

                          {openThreads[post.id] && (
                            <div className="mt-2 pl-3 py-2" style={{ borderLeft: "2px solid var(--border)" }}>
                              {post.comments?.map((c) => (
                                <div key={c.id} className="flex items-start gap-2 mb-2">
                                  <Avatar user={c.author} size={22} />
                                  <div className="text-xs" style={{ flex: 1 }}>
                                    <span className="font-semibold">{c.author.username}</span>{" "}
                                    <span style={{ color: "var(--text-muted)" }}>{c.content}</span>
                                  </div>
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
                              ))}
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  className="input pl-3"
                                  style={{ padding: "6px 10px", fontSize: 12 }}
                                  placeholder="Reply in thread…"
                                  value={commentDrafts[post.id] || ""}
                                  onChange={(e) => setCommentDrafts((prev2) => ({ ...prev2, [post.id]: e.target.value }))}
                                  onKeyDown={(e) => e.key === "Enter" && handleAddComment(post.id)}
                                />
                                <button onClick={() => handleAddComment(post.id)} style={{ color: "var(--accent)", background: "none", border: "none" }} aria-label="Send reply">
                                  <Send size={14} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {community.isMember && activeChannel.type === "forum" && !openForumPostId && (
            <div style={{ borderTop: "1px solid var(--border)", flexShrink: 0 }} className="p-3">
              {!showNewPostForm ? (
                <button
                  onClick={() => setShowNewPostForm(true)}
                  className="btn-primary w-full"
                >
                  <Plus size={15} /> New Post
                </button>
              ) : (
                <form onSubmit={handlePost} className="space-y-2">
                  {error && <div className="text-xs" style={{ color: "var(--danger, #e55)" }}>{error}</div>}
                  <input
                    className="input pl-3"
                    style={{ padding: "9px 10px", fontSize: 14 }}
                    placeholder="Post title"
                    value={newPostTitle}
                    onChange={(e) => setNewPostTitle(e.target.value)}
                    autoFocus
                  />
                  <textarea
                    className="input pl-3"
                    style={{ padding: "9px 10px", fontSize: 14, minHeight: 70, resize: "vertical" }}
                    placeholder="What's on your mind?"
                    value={newPost}
                    onChange={(e) => setNewPost(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary" disabled={posting || !newPost.trim() || !newPostTitle.trim()}>
                      {posting ? <Loader2 size={14} className="animate-spin" /> : "Post"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowNewPostForm(false); setNewPost(""); setNewPostTitle(""); setError(""); }}
                      className="btn-primary"
                      style={{ background: "var(--surface-2)", color: "var(--text)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {community.isMember && activeChannel.type !== "forum" && (
            <form onSubmit={handlePost} className="flex flex-col gap-1 p-3" style={{ borderTop: "1px solid var(--border)", flexShrink: 0, position: "relative" }}>
              {error && (
                <div className="alert alert-error" style={{ position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 8 }}>
                  <AlertCircle size={14} />{error}
                </div>
              )}
              {replyingTo && (
                <div className="flex items-center justify-between px-2 py-1" style={{ background: "var(--surface-2)", borderRadius: 8, fontSize: 12, color: "var(--text-muted)" }}>
                  <span>Replying to <strong>{replyingTo.author.username}</strong></span>
                  <button onClick={() => setReplyingTo(null)} style={{ background: "none", border: "none", color: "var(--text-muted)" }} aria-label="Cancel reply">
                    <XIcon size={12} />
                  </button>
                </div>
              )}
              {emojiPickerOpen && (
                <div
                  className="card p-2"
                  style={{ position: "absolute", bottom: "100%", left: 12, marginBottom: 8, maxWidth: 260, maxHeight: 220, overflowY: "auto", zIndex: 5 }}
                >
                  {emojis.length === 0 ? (
                    <p className="text-xs p-2" style={{ color: "var(--text-muted)" }}>
                      No custom emojis or stickers yet.{canManage ? " Add some from Settings → Emojis & Stickers." : ""}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {emojis.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => insertEmojiShortcode(e)}
                          title={e.name}
                          style={{ background: "none", border: "none", padding: 2, borderRadius: 6 }}
                        >
                          <img
                            src={e.imageDataUrl}
                            alt={e.name}
                            style={{ width: e.type === "sticker" ? 40 : 24, height: e.type === "sticker" ? 40 : 24, objectFit: "cover", borderRadius: 4 }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEmojiPickerOpen((v) => !v)}
                  aria-label="Emojis & Stickers"
                  style={{
                    width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                    background: emojiPickerOpen ? "var(--accent-soft)" : "var(--surface-2)",
                    color: emojiPickerOpen ? "var(--accent)" : "var(--text-muted)",
                    border: "none", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Smile size={18} />
                </button>
                <input
                  className="input pl-4"
                  style={{
                    flex: 1, borderRadius: 999, height: 46,
                    background: "var(--surface-2)", border: "1px solid var(--border)",
                  }}
                  placeholder={`Message #${activeChannel.name}`}
                  value={newPost}
                  onChange={(e) => setNewPost(e.target.value)}
                />
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={posting || !newPost.trim()}
                  style={{
                    width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
                    background: "var(--accent)", color: "white", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    opacity: posting || !newPost.trim() ? 0.5 : 1,
                  }}
                >
                  {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// New settings pages (Channel Permissions, Safety & Moderation, AutoMod, Audit Log, Integrations, Webhooks, Server Analytics, Widget).
// Imports are hoisted, so this works even though it sits at the end of the file.
import CommunitySettingsPage, { resolveSettingsPage } from "./CommunitySettingsPages";