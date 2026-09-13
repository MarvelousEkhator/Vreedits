"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, UserPlus, Shield, Copy, Check, Share2 } from "lucide-react";

export default function TeamPage() {
  const { id: businessId } = useParams();
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  const loadBusiness = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/business");
      const data = await res.json();
      if (res.ok) {
        const found = (data.businesses || []).find((b) => b.id === businessId);
        setBusiness(found || null);
      } else {
        setError(data.error || "Could not load team.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { loadBusiness(); }, [loadBusiness]);

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError("");
    setInviteLink("");
    try {
      const res = await fetch(`/api/business/${businessId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not send invite.");
        return;
      }
      setInviteLink(data.inviteLink);
      setInviteEmail("");
      setInviteRole("member");
    } catch {
      setError("Network error.");
    } finally {
      setInviting(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function shareLink() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join my team on Vreedits", url: inviteLink });
      } catch {}
    } else {
      copyLink();
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center" style={{ height: "60vh" }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (!business) {
    return (
      <div className="px-4 pt-6" style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link href="/business/dashboard" className="flex items-center gap-2 mb-4" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft size={16} /> Back
        </Link>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {error || "You don't have access to this team."}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-10" style={{ maxWidth: 720, margin: "0 auto" }}>
      <Link href="/business/dashboard" className="flex items-center gap-2 mb-4" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>

      <h1 className="text-xl font-semibold mb-1">{business.name} — Team</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Manage who has access to this business.
      </p>

      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Shield size={14} /> Members
      </h2>
      <div className="flex flex-col gap-2 mb-6">
        {business.members?.map((m) => (
          <div key={m.id} className="card p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{m.user?.displayName || m.user?.username || m.user?.email}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{m.user?.email}</div>
            </div>
            <span
              className="text-xs px-2 py-1 rounded-full"
              style={{ background: "var(--surface-2)", textTransform: "capitalize" }}
            >
              {m.role}
            </span>
          </div>
        ))}
      </div>

      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <UserPlus size={14} /> Invite someone
      </h2>
      <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
        Automatic invite emails aren't set up yet — you'll get a link to send them yourself.
      </p>
      <form onSubmit={handleInvite} className="flex flex-col gap-2 mb-2">
        <input
          type="email"
          className="input"
          placeholder="teammate@example.com"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          required
        />
        <select
          className="input"
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value)}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" className="btn btn-primary" disabled={inviting || !inviteEmail.trim()}>
          {inviting ? <Loader2 size={14} className="animate-spin" /> : "Generate Invite Link"}
        </button>
      </form>

      {inviteLink && (
        <div className="card p-3 flex items-center justify-between gap-2 mb-2" style={{ wordBreak: "break-all" }}>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{inviteLink}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={copyLink} aria-label="Copy link" style={{ color: "var(--text-muted)" }}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button onClick={shareLink} aria-label="Share link" style={{ color: "var(--text-muted)" }}>
              <Share2 size={16} />
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm mt-2" style={{ color: "#e55" }}>{error}</p>}
    </div>
  );
}