// app/settings/account/page.js
"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, AlertCircle, Trash2 } from "lucide-react";

export default function DeleteAccountPage() {
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const ready = password.length > 0 && confirmText.trim().toUpperCase() === "DELETE";

  async function handleDelete(e) {
    e.preventDefault();
    if (!ready || loading) return;
    if (!window.confirm("This permanently deletes your account and can't be undone. Continue?")) return;

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't delete your account.");
        setLoading(false);
        return;
      }
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {}
      window.location.href = "/login";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100, overflowY: "auto",
        background: "var(--surface)", color: "var(--text)",
      }}
    >
      <div
        className="flex items-center gap-3 px-4"
        style={{
          height: 56, borderBottom: "1px solid var(--border)",
          position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
        }}
      >
        <Link href="/settings" aria-label="Back" style={{ color: "var(--text)", display: "flex" }}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-sm font-semibold">Delete account</h1>
      </div>

      <form onSubmit={handleDelete} className="p-4" style={{ maxWidth: 440, margin: "0 auto", paddingBottom: 60 }}>
        <div className="flex items-center gap-2 mb-2" style={{ color: "var(--danger, #e55)" }}>
          <Trash2 size={20} />
          <h2 className="text-base font-bold">Delete your account</h2>
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          This can't be undone. These will be permanently deleted:
        </p>
        <ul className="text-sm mb-5" style={{ color: "var(--text-muted)", paddingLeft: 18, listStyle: "disc", lineHeight: 1.7 }}>
          <li>Your profile, posts, videos, drafts, and sounds</li>
          <li>Your comments and likes</li>
          <li>Your messages, in both your chats and the other person's</li>
          <li>Your friends, followers, and settings</li>
          <li>Your Syna chats and saved work</li>
        </ul>
        <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
          If you own a community with other members, delete or transfer it first.
        </p>

        {error && (
          <div className="alert alert-error mb-4">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
          Your password
        </label>
        <input
          className="input pl-3 mb-4"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
          Type DELETE to confirm
        </label>
        <input
          className="input pl-3 mb-5"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoCapitalize="characters"
        />

        <button
          className="btn-primary"
          type="submit"
          disabled={!ready || loading}
          style={{ background: "var(--danger, #e55)", opacity: !ready || loading ? 0.5 : 1 }}
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : "Permanently delete my account"}
        </button>
      </form>
    </div>
  );
}