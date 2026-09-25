"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { User, Settings, HelpCircle, Phone, ChevronRight, MessageSquare, Sparkles, Loader2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

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

export default function DashboardClient({ user }) {
  const { t } = useLanguage();
  const [conversations, setConversations] = useState([]);
  const [loadingChats, setLoadingChats] = useState(true);

  useEffect(() => {
    fetch("/api/ai/conversations")
      .then((r) => r.json())
      .then((data) => setConversations((data.conversations || []).slice(0, 4)))
      .finally(() => setLoadingChats(false));
  }, []);

  const quickActions = [
    { labelKey: "settings.editProfile", href: "/profile", icon: User },
    { labelKey: "nav.settings", href: "/settings", icon: Settings },
    { labelKey: "settings.helpCenter", href: "/help", icon: HelpCircle },
    { labelKey: "settings.contactUs", href: "/contact", icon: Phone },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center px-4 pb-16">
      <div className="w-full max-w-[480px] mt-10">
        <div className="flex items-center gap-4 mb-8">
          {user.avatarDataUrl ? (
            <img
              src={user.avatarDataUrl}
              alt="Profile"
              className="w-16 h-16 rounded-full object-cover"
              style={{ boxShadow: "0 0 0 2px var(--border)" }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold"
              style={{ background: "var(--accent-soft)", color: "var(--accent)", fontFamily: "var(--font-display)" }}
            >
              {user.username.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {t("dash.welcomeBack")}, {user.username}
            </h1>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {user.online ? t("settings.onlineAuto") : t("common.offline")}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            {t("dash.recentAi")}
          </h2>
          <Link href="/ai-tools/chat" className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
            {t("dash.newChat")}
          </Link>
        </div>

        {loadingChats && (
          <div className="flex justify-center py-6 mb-6" style={{ color: "var(--text-muted)" }}>
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}

        {!loadingChats && conversations.length === 0 && (
          <Link
            href="/ai-tools/chat"
            className="flex items-center gap-3 p-4 rounded-2xl mb-6"
            style={{ background: "var(--accent-soft)", border: "1px solid var(--border)" }}
          >
            <Sparkles size={18} style={{ color: "var(--accent)" }} />
            <div>
              <div className="text-sm font-semibold">{t("dash.startChat")}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{t("dash.askAnything")}</div>
            </div>
          </Link>
        )}

        {!loadingChats && conversations.length > 0 && (
          <div className="card mb-6" style={{ padding: 6 }}>
            {conversations.map((c, i, arr) => (
              <Link
                key={c.id}
                href={`/ai-tools/chat?id=${c.id}`}
                className="flex items-center justify-between p-3 rounded-xl"
                style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}
              >
                <div className="flex items-start gap-2.5" style={{ minWidth: 0 }}>
                  <MessageSquare size={16} style={{ color: "var(--text-muted)", marginTop: 2, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      className="text-sm font-medium"
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {c.title}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {relativeTime(c.updatedAt)}
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        )}

        <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>
          {t("dash.quickActions")}
        </h2>
        <div className="card" style={{ padding: 6 }}>
          {quickActions.map((action, i) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-center justify-between p-3 rounded-xl"
              style={{
                borderBottom: i < quickActions.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <div className="flex items-center gap-2.5 text-sm font-medium">
                <action.icon size={16} />
                {t(action.labelKey)}
              </div>
              <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}