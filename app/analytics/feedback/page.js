// app/analytics/feedback/page.js  ->  yoursite.com/analytics/feedback  (owner only)
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { pool } from "../../../lib/analytics";
import { ensureFeedbackTable } from "@/lib/feedback";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback", robots: { index: false, follow: false } };

/* ---------- owner-only gate (same login as /analytics) ---------- */

const COOKIE = "vre_owner";
const sha = (s) => crypto.createHash("sha256").update(s).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const token = (secret) => sha("vreedits-owner:" + secret).toString("hex");

/* ---------- data ---------- */

// Guess the profile-picture field so this works with your User model.
const avatarOf = (u) =>
  u?.avatarUrl || u?.avatar || u?.image || u?.profilePicture || u?.profileImage || u?.photoUrl || u?.pfp || null;

async function load() {
  await ensureFeedbackTable();
  const [list, stats] = await Promise.all([
    pool.query(
      `SELECT id, user_id, username, display_name, rating, message, source, created_at
       FROM feedback ORDER BY created_at DESC LIMIT 200`
    ),
    pool.query(`SELECT rating, count(*)::int AS c FROM feedback GROUP BY rating`),
  ]);

  const rows = list.rows;
  const ids = [...new Set(rows.map((r) => r.user_id))];
  let users = [];
  if (ids.length) {
    try {
      users = await prisma.user.findMany({ where: { id: { in: ids } } });
    } catch {
      try {
        const nums = ids.map(Number).filter(Number.isFinite);
        users = await prisma.user.findMany({ where: { id: { in: nums } } });
      } catch {
        users = [];
      }
    }
  }
  const byId = new Map(users.map((u) => [String(u.id), u]));

  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;
  for (const s of stats.rows) {
    dist[s.rating] = s.c;
    total += s.c;
    sum += s.rating * s.c;
  }
  return { rows, byId, dist, total, avg: total ? sum / total : 0 };
}

const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
const when = (d) =>
  new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";

/* ---------- UI ---------- */

function Shell({ children }) {
  return (
    <div className="fv">
      <style>{CSS}</style>
      <div className="fv-wrap">
        <header className="fv-head">
          <div>
            <h1>Feedback</h1>
            <p className="fv-sub">Only visible to you</p>
          </div>
          <a className="fv-btn" href="/analytics">
            ← Analytics
          </a>
        </header>
        {children}
      </div>
    </div>
  );
}

export default async function Page() {
  const secret = process.env.ANALYTICS_SECRET;
  const jar = await cookies();
  const authed = Boolean(secret) && safeEqual(jar.get(COOKIE)?.value || "", token(secret));
  if (!authed) redirect("/analytics"); // sign in there, then come back

  let d;
  try {
    d = await load();
  } catch (e) {
    return (
      <Shell>
        <p className="fv-err">Couldn't load feedback: {String(e?.message || e)}</p>
      </Shell>
    );
  }

  if (d.total === 0) {
    return (
      <Shell>
        <p>No feedback yet. It shows up here as soon as someone sends some.</p>
      </Shell>
    );
  }

  const maxDist = Math.max(1, ...Object.values(d.dist));

  return (
    <Shell>
      <section className="fv-top">
        <div>
          <div className="fv-num">{d.avg.toFixed(1)}</div>
          <div className="fv-stars">{stars(Math.round(d.avg))}</div>
          <div className="fv-sub">
            {d.total} {d.total === 1 ? "response" : "responses"}
          </div>
        </div>
        <div className="fv-dist">
          {[5, 4, 3, 2, 1].map((n) => (
            <div className="fv-drow" key={n}>
              <span>{n}★</span>
              <span className="fv-bar">
                <i style={{ width: `${d.dist[n] ? Math.max(3, (d.dist[n] / maxDist) * 100) : 0}%` }} />
              </span>
              <span className="fv-cnt">{d.dist[n]}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        {d.rows.map((r) => {
          const u = d.byId.get(String(r.user_id));
          const name = u?.displayName || r.display_name || r.username || "Unknown";
          const handle = u?.username || r.username;
          const av = avatarOf(u);
          return (
            <article className="fv-item" key={String(r.id)}>
              {av ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="fv-av" src={av} alt="" />
              ) : (
                <div className="fv-av fv-init">{(name[0] || "?").toUpperCase()}</div>
              )}
              <div className="fv-body">
                <div className="fv-line">
                  <strong>{name}</strong>
                  {handle && <span className="fv-sub"> @{handle}</span>}
                </div>
                <div className="fv-stars">{stars(r.rating)}</div>
                {r.message && <p className="fv-msg">{r.message}</p>}
                <div className="fv-sub">
                  {when(r.created_at)} · {r.source === "popup" ? "popup" : "settings"}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </Shell>
  );
}

const CSS = `
.fv{--bg:#f2f5f7;--ink:#13202a;--mute:#5a6b78;--line:#d8e0e6;--accent:#0e5a6b;
  background:var(--bg);color:var(--ink);min-height:100vh;padding:20px 16px 56px;
  font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){.fv{--bg:#0f171d;--ink:#e6edf2;--mute:#8fa1ae;--line:#25343f;--accent:#5fb3c6}}
.fv-wrap{max-width:720px;margin:0 auto}
.fv h1{font-size:22px;margin:0;letter-spacing:-.01em}
.fv-sub{color:var(--mute);font-size:13px}
.fv-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:22px}
.fv-btn{border:1px solid var(--line);color:var(--mute);border-radius:8px;padding:8px 12px;font-size:13px;text-decoration:none}
.fv-top{display:flex;gap:28px;align-items:center;flex-wrap:wrap;padding-bottom:22px;border-bottom:1px solid var(--line)}
.fv-num{font-size:40px;font-weight:650;letter-spacing:-.02em;line-height:1.05}
.fv-stars{color:#f5b301;letter-spacing:2px;font-size:16px}
.fv-dist{flex:1;min-width:200px}
.fv-drow{display:grid;grid-template-columns:28px 1fr 28px;gap:8px;align-items:center;font-size:13px;padding:2px 0}
.fv-bar{height:8px;background:var(--line);border-radius:4px;overflow:hidden}
.fv-bar i{display:block;height:100%;background:var(--accent);border-radius:4px}
.fv-cnt{text-align:right;color:var(--mute)}
.fv-item{display:flex;gap:12px;padding:16px 0;border-bottom:1px solid var(--line)}
.fv-av{width:42px;height:42px;border-radius:50%;object-fit:cover;flex:none;background:var(--line)}
.fv-init{display:flex;align-items:center;justify-content:center;font-weight:650;color:var(--mute)}
.fv-body{min-width:0;flex:1}
.fv-msg{margin:6px 0;white-space:pre-wrap;word-break:break-word}
.fv-err{color:#c0392b;font-size:14px}
`;