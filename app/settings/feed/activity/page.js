// app/settings/feed/activity/page.js
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Eye, Heart, MessageCircle, Bookmark, Lock } from "lucide-react";
import NavShell from "@/components/NavShell";

function abbreviate(n) {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="flex flex-col items-center" style={{ minWidth: 0 }}>
      <Icon size={15} style={{ color: "var(--text-muted)" }} />
      <div className="text-sm font-semibold mt-1">{abbreviate(value)}</div>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

export default function ActivityCentrePage() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => setUser(s.user))
      .catch(() => {});
    fetch("/api/feed/insights", { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (r.ok) setData(json);
        else setError(json.error || "Couldn't load your activity.");
      })
      .catch(() => setError("Couldn't load your activity."));
  }, []);

  return (
    <NavShell user={user}>
      <div className="px-4 pt-5 pb-16" style={{ maxWidth: 480, margin: "0 auto" }}>
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings/feed" aria-label="Back" style={{ color: "var(--text)" }}>
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-semibold">Activity centre</h1>
        </div>

        {!data && !error && (
          <div className="flex justify-center py-16" style={{ color: "var(--text-muted)" }}>
            <Loader2 size={22} className="animate-spin" />
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {data && (
          <>
            <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
              All posts
            </div>
            <div className="card mb-2 p-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              <Stat icon={Eye} value={data.totals.views} label="Views" />
              <Stat icon={Heart} value={data.totals.likes} label="Likes" />
              <Stat icon={MessageCircle} value={data.totals.comments} label="Comments" />
              <Stat icon={Bookmark} value={data.totals.saves} label="Saves" />
            </div>
            <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
              Views count each person once per post, and never your own views.
            </p>

            <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
              Your posts
            </div>

            {data.posts.length === 0 ? (
              <p className="text-sm text-center py-10" style={{ color: "var(--text-muted)" }}>
                No posts yet. Once you post, your numbers show up here.
              </p>
            ) : (
              <div className="space-y-2">
                {data.posts.map((p) => (
                  <div key={p.id} className="card p-3.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-sm font-semibold"
                        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}
                      >
                        {p.caption || (p.mediaType === "video" ? "Video" : "Photo post")}
                      </span>
                      {p.isPrivate && <Lock size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
                    </div>
                    <div className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                      {p.mediaType === "video" ? "Video" : "Photo"} · {new Date(p.createdAt).toLocaleDateString()}
                      {p.isPrivate ? " · Only me" : ""}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                      <Stat icon={Eye} value={p.views} label="Views" />
                      <Stat icon={Heart} value={p.likes} label="Likes" />
                      <Stat icon={MessageCircle} value={p.comments} label="Comments" />
                      <Stat icon={Bookmark} value={p.saves} label="Saves" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </NavShell>
  );
}