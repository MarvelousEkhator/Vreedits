"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ArrowLeft, Play, Eraser, Pencil, RotateCcw, RotateCw, Crown } from "lucide-react";
import { GameNotes } from "./NotesQuiz";

/* ═══════════════════════════════════════════════════════════════
   MIND GYM — the games (everything except Quick Math and Sudoku,
   which live in page.js), plus the shared progress store.

   Every game saves where you stopped, pauses when you switch apps,
   and counts toward your daily streak. Daily puzzles are the same for
   everyone: they are made from today's UTC date.
   ═══════════════════════════════════════════════════════════════ */

// ==LOGIC-START==
/* ───────── shared helpers (pure) ───────── */
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededRng(str) { return mulberry32(hashSeed(str)); }
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pad2(n) { return String(n).padStart(2, "0"); }
function localDayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function utcDayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${pad2(s)}`;
}
function ri(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
function pickOne(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
// ==LOGIC-END==

/* ───────── progress kept on this device ───────── */
export const STORE_KEY = "vreedits.mindgym.v1";
const SAVE_PREFIX = "vreedits.mg.save.";

function emptyStore() {
  return { playedDays: [], math: { best: 0, plays: 0 }, sudoku: { done: {}, partial: {} }, games: {} };
}
export function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const e = emptyStore();
      return {
        playedDays: Array.isArray(s.playedDays) ? s.playedDays : [],
        math: { ...e.math, ...(s.math || {}) },
        sudoku: { done: (s.sudoku && s.sudoku.done) || {}, partial: (s.sudoku && s.sudoku.partial) || {} },
        games: s.games && typeof s.games === "object" ? s.games : {},
      };
    }
  } catch {}
  return emptyStore();
}
export function updateStore(fn) {
  const next = fn(loadStore());
  next.playedDays = Array.from(new Set(next.playedDays)).sort().slice(-90);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
  return next;
}
export function markPlayedToday(s) { s.playedDays = [...s.playedDays, localDayKey()]; return s; }

// Updates one game's record and counts the day toward the streak.
function recordGame(id, fn) {
  updateStore((s) => {
    const g = s.games[id] || (s.games[id] = { plays: 0, wins: 0, best: 0 });
    if (!g.done) g.done = {};
    if (!g.bestBy) g.bestBy = {};
    fn(g);
    return markPlayedToday(s);
  });
}
function touchToday() { updateStore((s) => markPlayedToday(s)); }
function gameRecord(id) {
  const g = loadStore().games[id];
  return g || { plays: 0, wins: 0, best: 0, done: {}, bestBy: {} };
}

function readSave(key) {
  try {
    const r = localStorage.getItem(SAVE_PREFIX + key);
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}
function writeSave(key, val) {
  try { localStorage.setItem(SAVE_PREFIX + key, JSON.stringify(val)); } catch {}
}
function clearSave(key) {
  try { localStorage.removeItem(SAVE_PREFIX + key); } catch {}
}

/* ───────── hooks ───────── */
// Counts up while "running" and the tab is visible.
function useClock(running, start = 0) {
  const [seconds, setSeconds] = useState(start);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);
  return [seconds, setSeconds];
}

// Pauses by itself when you leave the tab or app.
function usePauseOnHide(setPaused) {
  useEffect(() => {
    function onHide() { if (document.visibilityState === "hidden") setPaused(true); }
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [setPaused]);
}

function useWidth(ref, fallback = 320) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setW(el.clientWidth || fallback);
    update();
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    } else {
      window.addEventListener("resize", update);
    }
    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", update);
    };
  }, [ref, fallback]);
  return w;
}

// Runs "fn" when the screen is left (for saving part-way progress).
function useOnLeave(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => () => { ref.current && ref.current(); }, []);
}

/* ───────── small shared pieces ───────── */
function GameFrame({ eyebrow, title, onExit, children }) {
  return (
    <div className="mg">
      <button className="mg-back" onClick={onExit}><ArrowLeft size={20} /> Mind Gym</button>
      {eyebrow ? <div className="mg-eyebrow">{eyebrow}</div> : null}
      <h1 className="mg-title">{title}</h1>
      {children}
    </div>
  );
}

function Segs({ value, onChange, options, marks }) {
  return (
    <div className="mg-seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          className={value === o.id ? "on" : ""}
          onClick={() => onChange(o.id)}
        >
          {o.label}
          {marks && marks[o.id] ? <span className="mg-tick">{marks[o.id]}</span> : null}
        </button>
      ))}
    </div>
  );
}

function PauseCover({ onResume, text }) {
  return (
    <div className="mg-pause" role="dialog" aria-label="Paused">
      <div className="mg-pause-card">
        <h2>Paused</h2>
        <p>{text || "The clock is stopped and the puzzle is hidden."}</p>
        <button className="mg-cta" onClick={onResume}><Play size={16} style={{ verticalAlign: "-2px" }} /> Resume</button>
      </div>
    </div>
  );
}

function ToolRow({ children }) {
  return <div className="mg-tools">{children}</div>;
}
function ToolBtn({ children, onClick, on, disabled, label }) {
  return (
    <button className={`mg-tool ${on ? "on" : ""}`} onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={on ? true : undefined}>
      {children}
    </button>
  );
}

function SolvedBanner({ title, text }) {
  return (
    <div className="mg-solved">
      <b>{title}</b>
      {text ? <span>{text}</span> : null}
    </div>
  );
}

/* ═══════════════════════════ 2048 ═══════════════════════════ */
// ==LOGIC-START==
function slide2048(line) {
  const nums = line.filter(Boolean);
  const out = [];
  const merged = [];
  let gained = 0;
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] === nums[i + 1]) {
      out.push(nums[i] * 2);
      merged.push(out.length - 1);
      gained += nums[i] * 2;
      i++;
    } else {
      out.push(nums[i]);
    }
  }
  while (out.length < line.length) out.push(0);
  return { line: out, gained, merged };
}

// dir: 0 left, 1 up, 2 right, 3 down
function move2048(grid, dir) {
  const n = 4;
  const res = grid.slice();
  let gained = 0;
  let moved = false;
  const mergedIdx = [];
  for (let k = 0; k < n; k++) {
    const idx = [];
    for (let j = 0; j < n; j++) {
      idx.push(
        dir === 0 ? k * n + j :
        dir === 2 ? k * n + (n - 1 - j) :
        dir === 1 ? j * n + k :
        (n - 1 - j) * n + k
      );
    }
    const r = slide2048(idx.map((i) => grid[i]));
    gained += r.gained;
    r.line.forEach((v, j) => {
      if (res[idx[j]] !== v) moved = true;
      res[idx[j]] = v;
    });
    r.merged.forEach((j) => mergedIdx.push(idx[j]));
  }
  return { grid: res, gained, moved, mergedIdx };
}

function spawn2048(grid, rng) {
  const empty = [];
  grid.forEach((v, i) => { if (!v) empty.push(i); });
  if (!empty.length) return { grid, idx: -1 };
  const g = grid.slice();
  const idx = empty[Math.floor(rng() * empty.length)];
  g[idx] = rng() < 0.9 ? 2 : 4;
  return { grid: g, idx };
}

function canMove2048(grid) {
  if (grid.includes(0)) return true;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const v = grid[r * 4 + c];
      if (c < 3 && grid[r * 4 + c + 1] === v) return true;
      if (r < 3 && grid[(r + 1) * 4 + c] === v) return true;
    }
  }
  return false;
}
// ==LOGIC-END==

const TILE_COLORS = {
  2: ["#f1e7ff", "#dcc6fb", "#3b1a66"],
  4: ["#e6d3ff", "#c9a6f7", "#3b1a66"],
  8: ["#d6adff", "#b57cf0", "#ffffff"],
  16: ["#c78ff7", "#9e55e8", "#ffffff"],
  32: ["#b772f1", "#8a3fd8", "#ffffff"],
  64: ["#a550e8", "#7a28c4", "#ffffff"],
  128: ["#d86df1", "#a826cf", "#ffffff"],
  256: ["#e553e1", "#b81eb4", "#ffffff"],
  512: ["#f343b9", "#c01383", "#ffffff"],
  1024: ["#ff5a8e", "#cc1f5e", "#ffffff"],
  2048: ["#ffc24f", "#e0841a", "#2b1200"],
};
function tileStyle(v) {
  const c = TILE_COLORS[v] || ["#ffdd6a", "#e0a300", "#2b1200"];
  const digits = String(v).length;
  return {
    background: `linear-gradient(160deg, ${c[0]},${c[1]})`,
    color: c[2],
    fontSize: digits >= 4 ? "clamp(15px, 5.2vw, 24px)" : digits === 3 ? "clamp(18px, 6.4vw, 30px)" : "clamp(22px, 8vw, 36px)",
    boxShadow: "inset 0 2px 0 rgba(255,255,255,.5), inset 0 -3px 0 rgba(0,0,0,.18), 0 2px 0 rgba(0,0,0,.25)",
  };
}

function fresh2048() {
  let r = spawn2048(new Array(16).fill(0), Math.random);
  r = spawn2048(r.grid, Math.random);
  return { grid: r.grid, score: 0, undo: null, reached: false, ack: false, over: false, moves: 0 };
}

export function Game2048({ onExit }) {
  const [st, setSt] = useState(() => {
    const s = readSave("2048");
    return s && Array.isArray(s.grid) && s.grid.length === 16 ? s : fresh2048();
  });
  const [fx, setFx] = useState({ spawn: -1, merged: [], tick: 0 });
  const [best, setBest] = useState(() => gameRecord("2048").best || 0);
  const stRef = useRef(st);
  stRef.current = st;
  const recordedRef = useRef(!!st.over);
  const touchRef = useRef(null);

  const doMove = useCallback((dir) => {
    const cur = stRef.current;
    if (cur.over) return;
    const m = move2048(cur.grid, dir);
    if (!m.moved) return;
    const sp = spawn2048(m.grid, Math.random);
    const score = cur.score + m.gained;
    const reached = cur.reached || sp.grid.some((v) => v >= 2048);
    const next = {
      grid: sp.grid,
      score,
      undo: { grid: cur.grid, score: cur.score, reached: cur.reached, ack: cur.ack },
      reached,
      ack: cur.ack || (cur.reached && true),
      over: !canMove2048(sp.grid),
      moves: cur.moves + 1,
    };
    stRef.current = next;
    setSt(next);
    setFx((f) => ({ spawn: sp.idx, merged: m.mergedIdx, tick: f.tick + 1 }));
  }, []);

  // Keep the save up to date, and track the best score.
  useEffect(() => {
    writeSave("2048", st);
    if (st.score > best) {
      setBest(st.score);
      recordGame("2048", (g) => { g.best = Math.max(g.best || 0, st.score); });
    }
  }, [st]); // eslint-disable-line react-hooks/exhaustive-deps

  // Game over: count the round once.
  useEffect(() => {
    if (!st.over || recordedRef.current) return;
    recordedRef.current = true;
    recordGame("2048", (g) => {
      g.plays = (g.plays || 0) + 1;
      g.best = Math.max(g.best || 0, st.score);
      if (st.reached) g.wins = (g.wins || 0) + 1;
    });
  }, [st.over]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e) {
      const map = { ArrowLeft: 0, ArrowUp: 1, ArrowRight: 2, ArrowDown: 3, a: 0, w: 1, d: 2, s: 3 };
      if (!(e.key in map)) return;
      doMove(map[e.key]);
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doMove]);

  function onDown(e) { touchRef.current = { x: e.clientX, y: e.clientY }; }
  function onUp(e) {
    const t = touchRef.current;
    touchRef.current = null;
    if (!t) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 2 : 0);
    else doMove(dy > 0 ? 3 : 1);
  }

  function undo() {
    const cur = stRef.current;
    if (!cur.undo) return;
    const next = { ...cur, grid: cur.undo.grid, score: cur.undo.score, reached: cur.undo.reached, ack: cur.undo.ack, undo: null, over: false, moves: Math.max(0, cur.moves - 1) };
    stRef.current = next;
    recordedRef.current = false;
    setSt(next);
    setFx({ spawn: -1, merged: [], tick: fx.tick + 1 });
  }

  function newGame() {
    const cur = stRef.current;
    if (!cur.over && cur.moves > 3 && !window.confirm("Start a new game? Your current game will be counted as finished.")) return;
    if (!cur.over && cur.moves > 3 && !recordedRef.current) {
      recordGame("2048", (g) => {
        g.plays = (g.plays || 0) + 1;
        g.best = Math.max(g.best || 0, cur.score);
        if (cur.reached) g.wins = (g.wins || 0) + 1;
      });
    }
    recordedRef.current = false;
    const f = fresh2048();
    stRef.current = f;
    setSt(f);
    setFx({ spawn: -1, merged: [], tick: fx.tick + 1 });
  }

  const showWin = st.reached && !st.ack && !st.over;

  return (
    <GameFrame eyebrow="Join the tiles" title="2048" onExit={onExit}>
      <div className="mg-scorebar">
        <div><span>Score</span><b>{st.score}</b></div>
        <div><span>Best</span><b>{Math.max(best, st.score)}</b></div>
      </div>

      <div className="mg-boardwrap">
        <div
          className="mg-2048"
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerCancel={() => { touchRef.current = null; }}
          role="grid"
          aria-label="2048 board"
        >
          {st.grid.map((v, i) => (
            <div className="mg-2048-cell" key={i} role="gridcell">
              {v ? (
                <div
                  key={`${fx.tick}-${v}`}
                  className={`mg-2048-tile ${fx.spawn === i ? "pop" : ""} ${fx.merged.includes(i) ? "merge" : ""}`}
                  style={tileStyle(v)}
                >
                  {v}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {st.over && (
          <div className="mg-pause" role="dialog" aria-label="Game over">
            <div className="mg-pause-card">
              <h2>No moves left</h2>
              <p>You scored {st.score}{st.reached ? " and made 2048!" : "."}</p>
              <button className="mg-cta" onClick={newGame}>Play again</button>
              {st.undo ? <button className="mg-ghost" onClick={undo}>Undo last move</button> : null}
            </div>
          </div>
        )}
        {showWin && (
          <div className="mg-pause" role="dialog" aria-label="You made 2048">
            <div className="mg-pause-card">
              <h2>You made 2048</h2>
              <p>Well done. You can keep going for a higher score.</p>
              <button className="mg-cta" onClick={() => setSt((s) => ({ ...s, ack: true }))}>Keep going</button>
              <button className="mg-ghost" onClick={newGame}>New game</button>
            </div>
          </div>
        )}
      </div>

      <ToolRow>
        <ToolBtn onClick={undo} disabled={!st.undo} label="Undo last move"><RotateCcw size={15} /> Undo</ToolBtn>
        <ToolBtn onClick={newGame} label="New game"><RotateCw size={15} /> New game</ToolBtn>
      </ToolRow>
      <p className="mg-meta">Swipe, or use the arrow keys. Tiles with the same number merge when they touch.</p>
    </GameFrame>
  );
}

/* ═══════════════════════════ N-QUEENS ═══════════════════════════ */
// ==LOGIC-START==
// A queen is stored as a cell number: row * n + column.
function queenConflictSet(n, cells) {
  const bad = new Set();
  for (let a = 0; a < cells.length; a++) {
    for (let b = a + 1; b < cells.length; b++) {
      const ra = (cells[a] / n) | 0, ca = cells[a] % n;
      const rb = (cells[b] / n) | 0, cb = cells[b] % n;
      if (ra === rb || ca === cb || Math.abs(ra - rb) === Math.abs(ca - cb)) {
        bad.add(cells[a]);
        bad.add(cells[b]);
      }
    }
  }
  return bad;
}

function queenAttacked(n, cells) {
  const att = new Set();
  for (const q of cells) {
    const qr = (q / n) | 0, qc = q % n;
    for (let i = 0; i < n * n; i++) {
      if (i === q) continue;
      const r = (i / n) | 0, c = i % n;
      if (r === qr || c === qc || Math.abs(r - qr) === Math.abs(c - qc)) att.add(i);
    }
  }
  return att;
}

// Finds a full solution that keeps the queens already placed, or null.
function solveQueens(n, fixed) {
  const rows = new Array(n).fill(-1);
  const cols = new Array(n).fill(false);
  const d1 = new Array(2 * n).fill(false);
  const d2 = new Array(2 * n + 1).fill(false);
  for (const cell of fixed) {
    const r = (cell / n) | 0, c = cell % n;
    if (rows[r] !== -1 || cols[c] || d1[r + c] || d2[r - c + n]) return null;
    rows[r] = c;
    cols[c] = true;
    d1[r + c] = true;
    d2[r - c + n] = true;
  }
  function go(r) {
    if (r === n) return true;
    if (rows[r] !== -1) return go(r + 1);
    for (let c = 0; c < n; c++) {
      if (cols[c] || d1[r + c] || d2[r - c + n]) continue;
      rows[r] = c;
      cols[c] = true;
      d1[r + c] = true;
      d2[r - c + n] = true;
      if (go(r + 1)) return true;
      rows[r] = -1;
      cols[c] = false;
      d1[r + c] = false;
      d2[r - c + n] = false;
    }
    return false;
  }
  if (!go(0)) return null;
  return rows.map((c, r) => r * n + c);
}

function countQueens(n) {
  const cols = new Array(n).fill(false);
  const d1 = new Array(2 * n).fill(false);
  const d2 = new Array(2 * n + 1).fill(false);
  let count = 0;
  (function go(r) {
    if (r === n) { count++; return; }
    for (let c = 0; c < n; c++) {
      if (cols[c] || d1[r + c] || d2[r - c + n]) continue;
      cols[c] = d1[r + c] = d2[r - c + n] = true;
      go(r + 1);
      cols[c] = d1[r + c] = d2[r - c + n] = false;
    }
  })(0);
  return count;
}
// ==LOGIC-END==

function QueenDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="mgq-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6e9ff" />
          <stop offset="0.45" stopColor="#b57cf0" />
          <stop offset="1" stopColor="#5a1fa8" />
        </linearGradient>
        <linearGradient id="mgq-bad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd3da" />
          <stop offset="0.5" stopColor="#ff6b81" />
          <stop offset="1" stopColor="#b3203c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function QueenIcon({ bad }) {
  const fill = bad ? "url(#mgq-bad)" : "url(#mgq-grad)";
  return (
    <svg viewBox="0 0 24 24" className="mg-queen" aria-hidden="true">
      <path d="M4 9l3.6 4.2L9 6.5l3 5.8 3-5.8 1.4 6.7L20 9l-1.8 10H5.8z" fill={fill} stroke="rgba(255,255,255,.75)" strokeWidth=".7" strokeLinejoin="round" />
      <rect x="5.4" y="19.4" width="13.2" height="2.4" rx="1.2" fill={fill} stroke="rgba(255,255,255,.75)" strokeWidth=".6" />
      <circle cx="4" cy="8" r="1.5" fill={fill} stroke="rgba(255,255,255,.75)" strokeWidth=".5" />
      <circle cx="9" cy="5.6" r="1.5" fill={fill} stroke="rgba(255,255,255,.75)" strokeWidth=".5" />
      <circle cx="15" cy="5.6" r="1.5" fill={fill} stroke="rgba(255,255,255,.75)" strokeWidth=".5" />
      <circle cx="20" cy="8" r="1.5" fill={fill} stroke="rgba(255,255,255,.75)" strokeWidth=".5" />
      <path d="M7.5 10.5l1.3 5" stroke="#fff" strokeOpacity=".5" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function QueensBoard({ n, onExit }) {
  const saveKey = `queens-${n}`;
  const saved = useMemo(() => readSave(saveKey), [saveKey]);
  const [cells, setCells] = useState(() => (
    saved && Array.isArray(saved.cells) ? saved.cells.filter((i) => Number.isInteger(i) && i >= 0 && i < n * n) : []
  ));
  const [hints, setHints] = useState((saved && saved.hints) || 0);
  const [paused, setPaused] = useState(false);
  const [threats, setThreats] = useState(false);
  const [note, setNote] = useState("");
  const solvedRef = useRef(false);

  const conflicts = useMemo(() => queenConflictSet(n, cells), [n, cells]);
  const attacked = useMemo(() => (threats ? queenAttacked(n, cells) : new Set()), [n, cells, threats]);
  const complete = cells.length === n && conflicts.size === 0;
  const [seconds] = useClock(!paused && !complete, (saved && saved.seconds) || 0);
  const secRef = useRef(seconds);
  secRef.current = seconds;
  usePauseOnHide(setPaused);

  useEffect(() => {
    if (complete) return;
    writeSave(saveKey, { cells, seconds, hints });
  }, [cells, seconds, hints, complete, saveKey]);

  useEffect(() => {
    if (!complete || solvedRef.current) return;
    solvedRef.current = true;
    clearSave(saveKey);
    recordGame("queens", (g) => {
      g.plays = (g.plays || 0) + 1;
      g.wins = (g.wins || 0) + 1;
      g.done[n] = true;
      if (!hints && (!g.bestBy[n] || secRef.current < g.bestBy[n])) g.bestBy[n] = secRef.current;
    });
  }, [complete]); // eslint-disable-line react-hooks/exhaustive-deps

  useOnLeave(() => { if (!solvedRef.current && cellsRef.current.length > 0) touchToday(); });
  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  function tap(i) {
    if (paused || complete) return;
    setNote("");
    setCells((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));
  }

  function hint() {
    if (paused || complete) return;
    if (conflicts.size > 0) { setNote("Fix the red queens first, then ask again."); return; }
    const sol = solveQueens(n, cells);
    if (!sol) { setNote("These queens cannot all be part of a solution. Try moving one."); return; }
    const missing = sol.filter((c) => !cells.includes(c));
    if (!missing.length) return;
    const pick = missing[Math.floor(Math.random() * missing.length)];
    setCells((cur) => [...cur, pick]);
    setHints((h) => h + 1);
    setNote("A queen was placed for you.");
  }

  function reset() {
    setCells([]);
    setNote("");
  }

  const left = Math.max(0, n - cells.length);
  return (
    <>
      <QueenDefs />
      <div className="mg-sbar">
        <span className="mg-stime">{formatTime(seconds)}{paused ? " · paused" : ""}</span>
        <span className="mg-meta" style={{ margin: 0 }}>{complete ? "Solved" : `${left} queen${left === 1 ? "" : "s"} to place`}</span>
      </div>

      <div className="mg-boardwrap">
        <div
          className="mg-qboard"
          style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, visibility: paused ? "hidden" : "visible" }}
          role="grid"
          aria-label={`${n} by${n} board`}
        >
          {Array.from({ length: n * n }, (_, i) => {
            const r = (i / n) | 0, c = i % n;
            const hasQ = cells.includes(i);
            const bad = conflicts.has(i);
            return (
              <button
                key={i}
                role="gridcell"
                className={`mg-qcell ${(r + c) % 2 ? "dark" : "light"} ${bad ? "bad" : ""} ${!hasQ && attacked.has(i) ? "att" : ""}`}
                onClick={() => tap(i)}
                aria-label={`Row ${r + 1}, column ${c + 1}${hasQ ? ", queen" : ""}`}
              >
                {hasQ ? <QueenIcon bad={bad} /> : null}
              </button>
            );
          })}
        </div>
        {paused && !complete && <PauseCover onResume={() => setPaused(false)} />}
      </div>

      {complete ? (
        <SolvedBanner title={`Solved in ${formatTime(seconds)}${hints ? ` with ${hints} hint${hints === 1 ? "" : "s"}` : ""}.`} text="No two queens attack each other. Try a bigger board." />
      ) : (
        <>
          <ToolRow>
            <ToolBtn onClick={() => setThreats((t) => !t)} on={threats} label="Show attacked squares">Show threats</ToolBtn>
            <ToolBtn onClick={hint} label="Place one queen for me">Hint</ToolBtn>
            <ToolBtn onClick={() => setPaused(true)} label="Pause">Pause</ToolBtn>
            <ToolBtn onClick={reset} label="Clear the board">Clear</ToolBtn>
          </ToolRow>
          {note ? <p className="mg-meta">{note}</p> : <p className="mg-meta">Tap a square to place or remove a queen. Queens attack along rows, columns and diagonals.</p>}
        </>
      )}
    </>
  );
}

export function GameQueens({ onExit }) {
  const [n, setN] = useState(6);
  const rec = gameRecord("queens");
  const marks = {};
  [5, 6, 7, 8].forEach((k) => { if (rec.done && rec.done[k]) marks[k] = "✓"; });
  return (
    <GameFrame eyebrow="Algorithmic thinking" title="N-Queens" onExit={onExit}>
      <Segs
        value={n}
        onChange={setN}
        options={[5, 6, 7, 8].map((k) => ({ id: k, label: `${k}×${k}` }))}
        marks={marks}
      />
      <QueensBoard key={n} n={n} onExit={onExit} />
    </GameFrame>
  );
}/* ═══════════════════════════ TOWER OF HANOI ═══════════════════════════ */
// ==LOGIC-START==
function hanoiStart(n) {
  return [Array.from({ length: n }, (_, i) => n - i), [], []];
}
function hanoiCanMove(pegs, from, to) {
  if (from === to) return false;
  const a = pegs[from];
  if (!a.length) return false;
  const b = pegs[to];
  return !b.length || b[b.length - 1] > a[a.length - 1];
}
function hanoiMove(pegs, from, to) {
  const next = pegs.map((p) => p.slice());
  next[to].push(next[from].pop());
  return next;
}
function hanoiWon(pegs, n) {
  return pegs[2].length === n || pegs[1].length === n;
}
// ==LOGIC-END==

function HanoiPlay({ n }) {
  const saveKey = `hanoi-${n}`;
  const saved = useMemo(() => readSave(saveKey), [saveKey]);
  const valid = saved && Array.isArray(saved.pegs) && saved.pegs.length === 3 &&
    saved.pegs.reduce((t, p) => t + p.length, 0) === n;
  const [pegs, setPegs] = useState(valid ? saved.pegs : hanoiStart(n));
  const [moves, setMoves] = useState(valid ? saved.moves || 0 : 0);
  const [sel, setSel] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [shake, setShake] = useState(-1);
  const won = hanoiWon(pegs, n);
  const best = Math.pow(2, n) - 1;
  const [seconds] = useClock(!paused && !won, valid ? saved.seconds || 0 : 0);
  const secRef = useRef(seconds);
  secRef.current = seconds;
  const movesRef = useRef(moves);
  movesRef.current = moves;
  const wonRef = useRef(false);
  usePauseOnHide(setPaused);

  useEffect(() => {
    if (!won) writeSave(saveKey, { pegs, moves, seconds });
  }, [pegs, moves, seconds, won, saveKey]);

  useEffect(() => {
    if (!won || wonRef.current) return;
    wonRef.current = true;
    clearSave(saveKey);
    recordGame("hanoi", (g) => {
      g.plays = (g.plays || 0) + 1;
      g.wins = (g.wins || 0) + 1;
      g.done[n] = true;
      if (!g.bestBy[n] || movesRef.current < g.bestBy[n]) g.bestBy[n] = movesRef.current;
    });
  }, [won]); // eslint-disable-line react-hooks/exhaustive-deps

  useOnLeave(() => { if (!wonRef.current && movesRef.current > 0) touchToday(); });

  function tapPeg(i) {
    if (paused || won) return;
    if (sel === -1) {
      if (pegs[i].length) setSel(i);
      return;
    }
    if (sel === i) { setSel(-1); return; }
    if (hanoiCanMove(pegs, sel, i)) {
      setPegs(hanoiMove(pegs, sel, i));
      setMoves((m) => m + 1);
      setSel(-1);
    } else {
      setShake(i);
      setTimeout(() => setShake(-1), 350);
      setSel(pegs[i].length ? i : -1);
    }
  }

  function restart() {
    setPegs(hanoiStart(n));
    setMoves(0);
    setSel(-1);
  }

  const discHue = (d) => 265 + (d * 70) / n;
  return (
    <>
      <div className="mg-sbar">
        <span className="mg-stime">{formatTime(seconds)}{paused ? " · paused" : ""}</span>
        <span className="mg-meta" style={{ margin: 0 }}>{moves} move{moves === 1 ? "" : "s"} · best possible {best}</span>
      </div>
      <div className="mg-boardwrap">
        <div className="mg-hanoi" style={{ visibility: paused ? "hidden" : "visible" }}>
          {pegs.map((peg, pi) => (
            <button
              key={pi}
              className={`mg-peg ${sel === pi ? "sel" : ""} ${shake === pi ? "shake" : ""}`}
              onClick={() => tapPeg(pi)}
              aria-label={`Peg ${pi + 1},${peg.length} disc${peg.length === 1 ? "" : "s"}${sel === pi ? ", picked up" : ""}`}
            >
              <span className="mg-pole" />
              <span className="mg-stack">
                {peg.map((d, k) => {
                  const top = k === peg.length - 1;
                  return (
                    <span
                      key={d}
                      className={`mg-disc ${top && sel === pi ? "lift" : ""}`}
                      style={{
                        width: `${28 + (d / n) * 66}%`,
                        background: `linear-gradient(180deg, hsl(${discHue(d)} 85\% 78\%), hsl(${discHue(d)} 70% 52%))`,
                      }}
                    />
                  );
                })}
              </span>
              <span className="mg-base" />
            </button>
          ))}
        </div>
        {paused && !won && <PauseCover onResume={() => setPaused(false)} />}
      </div>
      {won ? (
        <SolvedBanner
          title={`Done in ${moves} moves${moves === best ? " — the fewest possible" : ""}.`}
          text={moves === best ? "A perfect solution." : `The fewest possible is ${best}. Can you match it?`}
        />
      ) : (
        <>
          <ToolRow>
            <ToolBtn onClick={() => setPaused(true)} label="Pause">Pause</ToolBtn>
            <ToolBtn onClick={restart} label="Start over">Start over</ToolBtn>
          </ToolRow>
          <p className="mg-meta">Tap a peg to lift its top disc, then tap where to put it. A bigger disc can never sit on a smaller one. Move the whole tower to another peg.</p>
        </>
      )}
    </>
  );
}

export function GameHanoi({ onExit }) {
  const [n, setN] = useState(4);
  const rec = gameRecord("hanoi");
  const marks = {};
  [3, 4, 5, 6, 7].forEach((k) => { if (rec.done && rec.done[k]) marks[k] = "✓"; });
  return (
    <GameFrame eyebrow="Sequential reasoning" title="Tower of Hanoi" onExit={onExit}>
      <Segs value={n} onChange={setN} options={[3, 4, 5, 6, 7].map((k) => ({ id: k, label: `${k} discs` }))} marks={marks} />
      <HanoiPlay key={n} n={n} />
    </GameFrame>
  );
}

/* ═══════════════════════════ MASTERMIND ═══════════════════════════ */
// ==LOGIC-START==
const MM_COLORS = 6;
const MM_SLOTS = 4;
const MM_TRIES = 10;
function mmScore(secret, guess) {
  let exact = 0;
  const sCount = new Array(MM_COLORS).fill(0);
  const gCount = new Array(MM_COLORS).fill(0);
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) exact++;
    else { sCount[secret[i]]++; gCount[guess[i]]++; }
  }
  let near = 0;
  for (let c = 0; c < MM_COLORS; c++) near += Math.min(sCount[c], gCount[c]);
  return { exact, near };
}
function mmNewSecret(rng) {
  return Array.from({ length: MM_SLOTS }, () => Math.floor(rng() * MM_COLORS));
}
// ==LOGIC-END==

const MM_HUES = [
  ["#ffb3c1", "#e0245e"],
  ["#ffd9a0", "#e8800c"],
  ["#fff3a6", "#d9b400"],
  ["#b6f0c2", "#1f9d55"],
  ["#a9d8ff", "#1f6fd1"],
  ["#d9b8ff", "#7a2fd0"],
];
const MM_NAMES = ["red", "orange", "yellow", "green", "blue", "purple"];

function Bead({ c, size = 34, empty, onClick, label, ring }) {
  const style = empty
    ? { width: size, height: size }
    : {
        width: size,
        height: size,
        background: `radial-gradient(circle at 32% 28%, #fff 0, ${MM_HUES[c][0]} 28\%,${MM_HUES[c][1]} 100%)`,
      };
  return (
    <button
      type="button"
      className={`mg-bead ${empty ? "empty" : ""} ${ring ? "ring" : ""}`}
      style={style}
      onClick={onClick}
      aria-label={label || (empty ? "empty" : MM_NAMES[c])}
    />
  );
}

