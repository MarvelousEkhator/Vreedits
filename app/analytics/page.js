// app/analytics/page.js  ->  yoursite.com/analytics  (owner only)
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { pool, ensureTable } from "../../lib/analytics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics", robots: { index: false, follow: false } };

/* ---------- owner-only gate (ANALYTICS_SECRET env var) ---------- */

const COOKIE = "vre_owner";
const sha = (s) => crypto.createHash("sha256").update(s).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const token = (secret) => sha("vreedits-owner:" + secret).toString("hex");

async function login(formData) {
  "use server";
  const secret = process.env.ANALYTICS_SECRET;
  const attempt = String(formData.get("key") || "");
  if (secret && safeEqual(attempt, secret)) {
    (await cookies()).set(COOKIE, token(secret), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/analytics",
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect("/analytics");
  }
  await new Promise((r) => setTimeout(r, 800));
  redirect("/analytics?bad=1");
}

async function logout() {
  "use server";
  (await cookies()).set(COOKIE, "", { path: "/analytics", maxAge: 0 });
  redirect("/analytics");
}

/* ---------- data ---------- */

const VIEWS = {
  daily: { unit: "day", span: "30 days", step: "1 day" },
  weekly: { unit: "week", span: "12 weeks", step: "1 week" },
  monthly: { unit: "month", span: "12 months", step: "1 month" },
};

async function load(view) {
  await ensureTable();
  const v = VIEWS[view];
  const q = (text, params) => pool.query(text, params).then((r) => r.rows);

  const [kpi, traffic, sessions, back, funnel, sources, features, countries, members] = await Promise.all([
    q(`SELECT
         count(DISTINCT visitor_id) AS visitors,
         count(DISTINCT visitor_id) FILTER (WHERE ts > now() - interval '5 minutes') AS active,
         count(DISTINCT session_id) FILTER (WHERE is_guest) AS guest_sessions,
         count(DISTINCT visitor_id) FILTER (WHERE type = 'signup') AS signups,
         (SELECT count(*) FROM "User" WHERE "isGuest" = false) AS members,
         (SELECT count(*) FROM "User" WHERE "isGuest" = false AND "createdAt" > now() - interval '7 days') AS members_week
       FROM analytics_events`),

    q(
      `SELECT b.bucket, coalesce(t.visitors, 0) AS visitors, coalesce(t.sessions, 0) AS sessions
       FROM generate_series(
              date_trunc($1::text, now() - $2::interval),
              date_trunc($1::text, now()),
              $3::interval
            ) AS b(bucket)
       LEFT JOIN (
         SELECT date_trunc($1::text, ts) AS bucket,
                count(DISTINCT visitor_id) AS visitors,
                count(DISTINCT session_id) AS sessions
         FROM analytics_events
         WHERE type = 'pageview' AND ts >= date_trunc($1::text, now() - $2::interval)
         GROUP BY 1
       ) t ON t.bucket = b.bucket
       ORDER BY b.bucket DESC`,
      [v.unit, v.span, v.step]
    ),

    q(`WITH s AS (
         SELECT session_id,
                bool_or(is_guest) AS guest,
                count(*) FILTER (WHERE type <> 'guest_start') AS n,
                extract(epoch FROM max(ts) - min(ts)) AS secs
         FROM analytics_events GROUP BY session_id
       )
       SELECT
         count(*) AS sessions,
         count(*) FILTER (WHERE guest) AS guest_sessions,
         count(*) FILTER (WHERE guest AND n = 1) AS guest_bounced,
         coalesce(avg(secs) FILTER (WHERE guest AND n > 1), 0) AS guest_avg_secs
       FROM s`),

    q(`WITH first AS (
         SELECT visitor_id, min(ts)::date AS d0
         FROM analytics_events WHERE type = 'pageview' GROUP BY visitor_id
       ), r AS (
         SELECT f.visitor_id, f.d0,
           EXISTS (SELECT 1 FROM analytics_events e
                   WHERE e.visitor_id = f.visitor_id AND e.type = 'pageview' AND e.ts::date > f.d0) AS ever,
           EXISTS (SELECT 1 FROM analytics_events e
                   WHERE e.visitor_id = f.visitor_id AND e.type = 'pageview' AND e.ts::date = f.d0 + 1) AS d1,
           EXISTS (SELECT 1 FROM analytics_events e
                   WHERE e.visitor_id = f.visitor_id AND e.type = 'pageview'
                     AND e.ts::date BETWEEN f.d0 + 1 AND f.d0 + 7) AS w1
         FROM first f
       )
       SELECT
         count(*) FILTER (WHERE ever) AS returning,
         count(*) FILTER (WHERE d0 < current_date) AS d1_cohort,
         count(*) FILTER (WHERE d0 < current_date AND d1) AS d1_back,
         count(*) FILTER (WHERE d0 <= current_date - 7) AS w1_cohort,
         count(*) FILTER (WHERE d0 <= current_date - 7 AND w1) AS w1_back
       FROM r`),

    q(`WITH g AS (
         SELECT visitor_id, min(ts) AS t0 FROM analytics_events WHERE is_guest GROUP BY visitor_id
       )
       SELECT
         count(*) AS guests,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e
             WHERE e.visitor_id = g.visitor_id AND e.type = 'signup' AND e.ts > g.t0)) AS to_signup,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e
             WHERE e.visitor_id = g.visitor_id AND e.type = 'login' AND e.ts > g.t0)) AS to_login,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e
             WHERE e.visitor_id = g.visitor_id AND e.type IN ('signup', 'login') AND e.ts > g.t0)) AS to_either
       FROM g`),

    q(`WITH s AS (
         SELECT session_id,
                bool_or(is_guest) AS guest,
                (array_agg(source ORDER BY ts))[1] AS source
         FROM analytics_events GROUP BY session_id
       )
       SELECT coalesce(source, 'direct') AS source,
              count(*) AS sessions,
              count(*) FILTER (WHERE guest) AS guest_sessions
       FROM s GROUP BY 1 ORDER BY 2 DESC`),

    q(`SELECT name, count(*) AS uses, count(DISTINCT visitor_id) AS visitors
       FROM analytics_events
       WHERE name IS NOT NULL AND type IN ('pageview', 'feature')
       GROUP BY name ORDER BY uses DESC LIMIT 40`),

    q(`SELECT coalesce(e.country, 'Unknown') AS country,
              count(DISTINCT e.visitor_id) AS visitors,
              count(DISTINCT e.visitor_id) FILTER (WHERE m.visitor_id IS NOT NULL) AS members
       FROM analytics_events e
       LEFT JOIN analytics_members m ON m.visitor_id = e.visitor_id
       GROUP BY 1 ORDER BY 2 DESC`),

    q(`SELECT u.username, u."createdAt" AS joined, m.last_ts,
              f.source, f.country, f.path AS entry,
              coalesce(g.was_guest, false) AS was_guest,
              coalesce(h.beats, 0) AS beats,
              coalesce(h.pages, 0) AS pages
       FROM "User" u
       LEFT JOIN analytics_members m ON m.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT source, country, path FROM analytics_events e
         WHERE e.visitor_id = m.visitor_id AND e.type = 'pageview' ORDER BY ts LIMIT 1
       ) f ON true
       LEFT JOIN LATERAL (
         SELECT bool_or(is_guest) AS was_guest FROM analytics_events e WHERE e.visitor_id = m.visitor_id
       ) g ON true
       LEFT JOIN LATERAL (
         SELECT count(*) FILTER (WHERE type = 'heartbeat') AS beats,
                count(*) FILTER (WHERE type = 'pageview') AS pages
         FROM analytics_events e WHERE e.visitor_id = m.visitor_id
       ) h ON true
       WHERE u."isGuest" = false
       ORDER BY u."createdAt" DESC LIMIT 100`),
  ]);

  return { kpi: kpi[0], traffic, sessions: sessions[0], back: back[0], funnel: funnel[0], sources, features, countries, members };
}

/* ---------- formatting ---------- */

const n = (x) => Number(x || 0);
const pct = (a, b) => (n(b) ? `${Math.round((n(a) / n(b)) * 100)}%` : "–");
const dur = (s) => {
  s = Math.round(n(s));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
};

const FEATURE_LABELS = {
  syna: "Syna AI",
  community: "Communities",
  feed: "Feed",
  coding_room: "Coding Room",
  ai_tools: "AI Tools",
  school: "School",
  home: "Home dashboard",
  mind_gym: "Mind Gym",
  premium_shop: "Premium and Shop",
  study_rooms: "Study Rooms",
  flashcards: "Flashcards",
  ai_tutor: "AI Tutor",
  study_progress: "Study Progress",
  smart_tools: "Smart Tools",
  inbox: "Inbox",
  notifications: "Notifications",
  profile: "Profile",
  settings: "Settings",
  invite_link: "Community invite link",
  team_invite: "Team invite link",
  sign_up_page: "Sign-up page",
  login_page: "Login page",
};
const featureLabel = (k) =>
  FEATURE_LABELS[k] || k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const SOURCE_LABELS = {
  linkedin: "LinkedIn", direct: "Direct link", search: "Search", whatsapp: "WhatsApp", facebook: "Facebook",
  instagram: "Instagram", tiktok: "TikTok", twitter: "X / Twitter", telegram: "Telegram", youtube: "YouTube",
  reddit: "Reddit", snapchat: "Snapchat", discord: "Discord", github: "GitHub", other: "Other",
};
function sourceLabel(src) {
  if (!src) return "Before tracking";
  if (src.startsWith("other:")) return src.slice(6) || "Other";
  return SOURCE_LABELS[src] || src;
}
// The first page someone opened tells you which link they used to get in.
function entryLabel(path) {
  const p = (path || "").toLowerCase();
  if (p.startsWith("/invite/")) return "Community invite";
  if (p.startsWith("/team-invites/")) return "Team invite";
  if (p.startsWith("/share")) return "Shared link";
  if (p.startsWith("/u/")) return "Profile link";
  if (p.startsWith("/register")) return "Sign-up page";
  if (p.startsWith("/login")) return "Login page";
  if (!p || p === "/") return "Home page";
  return "";
}
function flag(code) {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}
const ago = (d) => {
  if (!d) return "–";
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};
const when = (d) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "–");

