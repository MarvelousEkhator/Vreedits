"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RotateCw } from "lucide-react";

function timeAgo(dateStr) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function name(p) {
  return p ? `@${p.username}` : "unknown";
}

const smallBtn = {
  background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)",
  borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 600,
};
const dangerBtn = { ...smallBtn, color: "var(--danger, #e55)" };

export default function AdminReportsPage() {
  const [tab, setTab] = useState("open");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyKey, setBusyKey] = useState(null);
  const [media, setMedia] = useState({});

  const load = useCallback(async (which) => {
    setItems(null);
    setError("");
    try {
      const res = await fetch(`/api/admin/reports?status=${which}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 403 ? "Only the owner can open this page." : data.error || "Couldn't load reports.");
        setItems([]);
        return;
      }
      setItems(data.items || []);
    } catch {
      setError("Couldn't load reports.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  async function act(item, action) {
    const question =
      action === "remove" ? "Remove this content? This can't be undone."
      : action === "warn" ? `Give @${item.target?.username || "this user"} a warning strike?`
      : "";
    if (question && !window.confirm(question)) return;

    setBusyKey(item.key);
    setNotice("");
    setError("");
    try {
      const res = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: item.source, id: item.id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "That didn't work.");
      } else {
        setNotice(data.note ? `Done.${data.note}` : "Done.");
        await load(tab);
      }
    } catch {
      setError("Network problem. Try again.");
    }
    setBusyKey(null);
  }

  async function showMedia(item) {
    setMedia((m) => ({ ...m, [item.key]: { loading: true } }));
    try {
      const res = await fetch(
        `/api/admin/reports?media=${item.mediaKind}&id=${encodeURIComponent(item.mediaId)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      setMedia((m) => ({ ...m, [item.key]: res.ok ? { data } : { error: data.error || "Couldn't load it." } }));
    } catch {
      setMedia((m) => ({ ...m, [item.key]: { error: "Couldn't load it." } }));
    }
  }

  function renderMedia(state) {
    if (!state) return null;
    if (state.loading) return <div className="text-xs" style={{ color: "var(--text-muted)" }}>Loading…</div>;
    if (state.error) return <div className="text-xs" style={{ color: "var(--danger, #e55)" }}>{state.error}</div>;
    const d = state.data;
    if (!d || (!d.mediaUrl && !d.mediaUrls)) {
      return <div className="text-xs" style={{ color: "var(--text-muted)" }}>No media on this post.</div>;
    }
    if (d.mediaType === "video") {
      return <video src={d.mediaUrl} controls playsInline style={{ width: "100%", maxHeight: 360, borderRadius: 10, background: "#000" }} />;
    }
    const urls = d.mediaUrls || [d.mediaUrl];
    return (
      <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
        {urls.map((u, i) => (
          <img key={i} src={u} alt="" style={{ height: 220, borderRadius: 10, flexShrink: 0 }} />
        ))}
      </div>
    );
  }

  const tabStyle = (id) => ({
    flex: 1, padding: "10px 0", background: "none", border: "none",
    fontSize: 14, fontWeight: tab === id ? 700 : 500,
    color: tab === id ? "var(--text)" : "var(--text-muted)",
    borderBottom: tab === id ? "2px solid var(--accent)" : "2px solid transparent",
  });

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
        <Link href="/dashboard" aria-label="Back" style={{ color: "var(--text)", display: "flex" }}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-sm font-semibold" style={{ flex: 1 }}>Reports</h1>
        <button onClick={() => load(tab)} aria-label="Refresh" style={{ background: "none", border: "none", color: "var(--text)" }}>
          <RotateCw size={18} />
        </button>
      </div>

      <div className="flex" style={{ borderBottom: "1px solid var(--border)" }}>
        <button onClick={() => setTab("open")} style={tabStyle("open")}>Open</button>
        <button onClick={() => setTab("closed")} style={tabStyle("closed")}>Closed</button>
      </div>

      <div className="p-4" style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 60 }}>
        {notice && <div className="mb-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>{notice}</div>}
        {error && <div className="alert alert-error mb-3">{error}</div>}

        {items === null && (
          <div className="flex justify-center py-12" style={{ color: "var(--text-muted)" }}>
            <Loader2 size={22} className="animate-spin" />
          </div>
        )}

        {items && items.length === 0 && !error && (
          <p className="text-sm text-center py-12" style={{ color: "var(--text-muted)" }}>
            {tab === "open" ? "No open reports. Nice." : "Nothing here yet."}
          </p>
        )}

        {items && items.map((item) => (
          <div key={item.key} className="card p-3 mb-3" style={{ overflowWrap: "anywhere" }}>
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                {item.kind}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {timeAgo(item.createdAt)}{item.status !== "open" ? ` · ${item.status}` : ""}
              </span>
            </div>

            <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
              {name(item.reporter)} reported {name(item.target)}
            </div>
            {item.context && <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{item.context}</div>}

            <div className="text-sm mb-2"><strong>Reason:</strong> {item.reason || "(none given)"}</div>

            {item.preview && (
              <div
                className="text-sm mb-2 p-2"
                style={{ background: "var(--surface-2)", borderRadius: 10, lineHeight: 1.45 }}
              >
                {item.preview}
              </div>
            )}

            {item.mediaKind && (
              <div className="mb-2">
                {media[item.key] ? renderMedia(media[item.key]) : (
                  <button style={smallBtn} onClick={() => showMedia(item)}>Show photo or video</button>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {busyKey === item.key ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  {item.status === "open" && <button style={smallBtn} onClick={() => act(item, "dismiss")}>Dismiss</button>}
                  {item.status === "open" && <button style={smallBtn} onClick={() => act(item, "reviewed")}>Reviewed</button>}
                  {item.canRemove && <button style={dangerBtn} onClick={() => act(item, "remove")}>Remove</button>}
                  {item.canWarn && <button style={dangerBtn} onClick={() => act(item, "warn")}>Warn author</button>}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}