export function GameMastermind({ onExit }) {
  const [st, setSt] = useState(() => {
    const s = readSave("mastermind");
    if (s && Array.isArray(s.secret) && s.secret.length === MM_SLOTS && Array.isArray(s.rows)) return s;
    return { secret: mmNewSecret(Math.random), rows: [], over: false, won: false };
  });
  const [cur, setCur] = useState([-1, -1, -1, -1]);
  const [slot, setSlot] = useState(0);
  const [paused, setPaused] = useState(false);
  const recRef = useRef(st.over);
  const rowsRef = useRef(st.rows.length);
  rowsRef.current = st.rows.length;
  usePauseOnHide(setPaused);

  useEffect(() => { writeSave("mastermind", st); }, [st]);

  useEffect(() => {
    if (!st.over || recRef.current) return;
    recRef.current = true;
    recordGame("mastermind", (g) => {
      g.plays = (g.plays || 0) + 1;
      if (st.won) {
        g.wins = (g.wins || 0) + 1;
        if (!g.best || st.rows.length < g.best) g.best = st.rows.length;
      }
    });
  }, [st.over]); // eslint-disable-line react-hooks/exhaustive-deps

  useOnLeave(() => { if (rowsRef.current > 0) touchToday(); });

  function pickColor(c) {
    if (st.over || paused) return;
    const next = cur.slice();
    next[slot] = c;
    setCur(next);
    const empty = next.findIndex((v) => v === -1);
    setSlot(empty === -1 ? Math.min(slot + 1, MM_SLOTS - 1) : empty);
  }
  function clearSlot() {
    const next = cur.slice();
    next[slot] = -1;
    setCur(next);
  }
  function submit() {
    if (cur.some((v) => v === -1) || st.over || paused) return;
    const fb = mmScore(st.secret, cur);
    const rows = [...st.rows, { guess: cur, ...fb }];
    const won = fb.exact === MM_SLOTS;
    setSt({ ...st, rows, won, over: won || rows.length >= MM_TRIES });
    setCur([-1, -1, -1, -1]);
    setSlot(0);
  }
  function again() {
    recRef.current = false;
    setSt({ secret: mmNewSecret(Math.random), rows: [], over: false, won: false });
    setCur([-1, -1, -1, -1]);
    setSlot(0);
  }

  const ready = cur.every((v) => v !== -1);
  return (
    <GameFrame eyebrow="Logical elimination" title="Mastermind" onExit={onExit}>
      <div className="mg-sbar">
        <span className="mg-stime">Guess {Math.min(st.rows.length + (st.over ? 0 : 1), MM_TRIES)} of {MM_TRIES}</span>
        <span className="mg-meta" style={{ margin: 0 }}>Best: {gameRecord("mastermind").best || "—"}</span>
      </div>

      <div className="mg-boardwrap">
        <div className="mg-mm" style={{ visibility: paused ? "hidden" : "visible" }}>
          {st.rows.map((r, i) => (
            <div className="mg-mm-row" key={i}>
              <span className="mg-mm-n">{i + 1}</span>
              <div className="mg-mm-beads">{r.guess.map((c, k) => <Bead key={k} c={c} size={30} />)}</div>
              <div className="mg-mm-pegs" aria-label={`${r.exact} in the right place,${r.near} right colour in the wrong place`}>
                {Array.from({ length: MM_SLOTS }, (_, k) => (
                  <i key={k} className={k < r.exact ? "ex" : k < r.exact + r.near ? "nr" : ""} />
                ))}
              </div>
            </div>
          ))}
          {!st.over && (
            <div className="mg-mm-row now">
              <span className="mg-mm-n">{st.rows.length + 1}</span>
              <div className="mg-mm-beads">
                {cur.map((c, k) => (
                  <Bead key={k} c={c} size={30} empty={c === -1} ring={slot === k} onClick={() => setSlot(k)} label={`slot ${k + 1}`} />
                ))}
              </div>
              <button className="mg-mm-go" disabled={!ready} onClick={submit}>Check</button>
            </div>
          )}
          {st.over && (
            <div className="mg-mm-row secret">
              <span className="mg-mm-n">★</span>
              <div className="mg-mm-beads">{st.secret.map((c, k) => <Bead key={k} c={c} size={30} />)}</div>
              <span className="mg-meta" style={{ margin: 0 }}>the code</span>
            </div>
          )}
        </div>
        {paused && !st.over && <PauseCover onResume={() => setPaused(false)} text="Your guesses are saved and hidden." />}
      </div>

      {st.over ? (
        <>
          <SolvedBanner
            title={st.won ? `Cracked in ${st.rows.length} guess${st.rows.length === 1 ? "" : "es"}.` : "Out of guesses."}
            text={st.won ? "Nicely reasoned." : "The code is shown above. Try again."}
          />
          <ToolRow><ToolBtn onClick={again} label="New code"><RotateCw size={15} /> New code</ToolBtn></ToolRow>
        </>
      ) : (
        <>
          <div className="mg-palette">
            {MM_HUES.map((_, c) => <Bead key={c} c={c} size={40} onClick={() => pickColor(c)} />)}
          </div>
          <ToolRow>
            <ToolBtn onClick={clearSlot} label="Clear this slot"><Eraser size={15} /> Clear slot</ToolBtn>
            <ToolBtn onClick={() => setPaused(true)} label="Pause">Pause</ToolBtn>
            <ToolBtn onClick={() => { if (st.rows.length === 0 || window.confirm("Give up and start a new code?")) again(); }} label="New code">New code</ToolBtn>
          </ToolRow>
          <p className="mg-meta">Crack the 4-colour code. A dark dot means right colour in the right place. A light dot means right colour, wrong place. Colours can repeat.</p>
        </>
      )}
    </GameFrame>
  );
}

/* ═══════════════════════════ KENKEN ═══════════════════════════ */
// ==LOGIC-START==
function kkLatin(n, rng) {
  const p = shuffle(Array.from({ length: n }, (_, i) => i), rng);
  const q = shuffle(Array.from({ length: n }, (_, i) => i), rng);
  const s = shuffle(Array.from({ length: n }, (_, i) => i), rng);
  const out = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out.push(s[(p[r] + q[c]) % n] + 1);
  return out;
}

function kkCageOk(vals, op, target) {
  if (op === "=") return vals[0] === target;
  if (op === "+") return vals.reduce((a, b) => a + b, 0) === target;
  if (op === "×") return vals.reduce((a, b) => a * b, 1) === target;
  const hi = Math.max(vals[0], vals[1]);
  const lo = Math.min(vals[0], vals[1]);
  if (op === "−") return hi - lo === target;
  return lo > 0 && hi % lo === 0 && hi / lo === target;
}

function kkMakeCages(n, sol, rng) {
  const id = new Array(n * n).fill(-1);
  const cages = [];
  const order = shuffle(Array.from({ length: n * n }, (_, i) => i), rng);
  const sizes = n <= 4 ? [1, 2, 2, 2, 2, 3, 3] : [1, 2, 2, 2, 3, 3, 3];
  for (const start of order) {
    if (id[start] !== -1) continue;
    const want = pickOne(rng, sizes);
    const cells = [start];
    id[start] = cages.length;
    while (cells.length < want) {
      const cand = [];
      for (const x of cells) {
        const r = (x / n) | 0, c = x % n;
        if (r > 0 && id[x - n] === -1) cand.push(x - n);
        if (r < n - 1 && id[x + n] === -1) cand.push(x + n);
        if (c > 0 && id[x - 1] === -1) cand.push(x - 1);
        if (c < n - 1 && id[x + 1] === -1) cand.push(x + 1);
      }
      if (!cand.length) break;
      const nx = pickOne(rng, cand);
      id[nx] = cages.length;
      cells.push(nx);
    }
    cells.sort((a, b) => a - b);
    const vals = cells.map((x) => sol[x]);
    let op;
    let target;
    if (cells.length === 1) { op = "="; target = vals[0]; }
    else if (cells.length === 2) {
      const hi = Math.max(vals[0], vals[1]);
      const lo = Math.min(vals[0], vals[1]);
      const opts = ["+", "×", "−"];
      if (hi % lo === 0) opts.push("÷", "÷");
      op = pickOne(rng, opts);
      target = op === "+" ? hi + lo : op === "×" ? hi * lo : op === "−" ? hi - lo : hi / lo;
    } else {
      op = pickOne(rng, ["+", "×"]);
      target = op === "+" ? vals.reduce((a, b) => a + b, 0) : vals.reduce((a, b) => a * b, 1);
    }
    cages.push({ cells, op, target });
  }
  return cages;
}

function kkCount(n, cages, limit) {
  const cageOf = new Array(n * n);
  cages.forEach((cg, i) => cg.cells.forEach((x) => { cageOf[x] = i; }));
  const vals = new Array(n * n).fill(0);
  let count = 0;
  function partialOk(ci) {
    const cg = cages[ci];
    let filled = 0, sum = 0, prod = 1;
    for (const x of cg.cells) if (vals[x]) { filled++; sum += vals[x]; prod *= vals[x]; }
    if (filled === cg.cells.length) return kkCageOk(cg.cells.map((x) => vals[x]), cg.op, cg.target);
    if (cg.op === "+") return sum < cg.target;
    if (cg.op === "×") return cg.target % prod === 0;
    return true;
  }
  function go(i) {
    if (count >= limit) return;
    if (i === n * n) { count++; return; }
    const r = (i / n) | 0, c = i % n;
    for (let v = 1; v <= n; v++) {
      let clash = false;
      for (let k = 0; k < c; k++) if (vals[r * n + k] === v) { clash = true; break; }
      if (!clash) for (let k = 0; k < r; k++) if (vals[k * n + c] === v) { clash = true; break; }
      if (clash) continue;
      vals[i] = v;
      if (partialOk(cageOf[i])) go(i + 1);
      vals[i] = 0;
    }
  }
  go(0);
  return count;
}

function kkGenerate(n, seedStr) {
  const rng = seededRng(seedStr);
  const sol = kkLatin(n, rng);
  let cages = null;
  for (let attempt = 0; attempt < 250; attempt++) {
    cages = kkMakeCages(n, sol, rng);
    if (kkCount(n, cages, 2) === 1) break;
  }
  return { n, sol, cages };
}