function countryName(code) {
  if (!code || code === "Unknown") return "Unknown";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function bucketLabel(d, view) {
  const date = new Date(d);
  if (view === "monthly") return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return view === "weekly" ? `Week of ${day}` : day;
}

/* ---------- UI ---------- */

function Rows({ items, tone }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div>
      {items.map((i) => (
        <div className="va-row" key={i.label}>
          <span className="va-name">{i.label}</span>
          <span className="va-bar">
            <i
              className={tone === "guest" ? "guest" : ""}
              style={{ width: `${i.value ? Math.max(2, (i.value / max) * 100) : 0}%` }}
            />
          </span>
          <span className="va-val">{i.note}</span>
        </div>
      ))}
    </div>
  );
}

function Shell({ children, signedIn }) {
  return (
    <div className="va">
      <style>{CSS}</style>
      <div className="va-wrap">
        <header className="va-head">
          <div>
            <h1>Vreedits analytics</h1>
            <p className="va-sub">Only visible to you</p>
          </div>
          {signedIn && (
            <form action={logout}>
              <button className="va-btn">Sign out</button>
            </form>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

function Gate({ configured, bad }) {
  return (
    <Shell>
      {configured ? (
        <form action={login} className="va-gate">
          <label htmlFor="key">Owner key</label>
          <input id="key" name="key" type="password" autoComplete="current-password" required />
          {bad && <p className="va-err">That key didn't match.</p>}
          <button className="va-btn solid">Open dashboard</button>
        </form>
      ) : (
        <p className="va-err">
          Add an ANALYTICS_SECRET environment variable in Render, redeploy, then reload this page.
        </p>
      )}
    </Shell>
  );
}

export default async function Page({ searchParams }) {
  const sp = (await searchParams) || {};
  const secret = process.env.ANALYTICS_SECRET;
  const jar = await cookies();
  const authed = Boolean(secret) && safeEqual(jar.get(COOKIE)?.value || "", token(secret));
  if (!authed) return <Gate configured={Boolean(secret)} bad={sp.bad === "1"} />;

  const view = VIEWS[sp.view] ? sp.view : "daily";
  let d;
  try {
    d = await load(view);
  } catch (e) {
    return (
      <Shell signedIn>
        <p className="va-err">Couldn't load data: {String(e?.message || e)}</p>
      </Shell>
    );
  }

  const k = d.kpi;
  const f = d.funnel;
  const s = d.sessions;
  const b = d.back;
  const maxTraffic = Math.max(1, ...d.traffic.map((t) => n(t.visitors)));

  if (n(k.visitors) === 0) {
    return (
      <Shell signedIn>
        <p>No visits recorded yet. Once the tracker is live in the app, visits show up here within seconds.</p>
      </Shell>
    );
  }

  return (
    <Shell signedIn>
      <div className="va-kpis">
        <div><div className="va-num">{n(k.visitors)}</div><div className="va-lab">Total visitors</div></div>
        <div><div className="va-num">{n(k.active)}</div><div className="va-lab">Active now (last 5 min)</div></div>
        <div><div className="va-num">{n(k.guest_sessions)}</div><div className="va-lab">Guest sessions</div></div>
        <div><div className="va-num">{n(k.members)}</div><div className="va-lab">Members (signed up)</div></div>
        <div><div className="va-num">{n(k.members_week)}</div><div className="va-lab">New members this week</div></div>
        <div><div className="va-num">{n(b.returning)}</div><div className="va-lab">Returning visitors</div></div>
        <div><div className="va-num">{pct(f.to_either, f.guests)}</div><div className="va-lab">Guests who made an account</div></div>
      </div>

      <section>
        <h2>Traffic</h2>
        <nav className="va-tabs">
          {Object.keys(VIEWS).map((key) => (
            <a key={key} href={`/analytics?view=${key}`} aria-current={key === view}>
              {key[0].toUpperCase() + key.slice(1)}
            </a>
          ))}
        </nav>
        <div className="va-scroll">
          {d.traffic.map((t) => (
            <div className="va-row wide" key={String(t.bucket)}>
              <span className="va-name">{bucketLabel(t.bucket, view)}</span>
              <span className="va-bar">
                <i style={{ width: `${n(t.visitors) ? Math.max(2, (n(t.visitors) / maxTraffic) * 100) : 0}%` }} />
              </span>
              <span className="va-val">{n(t.visitors)} visitors · {n(t.sessions)} sessions</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Guest Mode</h2>
        <Rows
          tone="guest"
          items={[
            { label: "Entered Guest Mode", value: n(f.guests), note: `${n(f.guests)}` },
            { label: "Signed up", value: n(f.to_signup), note: `${n(f.to_signup)} · ${pct(f.to_signup, f.guests)}` },
            { label: "Logged in", value: n(f.to_login), note: `${n(f.to_login)} · ${pct(f.to_login, f.guests)}` },
          ]}
        />
        <p className="va-note">
          Average stay {dur(s.guest_avg_secs)} · {pct(s.guest_bounced, s.guest_sessions)} left immediately
          ({n(s.guest_bounced)} of {n(s.guest_sessions)} guest sessions)
        </p>
      </section>

      <section>
        <h2>Came back</h2>
        <Rows
          items={[
            { label: "Next day", value: n(b.d1_back), note: `${n(b.d1_back)} of ${n(b.d1_cohort)} · ${pct(b.d1_back, b.d1_cohort)}` },
            { label: "Within a week", value: n(b.w1_back), note: `${n(b.w1_back)} of ${n(b.w1_cohort)} · ${pct(b.w1_back, b.w1_cohort)}` },
          ]}
        />
        <p className="va-note">Only visitors old enough to have had the chance to return are counted.</p>
      </section>

      <section>
        <h2>Where visitors come from</h2>
        <Rows
          items={d.sources.map((r) => ({
            label: sourceLabel(r.source),
            value: n(r.sessions),
            note: `${n(r.sessions)} sessions · ${n(r.guest_sessions)} guest`,
          }))}
        />
      </section>

      <section>
        <h2>What people use</h2>
        {d.features.length ? (
          <Rows
            items={d.features.map((r) => ({
              label: featureLabel(r.name),
              value: n(r.uses),
              note: `${n(r.uses)} uses · ${n(r.visitors)} people`,
            }))}
          />
        ) : (
          <p className="va-note">No feature activity yet.</p>
        )}
      </section>

      <section>
        <h2>People who signed up</h2>
        <p className="va-note" style={{ marginTop: 0, marginBottom: 10 }}>
          Every real account, newest first, with how they first arrived. People who joined before tracking show "Before tracking" until they visit again.
        </p>
        <div className="va-scroll" style={{ maxHeight: 520 }}>
          {d.members.map((m) => (
            <div className="va-mem" key={m.username + String(m.joined)}>
              <div className="va-mem-top">
                <b>@{m.username}</b>
                <span>{when(m.joined)}</span>
              </div>
              <div className="va-mem-sub">
                {sourceLabel(m.source)}
                {entryLabel(m.entry) ? ` · via ${entryLabel(m.entry)}` : ""}
                {m.country ? ` · ${flag(m.country)} ${countryName(m.country)}` : ""}
                {m.was_guest ? " · started as a guest" : ""}
              </div>
              <div className="va-mem-sub">
                Last seen {ago(m.last_ts)} · {n(m.pages)} pages · about {Math.round((n(m.beats) * 15) / 60)} min on site
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Countries</h2>
        <Rows
          items={d.countries.map((r) => ({
            label: `${flag(r.country)} ${countryName(r.country)}`.trim(),
            value: n(r.visitors),
            note: `${n(r.visitors)} people · ${n(r.members)} members`,
          }))}
        />
      </section>
    </Shell>
  );
}

const CSS = `
.va{--bg:#f2f5f7;--ink:#13202a;--mute:#5a6b78;--line:#d8e0e6;--accent:#0e5a6b;--guest:#b4691f;
  background:var(--bg);color:var(--ink);min-height:100vh;padding:20px 16px 56px;
  font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){.va{--bg:#0f171d;--ink:#e6edf2;--mute:#8fa1ae;--line:#25343f;--accent:#5fb3c6;--guest:#e0a35a}}
.va-wrap{max-width:720px;margin:0 auto}
.va h1{font-size:22px;margin:0;letter-spacing:-.01em}
.va h2{font-size:16px;margin:0 0 12px}
.va-sub{color:var(--mute);font-size:13px;margin:2px 0 0}
.va-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:22px}
.va-btn{background:none;border:1px solid var(--line);color:var(--mute);border-radius:8px;padding:8px 12px;font:inherit;font-size:13px;cursor:pointer}
.va-btn.solid{background:var(--ink);color:var(--bg);border-color:var(--ink);font-size:15px}
.va-btn:focus-visible,.va-tabs a:focus-visible,.va-gate input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.va-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:20px 16px;padding-bottom:24px;border-bottom:1px solid var(--line)}
@media (min-width:560px){.va-kpis{grid-template-columns:repeat(3,1fr)}}
.va-num{font-size:30px;font-weight:650;letter-spacing:-.02em;line-height:1.1}
.va-lab{color:var(--mute);font-size:13px;margin-top:2px}
.va section{padding:22px 0;border-bottom:1px solid var(--line)}
.va-row{display:grid;grid-template-columns:minmax(84px,120px) 1fr auto;gap:10px;align-items:center;padding:5px 0;font-size:14px}
.va-row.wide{grid-template-columns:minmax(84px,110px) 1fr auto}
.va-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.va-bar{height:8px;background:var(--line);border-radius:4px;overflow:hidden}
.va-bar i{display:block;height:100%;background:var(--accent);border-radius:4px}
.va-bar i.guest{background:var(--guest)}
.va-val{color:var(--mute);font-size:12.5px;text-align:right;white-space:nowrap}
.va-note{color:var(--mute);font-size:13px;margin:10px 0 0}
.va-tabs{display:flex;gap:6px;margin-bottom:10px}
.va-tabs a{padding:6px 14px;border:1px solid var(--line);border-radius:999px;color:var(--mute);text-decoration:none;font-size:13px}
.va-tabs a[aria-current=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.va-scroll{max-height:380px;overflow-y:auto}
.va-gate{display:flex;flex-direction:column;gap:10px;max-width:320px}
.va-gate input{padding:10px 12px;font:inherit;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit}
.va-err{color:#c0392b;font-size:14px}
.va-mem{padding:9px 0;border-bottom:1px solid var(--line)}
.va-mem:last-child{border-bottom:0}
.va-mem-top{display:flex;justify-content:space-between;gap:10px}
.va-mem-top span{color:var(--mute);font-size:12.5px}
.va-mem-sub{color:var(--mute);font-size:13px;margin-top:2px}
`;
