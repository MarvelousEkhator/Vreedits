"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Trash2, Copy, RefreshCw } from "lucide-react";
import { AccessControlRow } from "./CommunityDetailShared";

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