function kkConflicts(n, vals) {
  const bad = new Set();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = vals[r * n + c];
      if (!v) continue;
      for (let k = c + 1; k < n; k++) if (vals[r * n + k] === v) { bad.add(r * n + c); bad.add(r * n + k); }
      for (let k = r + 1; k < n; k++) if (vals[k * n + c] === v) { bad.add(r * n + c); bad.add(k * n + c); }
    }
  }
  return bad;
}

function kkCageBroken(cages, vals) {
  const bad = new Set();
  cages.forEach((cg, i) => {
    const v = cg.cells.map((x) => vals[x]);
    if (v.every(Boolean) && !kkCageOk(v, cg.op, cg.target)) bad.add(i);
  });
  return bad;
}
// ==LOGIC-END==

function KenKenPlay({ n, seed, onNew }) {
  const puzzle = useMemo(() => kkGenerate(n, seed), [n, seed]);
  const saveKey = `kenken-${n}`;
  const saved = useMemo(() => {
    const s = readSave(saveKey);
    return s && s.seed === seed && Array.isArray(s.vals) && s.vals.length === n * n ? s : null;
  }, [saveKey, seed, n]);
  const [vals, setVals] = useState(saved ? saved.vals : new Array(n * n).fill(0));
  const [hints, setHints] = useState(saved ? saved.hints || 0 : 0);
  const [sel, setSel] = useState(-1);
  const [paused, setPaused] = useState(false);
  const cageOf = useMemo(() => {
    const m = new Array(n * n);
    puzzle.cages.forEach((cg, i) => cg.cells.forEach((x) => { m[x] = i; }));
    return m;
  }, [puzzle, n]);
  const dupes = useMemo(() => kkConflicts(n, vals), [n, vals]);
  const brokenCages = useMemo(() => kkCageBroken(puzzle.cages, vals), [puzzle, vals]);
  const full = vals.every(Boolean);
  const won = full && dupes.size === 0 && brokenCages.size === 0;
  const [seconds] = useClock(!paused && !won, saved ? saved.seconds || 0 : 0);
  const secRef = useRef(seconds);
  secRef.current = seconds;
  const filledRef = useRef(0);
  filledRef.current = vals.filter(Boolean).length;
  const wonRef = useRef(false);
  usePauseOnHide(setPaused);

  useEffect(() => {
    if (!won) writeSave(saveKey, { seed, vals, seconds, hints });
  }, [vals, seconds, hints, won, seed, saveKey]);

  useEffect(() => {
    if (!won || wonRef.current) return;
    wonRef.current = true;
    clearSave(saveKey);
    recordGame("kenken", (g) => {
      g.plays = (g.plays || 0) + 1;
      g.wins = (g.wins || 0) + 1;
      g.done[n] = true;
      if (!hints && (!g.bestBy[n] || secRef.current < g.bestBy[n])) g.bestBy[n] = secRef.current;
    });
  }, [won]); // eslint-disable-line react-hooks/exhaustive-deps

  useOnLeave(() => { if (!wonRef.current && filledRef.current > 0) touchToday(); });

  function put(v) {
    if (sel < 0 || paused || won) return;
    setVals((cur) => { const nx = cur.slice(); nx[sel] = v; return nx; });
  }
  useEffect(() => {
    function onKey(e) {
      if (e.key >= "1" && e.key <= String(n)) put(Number(e.key));
      else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") put(0);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function hint() {
    if (paused || won) return;
    const wrong = [];
    for (let i = 0; i < n * n; i++) if (vals[i] !== puzzle.sol[i]) wrong.push(i);
    if (!wrong.length) return;
    const i = sel >= 0 && wrong.includes(sel) ? sel : wrong[Math.floor(Math.random() * wrong.length)];
    setVals((cur) => { const nx = cur.slice(); nx[i] = puzzle.sol[i]; return nx; });
    setHints((h) => h + 1);
    setSel(i);
  }

  return (
    <>
      <div className="mg-sbar">
        <span className="mg-stime">{formatTime(seconds)}{paused ? " · paused" : ""}</span>
        <span className="mg-meta" style={{ margin: 0 }}>{won ? "Solved" : `${vals.filter(Boolean).length}/${n * n} filled`}</span>
      </div>
      <div className="mg-boardwrap">
        <div className="mg-kk" style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, visibility: paused ? "hidden" : "visible" }} role="grid" aria-label="KenKen board">
          {vals.map((v, i) => {
            const r = (i / n) | 0, c = i % n;
            const ci = cageOf[i];
            const cg = puzzle.cages[ci];
            const b = [];
            if (r === 0 || cageOf[i - n] !== ci) b.push("bt");
            if (c === 0 || cageOf[i - 1] !== ci) b.push("bl");
            if (r === n - 1 || cageOf[i + n] !== ci) b.push("bb");
            if (c === n - 1 || cageOf[i + 1] !== ci) b.push("br");
            const label = cg.cells[0] === i ? `${cg.target}${cg.op === "=" ? "" : cg.op}` : "";
            return (
              <button
                key={i}
                role="gridcell"
                className={`mg-kkc ${b.join(" ")} ${sel === i ? "sel" : ""} ${dupes.has(i) ? "bad" : ""} ${brokenCages.has(ci) ? "cagebad" : ""}`}
                onClick={() => setSel(i)}
                aria-label={`Row ${r + 1}, column ${c + 1}${v ? `, ${v}` : ", empty"}${label ? `, cage ${label}` : ""}`}
              >
                {label ? <span className="mg-kk-t">{label}</span> : null}
                <span className="mg-kk-v">{v || ""}</span>
              </button>
            );
          })}
        </div>
        {paused && !won && <PauseCover onResume={() => setPaused(false)} />}
      </div>

      {won ? (
        <>
          <SolvedBanner title={`Solved in ${formatTime(seconds)}${hints ? ` with ${hints} hint${hints === 1 ? "" : "s"}` : ""}.`} text="Every cage adds up and every line is clean." />
          <ToolRow><ToolBtn onClick={onNew} label="New puzzle"><RotateCw size={15} /> New puzzle</ToolBtn></ToolRow>
        </>
      ) : (
        <>
          <div className="mg-npad" style={{ gridTemplateColumns: `repeat(${n + 1}, 1fr)` }}>
            {Array.from({ length: n }, (_, k) => (
              <button key={k} onClick={() => put(k + 1)} aria-label={`Put ${k + 1}`}>{k + 1}</button>
            ))}
            <button onClick={() => put(0)} aria-label="Erase"><Eraser size={16} /></button>
          </div>
          <ToolRow>
            <ToolBtn onClick={hint} label="Fill one cell">Hint</ToolBtn>
            <ToolBtn onClick={() => setPaused(true)} label="Pause">Pause</ToolBtn>
            <ToolBtn onClick={() => { if (filledRef.current === 0 || window.confirm("Leave this puzzle and start a new one?")) onNew(); }} label="New puzzle">New puzzle</ToolBtn>
          </ToolRow>
          <p className="mg-meta">Fill each row and column with 1 to {n}, no repeats. The number in each outlined cage is reached by combining its cells with the sign shown.</p>
        </>
      )}
    </>
  );
}

export function GameKenKen({ onExit }) {
  const [n, setN] = useState(4);
  const [seeds, setSeeds] = useState(null);
  useEffect(() => {
    const day = utcDayKey();
    const out = {};
    [4, 5].forEach((k) => {
      const s = readSave(`kenken-${k}`);
      out[k] = s && s.seed ? s.seed : `kk-${k}-${day}`;
    });
    setSeeds(out);
  }, []);
  const rec = gameRecord("kenken");
  const marks = {};
  [4, 5].forEach((k) => { if (rec.done && rec.done[k]) marks[k] = "✓"; });
  function fresh() {
    clearSave(`kenken-${n}`);
    setSeeds((s) => ({ ...s, [n]: `kk-${n}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}` }));
  }
  return (
    <GameFrame eyebrow="Arithmetic and logic" title="KenKen" onExit={onExit}>
      <Segs value={n} onChange={setN} options={[4, 5].map((k) => ({ id: k, label: `${k}×${k}` }))} marks={marks} />
      {seeds ? <KenKenPlay key={`${n}-${seeds[n]}`} n={n} seed={seeds[n]} onNew={fresh} /> : null}
    </GameFrame>
  );
}/* ═══════════════════════════ NONOGRAMS ═══════════════════════════ */
// ==LOGIC-START==
function nonoRuns(line) {
  const out = [];
  let k = 0;
  for (const v of line) {
    if (v === 1) k++;
    else if (k) { out.push(k); k = 0; }
  }
  if (k) out.push(k);
  return out;
}

function nonoClues(grid, n) {
  const rows = [], cols = [];
  for (let r = 0; r < n; r++) rows.push(nonoRuns(grid.slice(r * n, r * n + n)));
  for (let c = 0; c < n; c++) {
    const col = [];
    for (let r = 0; r < n; r++) col.push(grid[r * n + c]);
    cols.push(nonoRuns(col));
  }
  return { rows, cols };
}

// known: -1 unknown, 0 empty, 1 filled. Returns null if impossible.
function nonoSolveLine(blocks, known) {
  const len = known.length;
  const can0 = new Array(len).fill(false);
  const can1 = new Array(len).fill(false);
  const need = new Array(blocks.length + 1).fill(0);
  for (let i = blocks.length - 1; i >= 0; i--) need[i] = blocks[i] + (i < blocks.length - 1 ? 1 + need[i + 1] : 0);
  const starts = [];
  let any = false;
  function finish() {
    const line = new Array(len).fill(0);
    for (let i = 0; i < blocks.length; i++) for (let k = 0; k < blocks[i]; k++) line[starts[i] + k] = 1;
    for (let k = 0; k < len; k++) {
      if (known[k] !== -1 && known[k] !== line[k]) return;
    }
    any = true;
    for (let k = 0; k < len; k++) { if (line[k]) can1[k] = true; else can0[k] = true; }
  }
  function rec(i, pos) {
    if (i === blocks.length) { finish(); return; }
    for (let s = pos; s + need[i] <= len; s++) {
      if (s > pos && known[s - 1] === 1) break;
      starts[i] = s;
      let ok = true;
      for (let k = s; k < s + blocks[i]; k++) if (known[k] === 0) { ok = false; break; }
      if (!ok) continue;
      if (s + blocks[i] < len && known[s + blocks[i]] === 1) continue;
      rec(i + 1, s + blocks[i] + 1);
    }
  }
  rec(0, 0);
  if (!any) return null;
  return known.map((v, k) => (v !== -1 ? v : can1[k] && !can0[k] ? 1 : can0[k] && !can1[k] ? 0 : -1));
}

function nonoSolvable(n, clues) {
  const g = new Array(n * n).fill(-1);
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < n; r++) {
      const cur = g.slice(r * n, r * n + n);
      const res = nonoSolveLine(clues.rows[r], cur);
      if (!res) return false;
      for (let c = 0; c < n; c++) if (res[c] !== cur[c]) { g[r * n + c] = res[c]; changed = true; }
    }
    for (let c = 0; c < n; c++) {
      const cur = [];
      for (let r = 0; r < n; r++) cur.push(g[r * n + c]);
      const res = nonoSolveLine(clues.cols[c], cur);
      if (!res) return false;
      for (let r = 0; r < n; r++) if (res[r] !== cur[r]) { g[r * n + c] = res[r]; changed = true; }
    }
  }
  return g.every((v) => v !== -1);
}

function nonoGenerate(n, seedStr) {
  const rng = seededRng(seedStr);
  const density = n <= 5 ? 0.6 : 0.58;
  let grid = null, clues = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    grid = Array.from({ length: n * n }, () => (rng() < density ? 1 : 0));
    clues = nonoClues(grid, n);
    if (nonoSolvable(n, clues)) break;
  }
  return { n, grid, clues };
}

function sameRuns(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
// ==LOGIC-END==

function NonoPlay({ n, seed, onNew }) {
  const puzzle = useMemo(() => nonoGenerate(n, seed), [n, seed]);
  const saveKey = `nono-${n}`;
  const saved = useMemo(() => {
    const s = readSave(saveKey);
    return s && s.seed === seed && Array.isArray(s.marks) && s.marks.length === n * n ? s : null;
  }, [saveKey, seed, n]);
  const [marks, setMarks] = useState(saved ? saved.marks : new Array(n * n).fill(0));
  const [mode, setMode] = useState("fill");
  const [paused, setPaused] = useState(false);
  const [hints, setHints] = useState(saved ? saved.hints || 0 : 0);
  const wrapRef = useRef(null);
  const gridRef = useRef(null);
  const paintRef = useRef(null);
  const wrapW = useWidth(wrapRef, 320);
  const { rows: rowClues, cols: colClues } = puzzle.clues;
  const maxRow = Math.max(...rowClues.map((c) => Math.max(c.length, 1)));
  const maxCol = Math.max(...colClues.map((c) => Math.max(c.length, 1)));
  const clueW = maxRow * 13 + 12;
  const cs = Math.max(20, Math.min(36, Math.floor((wrapW - clueW - 4) / n)));

  const rowDone = rowClues.map((cl, r) => sameRuns(nonoRuns(marks.slice(r * n, r * n + n).map((v) => (v === 1 ? 1 : 0))), cl));
  const colDone = colClues.map((cl, c) => {
    const col = [];
    for (let r = 0; r < n; r++) col.push(marks[r * n + c] === 1 ? 1 : 0);
    return sameRuns(nonoRuns(col), cl);
  });
  const won = rowDone.every(Boolean) && colDone.every(Boolean);
  const [seconds] = useClock(!paused && !won, saved ? saved.seconds || 0 : 0);
  const secRef = useRef(seconds);
  secRef.current = seconds;
  const markedRef = useRef(0);
  markedRef.current = marks.filter(Boolean).length;
  const wonRef = useRef(false);
  usePauseOnHide(setPaused);

  useEffect(() => {
    if (!won) writeSave(saveKey, { seed, marks, seconds, hints });
  }, [marks, seconds, hints, won, seed, saveKey]);

  useEffect(() => {
    if (!won || wonRef.current) return;
    wonRef.current = true;
    clearSave(saveKey);
    recordGame("nonogram", (g) => {
      g.plays = (g.plays || 0) + 1;
      g.wins = (g.wins || 0) + 1;
      g.done[n] = true;
      if (!hints && (!g.bestBy[n] || secRef.current < g.bestBy[n])) g.bestBy[n] = secRef.current;
    });
  }, [won]); // eslint-disable-line react-hooks/exhaustive-deps

  useOnLeave(() => { if (!wonRef.current && markedRef.current > 0) touchToday(); });

  function cellAt(e) {
    const el = gridRef.current;
    if (!el) return -1;
    const b = el.getBoundingClientRect();
    const x = e.clientX - b.left, y = e.clientY - b.top;
    const c = Math.floor(x / (b.width / n)), r = Math.floor(y / (b.height / n));
    if (c < 0 || r < 0 || c >= n || r >= n) return -1;
    return r * n + c;
  }
  function apply(i, val) {
    setMarks((cur) => {
      if (cur[i] === val) return cur;
      const nx = cur.slice();
      nx[i] = val;
      return nx;
    });
  }
  function down(e) {
    if (paused || won) return;
    const i = cellAt(e);
    if (i < 0) return;
    const target = mode === "fill" ? 1 : 2;
    const val = marks[i] === target ? 0 : target;
    paintRef.current = { val, target };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    apply(i, val);
  }
  function move(e) {
    const p = paintRef.current;
    if (!p) return;
    const i = cellAt(e);
    if (i < 0) return;
    // Do not overwrite the other kind of mark while dragging.
    const curV = marks[i];
    if (p.val === 0 ? curV === p.target : curV === 0) apply(i, p.val);
  }
  function up() { paintRef.current = null; }

  function hint() {
    if (paused || won) return;
    const wrong = [];
    for (let i = 0; i < n * n; i++) {
      if ((marks[i] === 1) !== (puzzle.grid[i] === 1)) wrong.push(i);
    }
    if (!wrong.length) return;
    const i = wrong[Math.floor(Math.random() * wrong.length)];
    apply(i, puzzle.grid[i] === 1 ? 1 : 2);
    setHints((h) => h + 1);
  }

  return (
    <>
      <div className="mg-sbar">
        <span className="mg-stime">{formatTime(seconds)}{paused ? " · paused" : ""}</span>
        <span className="mg-meta" style={{ margin: 0 }}>{won ? "Solved" : `${rowDone.filter(Boolean).length + colDone.filter(Boolean).length}/${2 * n} lines match`}</span>
      </div>
      <div className="mg-boardwrap" ref={wrapRef}>
        <div className="mg-nono" style={{ "--cs": `${cs}px`, visibility: paused ? "hidden" : "visible" }}>
          <div className="mg-nono-top">
            <span style={{ width: clueW, flex: "none" }} />
            <div className="mg-nono-cols" style={{ gridTemplateColumns: `repeat(${n}, ${cs}px)`, minHeight: maxCol * 13 + 6 }}>
              {colClues.map((cl, c) => (
                <div key={c} className={`mg-nclue col ${colDone[c] ? "done" : ""}`}>
                  {(cl.length ? cl : [0]).map((v, k) => <span key={k}>{v}</span>)}
                </div>
              ))}
            </div>
          </div>
          <div className="mg-nono-main">
            <div className="mg-nono-rows" style={{ width: clueW, gridTemplateRows: `repeat(${n}, ${cs}px)` }}>
              {rowClues.map((cl, r) => (
                <div key={r} className={`mg-nclue row ${rowDone[r] ? "done" : ""}`}>
                  {(cl.length ? cl : [0]).map((v, k) => <span key={k}>{v}</span>)}
                </div>
              ))}
            </div>
            <div
              className="mg-nono-grid"
              ref={gridRef}
              style={{ gridTemplateColumns: `repeat(${n}, ${cs}px)`, gridTemplateRows: `repeat(${n}, ${cs}px)` }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              role="grid"
              aria-label="Nonogram board"
            >
              {marks.map((v, i) => {
                const r = (i / n) | 0, c = i % n;
                const g5 = n > 5 && ((c + 1) % 5 === 0 && c < n - 1 ? "gr " : "") + ((r + 1) % 5 === 0 && r < n - 1 ? "gb" : "");
                return (
                  <div key={i} role="gridcell" className={`mg-ncell ${v === 1 ? "on" : ""} ${v === 2 ? "x" : ""} ${g5 || ""}`}>
                    {v === 2 ? "×" : ""}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {paused && !won && <PauseCover onResume={() => setPaused(false)} />}
      </div>

      {won ? (
        <>
          <SolvedBanner title={`Solved in ${formatTime(seconds)}${hints ? ` with ${hints} hint${hints === 1 ? "" : "s"}` : ""}.`} text="The picture is complete." />
          <ToolRow><ToolBtn onClick={onNew} label="New puzzle"><RotateCw size={15} /> New puzzle</ToolBtn></ToolRow>
        </>
      ) : (
        <>
          <ToolRow>
            <ToolBtn on={mode === "fill"} onClick={() => setMode("fill")} label="Fill squares">■ Fill</ToolBtn>
            <ToolBtn on={mode === "x"} onClick={() => setMode("x")} label="Mark empty squares">× Mark empty</ToolBtn>
            <ToolBtn onClick={hint} label="Fix one square">Hint</ToolBtn>
            <ToolBtn onClick={() => setPaused(true)} label="Pause">Pause</ToolBtn>
            <ToolBtn onClick={() => { if (markedRef.current === 0 || window.confirm("Leave this puzzle and start a new one?")) onNew(); }} label="New puzzle">New puzzle</ToolBtn>
          </ToolRow>
          <p className="mg-meta">Each number is a run of filled squares in that row or column, in order, with at least one gap between runs. Drag to fill several squares. A clue turns grey when its line matches.</p>
        </>
      )}
    </>
  );
}

export function GameNonogram({ onExit }) {
  const [n, setN] = useState(5);
  const [seeds, setSeeds] = useState(null);
  useEffect(() => {
    const day = utcDayKey();
    const out = {};
    [5, 8, 10].forEach((k) => {
      const s = readSave(`nono-${k}`);
      out[k] = s && s.seed ? s.seed : `nono-${k}-${day}`;
    });
    setSeeds(out);
  }, []);
  const rec = gameRecord("nonogram");
  const marks = {};
  [5, 8, 10].forEach((k) => { if (rec.done && rec.done[k]) marks[k] = "✓"; });
  function fresh() {
    clearSave(`nono-${n}`);
    setSeeds((s) => ({ ...s, [n]: `nono-${n}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}` }));
  }
  return (
    <GameFrame eyebrow="Pattern deduction" title="Nonograms" onExit={onExit}>
      <Segs value={n} onChange={setN} options={[5, 8, 10].map((k) => ({ id: k, label: `${k}×${k}` }))} marks={marks} />
      {seeds ? <NonoPlay key={`${n}-${seeds[n]}`} n={n} seed={seeds[n]} onNew={fresh} /> : null}
    </GameFrame>
  );
}

/* ═══════════════════════════ CHECKERS ═══════════════════════════ */
// ==LOGIC-START==
// Board: 64 cells, row * 8 + column. 1 = your man, 2 = your king, -1 / -2 = computer.
// You start at the bottom and move up. Captures are compulsory. Kings move one square.
function ckStart() {
  const b = new Array(64).fill(0);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 !== 1) continue;
      if (r < 3) b[r * 8 + c] = -1;
      else if (r > 4) b[r * 8 + c] = 1;
    }
  }
  return b;
}

function ckDirs(p) {
  if (Math.abs(p) === 2) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return p > 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function ckJumps(b, pos, piece, path, caps, out) {
  const r = (pos / 8) | 0, c = pos % 8;
  let extended = false;
  for (const [dr, dc] of ckDirs(piece)) {
    const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
    if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;
    const mi = mr * 8 + mc, li = lr * 8 + lc;
    const mid = b[mi];
    if (mid === 0 || (mid > 0) === (piece > 0) || b[li] !== 0) continue;
    extended = true;
    b[mi] = 0;
    const crowned = Math.abs(piece) === 1 && (piece > 0 ? lr === 0 : lr === 7);
    path.push(li);
    caps.push(mi);
    if (crowned) out.push({ path: path.slice(), caps: caps.slice() });
    else ckJumps(b, li, piece, path, caps, out);
    path.pop();
    caps.pop();
    b[mi] = mid;
  }
  if (!extended && path.length > 1) out.push({ path: path.slice(), caps: caps.slice() });
}

function ckMoves(b, side) {
  const jumps = [];
  const steps = [];
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || (p > 0) !== (side > 0)) continue;
    b[i] = 0;
    ckJumps(b, i, p, [i], [], jumps);
    b[i] = p;
    if (jumps.length) continue;
    const r = (i / 8) | 0, c = i % 8;
    for (const [dr, dc] of ckDirs(p)) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      if (b[nr * 8 + nc] === 0) steps.push({ path: [i, nr * 8 + nc], caps: [] });
    }
  }
  return jumps.length ? jumps : steps;
}

function ckApply(b, m) {
  const n = b.slice();
  const from = m.path[0];
  const to = m.path[m.path.length - 1];
  const p = n[from];
  n[from] = 0;
  for (const x of m.caps) n[x] = 0;
  const row = (to / 8) | 0;
  n[to] = Math.abs(p) === 1 && (p > 0 ? row === 0 : row === 7) ? p * 2 : p;
  return n;
}

function ckPerft(b, side, depth) {
  if (depth === 0) return 1;
  let t = 0;
  for (const m of ckMoves(b, side)) t += ckPerft(ckApply(b, m), -side, depth - 1);
  return t;
}

function ckEval(b) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (!v) continue;
    const r = (i / 8) | 0, c = i % 8;
    let val = Math.abs(v) === 1 ? 100 + (v > 0 ? 7 - r : r) * 4 : 175;
    val += (3.5 - Math.abs(c - 3.5)) * 1.5;
    s += v > 0 ? val : -val;
  }
  return s;
}

