// app/analytics/feedback/page.js  ->  yoursite.com/analytics/feedback  (owner only)
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { pool } from "../../../lib/analytics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback", robots: { index: false, follow: false } };

/* Same owner gate as /analytics (cookie is scoped to /analytics, so it covers this page too) */
const COOKIE = "vre_owner";
const sha = (s) => crypto.createHash("sha256").update(s).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const token = (secret) => sha("vreedits-owner:" + secret).toString("hex");

async function logout() {
  "use server";
  (await cookies()).set(COOKIE, "", { path: "/analytics", maxAge: 0 });
  redirect("/analytics");
}

const n = (x) => Number(x || 0);

function when(d) {
  try {
    return new Date(d).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC",
    }) + " UTC";
  } catch {
    return "";
  }
}

async function load(star) {
  const q = (text, params) => pool.query(text, params).then((r) => r.rows);
  const [summary, byStar, rows] = await Promise.all([
    q(`SELECT count(*) AS total, coalesce(avg(rating), 0) AS avg FROM feedback`),
    q(`SELECT rating, count(*) AS c FROM feedback GROUP BY rating ORDER BY rating DESC`),
    star
      ? q(
          `SELECT id::text AS id, user_id, username, display_name, rating, message, source, created_at
           FROM feedback WHERE rating = $1 ORDER BY created_at DESC LIMIT 200`,
          [star]
        )
      : q(
          `SELECT id::text AS id, user_id, username, display_name, rating, message, source, created_at
           FROM feedback ORDER BY created_at DESC LIMIT 200`
        ),
  ]);
  return { summary: summary[0], byStar, rows };
}

