"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, Zap, Gem } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import GlossIcon from "@/components/GlossIcon";

// Remember which picture files load, so a missing file never leaves a blank gap.
const sheetState = {};
function useSheetOk(file) {
  const [ok, setOk] = useState(file && sheetState[file] !== undefined ? sheetState[file] : null);
  useEffect(() => {
    if (!file) return;
    if (sheetState[file] !== undefined) { setOk(sheetState[file]); return; }
    const im = new Image();
    im.onload = () => { sheetState[file] = true; setOk(true); };
    im.onerror = () => { sheetState[file] = false; setOk(false); };
    im.src = file;
  }, [file]);
  return ok;
}

// Every picture in the shop is one square of a bigger image file (public/*.webp) laid out as a grid.
function spriteBg(sheet, sprite) {
  const col = sprite % sheet.cols, row = Math.floor(sprite / sheet.cols);
  return {
    backgroundImage: `url(${sheet.file})`, backgroundRepeat: "no-repeat",
    backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
    backgroundPosition: `${sheet.cols > 1 ? (col / (sheet.cols - 1)) * 100 : 0}% ${sheet.rows > 1 ? (row / (sheet.rows - 1)) * 100 : 0}%`,
  };
}

// A round photo with a shop frame around it (picture frames, or the older gradient rings).
function FramedAvatar({ frame, size = 48, children }) {
  if (frame && frame.sheet && frame.sprite != null) {
    const fit = Math.max(frame.fit || 0.6, 0.5);
    const O = Math.round(size / fit);
    const m = Math.round((O - size) / 2);
    return (
      <span style={{ position: "relative", display: "inline-flex", width: size, height: size, margin: m, flexShrink: 0 }}>
        {children}
        <span aria-hidden="true" style={{ position: "absolute", left: (size - O) / 2, top: (size - O) / 2, width: O, height: O, pointerEvents: "none", ...spriteBg(frame.sheet, frame.sprite) }} />
      </span>
    );
  }
  if (frame && frame.ring) {
    return <span style={{ display: "inline-flex", padding: 3, borderRadius: "50%", background: frame.ring, flexShrink: 0 }}>{children}</span>;
  }
  return <span style={{ display: "inline-flex", flexShrink: 0 }}>{children}</span>;
}

// Mind Gym keeps its progress on this device under this key (see app/mind-gym/page.js).
const GYM_KEY = "vreedits.mindgym.v1";
const OWNER_KEY = "vreedits.mindgym.owner.v2";

// Mind Gym progress (streak, scores) is saved in this browser. To keep every account's streak board
// separate, each account's copy is stored under its own key. When a different account opens the app,
// the previous account's progress is parked and this account's own copy (or a clean slate) is loaded.
// Progress saved before this existed can't be tied to an account, so it is parked as "legacy".
function claimLocalProgress(userId) {
  if (!userId || typeof window === "undefined") return;
  try {
    const owner = localStorage.getItem(OWNER_KEY);
    if (owner === userId) return;
    const current = localStorage.getItem(GYM_KEY);
    if (current) localStorage.setItem(`${GYM_KEY}:u:${owner || "legacy"}`, current);
    const mine = localStorage.getItem(`${GYM_KEY}:u:${userId}`);
    if (mine) localStorage.setItem(GYM_KEY, mine);
    else localStorage.removeItem(GYM_KEY);
    localStorage.setItem(OWNER_KEY, userId);
  } catch {}
}