function ckSearch(b, side, depth, alpha, beta, ext) {
  const ms = ckMoves(b, side);
  if (!ms.length) return -100000 - depth;
  if (depth <= 0) {
    if (!(ms[0].caps.length && ext < 4)) return side * ckEval(b);
    depth = 1;
    ext++;
  }
  let best = -Infinity;
  for (const m of ms) {
    const sc = -ckSearch(ckApply(b, m), -side, depth - 1, -beta, -alpha, ext);
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function ckBest(b, side, depth, rng, sloppy) {
  const ms = shuffle(ckMoves(b, side), rng);
  if (!ms.length) return null;
  if (sloppy && rng() < sloppy) return ms[0];
  let best = ms[0];
  let bs = -Infinity;
  for (const m of ms) {
    const sc = -ckSearch(ckApply(b, m), -side, depth - 1, -Infinity, -bs, 0);
    if (sc > bs) { bs = sc; best = m; }
  }
  return best;
}
// ==LOGIC-END==

const CK_LEVELS = {
  easy: { depth: 2, sloppy: 0.3, label: "Easy" },
  medium: { depth: 5, sloppy: 0, label: "Medium" },
  hard: { depth: 8, sloppy: 0, label: "Hard" },
};

function CheckersPlay({ level }) {
  const saveKey = `checkers-${level}`;
  const saved = useMemo(() => {
    const s = readSave(saveKey);
    return s && Array.isArray(s.board) && s.board.length === 64 ? s : null;
  }, [saveKey]);
  const [board, setBoard] = useState(saved ? saved.board : ckStart());
  const [turn, setTurn] = useState(saved ? saved.turn : 1);
  const [quiet, setQuiet] = useState(saved ? saved.quiet || 0 : 0);
  const [hist, setHist] = useState(saved && Array.isArray(saved.hist) ? saved.hist : []);
  const [last, setLast] = useState(saved && Array.isArray(saved.last) ? saved.last : []);
  const [from, setFrom] = useState(-1);
  const [prefix, setPrefix] = useState([]);
  const [paused, setPaused] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [plies, setPlies] = useState(saved ? saved.plies || 0 : 0);
  const [note, setNote] = useState("");
  const recRef = useRef(false);
  const pliesRef = useRef(plies);
  pliesRef.current = plies;
  usePauseOnHide(setPaused);

  const myMoves = useMemo(() => (turn === 1 ? ckMoves(board, 1) : []), [board, turn]);
  const over = useMemo(() => {
    if (quiet >= 80) return "draw";
    if (turn === 1 && !myMoves.length) return "loss";
    if (turn === -1 && !ckMoves(board, -1).length) return "win";
    return null;
  }, [board, turn, quiet, myMoves]);

  useEffect(() => {
    if (!over) writeSave(saveKey, { board, turn, quiet, hist: hist.slice(-12), last, plies });
  }, [board, turn, quiet, hist, last, plies, over, saveKey]);

  useEffect(() => {
    if (!over || recRef.current) return;
    recRef.current = true;
    clearSave(saveKey);
    recordGame("checkers", (g) => {
      g.plays = (g.plays || 0) + 1;
      if (over === "win") { g.wins = (g.wins || 0) + 1; g.done[level] = true; }
    });
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps

  useOnLeave(() => { if (!recRef.current && pliesRef.current > 0) touchToday(); });

  // The computer's turn.
  useEffect(() => {
    if (turn !== -1 || over || paused) return undefined;
    setThinking(true);
    const t = setTimeout(() => {
      const cfg = CK_LEVELS[level];
      const m = ckBest(board, -1, cfg.depth, Math.random, cfg.sloppy);
      setThinking(false);
      if (!m) return;
      const mover = board[m.path[0]];
      const quietMove = !m.caps.length && Math.abs(mover) === 2;
      setBoard(ckApply(board, m));
      setLast(m.path);
      setQuiet((q) => (quietMove ? q + 1 : 0));
      setPlies((p) => p + 1);
      setTurn(1);
    }, 450);
    return () => { clearTimeout(t); setThinking(false); };
  }, [turn, over, paused, board, level]);

  const targets = useMemo(() => {
    if (from < 0) return new Set();
    const set = new Set();
    for (const m of myMoves) {
      if (m.path[0] !== from) continue;
      let ok = true;
      for (let k = 0; k < prefix.length; k++) if (m.path[k + 1] !== prefix[k]) { ok = false; break; }
      if (ok && m.path.length > prefix.length + 1) set.add(m.path[prefix.length + 1]);
    }
    return set;
  }, [from, prefix, myMoves]);

  const movable = useMemo(() => new Set(myMoves.map((m) => m.path[0])), [myMoves]);

  function tap(i) {
    if (paused || over || turn !== 1 || thinking) return;
    if (from < 0 || (prefix.length === 0 && movable.has(i))) {
      if (movable.has(i)) { setFrom(i === from ? -1 : i); setPrefix([]); setNote(""); }
      else if (board[i] > 0) setNote(mustJump ? "A capture is compulsory. Pick a piece that can jump." : "That piece can't move right now.");
      return;
    }
    if (!targets.has(i)) {
      setNote(prefix.length ? "Keep jumping: tap the next highlighted square." : "Tap a highlighted square to move there.");
      if (prefix.length === 0) setFrom(-1);
      return;
    }
    setNote("");
    const nextPrefix = [...prefix, i];
    const full = myMoves.filter((m) => {
      if (m.path[0] !== from) return false;
      for (let k = 0; k < nextPrefix.length; k++) if (m.path[k + 1] !== nextPrefix[k]) return false;
      return true;
    });
    const done = full.find((m) => m.path.length === nextPrefix.length + 1);
    if (done) {
      const mover = board[done.path[0]];
      setHist((h) => [...h, { board, quiet, last, plies }]);
      setBoard(ckApply(board, done));
      setLast(done.path);
      setQuiet(done.caps.length || Math.abs(mover) === 1 ? 0 : quiet + 1);
      setPlies((p) => p + 1);
      setFrom(-1);
      setPrefix([]);
      setTurn(-1);
    } else {
      setPrefix(nextPrefix);
    }
  }

  function undo() {
    if (!hist.length || thinking || over) return;
    const h = hist[hist.length - 1];
    setBoard(h.board);
    setQuiet(h.quiet);
    setLast(h.last);
    setPlies(h.plies);
    setHist((x) => x.slice(0, -1));
    setTurn(1);
    setFrom(-1);
    setPrefix([]);
    setNote("");
  }

  function restart() {
    recRef.current = false;
    setNote("");
    setBoard(ckStart());
    setTurn(1);
    setQuiet(0);
    setHist([]);
    setLast([]);
    setPlies(0);
    setFrom(-1);
    setPrefix([]);
  }

  const mine = board.filter((v) => v > 0).length;
  const theirs = board.filter((v) => v < 0).length;
  const mustJump = myMoves.length > 0 && myMoves[0].caps.length > 0;

  return (
    <>
      <div className="mg-scorebar">
        <div><span>You</span><b>{mine}</b></div>
        <div><span>Turn</span><b>{over ? "Game over" : thinking ? "Thinking…" : turn === 1 ? "Your move" : "Computer"}</b></div>
        <div><span>Computer</span><b>{theirs}</b></div>
      </div>
      <div className="mg-boardwrap">
        <div className="mg-ck" style={{ visibility: paused ? "hidden" : "visible" }} role="grid" aria-label="Checkers board">
          {board.map((v, i) => {
            const r = (i / 8) | 0, c = i % 8;
            const dark = (r + c) % 2 === 1;
            const isLast = last.includes(i);
            const isTarget = targets.has(i);
            return (
              <button
                key={i}
                role="gridcell"
                disabled={!dark}
                className={`mg-ckc ${dark ? "dk" : "lt"} ${isLast ? "last" : ""} ${isTarget ? "tgt" : ""} ${from === i ? "pick" : ""}`}
                onClick={() => tap(i)}
                aria-label={`Row ${r + 1}, column ${c + 1}${v ? (v > 0 ? ", your piece" : ", computer piece") : ""}${Math.abs(v) === 2 ? " king" : ""}`}
              >
                {v ? (
                  <span className={`mg-chk ${v > 0 ? "me" : "cpu"} ${movable.has(i) && turn === 1 && !over ? "can" : ""}`}>
                    {Math.abs(v) === 2 ? <Crown size={16} strokeWidth={2.4} /> : null}
                  </span>
                ) : null}
                {isTarget ? <span className="mg-dot" /> : null}
              </button>
            );
          })}
        </div>
        {paused && !over && <PauseCover onResume={() => setPaused(false)} text="The board is hidden while paused." />}
      </div>

      {over ? (
        <>
          <SolvedBanner
            title={over === "win" ? "You win." : over === "loss" ? "The computer wins this one." : "A draw."}
            text={over === "win" ? "Try the next level up." : over === "loss" ? "Start a new game to try again." : "Neither side could make progress."}
          />
          <ToolRow>
            <ToolBtn onClick={restart} label="Play again"><RotateCw size={15} /> Play again</ToolBtn>
          </ToolRow>
        </>
      ) : (
        <>
          <ToolRow>
            <ToolBtn onClick={undo} disabled={!hist.length || thinking} label="Take back your last move"><RotateCcw size={15} /> Take back</ToolBtn>
            <ToolBtn onClick={() => setPaused(true)} label="Pause">Pause</ToolBtn>
            <ToolBtn onClick={() => { if (plies === 0 || window.confirm("Start a new game? This one will be lost.")) restart(); }} label="New game">New game</ToolBtn>
          </ToolRow>
          <p className="mg-meta">
            {note ? note : (
              <>
                {mustJump ? "You must capture this turn. " : ""}
                Tap a piece, then a highlighted square. Jump over a computer piece to capture it. Reach the far row to make a king.
              </>
            )}
          </p>
        </>
      )}
    </>
  );
}

export function GameCheckers({ onExit }) {
  const [level, setLevel] = useState("easy");
  const rec = gameRecord("checkers");
  const marks = {};
  Object.keys(CK_LEVELS).forEach((k) => { if (rec.done && rec.done[k]) marks[k] = "✓"; });
  return (
    <GameFrame eyebrow="Plan ahead" title="Checkers" onExit={onExit}>
      <Segs value={level} onChange={setLevel} options={Object.keys(CK_LEVELS).map((k) => ({ id: k, label: CK_LEVELS[k].label }))} marks={marks} />
      <CheckersPlay key={level} level={level} />
    </GameFrame>
  );
}/* ═══════════════════════════ CHESS ═══════════════════════════ */
// ==LOGIC-START==
// Board: 64 cells, row * 8 + column, row 0 is the computer's back rank.
// 1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king. Positive = you (white), negative = computer.
const CH_N = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const CH_K = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const CH_B = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const CH_R = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const CH_VAL = [0, 100, 320, 330, 500, 900, 0];

function chStart() {
  const b = new Array(64).fill(0);
  const back = [4, 2, 3, 5, 6, 3, 2, 4];
  for (let c = 0; c < 8; c++) {
    b[c] = -back[c];
    b[8 + c] = -1;
    b[48 + c] = 1;
    b[56 + c] = back[c];
  }
  return { b, turn: 1, cas: [true, true, true, true], ep: -1, half: 0 };
}

function chAttacked(b, sq, by) {
  const r = (sq / 8) | 0, c = sq % 8;
  const pr = r + by;
  if (pr >= 0 && pr < 8) {
    if (c > 0 && b[pr * 8 + c - 1] === by) return true;
    if (c < 7 && b[pr * 8 + c + 1] === by) return true;
  }
  for (const [dr, dc] of CH_N) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === 2 * by) return true;
  }
  for (const [dr, dc] of CH_K) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === 6 * by) return true;
  }
  for (const [dr, dc] of CH_B) {
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      const v = b[rr * 8 + cc];
      if (v) { if (v === 3 * by || v === 5 * by) return true; break; }
      rr += dr; cc += dc;
    }
  }
  for (const [dr, dc] of CH_R) {
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      const v = b[rr * 8 + cc];
      if (v) { if (v === 4 * by || v === 5 * by) return true; break; }
      rr += dr; cc += dc;
    }
  }
  return false;
}

function chKingSq(b, side) { return b.indexOf(6 * side); }
function chInCheck(b, side) { return chAttacked(b, chKingSq(b, side), -side); }

function chPseudo(st) {
  const { b, turn: side, cas, ep } = st;
  const out = [];
  const add = (from, to, flag, promo) => out.push({ from, to, flag: flag || "", promo: promo || 0 });
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || (p > 0) !== (side > 0)) continue;
    const t = Math.abs(p), r = (i / 8) | 0, c = i % 8;
    if (t === 1) {
      const dir = side > 0 ? -1 : 1, start = side > 0 ? 6 : 1, last = side > 0 ? 0 : 7;
      const nr = r + dir;
      if (nr < 0 || nr > 7) continue;
      if (!b[nr * 8 + c]) {
        if (nr === last) for (const pr of [5, 4, 3, 2]) add(i, nr * 8 + c, "", pr);
        else {
          add(i, nr * 8 + c);
          if (r === start && !b[(r + 2 * dir) * 8 + c]) add(i, (r + 2 * dir) * 8 + c, "dbl");
        }
      }
      for (const dc of [-1, 1]) {
        const cc = c + dc;
        if (cc < 0 || cc > 7) continue;
        const to = nr * 8 + cc, v = b[to];
        if (v && (v > 0) !== (side > 0)) {
          if (nr === last) for (const pr of [5, 4, 3, 2]) add(i, to, "", pr);
          else add(i, to);
        } else if (!v && to === ep) add(i, to, "ep");
      }
    } else if (t === 2 || t === 6) {
      for (const [dr, dc] of t === 2 ? CH_N : CH_K) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
        const v = b[rr * 8 + cc];
        if (!v || (v > 0) !== (side > 0)) add(i, rr * 8 + cc);
      }
      if (t === 6) {
        const home = side > 0 ? 60 : 4;
        if (i === home && !chAttacked(b, i, -side)) {
          const k = side > 0 ? 0 : 2;
          if (cas[k] && !b[i + 1] && !b[i + 2] && b[i + 3] === 4 * side && !chAttacked(b, i + 1, -side)) add(i, i + 2, "ck");
          if (cas[k + 1] && !b[i - 1] && !b[i - 2] && !b[i - 3] && b[i - 4] === 4 * side && !chAttacked(b, i - 1, -side)) add(i, i - 2, "cq");
        }
      }
    } else {
      const dirs = t === 3 ? CH_B : t === 4 ? CH_R : CH_B.concat(CH_R);
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
          const v = b[rr * 8 + cc];
          if (!v) add(i, rr * 8 + cc);
          else { if ((v > 0) !== (side > 0)) add(i, rr * 8 + cc); break; }
          rr += dr; cc += dc;
        }
      }
    }
  }
  return out;
}

function chApply(st, m) {
  const b = st.b.slice();
  const p = b[m.from];
  const side = p > 0 ? 1 : -1;
  const cap = b[m.to];
  b[m.to] = m.promo ? side * m.promo : p;
  b[m.from] = 0;
  if (m.flag === "ep") b[((m.from / 8) | 0) * 8 + (m.to % 8)] = 0;
  else if (m.flag === "ck") { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = 0; }
  else if (m.flag === "cq") { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = 0; }
  const cas = st.cas.slice();
  if (Math.abs(p) === 6) { if (side > 0) { cas[0] = false; cas[1] = false; } else { cas[2] = false; cas[3] = false; } }
  for (const sq of [m.from, m.to]) {
    if (sq === 63) cas[0] = false;
    else if (sq === 56) cas[1] = false;
    else if (sq === 7) cas[2] = false;
    else if (sq === 0) cas[3] = false;
  }
  return {
    b,
    turn: -st.turn,
    cas,
    ep: m.flag === "dbl" ? (m.from + m.to) / 2 : -1,
    half: Math.abs(p) === 1 || cap ? 0 : st.half + 1,
  };
}

function chLegal(st) {
  const side = st.turn;
  const out = [];
  for (const m of chPseudo(st)) {
    const nx = chApply(st, m);
    if (!chInCheck(nx.b, side)) out.push(m);
  }
  return out;
}

function chKey(st) { return st.b.join(",") + "|" + st.turn + st.cas.map((x) => (x ? 1 : 0)).join("") + st.ep; }

function chInsufficient(b) {
  const minors = [];
  for (const v of b) {
    const t = Math.abs(v);
    if (!t || t === 6) continue;
    if (t === 2 || t === 3) minors.push(t);
    else return false;
  }
  return minors.length <= 1;
}

// keys: positions since the last pawn move or capture, including the current one.
function chStatus(st, legal, keys) {
  const check = chInCheck(st.b, st.turn);
  if (!legal.length) return check ? "mate" : "stalemate";
  if (st.half >= 100) return "draw50";
  if (chInsufficient(st.b)) return "insufficient";
  if (keys) {
    const k = chKey(st);
    let n = 0;
    for (const x of keys) if (x === k) n++;
    if (n >= 3) return "repeat";
  }
  return check ? "check" : "ok";
}

function chEval(b) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (!v) continue;
    const t = Math.abs(v), r = (i / 8) | 0, c = i % 8, side = v > 0 ? 1 : -1;
    let val = CH_VAL[t];
    const centre = 7 - (Math.abs(r - 3.5) + Math.abs(c - 3.5));
    if (t === 1) val += (side > 0 ? 6 - r : r - 1) * 7 + (c > 1 && c < 6 ? 4 : 0);
    else if (t === 2 || t === 3) val += centre * 5;
    else if (t === 5) val += centre * 1.5;
    s += side * val;
  }
  return s;
}

function chOrder(b, moves) {
  return moves
    .map((m) => ({ m, k: (b[m.to] ? 10 * Math.abs(b[m.to]) - Math.abs(b[m.from]) : 0) + (m.promo ? 8 : 0) }))
    .sort((x, y) => y.k - x.k)
    .map((x) => x.m);
}

