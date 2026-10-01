"use client";
// app/admin/feedback/page.js
import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2, Check, Heart } from "lucide-react";

const DEFAULT_THANKS = "Thank you for your feedback! We read every message and we're working on it. 💜 — The Vreedits team";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "notThanked", label: "Not thanked" },
];

function timeAgo(date) {
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function AdminFeedbackPage() {
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState(null);
  const [counts, setCounts] = useState({ total: 0, new: 0, notThanked: 0 });
  const [denied, setDenied] = useState(false);
  const [thanksText, setThanksText] = useState(DEFAULT_THANKS);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/feedback?filter=${filter}`);
      if (res.status === 403 || res.status === 401) {
        setDenied(true);
        return;
      }
      const data = await res.json();
      setItems(data.items || []);
      setCounts(data.counts || { total: 0, new: 0, notThanked: 0 });
    } catch {
      setItems([]);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(text) {
    setNotice(text);
    setTimeout(() => setNotice(""), 2500);
  }

  async function act(body, id) {
    setBusyId(id || "bulk");
    try {
      const res = await fetch("/api/admin/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || "Something went wrong.");
      } else if (body.action === "thank") {
        flash(`Thanks sent to ${data.sent} ${data.sent === 1 ? "person" : "people"}.`);
      }
      await load();
    } catch {
      flash("Something went wrong.");
    }
    setBusyId(null);
  }

  if (denied) {
    return (
      <div className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
        This page is only for the Vreedits owner.
      </div>
    );
  }

  return (
    <div className="p-4" style={{ maxWidth: 720, margin: "0 auto", color: "var(--text)" }}>
      <h1 className="text-lg font-bold mb-1">Guest feedback</h1>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        Only you can see this. {counts.total} total · {counts.new} new · {counts.notThanked} not thanked yet.
      </p>

      <div className="mb-4" style={{ background: "var(--surface-2)", borderRadius: 14, padding: 12 }}>
        <div className="text-sm font-semibold mb-2">Your thank-you message</div>
        <textarea
          className="input pl-3"
          style={{ minHeight: 80, resize: "vertical", paddingTop: 10 }}
          maxLength={500}
          value={thanksText}
          onChange={(e) => setThanksText(e.target.value)}
        />
        <button
          className="btn-primary mt-3"
          disabled={busyId === "bulk" || counts.notThanked === 0 || !thanksText.trim()}
          onClick={() => act({ action: "thank", allPending: true, message: thanksText })}
        >
          {busyId === "bulk" ? <Loader2 size={16} className="animate-spin" /> : (<><Heart size={15} /> Thank everyone not thanked yet ({counts.notThanked})</>)}
        </button>
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          They see it as a card the next time they open Vreedits. You can also thank people one by one below.
        </p>
      </div>

      {notice && <div className="alert mb-3">{notice}</div>}

      <div className="flex gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => { setItems(null); setFilter(f.id); }}
            style={{
              borderRadius: 16, padding: "6px 14px", fontSize: 13, fontWeight: 600,
              border: filter === f.id ? "2px solid var(--accent)" : "1px solid var(--border)",
              background: filter === f.id ? "var(--accent-soft)" : "var(--surface-2)",
              color: filter === f.id ? "var(--accent)" : "var(--text)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items === null && (
        <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}

      {items && items.length === 0 && (
        <p className="text-sm text-center py-10" style={{ color: "var(--text-muted)" }}>
          Nothing here yet.
        </p>
      )}

      {items && items.map((f) => (
        <div
          key={f.id}
          className="mb-3"
          style={{
            background: "var(--surface-2)", borderRadius: 14, padding: 12,
            border: f.status === "new" ? "1px solid var(--accent)" : "1px solid var(--border)",
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-semibold">
              {f.username ? `@${f.username}` : "Unknown"}
              <span className="text-xs" style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                {f.isGuest ? " · guest" : " · member"}
              </span>
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>{timeAgo(f.createdAt)}</div>
          </div>

          {f.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {f.categories.map((c) => (
                <span
                  key={c}
                  style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          <p className="text-sm" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{f.message}</p>
          {f.page && (
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>On page: {f.page}</div>
          )}

          <div className="flex items-center gap-2 mt-3">
            {f.thanksSentAt ? (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                <Check size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> Thanked {timeAgo(f.thanksSentAt)}
                {f.thanksSeenAt ? " · seen" : ""}
              </span>
            ) : (
              <button
                disabled={busyId === f.id || !thanksText.trim()}
                onClick={() => act({ action: "thank", ids: [f.id], message: thanksText }, f.id)}
                className="text-sm font-semibold"
                style={{ background: "none", border: "none", color: "var(--accent)" }}
              >
                {busyId === f.id ? "Sending…" : "Send thanks"}
              </button>
            )}
            <span style={{ flex: 1 }} />
            {f.status === "new" && (
              <button
                onClick={() => act({ action: "markRead", ids: [f.id] }, f.id)}
                className="text-xs font-semibold"
                style={{ background: "none", border: "none", color: "var(--text-muted)" }}
              >
                Mark read
              </button>
            )}
            <button
              onClick={() => {
                if (window.confirm("Delete this feedback?")) act({ action: "delete", ids: [f.id] }, f.id);
              }}
              aria-label="Delete feedback"
              style={{ background: "none", border: "none", color: "var(--danger, #e55)" }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}