function pad(n) { return String(n).padStart(2, "0"); }
function localDayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function shiftDay(key, delta) {
  const [y, m, d] = key.split("-").map(Number);
  return localDayKey(new Date(y, m - 1, d + delta));
}
function streakFromDays(days, today) {
  const set = new Set(days);
  // Alive only if you played today or yesterday.
  if (!set.has(today) && !set.has(shiftDay(today, -1))) return 0;
  let cursor = set.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  let grace = 1; // one missed day is forgiven
  for (;;) {
    if (set.has(cursor)) { n++; cursor = shiftDay(cursor, -1); }
    else if (grace > 0 && set.has(shiftDay(cursor, -1))) { grace--; cursor = shiftDay(cursor, -1); }
    else break;
  }
  return n;
}
function loadGym() {
  try {
    const raw = localStorage.getItem(GYM_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

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

const CURRENCY_LABEL = { neurons: "Neurons", gems: "Gems" };

function greetingFor(hour) {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const SHORTCUTS = [
  { label: "Ask Syna", sub: "Chat or upload notes", href: "/ai-tools/chat", gloss: "ai-tools" },
  { label: "Study planner", sub: "Plan your revision", href: "/ai-tools/study-planner", gloss: "planner" },
  { label: "Summarizer", sub: "Shrink long notes", href: "/ai-tools/summarizer", gloss: "summarizer" },
  { label: "School tools", sub: "Flashcards, quizzes, notes", href: "/tools/school", gloss: "school" },
  { label: "Writing", sub: "Essays and grammar", href: "/tools/writing", gloss: "writing" },
  { label: "Mind Gym", sub: "Warm up your head", href: "/mind-gym", gloss: "mind-gym" },
];

export default function DashboardClient({ user }) {
  const { t } = useLanguage();
  const [conversations, setConversations] = useState([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [communities, setCommunities] = useState([]);
  const [gym, setGym] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [frame, setFrame] = useState(null);
  const frameOk = useSheetOk(frame && frame.sheet ? frame.sheet.file : null);
  const [greeting, setGreeting] = useState("");

  const name = user.displayName || user.username;

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
    let removeWalletListeners = null;
    claimLocalProgress(user.id);
    const local = loadGym();
    setGym(local);

    // Saves your played days to your account and merges them back, so the streak is the same on every browser
    // and survives clearing site data. Guests (and signed-out visitors) just keep the local days.
    if (!user.isGuest) {
      fetch("/api/mindgym/reward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: "days", days: Array.isArray(local.playedDays) ? local.playedDays.slice(-120) : [] }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d || !Array.isArray(d.days)) return;
          setGym((g) => {
            const base = g || {};
            const merged = Array.from(new Set([...(base.playedDays || []), ...d.days])).sort();
            return { ...base, playedDays: merged };
          });
        })
        .catch(() => {});

      // The frame you chose in the shop (if any) around your photo.
      fetch("/api/store", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d && d.equipped) setFrame(d.equipped.frame || null); })
        .catch(() => {});

      // Your wallet lives on Home. Stays hidden if it can't be loaded.
      const loadWallet = () =>
        fetch("/api/wallet", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d && d.balances) setWallet(d); })
          .catch(() => {});
      loadWallet();
      window.addEventListener("vreedits:wallet-changed", loadWallet);
      window.addEventListener("focus", loadWallet);
      removeWalletListeners = () => {
        window.removeEventListener("vreedits:wallet-changed", loadWallet);
        window.removeEventListener("focus", loadWallet);
      };
    }

    fetch("/api/ai/conversations")
      .then((r) => r.json())
      .then((data) => setConversations((data.conversations || []).slice(0, 3)))
      .catch(() => {})
      .finally(() => setLoadingChats(false));

    // Existing communities endpoint. If it answers with something unexpected the section just stays hidden.
    fetch("/api/communities")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const list = Array.isArray(data) ? data : data.communities || data.items || [];
        if (Array.isArray(list)) setCommunities(list.slice(0, 3));
      })
      .catch(() => {});

    return () => { if (removeWalletListeners) removeWalletListeners(); };
  }, []);

  // Last seven days, oldest first, for the streak strip.
  const today = localDayKey();
  const played = new Set((gym && gym.playedDays) || []);
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const key = shiftDay(today, -i);
    const [y, m, d] = key.split("-").map(Number);
    week.push({
      key,
      letter: new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "narrow" }),
      done: played.has(key),
      isToday: i === 0,
    });
  }
  const streak = gym ? streakFromDays((gym.playedDays || []), today) : 0;
  const weekCount = week.filter((d) => d.done).length;
  const recentTx = wallet ? (wallet.history || []).filter((tx) => tx.currency !== "vcoins").slice(0, 4) : [];
  const utcToday = new Date().toISOString().slice(0, 10);
  const sudokuDone = gym && gym.sudoku && gym.sudoku.done
    ? Object.keys(gym.sudoku.done).filter((k) => k.startsWith(utcToday + ":")).length
    : 0;
  const mathBest = gym && gym.math ? gym.math.best || 0 : 0;

  return (
    <div className="dh">
      <style>{`
        .dh { max-width: 520px; margin: 0 auto; padding: 18px 16px 28px; }
        .dh-hello { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
        .dh-avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; flex-shrink: 0; box-shadow: 0 0 0 2px var(--border); }
        .dh-avatar-fallback {
          width: 56px; height: 56px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          background: var(--accent-soft); color: var(--accent); font-family: var(--font-display); font-size: 20px; font-weight: 600;
        }
        .dh-greet { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); min-height: 15px; }
        .dh-name { font-family: var(--font-display); font-size: 30px; line-height: 1.05; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dh-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin: 22px 0 10px; display: flex; justify-content: space-between; align-items: baseline; }
        .dh-label a { color: var(--accent); letter-spacing: 0; text-transform: none; font-size: 12.5px; font-weight: 600; }

        .dh-streak {
          display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 16px;
          border-radius: 20px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 4px 0 var(--border);
          text-decoration: none; color: var(--text);
        }
        .dh-streak-num { font-size: 40px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
        .dh-streak-cap { font-size: 12.5px; color: var(--text-muted); margin-top: 3px; line-height: 1.3; }
        .dh-week { display: flex; gap: 5px; }
        .dh-day { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10px; font-weight: 600; color: var(--text-muted); }
        .dh-dot { width: 22px; height: 22px; border-radius: 7px; border: 1.5px solid var(--border); background: transparent; }
        .dh-dot.done { background: var(--accent); border-color: var(--accent); }
        .dh-dot.today { border-color: var(--accent); }

        .dh-wallet { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .dh-wtile { display: flex; flex-direction: column; gap: 2px; padding: 12px; border-radius: 16px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 3px 0 var(--border); }
        .dh-wico { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent); margin-bottom: 6px; }
        .dh-wnum { font-size: 24px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
        .dh-wname { font-size: 12.5px; font-weight: 700; }
        .dh-wsub { font-size: 11px; color: var(--text-muted); line-height: 1.3; }
        .dh-wamt { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; flex-shrink: 0; color: var(--success); }
        .dh-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .dh-tile {
          display: flex; flex-direction: column; gap: 8px; padding: 13px; border-radius: 16px; text-decoration: none; color: var(--text);
          background: var(--surface); border: 1px solid var(--border); box-shadow: 0 3px 0 var(--border);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }
        .dh-tile:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--border); }
        .dh-tile-icon { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; }
        .dh-tile-title { font-size: 14px; font-weight: 700; }
        .dh-tile-sub { font-size: 12px; color: var(--text-muted); line-height: 1.3; margin-top: -4px; }

        .dh-list { border-radius: 16px; background: var(--surface); border: 1px solid var(--border); overflow: hidden; }
        .dh-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; text-decoration: none; color: var(--text); }
        .dh-row + .dh-row { border-top: 1px solid var(--border); }
        .dh-row-main { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .dh-row-title { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dh-row-sub { font-size: 12px; color: var(--text-muted); }
        .dh-empty { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 16px; border: 1.5px dashed var(--border); color: var(--text); text-decoration: none; }
        .dh-empty-title { font-size: 14px; font-weight: 600; }
        .dh-empty-sub { font-size: 12.5px; color: var(--text-muted); }
        .dh-gym { display: flex; gap: 10px; }
        .dh-gym > a { flex: 1; }
        @media (min-width: 1024px) { .dh { max-width: 720px; padding-top: 28px; } .dh-grid { grid-template-columns: repeat(3, 1fr); } }
      `}</style>

      <div className="dh-hello">
        <FramedAvatar frame={frame && (!frame.sheet || frameOk) ? frame : null} size={56}>
          {user.avatarDataUrl ? (
            <img className="dh-avatar" src={user.avatarDataUrl} alt="Profile" />
          ) : (
            <div className="dh-avatar-fallback">{(name || "?").slice(0, 2).toUpperCase()}</div>
          )}
        </FramedAvatar>
        <div style={{ minWidth: 0 }}>
          <div className="dh-greet">{greeting || t("dash.welcomeBack")}</div>
          <div className="dh-name">{name}</div>
        </div>
      </div>

      <Link href="/mind-gym" className="dh-streak">
        <div>
          <div className="dh-streak-num">{streak}</div>
          <div className="dh-streak-cap">
            {streak > 0
              ? `day${streak === 1 ? "" : "s"} in a row in Mind Gym`
              : "Play one Mind Gym round today to start a streak"}
          </div>
          {weekCount > 0 ? <div className="dh-streak-cap">{weekCount} of the last 7 days played</div> : null}
        </div>
        <div className="dh-week" aria-hidden="true">
          {week.map((d) => (
            <div key={d.key} className="dh-day">
              <div className={`dh-dot ${d.done ? "done" : ""} ${d.isToday ? "today" : ""}`} />
              {d.letter}
            </div>
          ))}
        </div>
      </Link>

      {wallet && (
        <>
          <div className="dh-label"><span>Your wallet</span></div>
          <div className="dh-wallet">
            <div className="dh-wtile">
              <span className="dh-wico"><Zap size={16} /></span>
              <span className="dh-wnum">{wallet.balances.neurons}</span>
              <span className="dh-wname">Neurons</span>
              <span className="dh-wsub">Earned in Mind Gym</span>
            </div>
            <div className="dh-wtile">
              <span className="dh-wico"><Gem size={16} /></span>
              <span className="dh-wnum">{wallet.balances.gems}</span>
              <span className="dh-wname">Gems</span>
              <span className="dh-wsub">Premium currency</span>
            </div>
          </div>
          {recentTx.length > 0 && (
            <div className="dh-list" style={{ marginTop: 10 }}>
              {recentTx.map((tx) => (
                <div key={tx.id} className="dh-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="dh-row-title">{tx.reason || (CURRENCY_LABEL[tx.currency] || "Wallet") + " " + tx.type}</div>
                    <div className="dh-row-sub">{relativeTime(tx.createdAt)}</div>
                  </div>
                  <span className="dh-wamt">{tx.amount > 0 ? "+" : ""}{tx.amount}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="dh-label"><span>Jump back in</span></div>
      <div className="dh-grid">
        {SHORTCUTS.map((s) => (
          <Link key={s.href} href={s.href} className="dh-tile">
            <span className="dh-tile-icon"><GlossIcon name={s.gloss} size={40} /></span>
            <span className="dh-tile-title">{s.label}</span>
            <span className="dh-tile-sub">{s.sub}</span>
          </Link>
        ))}
      </div>

      <div className="dh-label">
        <span>Recent with Syna</span>
        <Link href="/ai-tools/chat">{t("dash.newChat")}</Link>
      </div>
      {loadingChats && (
        <div className="flex justify-center py-6" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={18} className="animate-spin" />
        </div>
      )}
      {!loadingChats && conversations.length === 0 && (
        <Link href="/ai-tools/chat" className="dh-empty">
          <GlossIcon name="ai-tools" size={34} />
          <div>
            <div className="dh-empty-title">{t("dash.startChat")}</div>
            <div className="dh-empty-sub">Ask a question, or upload notes and turn them into a quiz.</div>
          </div>
        </Link>
      )}
      {!loadingChats && conversations.length > 0 && (
        <div className="dh-list">
          {conversations.map((c) => (
            <Link key={c.id} href={`/ai-tools/chat?id=${c.id}`} className="dh-row">
              <div className="dh-row-main">
                <GlossIcon name="ai-tools" size={26} />
                <div style={{ minWidth: 0 }}>
                  <div className="dh-row-title">{c.title}</div>
                  <div className="dh-row-sub">{relativeTime(c.updatedAt)}</div>
                </div>
              </div>
              <ChevronRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      )}

      <div className="dh-label"><span>Today in Mind Gym</span></div>
      <div className="dh-gym">
        <Link href="/mind-gym" className="dh-tile">
          <span className="dh-tile-title">Quick Math</span>
          <span className="dh-tile-sub">{mathBest > 0 ? `Your best: ${mathBest}` : "No score yet"}</span>
        </Link>
        <Link href="/mind-gym" className="dh-tile">
          <span className="dh-tile-title">Daily Sudoku</span>
          <span className="dh-tile-sub">{sudokuDone} of 3 solved today</span>
        </Link>
      </div>

      {communities.length > 0 && (
        <>
          <div className="dh-label">
            <span>Study communities</span>
            <Link href="/communities">See all</Link>
          </div>
          <div className="dh-list">
            {communities.map((c) => (
              <Link key={c.id} href={`/communities/${c.id}`} className="dh-row">
                <div className="dh-row-main">
                  <GlossIcon name="communities" size={26} />
                  <div className="dh-row-title">{c.name}</div>
                </div>
                <ChevronRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}