function chQuiesce(st, alpha, beta, depth) {
  if (chTimeUp()) return 0;
  const stand = st.turn * chEval(st.b);
  if (depth <= 0) return stand;
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  const caps = chOrder(st.b, chPseudo(st).filter((m) => st.b[m.to] || m.flag === "ep"));
  for (const m of caps) {
    const nx = chApply(st, m);
    if (chInCheck(nx.b, st.turn)) continue;
    const sc = -chQuiesce(nx, -beta, -alpha, depth - 1);
    if (sc >= beta) return sc;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

// Thinking-time limit, so the computer never freezes a slow phone. When time runs out it
// plays the best move from the last depth it finished. It still follows the same rules and
// sees exactly the same board as you.
let chDeadline = 0;
let chAborted = false;
let chNodes = 0;
function chTimeUp() {
  if (chAborted) return true;
  if (chDeadline && (++chNodes & 1023) === 0 && Date.now() > chDeadline) chAborted = true;
  return chAborted;
}

function chSearch(st, depth, alpha, beta, ply) {
  if (chTimeUp()) return 0;
  if (depth <= 0) return chQuiesce(st, alpha, beta, 4);
  const moves = chLegal(st);
  if (!moves.length) return chInCheck(st.b, st.turn) ? -99000 + ply : 0;
  let best = -Infinity;
  for (const m of chOrder(st.b, moves)) {
    const sc = -chSearch(chApply(st, m), depth - 1, -beta, -alpha, ply + 1);
    if (chAborted) return 0;
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function chBest(st, depth, rng, sloppy, maxMs) {
  const moves = shuffle(chLegal(st), rng);
  if (!moves.length) return null;
  if (sloppy && rng() < sloppy) return moves[0];
  let best = moves[0];
  let ordered = chOrder(st.b, moves);
  chDeadline = maxMs ? Date.now() + maxMs : 0;
  chAborted = false;
  chNodes = 0;
  for (let d = 1; d <= depth; d++) {
    let roundBest = ordered[0], bs = -Infinity;
    const scored = [];
    for (const m of ordered) {
      const sc = -chSearch(chApply(st, m), d - 1, -Infinity, -bs, 1);
      if (chAborted) break;
      scored.push({ m, sc });
      if (sc > bs) { bs = sc; roundBest = m; }
    }
    if (chAborted) break; // keep the move from the last depth that finished
    best = roundBest;
    ordered = scored.sort((a, b) => b.sc - a.sc).map((x) => x.m);
  }
  chDeadline = 0;
  chAborted = false;
  return best;
}

function chPerft(st, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of chLegal(st)) n += chPerft(chApply(st, m), depth - 1);
  return n;
}
// ==LOGIC-END==

const CH_ART = {
  1: "<circle cx='22.5' cy='13.5' r='5.2'/><path d='M22.5 19.5c-4 0-6.6 3-6.6 6.4 0 3 1.6 5 2.9 6.6h-5.3c-1.4 0-2.5 1.1-2.5 2.5V38h23v-2c0-1.4-1.1-2.5-2.5-2.5h-5.3c1.3-1.6 2.9-3.6 2.9-6.6 0-3.4-2.6-6.4-6.6-6.4z'/>",
  4: "<path d='M11 38h23v-4.5H11z'/><path d='M14 33.5l1.2-15h14.6l1.2 15z'/><path d='M12.5 18.5V8.5h5v3h3.3v-3h3.4v3h3.3v-3h5v10z'/>",
  3: "<circle cx='22.5' cy='8.6' r='2.8'/><path d='M22.5 12.5c-6.2 3.8-9 8.6-9 13.2 0 2.6 1.2 4.6 3 6.2h12c1.8-1.6 3-3.6 3-6.2 0-4.6-2.8-9.4-9-13.2z'/><path d='M12 33.5h21V38H12z'/>",
  5: "<path d='M9.5 14l4.8 15.5 3.6-14.8 4.6 14.8 4.6-14.8 3.6 14.8L35.5 14l-2.4 22h-20.7z'/><circle cx='9.5' cy='12.5' r='2.3'/><circle cx='16.8' cy='9.5' r='2.3'/><circle cx='22.5' cy='8.3' r='2.3'/><circle cx='28.2' cy='9.5' r='2.3'/><circle cx='35.5' cy='12.5' r='2.3'/><path d='M11.5 36h22v3h-22z'/>",
  6: "<path d='M21 3.5h3V7h3.5v3H24v3.5h-3V10h-3.5V7H21z'/><path d='M22.5 14c-7.5 0-12.5 5-10.4 13.4.8 3 2.4 5 4 6.6h12.8c1.6-1.6 3.2-3.6 4-6.6C35 19 30 14 22.5 14z'/><path d='M11 35h23v4H11z'/>",
  2: "<path d='M12.5 38c0-9.5 3.8-12.6 6.6-16-2.6.6-5 2.6-6.6 5.4-1.4-.4-3-1.6-3.4-3.8 1.4-3.8 5-8.4 8.4-11.4 1.2-1.2 2.2-2.2 2.2-4.4 1.4.6 2.6 1.6 3.2 2.8 6 .6 12.2 5.2 13.2 15.2.5 5.6-.4 10.4-.4 14.2z'/><circle cx='20.5' cy='14.5' r='1.3' fill='#1a0838' stroke='none'/>",
};

const CH_LEVELS = {
  easy: { depth: 2, sloppy: 0.35, ms: 1000, label: "Easy" },
  medium: { depth: 3, sloppy: 0, ms: 1800, label: "Medium" },
  hard: { depth: 4, sloppy: 0, ms: 2500, label: "Hard" },
  two: { depth: 0, sloppy: 0, ms: 0, label: "2 players" },
};
const CH_NAMES = { 2: "Knight", 3: "Bishop", 4: "Rook", 5: "Queen" };

function ChessDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="mgc-w" x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#b98cf0" />
        </linearGradient>
        <linearGradient id="mgc-b" x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#a283d4" />
          <stop offset="1" stopColor="#2a1250" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ChessPiece({ v }) {
  const white = v > 0;
  const t = Math.abs(v);
  const inner = white ? CH_ART[t] : CH_ART[t].replace("#1a0838", "#ffffff");
  return (
    <svg viewBox="0 0 45 45" className="mg-cp" aria-hidden="true">
      <g
        fill={white ? "url(#mgc-w)" : "url(#mgc-b)"}
        stroke={white ? "#3a1a66" : "#12002e"}
        strokeWidth="1.3"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: inner }}
      />
    </svg>
  );
}

function ChessPlay({ level }) {
  const saveKey = `chess-${level}`;
  const two = level === "two"; // two people on one phone
  const saved = useMemo(() => {
    const s = readSave(saveKey);
    return s && s.st && Array.isArray(s.st.b) && s.st.b.length === 64 ? s : null;
  }, [saveKey]);
  const [st, setSt] = useState(saved ? saved.st : chStart());
  const [keys, setKeys] = useState(saved && Array.isArray(saved.keys) ? saved.keys : [chKey(chStart())]);
  const [hist, setHist] = useState(saved && Array.isArray(saved.hist) ? saved.hist : []);
  const [last, setLast] = useState(saved && Array.isArray(saved.last) ? saved.last : []);
  const [plies, setPlies] = useState(saved ? saved.plies || 0 : 0);
  const [sel, setSel] = useState(-1);
  const [promo, setPromo] = useState(null);
  const [paused, setPaused] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [flip, setFlip] = useState(false);
  const [note, setNote] = useState("");
  const recRef = useRef(false);
  const pliesRef = useRef(plies);
  pliesRef.current = plies;
  usePauseOnHide(setPaused);

  const legal = useMemo(() => chLegal(st), [st]);
  const status = useMemo(() => chStatus(st, legal, keys), [st, legal, keys]);
  const over = status === "mate" || status === "stalemate" || status === "draw50" || status === "insufficient" || status === "repeat";
  const inCheck = status === "check" || status === "mate";
  const kingAt = inCheck ? chKingSq(st.b, st.turn) : -1;

  useEffect(() => {
    if (!over) writeSave(saveKey, { st, keys: keys.slice(-120), hist: hist.slice(-10), last, plies });
  }, [st, keys, hist, last, plies, over, saveKey]);

  useEffect(() => {
    if (!over || recRef.current) return;
    recRef.current = true;
    clearSave(saveKey);
    const won = !two && status === "mate" && st.turn === -1;
    recordGame("chess", (g) => {
      g.plays = (g.plays || 0) + 1;
      if (won) { g.wins = (g.wins || 0) + 1; g.done[level] = true; }
    });
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps

  useOnLeave(() => { if (!recRef.current && pliesRef.current > 0) touchToday(); });

  function play(m, record) {
    const nx = chApply(st, m);
    if (record) setHist((h) => [...h, { st, keys, last, plies }]);
    setKeys(nx.half === 0 ? [chKey(nx)] : [...keys, chKey(nx)]);
    setSt(nx);
    setLast([m.from, m.to]);
    setPlies((p) => p + 1);
    setSel(-1);
    setPromo(null);
    setNote("");
  }

  // The computer's turn.
  useEffect(() => {
    if (two || st.turn !== -1 || over || paused) return undefined;
    setThinking(true);
    const t = setTimeout(() => {
      const cfg = CH_LEVELS[level];
      const m = chBest(st, cfg.depth, Math.random, cfg.sloppy, cfg.ms);
      setThinking(false);
      if (m) play(m, false);
    }, 450);
    return () => { clearTimeout(t); setThinking(false); };
  }, [st, over, paused, level, two]); // eslint-disable-line react-hooks/exhaustive-deps

  const targets = useMemo(() => {
    const set = new Set();
    if (sel >= 0) for (const m of legal) if (m.from === sel) set.add(m.to);
    return set;
  }, [sel, legal]);

  function tap(i) {
    if (paused || over || (!two && st.turn !== 1) || thinking || promo) return;
    const v = st.b[i];
    if (sel >= 0 && targets.has(i)) {
      const ms = legal.filter((m) => m.from === sel && m.to === i);
      if (ms.length > 1) setPromo(ms);
      else play(ms[0], true);
      return;
    }
    if (v && (v > 0) === (st.turn > 0)) {
      if (legal.some((m) => m.from === i)) { setSel(i === sel ? -1 : i); setNote(""); }
      else {
        setSel(-1);
        setNote(inCheck
          ? "You are in check. Move your king, block the attack, or capture the checking piece."
          : "That piece has no legal move right now. It may be blocked, or moving it would expose your king.");
      }
      return;
    }
    if (sel >= 0) setNote("You can't move there. Tap a marked square, or pick another piece.");
    setSel(-1);
  }

  function undo() {
    if (!hist.length || thinking || over) return;
    const h = hist[hist.length - 1];
    setSt(h.st);
    setKeys(h.keys);
    setLast(h.last);
    setPlies(h.plies);
    setHist((x) => x.slice(0, -1));
    setSel(-1);
    setPromo(null);
    setNote("");
  }

  function restart() {
    recRef.current = false;
    const s0 = chStart();
    setSt(s0);
    setKeys([chKey(s0)]);
    setHist([]);
    setLast([]);
    setPlies(0);
    setSel(-1);
    setPromo(null);
    setNote("");
  }

  const headline =
    status === "mate" ? (two ? (st.turn === -1 ? "Checkmate. White wins." : "Checkmate. Black wins.") : st.turn === -1 ? "Checkmate. You win." : "Checkmate. The computer wins.") :
    status === "stalemate" ? "Stalemate. It is a draw." :
    status === "draw50" ? "Draw by the fifty-move rule." :
    status === "insufficient" ? "Draw. Neither side can checkmate." :
    status === "repeat" ? "Draw by repeating the position." : "";

  return (
    <>
      <ChessDefs />
      <div className="mg-scorebar">
        <div>
          <span>Turn</span>
          <b>{over ? "Game over" : two ? (st.turn === 1 ? "White" : "Black") : thinking ? "Thinking…" : st.turn === 1 ? "Your move" : "Computer"}</b>
        </div>
        <div><span>Status</span><b>{inCheck && !over ? "Check!" : over ? "Over" : "Playing"}</b></div>
      </div>
      <div className="mg-boardwrap">
        <div className="mg-ck chs" style={{ visibility: paused ? "hidden" : "visible" }} role="grid" aria-label="Chess board">
          {(flip ? st.b.map((_, k) => 63 - k) : st.b.map((_, k) => k)).map((i) => {
            const v = st.b[i];
            const r = (i / 8) | 0, c = i % 8;
            const vr = flip ? 7 - r : r, vc = flip ? 7 - c : c; // where the square is drawn
            const dark = (vr + vc) % 2 === 1;
            return (
              <button
                key={i}
                role="gridcell"
                className={`mg-ckc ${dark ? "dk" : "lt"} ${last.includes(i) ? "last" : ""} ${sel === i ? "pick" : ""} ${kingAt === i ? "chk" : ""}`}
                onClick={() => tap(i)}
                aria-label={`${"abcdefgh"[c]}${8 - r}${v ? (v > 0 ? ", your " : ", computer ") + (CH_NAMES[Math.abs(v)] || (Math.abs(v) === 1 ? "Pawn" : "King")) : ""}`}
              >
                {v ? <ChessPiece v={v} /> : null}
                {targets.has(i) ? <span className={v ? "mg-ring" : "mg-dot"} /> : null}
              </button>
            );
          })}
        </div>
        {promo && (
          <div className="mg-pause" role="dialog" aria-label="Choose a piece">
            <div className="mg-pause-card">
              <h2>Promote to</h2>
              <div className="mg-tools" style={{ marginTop: 0 }}>
                {[5, 4, 3, 2].map((p) => (
                  <button key={p} className="mg-tool" onClick={() => play(promo.find((m) => m.promo === p), true)}>{CH_NAMES[p]}</button>
                ))}
              </div>
            </div>
          </div>
        )}
        {paused && !over && <PauseCover onResume={() => setPaused(false)} text="The board is hidden while paused." />}
      </div>

      {over ? (
        <>
          <SolvedBanner title={headline} text={two ? "Play again, or switch sides by starting a new game." : status === "mate" && st.turn === -1 ? "Try the next level up." : status === "mate" ? "Start a new game to try again." : "Start a new game to play again."} />
          <ToolRow>
            <ToolBtn onClick={restart} label="Play again"><RotateCw size={15} /> Play again</ToolBtn>
          </ToolRow>
        </>
      ) : (
        <>
          <ToolRow>
            <ToolBtn onClick={undo} disabled={!hist.length || thinking} label="Take back your last move"><RotateCcw size={15} /> Take back</ToolBtn>
            {two ? <ToolBtn onClick={() => setFlip((f) => !f)} on={flip} label="Turn the board around">Turn board</ToolBtn> : null}
            <ToolBtn onClick={() => setPaused(true)} label="Pause">Pause</ToolBtn>
            <ToolBtn onClick={() => { if (plies === 0 || window.confirm("Start a new game? This one will be lost.")) restart(); }} label="New game">New game</ToolBtn>
          </ToolRow>
          <p className="mg-meta">
            {note
              ? note
              : inCheck
                ? (two ? "Check! The king must get out of check: move it, block the attack, or capture the checking piece." : st.turn === 1 ? "You are in check. Move your king, block the attack, or capture the checking piece." : "The computer is in check.")
                : two
                  ? "Two players, one phone. White moves first, then pass the phone. Use Turn board to see it from Black's side."
                  : "You play the light pieces and move first. Tap a piece, then a marked square. Knights jump in an L shape. Checkmate the king to win."}
          </p>
        </>
      )}
    </>
  );
}

export function GameChess({ onExit }) {
  const [level, setLevel] = useState("easy");
  const rec = gameRecord("chess");
  const marks = {};
  Object.keys(CH_LEVELS).forEach((k) => { if (rec.done && rec.done[k]) marks[k] = "✓"; });
  return (
    <GameFrame eyebrow="Think ahead" title="Chess" onExit={onExit}>
      <Segs value={level} onChange={setLevel} options={Object.keys(CH_LEVELS).map((k) => ({ id: k, label: CH_LEVELS[k].label }))} marks={marks} />
      <ChessPlay key={level} level={level} />
    </GameFrame>
  );
}

/* ═══════════════════════════ TANGRAM ═══════════════════════════ */
// ==LOGIC-START==
const TG_R2 = Math.SQRT2;
// The seven classic pieces. Areas: large 4, medium 2, small 1, square 2, parallelogram 2.
const TG_SHAPES = {
  L: [[0, 0], [2 * TG_R2, 0], [0, 2 * TG_R2]],
  M: [[0, 0], [2, 0], [0, 2]],
  S: [[0, 0], [TG_R2, 0], [0, TG_R2]],
  Q: [[0, 0], [TG_R2, 0], [TG_R2, TG_R2], [0, TG_R2]],
  P: [[0, 0], [2, 0], [3, 1], [1, 1]],
};
const TG_POOL = ["L", "L", "M", "S", "S", "Q", "P"];
const TG_VIEW = { w: 16, h: 18, cx: 8, cy: 5.2, maxExtent: 9 };

function tgCentroid(poly) {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}

// The piece turned by rot * 45 degrees (optionally mirrored) with its centre at (cx, cy).
function tgPlace(type, rot, flip, cx, cy) {
  const base = TG_SHAPES[type];
  const c = tgCentroid(base);
  const a = (rot * Math.PI) / 4;
  const ca = Math.cos(a), sa = Math.sin(a);
  return base.map(([x, y]) => {
    let px = x - c[0];
    const py = y - c[1];
    if (flip) px = -px;
    return [cx + px * ca - py * sa, cy + px * sa + py * ca];
  });
}

function tgBox(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys) for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// True when two convex polygons overlap by more than a touch.
function tgOverlap(A, B) {
  const eps = 1e-5;
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1], ny = p[0] - q[0];
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const [x, y] of A) { const d = x * nx + y * ny; if (d < aMin) aMin = d; if (d > aMax) aMax = d; }
      for (const [x, y] of B) { const d = x * nx + y * ny; if (d < bMin) bMin = d; if (d > bMax) bMax = d; }
      const len = Math.hypot(nx, ny) || 1;
      if (aMax <= bMin + eps * len || bMax <= aMin + eps * len) return false;
    }
  }
  return true;
}

function tgInside(poly, x, y) {
  let pos = false, neg = false;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const cr = (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    if (cr > 1e-7) pos = true;
    else if (cr < -1e-7) neg = true;
    if (pos && neg) return false;
  }
  return true;
}