function Shell({ children, signedIn }) {
  return (
    <div className="va">
      <style>{CSS}</style>
      <div className="va-wrap">
        <header className="va-head">
          <div>
            <h1>Feedback</h1>
            <p className="va-sub">Only visible to you</p>
          </div>
          {signedIn && (
            <div className="va-actions">
              <a className="va-btn" href="/analytics">Analytics</a>
              <form action={logout}>
                <button className="va-btn">Sign out</button>
              </form>
            </div>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

export default async function Page({ searchParams }) {
  const sp = (await searchParams) || {};
  const secret = process.env.ANALYTICS_SECRET;
  const jar = await cookies();
  const authed = Boolean(secret) && safeEqual(jar.get(COOKIE)?.value || "", token(secret));
  if (!authed) redirect("/analytics");

  const star = [1, 2, 3, 4, 5].includes(Number(sp.star)) ? Number(sp.star) : 0;

  let d;
  try {
    d = await load(star);
  } catch (e) {
    return (
      <Shell signedIn>
        <p className="va-err">Couldn't load feedback: {String(e?.message || e)}</p>
      </Shell>
    );
  }

  const total = n(d.summary.total);
  const counts = {};
  d.byStar.forEach((r) => (counts[n(r.rating)] = n(r.c)));
  const maxC = Math.max(1, ...Object.values(counts));

  return (
    <Shell signedIn>
      {total === 0 ? (
        <p>No feedback yet. Ratings and comments from the in-app popup will show up here.</p>
      ) : (
        <>
          <div className="va-kpis two">
            <div><div className="va-num">{total}</div><div className="va-lab">Responses</div></div>
            <div><div className="va-num">{n(d.summary.avg).toFixed(1)}</div><div className="va-lab">Average rating (out of 5)</div></div>
          </div>

          <section>
            <h2>Ratings</h2>
            {[5, 4, 3, 2, 1].map((s) => (
              <div className="va-row" key={s}>
                <span className="va-name">{s} star{s > 1 ? "s" : ""}</span>
                <span className="va-bar">
                  <i style={{ width: `${counts[s] ? Math.max(2, (counts[s] / maxC) * 100) : 0}%` }} />
                </span>
                <span className="va-val">{counts[s] || 0}</span>
              </div>
            ))}
          </section>

          <section>
            <h2>Responses</h2>
            <nav className="va-tabs">
              <a href="/analytics/feedback" aria-current={!star}>All</a>
              {[5, 4, 3, 2, 1].map((s) => (
                <a key={s} href={`/analytics/feedback?star=${s}`} aria-current={star === s}>{s}★</a>
              ))}
            </nav>
            {d.rows.length === 0 && <p className="va-note">Nothing with that rating.</p>}
            {d.rows.map((r) => (
              <article className="va-item" key={r.id}>
                <div className="va-item-top">
                  <span className="va-stars" aria-label={`${n(r.rating)} out of 5`}>
                    {"★".repeat(n(r.rating))}
                    <span className="off">{"★".repeat(Math.max(0, 5 - n(r.rating)))}</span>
                  </span>
                  <span className="va-when">{when(r.created_at)}</span>
                </div>
                {r.message ? <p className="va-msg">{r.message}</p> : <p className="va-note">No comment</p>}
                <p className="va-who">
                  {r.display_name || r.username || "Guest"}
                  {r.username ? ` · @${r.username}` : ""}
                  {r.source ? ` · ${r.source}` : ""}
                </p>
              </article>
            ))}
          </section>
        </>
      )}
    </Shell>
  );
}

const CSS = `
.va{--bg:#f2f5f7;--ink:#13202a;--mute:#5a6b78;--line:#d8e0e6;--accent:#0e5a6b;--star:#c98a1b;
  background:var(--bg);color:var(--ink);min-height:100vh;padding:20px 16px 56px;
  font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){.va{--bg:#0f171d;--ink:#e6edf2;--mute:#8fa1ae;--line:#25343f;--accent:#5fb3c6;--star:#e0a35a}}
.va-wrap{max-width:720px;margin:0 auto}
.va h1{font-size:22px;margin:0;letter-spacing:-.01em}
.va h2{font-size:16px;margin:0 0 12px}
.va-sub{color:var(--mute);font-size:13px;margin:2px 0 0}
.va-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:22px}
.va-actions{display:flex;gap:8px;align-items:center}
.va-btn{display:inline-block;background:none;border:1px solid var(--line);color:var(--mute);border-radius:8px;padding:8px 12px;font:inherit;font-size:13px;cursor:pointer;text-decoration:none}
.va-btn:focus-visible,.va-tabs a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.va-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:20px 16px;padding-bottom:24px;border-bottom:1px solid var(--line)}
.va-num{font-size:30px;font-weight:650;letter-spacing:-.02em;line-height:1.1}
.va-lab{color:var(--mute);font-size:13px;margin-top:2px}
.va section{padding:22px 0;border-bottom:1px solid var(--line)}
.va-row{display:grid;grid-template-columns:minmax(64px,90px) 1fr auto;gap:10px;align-items:center;padding:5px 0;font-size:14px}
.va-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.va-bar{height:8px;background:var(--line);border-radius:4px;overflow:hidden}
.va-bar i{display:block;height:100%;background:var(--accent);border-radius:4px}
.va-val{color:var(--mute);font-size:12.5px;text-align:right;white-space:nowrap}
.va-note{color:var(--mute);font-size:13px;margin:6px 0 0}
.va-tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
.va-tabs a{padding:6px 14px;border:1px solid var(--line);border-radius:999px;color:var(--mute);text-decoration:none;font-size:13px}
.va-tabs a[aria-current=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.va-item{padding:14px 0;border-top:1px solid var(--line)}
.va-item:first-of-type{border-top:0}
.va-item-top{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.va-stars{color:var(--star);letter-spacing:2px;font-size:15px}
.va-stars .off{color:var(--line)}
.va-when{color:var(--mute);font-size:12.5px}
.va-msg{margin:8px 0 4px;white-space:pre-wrap;overflow-wrap:anywhere}
.va-who{color:var(--mute);font-size:13px;margin:4px 0 0}
.va-err{color:#c0392b;font-size:14px}
`;