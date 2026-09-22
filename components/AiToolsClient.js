"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ChevronRight, Sparkles, MessageCircle, MessageSquare, Loader2, Pin, Trash2, Pencil, Share2, Check, X, Home } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

// Categories that already have their own dedicated section dashboard —
// their tools should only show there, not in the general AI Tools list.
const SECTION_OWNED_CATEGORIES = ["Business", "School", "Writing", "Travel", "Home Tools"];

function relativeTime(dateStr, lang = "en") {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  try {
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short" });
    if (mins < 1) return rtf.format(0, "second");
    if (mins < 60) return rtf.format(-mins, "minute");
    const hours = Math.floor(mins / 60);
    if (hours < 24) return rtf.format(-hours, "hour");
    const days = Math.floor(hours / 24);
    if (days < 7) return rtf.format(-days, "day");
  } catch {
    // fall through to the plain date below
  }
  return new Date(dateStr).toLocaleDateString(lang, { month: "short", day: "numeric" });
}

export default function AiToolsClient({ tools }) {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [shareCopiedId, setShareCopiedId] = useState(null);

  function loadConversations() {
    fetch("/api/ai/conversations")
      .then((r) => r.json())
      .then((data) => setConversations(data.conversations || []))
      .finally(() => setLoadingChats(false));
  }

  useEffect(() => { loadConversations(); }, []);

  const generalTools = tools.filter((t) => !SECTION_OWNED_CATEGORIES.includes(t.category));

  const filtered = generalTools.filter((t) =>
    (t.label + " " + t.description).toLowerCase().includes(query.toLowerCase())
  );
  const categories = [...new Set(filtered.map((t) => t.category))];

  function openConversation(id) {
    router.push(`/ai-tools/chat?id=${id}`);
  }

  async function togglePin(c) {
    await fetch(`/api/ai/conversations/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !c.pinned }),
    });
    loadConversations();
  }

  function startRename(c) {
    setRenamingId(c.id);
    setRenameValue(c.title);
  }

  async function confirmRename(id) {
    if (!renameValue.trim()) return;
    await fetch(`/api/ai/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: renameValue.trim() }),
    });
    setRenamingId(null);
    loadConversations();
  }

  async function handleDelete(id) {
    if (!window.confirm(t("aiTools.deleteConfirm"))) return;
    await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleShare(c) {
    const res = await fetch(`/api/ai/conversations/${c.id}/share`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      const url = `${window.location.origin}/share/${data.shareToken}`;
      navigator.clipboard.writeText(url);
      setShareCopiedId(c.id);
      setTimeout(() => setShareCopiedId(null), 2000);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 pb-16">
      <div className="w-full max-w-[480px] mt-10">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {t("aiTools.title")}
          </h1>
          <Link href="/dashboard" aria-label={t("aiTools.exitHome")} style={{ color: "var(--text-muted)" }}>
            <Home size={18} />
          </Link>
        </div>
        <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
          {t("aiTools.poweredBy")}
        </p>

        <div className="relative flex items-center mb-6">
          <Search
            size={15}
            className="absolute left-3"
            style={{ color: "var(--text-muted)", pointerEvents: "none" }}
          />
          <input
            className="input"
            style={{ paddingLeft: 38 }}
            placeholder={t("aiTools.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <Link
          href="/ai-tools/chat"
          className="flex items-center justify-between p-4 rounded-2xl mb-6"
          style={{ background: "var(--accent-soft)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "var(--accent)", color: "white" }}
            >
              <MessageCircle size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold">{t("aiTools.chatWithSyna")}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {t("aiTools.askAnything")}
              </div>
            </div>
          </div>
          <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
        </Link>

        {categories.length === 0 && query && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("aiTools.noMatch", { query })}
          </p>
        )}

        {categories.map((category) => (
          <div key={category} className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>
              {category}
            </h2>
            <div className="card" style={{ padding: 6 }}>
              {filtered
                .filter((t) => t.category === category)
                .map((tool, i, arr) => (
                  <Link
                    key={tool.id}
                    href={`/ai-tools/${tool.id}`}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}
                  >
                    <div className="flex items-start gap-2.5">
                      <Sparkles size={16} style={{ color: "var(--accent)", marginTop: 2 }} />
                      <div>
                        <div className="text-sm font-medium">{tool.label}</div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{tool.description}</div>
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  </Link>
                ))}
            </div>
          </div>
        ))}

        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>
            {t("aiTools.recentChats")}
          </h2>
          {loadingChats && (
            <div className="flex justify-center py-4" style={{ color: "var(--text-muted)" }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}
          {!loadingChats && conversations.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {t("aiTools.noConversations")}
            </p>
          )}
          {!loadingChats && conversations.length > 0 && (
            <div className="card" style={{ padding: 6 }}>
              {conversations.map((c, i, arr) => (
                <div
                  key={c.id}
                  style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}
                >
                  {renamingId === c.id ? (
                    <div className="flex items-center gap-2 p-3">
                      <input
                        className="input pl-2"
                        style={{ padding: "6px 8px", fontSize: 13 }}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        autoFocus
                      />
                      <button onClick={() => confirmRename(c.id)} style={{ color: "var(--accent)", background: "none", border: "none" }} aria-label={t("aiTools.saveName")}>
                        <Check size={16} />
                      </button>
                      <button onClick={() => setRenamingId(null)} style={{ color: "var(--text-muted)", background: "none", border: "none" }} aria-label={t("aiTools.cancelRename")}>
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 rounded-xl">
                      <div
                        onClick={() => openConversation(c.id)}
                        className="flex items-start gap-2.5"
                        style={{ minWidth: 0, cursor: "pointer", flex: 1 }}
                      >
                        {c.pinned ? (
                          <Pin size={16} style={{ color: "var(--accent)", marginTop: 2, flexShrink: 0 }} fill="var(--accent)" />
                        ) : (
                          <MessageSquare size={16} style={{ color: "var(--text-muted)", marginTop: 2, flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div
                            className="text-sm font-medium"
                            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {c.title}
                          </div>
                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {relativeTime(c.updatedAt, lang)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        <button onClick={() => togglePin(c)} aria-label={t("aiTools.pinChat")} style={{ color: c.pinned ? "var(--accent)" : "var(--text-muted)", background: "none", border: "none" }}>
                          <Pin size={14} fill={c.pinned ? "var(--accent)" : "none"} />
                        </button>
                        <button onClick={() => startRename(c)} aria-label={t("aiTools.renameChat")} style={{ color: "var(--text-muted)", background: "none", border: "none" }}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleShare(c)} aria-label={t("aiTools.shareChat")} style={{ color: shareCopiedId === c.id ? "var(--accent)" : "var(--text-muted)", background: "none", border: "none" }}>
                          {shareCopiedId === c.id ? <Check size={14} /> : <Share2 size={14} />}
                        </button>
                        <button onClick={() => handleDelete(c.id)} aria-label={t("aiTools.deleteChat")} style={{ color: "var(--text-muted)", background: "none", border: "none" }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}