// Moves/rotates a polygon so its edge ai lands on the segment u -> v.
function tgAlign(poly, ai, u, v) {
  const a = poly[ai], b = poly[(ai + 1) % poly.length];
  const ang = Math.atan2(v[1] - u[1], v[0] - u[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  return poly.map(([x, y]) => {
    const px = x - a[0], py = y - a[1];
    return [u[0] + px * ca - py * sa, u[1] + px * sa + py * ca];
  });
}

// Builds a puzzle by gluing the pieces edge to edge. The silhouette is the union.
function tgGenerate(seedStr, count) {
  const rng = seededRng(seedStr);
  let pool = shuffle(TG_POOL, rng).slice(0, count);
  for (let attempt = 0; attempt < 600; attempt++) {
    // Some mixes cannot touch edge to edge (a large triangle with only small pieces), so change the mix now and then.
    if (attempt > 0 && attempt % 40 === 0) pool = shuffle(TG_POOL, rng).slice(0, count);
    const order = shuffle(pool.map((_, i) => i), rng);
    const placed = [{ id: order[0], type: pool[order[0]], poly: tgPlace(pool[order[0]], 0, false, 0, 0) }];
    let ok = true;
    for (let k = 1; k < order.length && ok; k++) {
      const id = order[k];
      const type = pool[id];
      const cands = [];
      for (const flip of type === "P" ? [false, true] : [false]) {
        const base = tgPlace(type, 0, flip, 0, 0);
        const bl = base.length;
        for (const pl of placed) {
          const m = pl.poly.length;
          for (let j = 0; j < m; j++) {
            const u = pl.poly[j], v = pl.poly[(j + 1) % m];
            const len = Math.hypot(v[0] - u[0], v[1] - u[1]);
            for (let ai = 0; ai < bl; ai++) {
              const p = base[ai], q = base[(ai + 1) % bl];
              if (Math.abs(Math.hypot(q[0] - p[0], q[1] - p[1]) - len) > 1e-6) continue;
              for (const dir of [0, 1]) {
                const cand = dir ? tgAlign(base, ai, v, u) : tgAlign(base, ai, u, v);
                if (!placed.some((o) => tgOverlap(cand, o.poly))) cands.push(cand);
              }
            }
          }
        }
      }
      if (!cands.length) { ok = false; break; }
      let best = null, bestArea = Infinity;
      for (let t = 0; t < 8; t++) {
        const cand = pickOne(rng, cands);
        const bx = tgBox([...placed.map((o) => o.poly), cand]);
        const area = bx.w * bx.h;
        if (area < bestArea) { bestArea = area; best = cand; }
      }
      placed.push({ id, type, poly: best });
    }
    if (!ok) continue;
    const box = tgBox(placed.map((o) => o.poly));
    if (box.w > TG_VIEW.maxExtent || box.h > TG_VIEW.maxExtent) continue;
    const dx = TG_VIEW.cx - (box.x0 + box.x1) / 2;
    const dy = TG_VIEW.cy - (box.y0 + box.y1) / 2;
    placed.sort((a, b) => a.id - b.id);
    return {
      count,
      sol: placed.map((o) => ({ id: o.id, type: o.type, poly: o.poly.map(([x, y]) => [x + dx, y + dy]) })),
    };
  }
  return null;
}

// Share of the silhouette that the pieces cover (sampled).
function tgCoverage(solPolys, piecePolys) {
  const box = tgBox(solPolys);
  const step = 0.14;
  let total = 0, hit = 0;
  for (let x = box.x0 + step / 2; x < box.x1; x += step) {
    for (let y = box.y0 + step / 2; y < box.y1; y += step) {
      if (!solPolys.some((p) => tgInside(p, x, y))) continue;
      total++;
      if (piecePolys.some((p) => tgInside(p, x, y))) hit++;
    }
  }
  return total ? hit / total : 0;
}

function tgSnap(poly, solPolys, limit) {
  let best = null;
  for (const [px, py] of poly) {
    for (const sp of solPolys) {
      for (const [sx, sy] of sp) {
        const d = Math.hypot(sx - px, sy - py);
        if (d < limit && (!best || d < best.d)) best = { d, dx: sx - px, dy: sy - py };
      }
    }
  }
  return best;
}
// ==LOGIC-END==

const TG_LEVELS = {
  easy: { count: 4, label: "Easy" },
  medium: { count: 5, label: "Medium" },
  hard: { count: 7, label: "Hard" },
};
const TG_FILL = {
  L: ["#c9a2ff", "#6d28d9"],
  M: ["#f3a6e8", "#b81eb4"],
  S: ["#a6e3ff", "#1f78c8"],
  Q: ["#ffe08a", "#e0841a"],
  P: ["#b9f0cf", "#1f9d6a"],
};
const TG_POOL = ["L", "L", "M", "S", "S", "Q", "P"];
const TG_SLOTS = [[2.4, 12.2], [7.4, 12.2], [11.6, 12.2], [14.4, 12.6], [2.2, 16], [6, 16], [11, 16]];

function pts(poly) { return poly.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(" "); }

function TangramPlay({ level, seed, onNew }) {
  const count = TG_LEVELS[level].count;
  const puzzle = useMemo(() => tgGenerate(seed, count), [seed, count]);
  const saveKey = `tangram-${level}`;
  const saved = useMemo(() => {
    const s = readSave(saveKey);
    return s && s.seed === seed && Array.isArray(s.pieces) && s.pieces.length === count ? s : null;
  }, [saveKey, seed, count]);
  const [pieces, setPieces] = useState(() => {
    if (saved) return saved.pieces;
    const rng = seededRng(seed + "-tray");
    return puzzle.sol.map((s, i) => ({ id: i, type: s.type, x: TG_SLOTS[i][0], y: TG_SLOTS[i][1], rot: ri(rng, 0, 7), flip: false }));
  });
  const [sel, setSel] = useState(-1);
  const [hint, setHint] = useState(null);
  const [hints, setHints] = useState(saved ? saved.hints || 0 : 0);
  const [dragging, setDragging] = useState(false);
  const [paused, setPaused] = useState(false);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const wonRef = useRef(false);
  usePauseOnHide(setPaused);

  const solPolys = useMemo(() => puzzle.sol.map((s) => s.poly), [puzzle]);
  const polys = pieces.map((p) => tgPlace(p.type, p.rot, p.flip, p.x, p.y));
  const coverage = useMemo(() => tgCoverage(solPolys, polys), [pieces]); // eslint-disable-line react-hooks/exhaustive-deps
  const won = !dragging && coverage >= 0.975;
  const [seconds] = useClock(!paused && !won, saved ? saved.seconds || 0 : 0);
  const secRef = useRef(seconds);
  secRef.current = seconds;
  const movedRef = useRef(false);

  useEffect(() => {
    if (!won) writeSave(saveKey, { seed, pieces, seconds, hints });
  }, [pieces, seconds, hints, won, seed, saveKey]);

  useEffect(() => {
    if (!won || wonRef.current) return;
    wonRef.current = true;
    clearSave(saveKey);
    recordGame("tangram", (g) => {
      g.plays = (g.plays || 0) + 1;
      g.wins = (g.wins || 0) + 1;
      g.done[level] = true;
      if (!hints && (!g.bestBy[level] || secRef.current < g.bestBy[level])) g.bestBy[level] = secRef.current;
    });
  }, [won]); // eslint-disable-line react-hooks/exhaustive-deps

  useOnLeave(() => { if (!wonRef.current && movedRef.current) touchToday(); });

  function toSvg(e) {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function down(e, id) {
    if (paused || won) return;
    e.preventDefault();
    const p = toSvg(e);
    const piece = pieces.find((x) => x.id === id);
    dragRef.current = { id, sx: p.x, sy: p.y, ox: piece.x, oy: piece.y, moved: false };
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    setPieces((cur) => [...cur.filter((x) => x.id !== id), cur.find((x) => x.id === id)]);
    setDragging(true);
  }
  function move(e) {
    const d = dragRef.current;
    if (!d) return;
    const p = toSvg(e);
    const dx = p.x - d.sx, dy = p.y - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 0.15) return;
    d.moved = true;
    const nx = Math.max(0.6, Math.min(TG_VIEW.w - 0.6, d.ox + dx));
    const ny = Math.max(0.6, Math.min(TG_VIEW.h - 0.6, d.oy + dy));
    setPieces((cur) => cur.map((x) => (x.id === d.id ? { ...x, x: nx, y: ny } : x)));
  }
  function up() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    setDragging(false);
    setHint(null);
    if (!d.moved) {
      if (sel === d.id) rotate(d.id);
      else setSel(d.id);
      return;
    }
    movedRef.current = true;
    setSel(d.id);
    setPieces((cur) => cur.map((x) => {
      if (x.id !== d.id) return x;
      const poly = tgPlace(x.type, x.rot, x.flip, x.x, x.y);
      const s = tgSnap(poly, solPolys, 0.35);
      return s ? { ...x, x: x.x + s.dx, y: x.y + s.dy } : x;
    }));
  }

  function rotate(id) {
    movedRef.current = true;
    setPieces((cur) => cur.map((x) => (x.id === id ? { ...x, rot: (x.rot + 1) % 8 } : x)));
  }
  function flip(id) {
    movedRef.current = true;
    setPieces((cur) => cur.map((x) => (x.id === id ? { ...x, flip: !x.flip } : x)));
  }
  function showHint() {
    if (paused || won) return;
    const off = pieces.filter((p) => {
      const c = tgCentroid(tgPlace(p.type, p.rot, p.flip, p.x, p.y));
      const s = tgCentroid(solPolys[p.id]);
      return Math.hypot(c[0] - s[0], c[1] - s[1]) > 0.3;
    });
    if (!off.length) return;
    const pick = off[Math.floor(Math.random() * off.length)];
    setHint({ id: pick.id, type: pick.type, poly: solPolys[pick.id] });
    setHints((h) => h + 1);
  }

  const selected = pieces.find((p) => p.id === sel);
  if (!puzzle) return <p className="mg-meta">Could not build a puzzle. Try again.</p>;

  return (
    <>
      <div className="mg-sbar">
        <span className="mg-stime">{formatTime(seconds)}{paused ? " · paused" : ""}</span>
        <span className="mg-meta" style={{ margin: 0 }}>{won ? "Solved" : `${Math.round(coverage * 100)}% filled`}</span>
      </div>
      <div className="mg-boardwrap">
        <svg
          ref={svgRef}
          className="mg-tg"
          viewBox={`0 0 ${TG_VIEW.w} ${TG_VIEW.h}`}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{ visibility: paused ? "hidden" : "visible" }}
          role="img"
          aria-label="Tangram board. Drag the pieces to fill the shape."
        >
          <defs>
            {Object.keys(TG_FILL).map((t) => (
              <linearGradient key={t} id={`mgtg-${t}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={TG_FILL[t][0]} />
                <stop offset="1" stopColor={TG_FILL[t][1]} />
              </linearGradient>
            ))}
          </defs>
          <g className="mg-tg-sil">
            {solPolys.map((p, i) => <polygon key={i} points={pts(p)} />)}
          </g>
          <line x1="0.5" x2={TG_VIEW.w - 0.5} y1="10.4" y2="10.4" className="mg-tg-line" />
          {hint ? <polygon points={pts(hint.poly)} className="mg-tg-hint" stroke={TG_FILL[hint.type][1]} /> : null}
          {pieces.map((p) => (
            <polygon
              key={p.id}
              points={pts(tgPlace(p.type, p.rot, p.flip, p.x, p.y))}
              fill={`url(#mgtg-${p.type})`}
              className={`mg-tg-piece ${sel === p.id ? "sel" : ""}`}
              onPointerDown={(e) => down(e, p.id)}
            />
          ))}
        </svg>
        {paused && !won && <PauseCover onResume={() => setPaused(false)} />}
      </div>

      {won ? (
        <>
          <SolvedBanner title={`Solved in ${formatTime(seconds)}${hints ? ` with ${hints} hint${hints === 1 ? "" : "s"}` : ""}.`} text="Every piece is in place." />
          <ToolRow><ToolBtn onClick={onNew} label="New puzzle"><RotateCw size={15} /> New puzzle</ToolBtn></ToolRow>
        </>
      ) : (
        <>
          <ToolRow>
            <ToolBtn onClick={() => selected && rotate(selected.id)} disabled={!selected} label="Turn the selected piece">↻ Turn</ToolBtn>
            <ToolBtn onClick={() => selected && flip(selected.id)} disabled={!selected || selected.type !== "P"} label="Flip the selected piece">⇋ Flip</ToolBtn>
            <ToolBtn onClick={showHint} label="Outline one piece's spot">Hint</ToolBtn>
            <ToolBtn onClick={() => setPaused(true)} label="Pause">Pause</ToolBtn>
            <ToolBtn onClick={() => { if (!movedRef.current || window.confirm("Leave this puzzle and start a new one?")) onNew(); }} label="New puzzle">New puzzle</ToolBtn>
          </ToolRow>
          <p className="mg-meta">Drag the pieces into the dark shape so it is completely covered. Tap a piece to select it, tap again to turn it. Pieces snap to the corners when they are close.</p>
        </>
      )}
    </>
  );
}

export function GameTangram({ onExit }) {
  const [level, setLevel] = useState("easy");
  const [seeds, setSeeds] = useState(null);
  useEffect(() => {
    const day = utcDayKey();
    const out = {};
    Object.keys(TG_LEVELS).forEach((k) => {
      const s = readSave(`tangram-${k}`);
      out[k] = s && s.seed ? s.seed : `tg-${k}-${day}`;
    });
    setSeeds(out);
  }, []);
  const rec = gameRecord("tangram");
  const marks = {};
  Object.keys(TG_LEVELS).forEach((k) => { if (rec.done && rec.done[k]) marks[k] = "✓"; });
  function fresh() {
    clearSave(`tangram-${level}`);
    setSeeds((s) => ({ ...s, [level]: `tg-${level}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}` }));
  }
  return (
    <GameFrame eyebrow="Spatial reasoning" title="Tangram" onExit={onExit}>
      <Segs value={level} onChange={setLevel} options={Object.keys(TG_LEVELS).map((k) => ({ id: k, label: TG_LEVELS[k].label }))} marks={marks} />
      {seeds ? <TangramPlay key={`${level}-${seeds[level]}`} level={level} seed={seeds[level]} onNew={fresh} /> : null}
    </GameFrame>
  );
}/* ═══════════════════════════ LOGIC GRID ═══════════════════════════ */
// ==LOGIC-START==
// Category 0 is an ordered one (days or times). An item's "group" is its position in that order,
// so every group is one row of the finished table: one item from each category.
const LG_THEMES = [
  {
    title: "Study group",
    cats: [
      ["Monday", "Tuesday", "Wednesday", "Thursday"],
      ["Ava", "Ben", "Cleo", "Dev"],
      ["Math", "Biology", "History", "Physics"],
      ["Library", "Lab", "Cafe", "Hall"],
    ],
  },
  {
    title: "Exam week",
    cats: [
      ["9am", "11am", "1pm", "3pm"],
      ["Mia", "Omar", "Lena", "Raj"],
      ["Algebra", "Chemistry", "Geography", "Poetry"],
      ["Red pen", "Blue pen", "Green pen", "Black pen"],
    ],
  },
  {
    title: "Science fair",
    cats: [
      ["Stand 1", "Stand 2", "Stand 3", "Stand 4"],
      ["Zoe", "Kai", "Ines", "Tom"],
      ["Volcano", "Robot", "Plants", "Rocket"],
      ["Gold", "Silver", "Bronze", "Ribbon"],
    ],
  },
];

function lgPerms(n) {
  const out = [];
  (function go(cur, left) {
    if (!left.length) { out.push(cur); return; }
    for (let i = 0; i < left.length; i++) go([...cur, left[i]], left.filter((_, k) => k !== i));
  })([], Array.from({ length: n }, (_, i) => i));
  return out;
}

// Every possible answer: pos[c][item] = group.
function lgAllAssignments(n, k) {
  const perms = lgPerms(n);
  const ident = Array.from({ length: n }, (_, i) => i);
  let acc = [[ident]];
  for (let c = 1; c < k; c++) {
    const next = [];
    for (const a of acc) for (const p of perms) next.push([...a, p]);
    acc = next;
  }
  return acc;
}

function lgHolds(cl, pos) {
  const p = (r) => pos[r[0]][r[1]];
  switch (cl.t) {
    case "same": return p(cl.a) === p(cl.b);
    case "diff": return p(cl.a) !== p(cl.b);
    case "either": return p(cl.a) === p(cl.b) || p(cl.a) === p(cl.c);
    case "before": return p(cl.a) < p(cl.b);
    case "next": return p(cl.b) - p(cl.a) === 1;
    default: return false;
  }
}

function lgGenerate(seedStr, n, k) {
  const rng = seededRng(seedStr);
  const theme = LG_THEMES[Math.floor(rng() * LG_THEMES.length)];
  const cats = theme.cats.slice(0, k).map((c) => c.slice(0, n));
  const all = lgAllAssignments(n, k);
  const sol = [Array.from({ length: n }, (_, i) => i)];
  for (let c = 1; c < k; c++) sol.push(shuffle(Array.from({ length: n }, (_, i) => i), rng));

  // Every true statement we could use as a clue.
  const pool = [];
  for (let c1 = 0; c1 < k; c1++) {
    for (let c2 = 0; c2 < k; c2++) {
      if (c1 === c2) continue;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const a = [c1, i], b = [c2, j];
          if (c1 < c2) {
            const same = sol[c1][i] === sol[c2][j];
            pool.push({ t: same ? "same" : "diff", a, b, w: same ? 1 : 3 });
          }
          const d = sol[c2][j] - sol[c1][i];
          if (d > 0) pool.push({ t: "before", a, b, w: 2 });
          if (d === 1) pool.push({ t: "next", a, b, w: 2 });
          for (let m = j + 1; m < n; m++) {
            const cc = [c2, m];
            const ok = sol[c1][i] === sol[c2][j] || sol[c1][i] === sol[c2][m];
            if (ok) pool.push({ t: "either", a, b, c: cc, w: 3 });
          }
        }
      }
    }
  }
  // "before" / "next" clues are only worth giving when they say something about different categories.
  const usable = pool.filter((cl) => !(cl.t === "same" && cl.a[0] === 0 && false));
  const weighted = [];
  usable.forEach((cl) => { for (let w = 0; w < cl.w; w++) weighted.push(cl); });
  const order = shuffle(weighted, rng);

  let alive = all;
  const chosen = [];
  for (const cl of order) {
    if (chosen.includes(cl)) continue;
    const next = alive.filter((pos) => lgHolds(cl, pos));
    if (next.length === alive.length) continue; // tells us nothing new
    alive = next;
    chosen.push(cl);
    if (alive.length === 1) break;
  }
  // Drop clues that turned out to be unnecessary.
  let list = chosen.slice();
  for (const cl of chosen.slice()) {
    const without = list.filter((x) => x !== cl);
    let left = all;
    for (const x of without) left = left.filter((pos) => lgHolds(x, pos));
    if (left.length === 1) list = without;
  }
  return { n, k, theme: theme.title, cats, sol, clues: shuffle(list, rng) };
}

function lgText(cl, cats) {
  const nm = (r) => cats[r[0]][r[1]];
  switch (cl.t) {
    case "same": return `${nm(cl.a)} goes with ${nm(cl.b)}.`;
    case "diff": return `${nm(cl.a)} does not go with ${nm(cl.b)}.`;
    case "either": return `${nm(cl.a)} goes with either ${nm(cl.b)} or ${nm(cl.c)}.`;
    case "before": return `${nm(cl.a)} comes earlier than ${nm(cl.b)}.`;
    default: return `${nm(cl.a)} comes right before ${nm(cl.b)}.`;
  }
}
// ==LOGIC-END==

const LG_LEVELS = {
  easy: { n: 3, k: 3, label: "Easy" },
  medium: { n: 4, k: 3, label: "Medium" },
  hard: { n: 4, k: 4, label: "Hard" },
};

function lgPairs(k) {
  const out = [];
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) out.push([i, j]);
  return out;
}

