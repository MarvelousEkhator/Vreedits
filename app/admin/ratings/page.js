import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

// Who may open this page. Add more emails in Render → Environment → ADMIN_EMAILS (comma separated).
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "lillianhenryvague@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function when(d) {
  return new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default async function AdminFeedbackPage() {
  // Anyone who is not an admin just sees a normal "not found" page.
  let user = null;
  try {
    user = await requireUser();
  } catch {}
  if (!user || !user.id || user.isGuest) notFound();
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true } });
  if (!me || !me.email || !ADMIN_EMAILS.includes(me.email.toLowerCase())) notFound();

  // Star ratings (the "How are you enjoying Vreedits?" box) and written feedback live in two tables.
  const [stars, written] = await Promise.all([
    prisma.$queryRaw`SELECT id::text AS id, username, display_name AS "displayName", rating, message, source, created_at AS "createdAt"
                     FROM feedback ORDER BY created_at DESC LIMIT 200`.catch(() => []),
    prisma.$queryRaw`SELECT id, username, "isGuest", categories, message, page, status, "createdAt"
                     FROM "Feedback" ORDER BY "createdAt" DESC LIMIT 200`.catch(() => []),
  ]);

  const rated = stars.filter((r) => Number(r.rating) > 0);
  const avg = rated.length ? rated.reduce((a, r) => a + Number(r.rating), 0) / rated.length : 0;

  const items = [
    ...stars.map((r) => ({
      key: "s" + r.id,
      when: r.createdAt,
      who: r.displayName ? `${r.displayName} (@${r.username})` : r.username || "unknown",
      rating: Number(r.rating) || 0,
      tag: r.source || "rating",
      message: r.message || "",
    })),
    ...written.map((r) => ({
      key: "w" + r.id,
      when: r.createdAt,
      who: (r.username || "unknown") + (r.isGuest ? " (guest)" : ""),
      rating: 0,
      tag: [...(r.categories || []), r.page].filter(Boolean).join(" · ") || "feedback",
      message: r.message || "",
    })),
  ].sort((a, b) => new Date(b.when) - new Date(a.when));

  return (
    <div className="ad">
      <style>{`
        .ad { max-width: 760px; margin: 0 auto; padding: 20px 16px 40px; }
        .ad h1 { font-size: 22px; margin: 6px 0 4px; }
        .ad-sub { font-size: 13px; opacity: .65; margin: 0 0 16px; }
        .ad-back { font-size: 13px; opacity: .7; text-decoration: none; color: inherit; }
        .ad-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; margin-bottom: 18px; }
        .ad-tile { border: 1px solid var(--border, rgba(128,128,128,.3)); border-radius: 12px; padding: 12px 14px; }
        .ad-tile b { display: block; font-size: 22px; margin-top: 4px; }
        .ad-tile span { font-size: 12px; opacity: .65; }
        .ad-card { border: 1px solid var(--border, rgba(128,128,128,.3)); border-radius: 14px; padding: 12px 14px; margin-bottom: 10px; }
        .ad-top { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 13px; }
        .ad-who { font-weight: 700; }
        .ad-when { opacity: .6; font-size: 12px; }
        .ad-stars { letter-spacing: 2px; color: #f5b301; font-size: 15px; margin-top: 4px; }
        .ad-msg { margin: 6px 0 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
        .ad-tag { display: inline-block; margin-top: 8px; font-size: 11px; opacity: .6; border: 1px solid var(--border, rgba(128,128,128,.3)); border-radius: 999px; padding: 2px 8px; }
      `}</style>

      <Link href="/dashboard" className="ad-back">← Back to Home</Link>
      <h1>User feedback</h1>
      <p className="ad-sub">Private admin page. Newest first. Times are UTC.</p>

      <div className="ad-grid">
        <div className="ad-tile"><span>Total entries</span><b>{items.length}</b></div>
        <div className="ad-tile"><span>Star ratings</span><b>{rated.length}</b></div>
        <div className="ad-tile"><span>Average rating</span><b>{rated.length ? avg.toFixed(1) + " / 5" : "—"}</b></div>
      </div>

      {items.length === 0 && <p className="ad-sub">No feedback yet.</p>}
      {items.map((it) => (
        <div className="ad-card" key={it.key}>
          <div className="ad-top">
            <span className="ad-who">{it.who}</span>
            <span className="ad-when">{when(it.when)}</span>
          </div>
          {it.rating > 0 && (
            <div className="ad-stars" aria-label={`${it.rating} out of 5`}>
              {"★".repeat(it.rating)}{"☆".repeat(Math.max(0, 5 - it.rating))}
            </div>
          )}
          {it.message ? <p className="ad-msg">{it.message}</p> : <p className="ad-msg" style={{ opacity: .5 }}>(no message)</p>}
          <span className="ad-tag">{it.tag}</span>
        </div>
      ))}
    </div>
  );
}