function LogicGridPlay({ level, seed, onNew }) {
  const cfg = LG_LEVELS[level];
  const puzzle = useMemo(() => lgGenerate(seed, cfg.n, cfg.k), [seed, cfg.n, cfg.k]);
  const pairs = useMemo(() => lgPairs(cfg.k), [cfg.k]);
  const saveKey = `logicgrid-${level}`;
  const saved = useMemo(() => {
    const s = readSave(saveKey);
    return s && s.seed === seed && s.marks ? s : null;
  }, [saveKey, seed]);
  const [marks, setMarks] = useState(() => {
    const m = {};
    pairs.forEach(([i, j]) => {
      const key = `${i}-${j}`;
      m[key] = saved && Array.isArray(saved.marks[key]) && saved.marks[key].length === cfg.n * cfg.n ? saved.marks[key] : new Array(cfg.n * cfg.n).fill(0);
    });
    return m;
  });
  const [struck, setStruck] = useState(saved && Array.isArray(saved.struck) ? saved.struck : []);
  const [hints, setHints] = useState(saved ? saved.hints || 0 : 0);
  const [checkOn, setCheckOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const wonRef = useRef(false);
  usePauseOnHide(setPaused);

  // Right answer for a cell: row = item of the second category, column = item of the first.
  const truth = (i, j, r, c) => puzzle.sol[j][r] === puzzle.sol[i][c];
  const won = pairs.every(([i, j]) => {
    if (i !== 0) return true; // the grids against the first category settle everything
    for (let r = 0; r < cfg.n; r++) for (let c = 0; c < cfg.n; c++) {
      const v = marks[`${i}-${j}`][r * cfg.n + c];
      if ((v === 2) !== truth(i, j, r, c)) return false;
    }
    return true;
  });
  const [seconds] = useClock(!paused && !won, saved ? saved.seconds || 0 : 0);
  const secRef = useRef(seconds);
  secRef.current = seconds;
  const touchedRef = useRef(false);

  useEffect(() => {
    if (!won) writeSave(saveKey, { seed, marks, struck, seconds, hints });
  }, [marks, struck, seconds, hints, won, seed, saveKey]);

  useEffect(() => {
    if (!won || wonRef.current) return;
    wonRef.current = true;
    clearSave(saveKey);
    recordGame("logicgrid", (g) => {
      g.plays = (g.plays || 0) + 1;
      g.wins = (g.wins || 0) + 1;
      g.done[level] = true;
      if (!hints && (!g.bestBy[level] || secRef.current < g.bestBy[level])) g.bestBy[level] = secRef.current;
    });
  }, [won]); // eslint-disable-line react-hooks/exhaustive-deps

  useOnLeave(() => { if (!wonRef.current && touchedRef.current) touchToday(); });

  function tapCell(i, j, r, c) {
    if (paused || won) return;
    touchedRef.current = true;
    setCheckOn(false);
    const key = `${i}-${j}`;
    setMarks((cur) => {
      const arr = cur[key].slice();
      const idx = r * cfg.n + c;
      const nv = (arr[idx] + 1) % 3;
      arr[idx] = nv;
      if (nv === 2) {
        // A yes means everything else in that row and column is a no.
        for (let x = 0; x < cfg.n; x++) {
          if (x !== c && arr[r * cfg.n + x] === 0) arr[r * cfg.n + x] = 1;
          if (x !== r && arr[x * cfg.n + c] === 0) arr[x * cfg.n + c] = 1;
        }
      }
      return { ...cur, [key]: arr };
    });
  }

  function hint() {
    if (paused || won) return;
    const open = [];
    pairs.forEach(([i, j]) => {
      if (i !== 0) return;
      for (let r = 0; r < cfg.n; r++) for (let c = 0; c < cfg.n; c++) {
        if (truth(i, j, r, c) && marks[`${i}-${j}`][r * cfg.n + c] !== 2) open.push([i, j, r, c]);
      }
    });
    if (!open.length) return;
    const [i, j, r, c] = open[Math.floor(Math.random() * open.length)];
    const key = `${i}-${j}`;
    setMarks((cur) => {
      const arr = cur[key].slice();
      for (let x = 0; x < cfg.n; x++) { arr[r * cfg.n + x] = 1; arr[x * cfg.n + c] = 1; }
      arr[r * cfg.n + c] = 2;
      return { ...cur, [key]: arr };
    });
    setHints((h) => h + 1);
    touchedRef.current = true;
  }

  function wrongCell(i, j, r, c) {
    const v = marks[`${i}-${j}`][r * cfg.n + c];
    if (!v) return false;
    return (v === 2) !== truth(i, j, r, c);
  }

  return (
    <>
      <div className="mg-sbar">
        <span className="mg-stime">{formatTime(seconds)}{paused ? " · paused" : ""}</span>
        <span className="mg-meta" style={{ margin: 0 }}>{puzzle.theme}</span>
      </div>

      <div className="mg-boardwrap">
        <div style={{ visibility: paused ? "hidden" : "visible" }}>
          <ol className="mg-clues">
            {puzzle.clues.map((cl, i) => (
              <li key={i} className={struck.includes(i) ? "done" : ""} onClick={() => setStruck((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))}>
                {lgText(cl, puzzle.cats)}
              </li>
            ))}
          </ol>
          <p className="mg-meta" style={{ marginTop: 2 }}>Tap a clue to cross it off. Tap a square to cycle: empty, no (×), yes (✓).</p>

          {pairs.map(([i, j]) => (
            <div className="mg-lg" key={`${i}-${j}`}>
              <table>
                <thead>
                  <tr>
                    <th />
                    {puzzle.cats[i].map((nm) => <th key={nm}><span>{nm}</span></th>)}
                  </tr>
                </thead>
                <tbody>
                  {puzzle.cats[j].map((rn, r) => (
                    <tr key={rn}>
                      <th className="rowh">{rn}</th>
                      {puzzle.cats[i].map((cn, c) => {
                        const v = marks[`${i}-${j}`][r * cfg.n + c];
                        return (
                          <td key={cn}>
                            <button
                              className={`mg-lgc v${v} ${checkOn && wrongCell(i, j, r, c) ? "wrong" : ""}`}
                              onClick={() => tapCell(i, j, r, c)}
                              aria-label={`${rn} and ${cn}: ${v === 2 ? "yes" : v === 1 ? "no" : "unknown"}`}
                            >
                              {v === 2 ? "✓" : v === 1 ? "×" : ""}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        {paused && !won && <PauseCover onResume={() => setPaused(false)} text="The clues and your notes are hidden while paused." />}
      </div>

      {won ? (
        <>
          <SolvedBanner title={`Solved in ${formatTime(seconds)}${hints ? ` with ${hints} hint${hints === 1 ? "" : "s"}` : ""}.`} text="Every clue fits together." />
          <ToolRow><ToolBtn onClick={onNew} label="New puzzle"><RotateCw size={15} /> New puzzle</ToolBtn></ToolRow>
        </>
      ) : (
        <ToolRow>
          <ToolBtn onClick={() => setCheckOn((v) => !v)} on={checkOn} label="Highlight mistakes">Check</ToolBtn>
          <ToolBtn onClick={hint} label="Reveal one match">Hint</ToolBtn>
          <ToolBtn onClick={() => setPaused(true)} label="Pause">Pause</ToolBtn>
          <ToolBtn onClick={() => { if (!touchedRef.current || window.confirm("Leave this puzzle and start a new one?")) onNew(); }} label="New puzzle">New puzzle</ToolBtn>
        </ToolRow>
      )}
    </>
  );
}

export function GameLogicGrid({ onExit }) {
  const [level, setLevel] = useState("easy");
  const [seeds, setSeeds] = useState(null);
  useEffect(() => {
    const day = utcDayKey();
    const out = {};
    Object.keys(LG_LEVELS).forEach((k) => {
      const s = readSave(`logicgrid-${k}`);
      out[k] = s && s.seed ? s.seed : `lg-${k}-${day}`;
    });
    setSeeds(out);
  }, []);
  const rec = gameRecord("logicgrid");
  const marks = {};
  Object.keys(LG_LEVELS).forEach((k) => { if (rec.done && rec.done[k]) marks[k] = "✓"; });
  function fresh() {
    clearSave(`logicgrid-${level}`);
    setSeeds((s) => ({ ...s, [level]: `lg-${level}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}` }));
  }
  return (
    <GameFrame eyebrow="Deduce from clues" title="Logic Grid" onExit={onExit}>
      <Segs value={level} onChange={setLevel} options={Object.keys(LG_LEVELS).map((k) => ({ id: k, label: LG_LEVELS[k].label }))} marks={marks} />
      {seeds ? <LogicGridPlay key={`${level}-${seeds[level]}`} level={level} seed={seeds[level]} onNew={fresh} /> : null}
    </GameFrame>
  );
}

/* ═══════════════════════════ SEQUENCES ═══════════════════════════ */
// ==LOGIC-START==
// Each maker returns { seq, rule } with 8 terms. The rule is shown after you answer.
const SQ_MAKERS = {
  easy: [
    (rng) => {
      const d = ri(rng, 2, 9), a = ri(rng, 1, 20);
      return { seq: Array.from({ length: 8 }, (_, i) => a + d * i), rule: `Add ${d} each time.` };
    },
    (rng) => {
      const d = ri(rng, 2, 8), a = ri(rng, 40, 90);
      return { seq: Array.from({ length: 8 }, (_, i) => a - d * i), rule: `Subtract ${d} each time.` };
    },
    (rng) => {
      const r = pickOne(rng, [2, 3]), a = ri(rng, 1, 3);
      return { seq: Array.from({ length: 8 }, (_, i) => a * Math.pow(r, i)), rule: `Multiply by ${r} each time.` };
    },
    () => ({ seq: Array.from({ length: 8 }, (_, i) => (i + 1) * (i + 1)), rule: "Square numbers: 1×1, 2×2, 3×3, and so on." }),
    (rng) => {
      const k = ri(rng, 2, 6) * 5;
      return { seq: Array.from({ length: 8 }, (_, i) => k * (i + 1)), rule: `Count up in ${k}s.` };
    },
  ],
  medium: [
    (rng) => {
      const a = ri(rng, 1, 8), d = ri(rng, 1, 3), s = ri(rng, 1, 4);
      const seq = [a];
      for (let i = 0; i < 7; i++) seq.push(seq[i] + s + d * i);
      return { seq, rule: `The gap grows by ${d} each time (+${s}, +${s + d}, +${s + 2 * d}, …).` };
    },
    (rng) => {
      const a = ri(rng, 1, 4), b = ri(rng, 2, 6);
      const seq = [a, b];
      for (let i = 2; i < 8; i++) seq.push(seq[i - 1] + seq[i - 2]);
      return { seq, rule: "Each term is the sum of the two before it." };
    },
    () => ({ seq: Array.from({ length: 8 }, (_, i) => ((i + 1) * (i + 2)) / 2), rule: "Triangular numbers: add 2, then 3, then 4, then 5, …" }),
    (rng) => {
      const c = ri(rng, 1, 9);
      return { seq: Array.from({ length: 8 }, (_, i) => (i + 1) * (i + 1) + c), rule: `Square numbers, plus ${c}.` };
    },
    (rng) => {
      const a = ri(rng, 1, 4);
      const seq = [a];
      for (let i = 0; i < 7; i++) seq.push(seq[i] * 2 + 1);
      return { seq, rule: "Double it, then add 1." };
    },
    (rng) => {
      const a = ri(rng, 20, 40), x = ri(rng, 4, 9), y = ri(rng, 1, 3);
      const seq = [a];
      for (let i = 0; i < 7; i++) seq.push(seq[i] + (i % 2 === 0 ? x : -y));
      return { seq, rule: `Add ${x}, subtract ${y}, and repeat.` };
    },
    () => ({ seq: Array.from({ length: 8 }, (_, i) => (i + 1) * (i + 1) * (i + 1)), rule: "Cube numbers: 1×1×1, 2×2×2, 3×3×3, …" }),
  ],
  hard: [
    (rng) => {
      const a = ri(rng, 1, 9), b = ri(rng, 10, 30), d1 = ri(rng, 2, 5), d2 = ri(rng, 2, 6);
      const seq = [];
      for (let i = 0; i < 8; i++) seq.push(i % 2 === 0 ? a + d1 * (i / 2) : b + d2 * ((i - 1) / 2));
      return { seq, rule: `Two patterns take turns: one adds ${d1}, the other adds ${d2}.` };
    },
    (rng) => {
      const m = pickOne(rng, [2, 3]), c = ri(rng, 1, 3), a = ri(rng, 1, 3);
      const seq = [a];
      for (let i = 0; i < 7; i++) seq.push(seq[i] * m - c);
      return { seq, rule: `Multiply by ${m}, then subtract ${c}.` };
    },
    (rng) => {
      const a = ri(rng, 1, 3);
      const seq = [a];
      for (let i = 0; i < 7; i++) seq.push(seq[i] + Math.pow(2, i));
      return { seq, rule: "The gaps double: +1, +2, +4, +8, …" };
    },
    () => ({ seq: [2, 3, 5, 7, 11, 13, 17, 19], rule: "Prime numbers." }),
    (rng) => {
      const a = ri(rng, 1, 3), b = ri(rng, 1, 3);
      const seq = [a];
      for (let i = 0; i < 7; i++) seq.push(i % 2 === 0 ? seq[i] * b : seq[i] + c);
      return { seq, rule: `Multiply by ${b}, then add ${c}, and repeat.` };
    },
    (rng) => {
      const a = ri(rng, 1, 3), b = ri(rng, 1, 3);
      const seq = [a, b, a + b];
      for (let i = 3; i < 8; i++) seq.push(seq[i - 1] + seq[i - 2] + seq[i - 3]);
      return { seq, rule: "Each term is the sum of the three before it." };
    },
    (rng) => {
      const k = ri(rng, 2, 5);
      return { seq: Array.from({ length: 8 }, (_, i) => (i + 1) * (i + 1) - k * (i + 1)), rule: `n × n minus ${k} × n, for n = 1, 2, 3, …` };
    },
  ],
};

function sqMakeQuestion(rng, level) {
  for (let tries = 0; tries < 60; tries++) {
    const maker = pickOne(rng, SQ_MAKERS[level]);
    const { seq, rule } = maker(rng);
    if (seq.some((v) => v > 999 || v < -99)) continue;
    if (new Set(seq.slice(0, 7)).size < 6) continue; // skip flat or repeating patterns
    const hide = level === "hard" && rng() < 0.45 ? ri(rng, 2, 5) : 6;
    const answer = seq[hide];
    const shown = seq.slice(0, hide === 6 ? 6 : 7).map((v, i) => (i === hide ? null : v));
    if (hide !== 6) shown.pop();
    const gap = Math.abs(seq[hide] - seq[hide - 1]) || 1;
    const cand = [answer + 1, answer - 1, answer + gap, answer - gap, answer + 2, answer - 2, answer * 2, seq[hide - 1], answer + 10, answer - 10]
      .filter((v) => v !== answer && v > -100 && v < 1000);
    const opts = [answer];
    for (const v of shuffle(cand, rng)) {
      if (opts.length >= 4) break;
      if (!opts.includes(v)) opts.push(v);
    }
    if (opts.length < 4) continue;
    return { shown, answer, rule, options: shuffle(opts, rng), hide };
  }
  return { shown: [2, 4, 6, 8, 10, 12], answer: 14, rule: "Add 2 each time.", options: [12, 14, 16, 18], hide: 6 };
}

function sqMakeSet(seedStr, level, count) {
  const rng = seededRng(seedStr);
  const out = [];
  const seen = new Set();
  let guard = 0;
  while (out.length < count && guard++ < 200) {
    const q = sqMakeQuestion(rng, level);
    const key = q.shown.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}
// ==LOGIC-END==

const SQ_LEVELS = { easy: "Easy", medium: "Medium", hard: "Hard" };
const SQ_COUNT = 10;

function SequencesPlay({ level, seed, onNew }) {
  const questions = useMemo(() => sqMakeSet(seed, level, SQ_COUNT), [seed, level]);
  const saveKey = `sequences-${level}`;
  const saved = useMemo(() => {
    const s = readSave(saveKey);
    return s && s.seed === seed && Array.isArray(s.answers) ? s : null;
  }, [saveKey, seed]);
  const [answers, setAnswers] = useState(saved ? saved.answers : []);
  const [picked, setPicked] = useState(-1);
  const [paused, setPaused] = useState(false);
  const idx = answers.length;
  const done = idx >= questions.length;
  const score = answers.filter((a, i) => questions[i] && a === questions[i].answer).length;
  const [seconds] = useClock(!paused && !done, saved ? saved.seconds || 0 : 0);
  const secRef = useRef(seconds);
  secRef.current = seconds;
  const doneRef = useRef(false);
  usePauseOnHide(setPaused);

  useEffect(() => {
    if (!done) writeSave(saveKey, { seed, answers, seconds });
  }, [answers, seconds, done, seed, saveKey]);

  useEffect(() => {
    if (!done || doneRef.current) return;
    doneRef.current = true;
    clearSave(saveKey);
    recordGame("sequences", (g) => {
      g.plays = (g.plays || 0) + 1;
      g.best = Math.max(g.best || 0, score);
      if (score >= 8) { g.wins = (g.wins || 0) + 1; g.done[level] = true; }
      if (!g.bestBy[level] || score > (g.bestBy[level] || 0)) g.bestBy[level] = score;
    });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const idxRef = useRef(idx);
  idxRef.current = idx;
  useOnLeave(() => { if (!doneRef.current && idxRef.current > 0) touchToday(); });

  function choose(v) {
    if (picked !== -1 || paused || done) return;
    setPicked(v);
  }
  function next() {
    setAnswers((a) => [...a, picked]);
    setPicked(-1);
  }

  const q = questions[Math.min(idx, questions.length - 1)];
  return (
    <>
      <div className="mg-sbar">
        <span className="mg-stime">{formatTime(seconds)}{paused ? " · paused" : ""}</span>
        <span className="mg-meta" style={{ margin: 0 }}>{done ? "Finished" : `Question ${idx + 1} of ${questions.length}`} · {score} right</span>
      </div>
      <div className="mg-boardwrap">
        {done ? (
          <div className="mg-sq-end">
            <h2>{score} out of {questions.length}</h2>
            <p>{score >= 8 ? "Excellent pattern spotting." : score >= 5 ? "Good work. A few patterns slipped by." : "Look at the gaps between terms first. Practice makes this easier."}</p>
          </div>
        ) : (
          <div className="mg-sq" style={{ visibility: paused ? "hidden" : "visible" }}>
            <div className="mg-sq-row">
              {q.shown.map((v, i) => (
                <span key={i} className={`mg-sq-t ${v === null ? "q" : ""}`}>{v === null ? "?" : v}</span>
              ))}
              {q.hide === 6 ? <span className="mg-sq-t q">?</span> : null}
            </div>
            <div className="mg-sq-opts">
              {q.options.map((o) => (
                <button
                  key={o}
                  className={`mg-sq-o ${picked !== -1 && o === q.answer ? "right" : ""} ${picked === o && o !== q.answer ? "wrong" : ""}`}
                  onClick={() => choose(o)}
                  disabled={picked !== -1}
                >
                  {o}
                </button>
              ))}
            </div>
            {picked !== -1 ? (
              <div className="mg-sq-why">
                <b>{picked === q.answer ? "Correct." : `Not quite. The answer is ${q.answer}.`}</b>
                <span>{q.rule}</span>
                <button className="mg-cta" onClick={next}>{idx + 1 >= questions.length ? "See score" : "Next"}</button>
              </div>
            ) : null}
          </div>
        )}
        {paused && !done && <PauseCover onResume={() => setPaused(false)} text="Your place is saved." />}
      </div>

      {done ? (
        <ToolRow><ToolBtn onClick={onNew} label="New set"><RotateCw size={15} /> New set</ToolBtn></ToolRow>
      ) : (
        <>
          <ToolRow>
            <ToolBtn onClick={() => setPaused(true)} label="Pause">Pause</ToolBtn>
            <ToolBtn onClick={() => { if (idx === 0 || window.confirm("Leave this set and start a new one?")) onNew(); }} label="New set">New set</ToolBtn>
          </ToolRow>
          <p className="mg-meta">Find the rule, then pick what comes at the question mark. Score 8 or more to clear a level.</p>
        </>
      )}
    </>
  );
}

export function GameSequences({ onExit }) {
  const [level, setLevel] = useState("easy");
  const [seeds, setSeeds] = useState(null);
  useEffect(() => {
    const day = utcDayKey();
    const out = {};
    Object.keys(SQ_LEVELS).forEach((k) => {
      const s = readSave(`sequences-${k}`);
      out[k] = s && s.seed ? s.seed : `sq-${k}-${day}`;
    });
    setSeeds(out);
  }, []);
  const rec = gameRecord("sequences");
  const marks = {};
  Object.keys(SQ_LEVELS).forEach((k) => { if (rec.done && rec.done[k]) marks[k] = "✓"; });
  function fresh() {
    clearSave(`sequences-${level}`);
    setSeeds((s) => ({ ...s, [level]: `sq-${level}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}` }));
  }
  return (
    <GameFrame eyebrow="Find the rule" title="Sequences" onExit={onExit}>
      <Segs value={level} onChange={setLevel} options={Object.keys(SQ_LEVELS).map((k) => ({ id: k, label: SQ_LEVELS[k] }))} marks={marks} />
      {seeds ? <SequencesPlay key={`${level}-${seeds[level]}`} level={level} seed={seeds[level]} onNew={fresh} /> : null}
    </GameFrame>
  );
}

/* ═══════════════════════════ REGISTRY, HUB ART, SAVED-GAME LOOKUP ═══════════════════════════ */
export const CATEGORIES = [
  { id: "school", title: "From your notes" },
  { id: "numbers", title: "Numbers" },
  { id: "logic", title: "Logic and deduction" },
  { id: "strategy", title: "Strategy and planning" },
  { id: "spatial", title: "Spatial and pattern" },
];

export const GAMES = [
  { id: "notes", cat: "school", title: "Notes Challenge", desc: "Questions made from your own school notes.", Comp: GameNotes },
  { id: "2048", cat: "numbers", title: "2048", desc: "Slide and merge tiles. Plan three moves ahead.", Comp: Game2048 },
  { id: "kenken", cat: "numbers", title: "KenKen", desc: "Sudoku with arithmetic cages.", Comp: GameKenKen },
  { id: "sequences", cat: "numbers", title: "Sequences", desc: "Spot the rule and predict what comes next.", Comp: GameSequences },
  { id: "mastermind", cat: "logic", title: "Mastermind", desc: "Crack the colour code by elimination.", Comp: GameMastermind },
  { id: "logicgrid", cat: "logic", title: "Logic Grid", desc: "Use the clues to work out who goes with what.", Comp: GameLogicGrid },
  { id: "queens", cat: "logic", title: "N-Queens", desc: "Place queens so none can attack another.", Comp: GameQueens },
  { id: "chess", cat: "strategy", title: "Chess", desc: "The classic. Knights, castling and checkmate.", Comp: GameChess },
  { id: "checkers", cat: "strategy", title: "Checkers", desc: "Outplay the computer. Three levels.", Comp: GameCheckers },
  { id: "hanoi", cat: "strategy", title: "Tower of Hanoi", desc: "Move the tower in as few moves as you can.", Comp: GameHanoi },
  { id: "tangram", cat: "spatial", title: "Tangram", desc: "Fill the shape with seven classic pieces.", Comp: GameTangram },
  { id: "nonogram", cat: "spatial", title: "Nonograms", desc: "Reveal the picture from the number clues.", Comp: GameNonogram },
];

// One line of progress for a game card.
export function gameMeta(id) {
  const g = loadStore().games[id];
  if (!g || !g.plays) return "Not played yet";
  if (id === "2048") return g.best ? `Best tile score ${g.best}` : `${g.plays} played`;
  if (id === "mastermind") return g.best ? `Best: ${g.best} guesses` : `${g.plays} played`;
  if (id === "sequences") return g.best ? `Best: ${g.best} of 10` : `${g.plays} played`;
  return g.wins ? `${g.wins} solved` : `${g.plays} played`;
}

// Games that have a part-played save on this device.
export function inProgressIds() {
  const out = [];
  const checks = {
    queens: (s) => Array.isArray(s.cells) && s.cells.length > 0,
    hanoi: (s) => s.moves > 0,
    mastermind: (s) => Array.isArray(s.rows) && s.rows.length > 0 && !s.over,
    kenken: (s) => Array.isArray(s.vals) && s.vals.some(Boolean),
    nono: (s) => Array.isArray(s.marks) && s.marks.some(Boolean),
    checkers: (s) => s.plies > 0,
    chess: (s) => s.plies > 0,
    tangram: (s) => Array.isArray(s.pieces),
    logicgrid: (s) => !!s.marks && Object.values(s.marks).some((arr) => Array.isArray(arr) && arr.some(Boolean)),
    sequences: (s) => Array.isArray(s.answers) && s.answers.length > 0,
    "2048": (s) => s.moves > 0 && !s.over,
  };
  const idOf = { queens: "queens", hanoi: "hanoi", mastermind: "mastermind", kenken: "kenken", nono: "nonogram", checkers: "checkers", chess: "chess", tangram: "tangram", logicgrid: "logicgrid", sequences: "sequences", "2048": "2048" };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(SAVE_PREFIX)) continue;
      const name = k.slice(SAVE_PREFIX.length).split("-")[0];
      if (!checks[name]) continue;
      let s = null;
      try { s = JSON.parse(localStorage.getItem(k)); } catch {}
      if (s && checks[name](s) && !out.includes(idOf[name])) out.push(idOf[name]);
    }
  } catch {}
  return out;
}

/* Small glossy pictures for the game cards. */
export function ArtDefs() {
  const stops = {
    p: ["#f3deff", "#b45cf2", "#5a1fa8"],
    k: ["#ffe0ec", "#ff6fa5", "#b3205f"],
    b: ["#dcefff", "#5aa9ff", "#1f55b3"],
    g: ["#fff4c8", "#ffc24f", "#d9780f"],
    t: ["#d8fff0", "#46d6a4", "#0f7f5f"],
  };
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        {Object.keys(stops).map((k) => (
          <linearGradient key={k} id={`mga-${k}`} x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor={stops[k][0]} />
            <stop offset="0.5" stopColor={stops[k][1]} />
            <stop offset="1" stopColor={stops[k][2]} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

const W = { stroke: "rgba(255,255,255,.8)", strokeWidth: 1 };
function Tile({ x, y, g, t }) {
  return (
    <>
      <rect x={x} y={y} width="25" height="25" rx="7" fill={`url(#mga-${g})`} {...W} />
      <text x={x + 12.5} y={y + 17.5} textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" style={{ fontFamily: "inherit" }}>{t}</text>
    </>
  );
}

export function GameArt({ id }) {
  let body = null;
  switch (id) {
    case "notes":
      body = (
        <>
          <rect x="12" y="8" width="40" height="48" rx="7" fill="url(#mga-b)" {...W} />
          <path d="M20 22h24M20 31h24M20 40h14" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          <circle cx="46" cy="46" r="10" fill="url(#mga-g)" {...W} />
          <text x="46" y="51" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">?</text>
        </>
      );
      break;
    case "2048":
      body = <><Tile x={5} y={5} g="p" t="2" /><Tile x={34} y={5} g="k" t="4" /><Tile x={5} y={34} g="b" t="8" /><Tile x={34} y={34} g="g" t="16" /></>;
      break;
    case "queens":
      body = (
        <>
          <path d="M9 24l9 10 5-17 9 14 9-14 5 17 9-10-5 28H14z" transform="scale(.9) translate(4 2)" fill="url(#mga-g)" {...W} strokeLinejoin="round" />
          <rect x="13" y="50" width="38" height="7" rx="3.5" fill="url(#mga-p)" {...W} />
        </>
      );
      break;
    case "hanoi":
      body = (
        <>
          <rect x="29" y="8" width="6" height="46" rx="3" fill="url(#mga-b)" {...W} />
          <rect x="6" y="52" width="52" height="6" rx="3" fill="url(#mga-p)" {...W} />
          <rect x="10" y="40" width="44" height="10" rx="5" fill="url(#mga-k)" {...W} />
          <rect x="16" y="28" width="32" height="10" rx="5" fill="url(#mga-g)" {...W} />
          <rect x="22" y="16" width="20" height="10" rx="5" fill="url(#mga-t)" {...W} />
        </>
      );
      break;
    case "mastermind":
      body = (
        <>
          {[["p", 17, 17], ["k", 47, 17], ["g", 17, 47], ["t", 47, 47]].map(([g, x, y]) => (
            <circle key={g} cx={x} cy={y} r="11" fill={`url(#mga-${g})`} {...W} />
          ))}
          <circle cx="32" cy="32" r="3" fill="#fff" fillOpacity=".85" />
        </>
      );
      break;
    case "kenken":
      body = (
        <>
          <rect x="6" y="6" width="52" height="52" rx="8" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" />
          <path d="M23.3 6v52M40.6 6v52M6 23.3h52M6 40.6h52" stroke="rgba(255,255,255,.35)" strokeWidth="1" />
          <path d="M6 23.3h34.6V6" fill="none" stroke="#fff" strokeWidth="2.6" />
          <text x="10" y="17" fontSize="9" fontWeight="800" fill="#fff">6+</text>
          <text x="28" y="38" fontSize="16" fontWeight="800" fill="#ffe08a">3</text>
          <text x="45" y="55" fontSize="12" fontWeight="800" fill="#fff">2</text>
        </>
      );
      break;
    case "nonogram": {
      const heart = ["01010", "11111", "11111", "01110", "00100"];
      body = (
        <>
          {heart.map((row, r) => row.split("").map((v, c) => (
            <rect key={`${r}${c}`} x={10 + c * 9.6} y={10 + r * 9.6} width="8.6" height="8.6" rx="2" fill={v === "1" ? "url(#mga-k)" : "rgba(255,255,255,.14)"} stroke={v === "1" ? "rgba(255,255,255,.8)" : "rgba(255,255,255,.3)"} strokeWidth=".8" />
          )))}
        </>
      );
      break;
    }
    case "chess":
      body = (
        <g transform="translate(-3 1) scale(1.46)">
          <path d="M12.5 38c0-9.5 3.8-12.6 6.6-16-2.6.6-5 2.6-6.6 5.4-1.4-.4-3-1.6-3.4-3.8 1.4-3.8 5-8.4 8.4-11.4 1.2-1.2 2.2-2.2 2.2-4.4 1.4.6 2.6 1.6 3.2 2.8 6 .6 12.2 5.2 13.2 15.2.5 5.6-.4 10.4-.4 14.2z" fill="url(#mga-p)" stroke="rgba(255,255,255,.85)" strokeWidth=".7" strokeLinejoin="round" />
          <circle cx="20.5" cy="14.5" r="1.3" fill="#2a1250" />
        </g>
      );
      break;
    case "checkers":
      body = (
        <>
          {[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => (
            <rect key={`${r}${c}`} x={8 + c * 12} y={8 + r * 12} width="12" height="12" fill={(r + c) % 2 ? "rgba(40,10,90,.6)" : "rgba(255,255,255,.55)"} />
          )))}
          <circle cx="26" cy="38" r="5.4" fill="url(#mga-p)" {...W} />
          <circle cx="38" cy="26" r="5.4" fill="url(#mga-k)" {...W} />
          <circle cx="14" cy="14" r="5.4" fill="url(#mga-k)" {...W} />
          <circle cx="50" cy="50" r="5.4" fill="url(#mga-p)" {...W} />
        </>
      );
      break;
    case "tangram":
      body = (
        <>
          <polygon points="32,6 52,26 12,26" fill="url(#mga-p)" {...W} />
          <polygon points="12,26 32,26 12,46" fill="url(#mga-b)" {...W} />
          <polygon points="32,26 52,26 52,46" fill="url(#mga-t)" {...W} />
          <rect x="12" y="46" width="20" height="12" fill="url(#mga-g)" {...W} />
          <polygon points="32,46 52,46 44,58 32,58" fill="url(#mga-k)" {...W} />
        </>
      );
      break;
    case "logicgrid":
      body = (
        <>
          <rect x="8" y="8" width="48" height="48" rx="8" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" />
          <path d="M24 8v48M40 8v48M8 24h48M8 40h48" stroke="rgba(255,255,255,.4)" strokeWidth="1" />
          <text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="800" fill="#7dffc0">✓</text>
          <text x="32" y="37" textAnchor="middle" fontSize="13" fontWeight="800" fill="#ffb3c1">×</text>
          <text x="48" y="53" textAnchor="middle" fontSize="13" fontWeight="800" fill="#7dffc0">✓</text>
          <text x="48" y="21" textAnchor="middle" fontSize="13" fontWeight="800" fill="#ffb3c1">×</text>
        </>
      );
      break;
    case "sequences":
      body = (
        <>
          {[["2", 5, "p"], ["4", 22, "k"], ["8", 39, "b"]].map(([t, x, g]) => (
            <g key={t}>
              <rect x={x} y="18" width="16" height="28" rx="5" fill={`url(#mga-${g})`} {...W} />
              <text x={x + 8} y="37" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">{t}</text>
            </g>
          ))}
          <rect x="56" y="18" width="4" height="28" rx="2" fill="rgba(255,255,255,.0)" />
          <text x="52" y="56" fontSize="14" fontWeight="800" fill="#ffe08a">?</text>
        </>
      );
      break;
    default:
      body = null;
  }
  return <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">{body}</svg>;
}

/* ═══════════════════════════ STYLES FOR THE GAMES ═══════════════════════════ */
const GAMES_CSS = `
.mg-back { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px 0 12px; margin: 0 0 12px; border-radius: 99px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 2px 0 var(--border); color: var(--text); font-size: 14px; font-weight: 700; cursor: pointer; }
.mg-back:active { transform: translateY(2px); box-shadow: none; }
.mg-tools { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 12px 0 0; }
.mg-tool { display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 13.5px; font-weight: 600; cursor: pointer; touch-action: manipulation; }
.mg-tool.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.mg-tool:disabled { opacity: .4; cursor: not-allowed; }
.mg-tool:active:not(:disabled) { transform: translateY(1px); }
.mg-scorebar { display: flex; gap: 8px; margin-bottom: 10px; }
.mg-scorebar > div { flex: 1; display: flex; flex-direction: column; padding: 8px 12px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); }
.mg-scorebar span { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); }
.mg-scorebar b { font-size: 21px; font-variant-numeric: tabular-nums; }
.mg-npad { display: grid; gap: 8px; width: min(100%, 420px); margin: 12px auto 0; }
.mg-npad button { height: 50px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); box-shadow: 0 3px 0 var(--border); font-size: 20px; font-weight: 600; color: var(--text); cursor: pointer; display: flex; align-items: center; justify-content: center; touch-action: manipulation; }
.mg-npad button:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--border); }

/* 2048 */
.mg-2048 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 8px; width: min(100%, 420px); aspect-ratio: 1; margin: 0 auto; border-radius: 18px; background: var(--surface-2); border: 1px solid var(--border); touch-action: none; user-select: none; -webkit-user-select: none; }
.mg-2048-cell { position: relative; border-radius: 12px; background: rgba(150, 100, 220, .14); }
.mg-2048-tile { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-weight: 800; font-variant-numeric: tabular-nums; }
.mg-2048-tile.pop { animation: mg-pop .16s ease; }
.mg-2048-tile.merge { animation: mg-merge .18s ease; }
@keyframes mg-pop { from { transform: scale(.4); opacity: .4; } to { transform: scale(1); opacity: 1; } }
@keyframes mg-merge { 0% { transform: scale(1); } 50% { transform: scale(1.14); } 100% { transform: scale(1); } }

/* n-queens */
.mg-qboard { display: grid; width: min(100%, 440px); aspect-ratio: 1; margin: 0 auto; border-radius: 12px; overflow: hidden; border: 2px solid var(--text); }
.mg-qcell { border: 0; padding: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; touch-action: manipulation; }
.mg-qcell.light { background: var(--surface); }
.mg-qcell.dark { background: var(--accent-soft); }
.mg-qcell.att { box-shadow: inset 0 0 0 100px rgba(255, 90, 120, .16); }
.mg-qcell.bad { background: var(--danger-soft); }
.mg-queen { width: 80%; height: 80%; filter: drop-shadow(0 2px 1px rgba(40, 0, 80, .35)); }

/* tower of hanoi */
.mg-hanoi { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; height: 250px; }
.mg-peg { position: relative; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding: 0 4px 12px; border-radius: 16px; background: var(--surface); border: 1px solid var(--border); cursor: pointer; touch-action: manipulation; }
.mg-peg.sel { box-shadow: 0 0 0 2px var(--accent); }
.mg-peg.shake { animation: mg-shake .28s ease; }
.mg-pole { position: absolute; left: 50%; transform: translateX(-50%); top: 18px; bottom: 14px; width: 8px; border-radius: 6px; background: linear-gradient(90deg, var(--border), var(--text-muted)); opacity: .55; }
.mg-stack { position: relative; z-index: 1; display: flex; flex-direction: column-reverse; align-items: center; gap: 3px; width: 100%; }
.mg-disc { display: block; height: 22px; border-radius: 99px; box-shadow: inset 0 3px 0 rgba(255,255,255,.55), inset 0 -3px 0 rgba(0,0,0,.2), 0 2px 0 rgba(0,0,0,.22); transition: transform .12s ease; }
.mg-disc.lift { transform: translateY(-14px); }
.mg-base { display: block; width: 92%; height: 6px; margin-top: 4px; border-radius: 4px; background: var(--border); }

/* mastermind */
.mg-mm { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 16px; background: var(--surface); border: 1px solid var(--border); }
.mg-mm-row { display: flex; align-items: center; gap: 10px; min-height: 34px; }
.mg-mm-n { width: 18px; text-align: right; font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.mg-mm-beads { display: flex; gap: 8px; flex: 1; }
.mg-bead { border-radius: 50%; border: 0; padding: 0; cursor: pointer; box-shadow: inset 0 -3px 5px rgba(0,0,0,.28), 0 2px 3px rgba(0,0,0,.25); flex: none; }
.mg-bead.empty { background: var(--surface-2); border: 2px dashed var(--border); box-shadow: none; }
.mg-bead.ring { outline: 2px solid var(--accent); outline-offset: 2px; }
.mg-mm-pegs { display: grid; grid-template-columns: repeat(2, 11px); gap: 4px; }
.mg-mm-pegs i { width: 11px; height: 11px; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--border); display: block; }
.mg-mm-pegs i.ex { background: var(--accent); border-color: var(--accent); }
.mg-mm-pegs i.nr { background: transparent; border: 2px solid var(--accent); }
.mg-mm-go { height: 34px; padding: 0 14px; border-radius: 10px; border: 0; background: var(--accent-btn); color: #fff; font-weight: 700; cursor: pointer; }
.mg-mm-go:disabled { opacity: .35; cursor: not-allowed; }
.mg-palette { display: flex; justify-content: center; gap: 10px; margin: 14px 0 4px; }

/* kenken */
.mg-kk { display: grid; width: min(100%, 420px); aspect-ratio: 1; margin: 0 auto; border-radius: 10px; overflow: hidden; background: var(--surface); }
.mg-kkc { position: relative; padding: 0; background: transparent; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--text); cursor: pointer; touch-action: manipulation; border-radius: 0; }
.mg-kkc.bt { border-top: 2.5px solid var(--text); }
.mg-kkc.bl { border-left: 2.5px solid var(--text); }
.mg-kkc.bb { border-bottom: 2.5px solid var(--text); }
.mg-kkc.br { border-right: 2.5px solid var(--text); }
.mg-kkc.sel { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent); }
.mg-kk-t { position: absolute; top: 2px; left: 4px; font-size: clamp(10px, 3vw, 13px); font-weight: 700; color: var(--text-muted); }
.mg-kk-v { font-size: clamp(22px, 7vw, 34px); font-weight: 600; color: var(--accent); }
.mg-kkc.bad .mg-kk-v { color: var(--danger); }
.mg-kkc.cagebad .mg-kk-t { color: var(--danger); }

/* nonograms */
.mg-nono { width: max-content; max-width: 100%; margin: 0 auto; }
.mg-nono-top { display: flex; }
.mg-nono-cols { display: grid; align-items: end; }
.mg-nono-main { display: flex; }
.mg-nono-rows { display: grid; flex: none; }
.mg-nclue { font-size: 12px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; transition: opacity .15s ease; }
.mg-nclue.col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 1px; padding-bottom: 4px; }
.mg-nclue.row { display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding-right: 6px; }
.mg-nclue.done { opacity: .3; }
.mg-nono-grid { display: grid; border: 2px solid var(--text); background: var(--surface); touch-action: none; user-select: none; -webkit-user-select: none; }
.mg-ncell { display: flex; align-items: center; justify-content: center; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); font-size: calc(var(--cs) * .6); color: var(--text-muted); }
.mg-ncell.gr { border-right: 2px solid var(--text); }
.mg-ncell.gb { border-bottom: 2px solid var(--text); }
.mg-ncell.on { background: var(--accent); }

/* checkers */
.mg-ck { display: grid; grid-template-columns: repeat(8, 1fr); width: min(100%, 440px); aspect-ratio: 1; margin: 0 auto; border-radius: 10px; overflow: hidden; border: 2px solid var(--text); }
.mg-ckc { position: relative; border: 0; padding: 0; display: flex; align-items: center; justify-content: center; touch-action: manipulation; }
.mg-ckc.lt { background: var(--surface); }
.mg-ckc.dk { background: #3a2a63; cursor: pointer; }
.mg-ck.chs .mg-ckc.dk { background: #8f78c4; }
.mg-ck.chs .mg-ckc.lt { background: #f3ecfd; }
.mg-ckc.last { box-shadow: inset 0 0 0 3px rgba(255, 214, 102, .85); }
.mg-ckc.pick { box-shadow: inset 0 0 0 3px #fff; }
.mg-ckc.chk { box-shadow: inset 0 0 0 100px rgba(255, 70, 100, .5); }
.mg-cp { width: 88%; height: 88%; filter: drop-shadow(0 2px 1.5px rgba(10, 0, 30, .45)); pointer-events: none; }
.mg-ring { position: absolute; inset: 6%; border-radius: 50%; border: 3px solid rgba(255, 255, 255, .8); pointer-events: none; }
.mg-chk { width: 78%; height: 78%; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; }
.mg-chk.me { background: radial-gradient(circle at 32% 28%, #fff 0, #e3c8ff 24%, #a56ae8 72%, #6a2fc0 100%); box-shadow: 0 3px 0 rgba(20, 0, 50, .6), inset 0 -3px 5px rgba(0,0,0,.2); color: #4a1a8a; }
.mg-chk.cpu { background: radial-gradient(circle at 32% 28%, #fff 0, #ffd2de 22%, #e8587c 70%, #9c1d44 100%); box-shadow: 0 3px 0 rgba(20, 0, 50, .6), inset 0 -3px 5px rgba(0,0,0,.25); }
.mg-chk.me.can { box-shadow: 0 3px 0 rgba(20, 0, 50, .6), 0 0 0 2px rgba(255,255,255,.7); }
.mg-dot { position: absolute; width: 26%; height: 26%; border-radius: 50%; background: rgba(255, 255, 255, .8); }

/* tangram */
.mg-tg { display: block; width: min(100%, 460px); margin: 0 auto; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); touch-action: none; user-select: none; -webkit-user-select: none; }
.mg-tg-sil polygon { fill: var(--text); fill-opacity: .82; stroke: var(--text); stroke-opacity: .82; stroke-width: .04; }
.mg-tg-line { stroke: var(--border); stroke-width: .05; stroke-dasharray: .3 .3; }
.mg-tg-piece { stroke: rgba(255,255,255,.92); stroke-width: .07; stroke-linejoin: round; cursor: grab; }
.mg-tg-piece.sel { stroke: #ffd666; stroke-width: .13; }
.mg-tg-hint { fill: none; stroke-width: .1; stroke-dasharray: .25 .2; pointer-events: none; }

/* logic grid */
.mg-clues { margin: 0 0 6px; padding: 12px 14px 12px 34px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); font-size: 14px; line-height: 1.5; }
.mg-clues li { cursor: pointer; padding: 2px 0; }
.mg-clues li.done { text-decoration: line-through; color: var(--text-muted); }
.mg-lg { overflow-x: auto; margin: 12px 0; }
.mg-lg table { border-collapse: collapse; margin: 0 auto; }
.mg-lg th { font-weight: 700; color: var(--text); }
.mg-lg th span { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); font-size: 11px; padding: 4px 0; max-height: 92px; white-space: nowrap; }
.mg-lg .rowh { text-align: right; font-size: 11px; padding-right: 6px; white-space: nowrap; }
.mg-lgc { width: 36px; height: 36px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 17px; font-weight: 700; cursor: pointer; padding: 0; border-radius: 0; touch-action: manipulation; }
.mg-lgc.v1 { color: var(--text-muted); }
.mg-lgc.v2 { background: var(--success-soft); color: var(--success); }
.mg-lgc.wrong { background: var(--danger-soft); color: var(--danger); }

/* sequences */
.mg-sq-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; padding: 18px 4px 20px; }
.mg-sq-t { min-width: 46px; height: 54px; padding: 0 8px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 3px 0 var(--border); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.mg-sq-t.q { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.mg-sq-opts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mg-sq-o { height: 58px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface); box-shadow: 0 3px 0 var(--border); font-size: 22px; font-weight: 700; color: var(--text); cursor: pointer; font-variant-numeric: tabular-nums; }
.mg-sq-o.right { background: var(--success-soft); border-color: var(--success); color: var(--success); }
.mg-sq-o.wrong { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }
.mg-sq-why { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 14px; background: var(--surface-2); border: 1px solid var(--border); }
.mg-sq-why span { font-size: 13.5px; color: var(--text-muted); }
.mg-sq-why .mg-cta { margin-top: 6px; height: 46px; font-size: 15px; }
.mg-sq-end { text-align: center; padding: 28px 12px; border-radius: 18px; background: var(--surface); border: 1px solid var(--border); }
.mg-sq-end h2 { font-family: var(--font-display); font-size: 34px; margin: 0 0 6px; }
.mg-sq-end p { margin: 0; color: var(--text-muted); font-size: 14px; }

/* hub */
.mg-cat { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--text-muted); margin: 22px 0 10px; }
.mg-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mg-card { position: relative; text-align: left; display: flex; flex-direction: column; gap: 4px; padding: 10px 10px 12px; border-radius: 18px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 4px 0 var(--border); cursor: pointer; color: var(--text); transition: transform .1s ease, box-shadow .1s ease; }
.mg-card:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--border); }
.mg-art2 { height: 84px; margin-bottom: 6px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: linear-gradient(145deg, rgba(184, 77, 255, .38), rgba(88, 28, 160, .26)); border: 1px solid rgba(255, 255, 255, .16); box-shadow: inset 0 2px 0 rgba(255, 255, 255, .22); }
.mg-card b { font-size: 15px; }
.mg-card span { font-size: 12px; line-height: 1.35; color: var(--text-muted); }
.mg-card em { font-style: normal; font-size: 11.5px; font-weight: 700; color: var(--accent); margin-top: 2px; }
.mg-resume { position: absolute; top: 8px; right: 8px; font-size: 10px; font-weight: 800; letter-spacing: .04em; background: var(--accent); color: #fff; border-radius: 99px; padding: 3px 8px; }
@media (prefers-reduced-motion: reduce) { .mg-2048-tile, .mg-peg.shake { animation: none; } .mg-disc { transition: none; } }
`;

export function GamesStyle() {
  return <style>{GAMES_CSS}</style>;
}
