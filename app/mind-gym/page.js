"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ArrowLeft, Eraser, Pencil, Pause, Play } from "lucide-react";
import GlossIcon from "@/components/GlossIcon";
import {
  GAMES, CATEGORIES, GameArt, ArtDefs, GamesStyle, gameMeta, inProgressIds,
  loadStore, updateStore, markPlayedToday,
} from "./games";

/* ═══════════════════════════════════════════════════════════════
   MIND GYM — hub, Quick Math Sprint and Daily Sudoku.
   The other ten games live in ./games.js, which also holds the shared
   progress store. Progress is kept on this device for now; rewards and
   server-side validation arrive with the wallet.
   ═══════════════════════════════════════════════════════════════ */

const PROGRESS_PREFIX = "vreedits.sudoku.progress.";

// Tweak the game here — nothing else needs to change.
const MATH_CONFIG = {
  duration: 60,          // seconds
  basePoints: 10,        // points for a correct answer before the multiplier
  multipliers: { 1: 1, 2: 2, 3: 3 },
  correctToLevelUp: 3,   // right answers in a row to climb one tier
  wrongPenaltyLevels: 1, // tiers lost on a wrong answer
};
const SUDOKU_CLUES = { easy: 40, medium: 32, hard: 27 };

// ==LOGIC-START==
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
function shiftDay(key, delta) {
  const [y, m, d] = key.split("-").map(Number);
  return localDayKey(new Date(y, m - 1, d + delta));
}
function streakFromDays(days, today) {
  const set = new Set(days);
  let cursor = set.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (set.has(cursor)) { n++; cursor = shiftDay(cursor, -1); }
  return n;
}
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${pad2(s)}`;
}

/* ───────── Quick Math questions ───────── */
const MINUS = "−";
function fmt(n) { return n < 0 ? MINUS + Math.abs(n) : String(n); }
function ri(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }

function makeQuestion(tier, rng = Math.random, previous = "") {
  for (let attempt = 0; attempt < 8; attempt++) {
    const q = buildQuestion(tier, rng);
    if (q.prompt !== previous) return q;
  }
  return buildQuestion(tier, rng);
}

function buildQuestion(tier, rng) {
  const pick = ri(rng, 0, 3);
  if (tier === 1) {
    if (pick === 0) { const a = ri(rng, 3, 25), b = ri(rng, 3, 25); return { tier, prompt: `${a} + ${b} = ?`, hint: "", answer: a + b }; }
    if (pick === 1) { const b = ri(rng, 2, 15), a = b + ri(rng, 2, 20); return { tier, prompt: `${a} ${MINUS} ${b} = ?`, hint: "", answer: a - b }; }
    if (pick === 2) { const k = ri(rng, 2, 12), m = ri(rng, 2, 20); return { tier, prompt: `x ${MINUS} ${k} = ${m}`, hint: "Find x", answer: m + k }; }
    const k = ri(rng, 2, 15), m = ri(rng, 16, 40); return { tier, prompt: `x + ${k} = ${m}`, hint: "Find x", answer: m - k };
  }
  if (tier === 2) {
    if (pick === 0) { const a = ri(rng, 3, 12), b = ri(rng, 3, 12); return { tier, prompt: `${a} × ${b} = ?`, hint: "", answer: a * b }; }
    if (pick === 1) { const a = ri(rng, 2, 9), b = ri(rng, 2, 9), c = ri(rng, 2, 15); return { tier, prompt: `(${a} × ${b}) + ${c} = ?`, hint: "", answer: a * b + c }; }
    if (pick === 2) { const q = ri(rng, 2, 12), b = ri(rng, 2, 12); return { tier, prompt: `${q * b} ÷ ${b} = ?`, hint: "", answer: q }; }
    const a = ri(rng, 3, 9), b = ri(rng, 3, 9), c = ri(rng, 1, a * b - 1); return { tier, prompt: `(${a} × ${b}) ${MINUS} ${c} = ?`, hint: "", answer: a * b - c };
  }
  // Tier 3: algebra with whole-number answers
  let x = ri(rng, 1, 12);
  if (rng() < 0.25) x = -ri(rng, 1, 6);
  const a = ri(rng, 2, 9);
  if (pick === 0) { const b = ri(rng, 1, 15); return { tier, prompt: `${a}x + ${b} = ${fmt(a * x + b)}`, hint: "Find x", answer: x }; }
  if (pick === 1) { const b = ri(rng, 1, 15); return { tier, prompt: `${a}x ${MINUS} ${b} = ${fmt(a * x - b)}`, hint: "Find x", answer: x }; }
  if (pick === 2) { return { tier, prompt: `${a}x = ${fmt(a * x)}`, hint: "Find x", answer: x }; }
  const b = ri(rng, 1, 15); return { tier, prompt: `${a}x + ${b} = ${fmt(a * x + b)}`, hint: "Find x", answer: x };
}

/* ───────── Sudoku engine ───────── */
function boxOf(i) { return ((i / 27) | 0) * 3 + (((i % 9) / 3) | 0); }
function popcount(n) { let c = 0; while (n) { n &= n - 1; c++; } return c; }

// Counts solutions, stopping at `limit` — used to keep every puzzle uniquely solvable.
function countSolutions(cells, limit = 2) {
  const g = cells.slice();
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    if (g[i]) { const b = 1 << g[i]; rows[(i / 9) | 0] |= b; cols[i % 9] |= b; boxes[boxOf(i)] |= b; }
  }
  let count = 0;
  function solve() {
    if (count >= limit) return;
    let best = -1, bestMask = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const used = rows[(i / 9) | 0] | cols[i % 9] | boxes[boxOf(i)];
      const mask = ~used & 0x3fe;
      const n = popcount(mask);
      if (n < bestN) { best = i; bestMask = mask; bestN = n; if (n <= 1) break; }
    }
    if (best === -1) { count++; return; }
    if (bestN === 0) return;
    const r = (best / 9) | 0, c = best % 9, bx = boxOf(best);
    for (let d = 1; d <= 9; d++) {
      const b = 1 << d;
      if (!(bestMask & b)) continue;
      g[best] = d; rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
      solve();
      g[best] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b;
      if (count >= limit) return;
    }
  }
  solve();
  return count;
}

function generateSolved(rng) {
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
  const bands = shuffle([0, 1, 2], rng);
  const stacks = shuffle([0, 1, 2], rng);
  const rowOrder = bands.flatMap((b) => shuffle([0, 1, 2], rng).map((r) => b * 3 + r));
  const colOrder = stacks.flatMap((s) => shuffle([0, 1, 2], rng).map((c) => s * 3 + c));
  const grid = new Array(81);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const base = ((rowOrder[r] * 3 + Math.floor(rowOrder[r] / 3) + colOrder[c]) % 9);
      grid[r * 9 + c] = digits[base];
    }
  }
  return grid;
}

// Same puzzle for everyone on the same UTC day + difficulty.
function makePuzzle(seedKey, difficulty) {
  const rng = seededRng("vreedits-sudoku:" + seedKey);
  const solution = generateSolved(rng);
  const puzzle = solution.slice();
  const target = SUDOKU_CLUES[difficulty] || SUDOKU_CLUES.easy;
  let clues = 81;
  for (const idx of shuffle(Array.from({ length: 81 }, (_, i) => i), rng)) {
    if (clues <= target) break;
    const keep = puzzle[idx];
    puzzle[idx] = 0;
    if (countSolutions(puzzle, 2) !== 1) puzzle[idx] = keep;
    else clues--;
  }
  return { puzzle, solution };
}

// Indices of cells that repeat a digit in their row, column or 3x3 box.
function findConflicts(vals) {
  const bad = new Set();
  const units = [];
  for (let k = 0; k < 9; k++) {
    units.push(Array.from({ length: 9 }, (_, i) => k * 9 + i));
    units.push(Array.from({ length: 9 }, (_, i) => i * 9 + k));
    const br = Math.floor(k / 3) * 3, bc = (k % 3) * 3;
    units.push(Array.from({ length: 9 }, (_, i) => (br + Math.floor(i / 3)) * 9 + bc + (i % 3)));
  }
  for (const unit of units) {
    const seen = {};
    for (const i of unit) {
      const v = vals[i];
      if (!v) continue;
      (seen[v] = seen[v] || []).push(i);
    }
    for (const v in seen) if (seen[v].length > 1) seen[v].forEach((i) => bad.add(i));
  }
  return bad;
}
// ==LOGIC-END==

/* ═══════════════ QUICK MATH ═══════════════ */
// Saves a round (finished, or quit part-way) to this device.
function recordMathRound(final) {
  updateStore((s) => {
    s.math.plays = (s.math.plays || 0) + 1;
    s.math.best = Math.max(s.math.best || 0, final.score);
    return markPlayedToday(s);
  });
}
const INITIAL_STATS = { score: 0, total: 0, correct: 0, tier: 1, run: 0, maxTier: 1 };

function QuickMath({ onExit }) {
  const [phase, setPhase] = useState("ready"); // ready | playing | done
  const [timeLeft, setTimeLeft] = useState(MATH_CONFIG.duration);
  const [q, setQ] = useState(null);
  const [input, setInput] = useState("");
  const [stats, setStats] = useState(INITIAL_STATS);
  const [fb, setFb] = useState(null);
  const [newBest, setNewBest] = useState(false);
  const [paused, setPaused] = useState(false);

  const phaseRef = useRef("ready");
  const remainingRef = useRef(MATH_CONFIG.duration * 1000);
  const endAtRef = useRef(0);
  const busyRef = useRef(false);
  const recordedRef = useRef(false);
  phaseRef.current = phase;
  const statsRef = useRef(stats); statsRef.current = stats;
  const qRef = useRef(q); qRef.current = q;
  const prevBestRef = useRef(loadStore().math.best);

  function start() {
    recordedRef.current = false;
    busyRef.current = false;
    statsRef.current = INITIAL_STATS;
    setStats(INITIAL_STATS);
    setQ(makeQuestion(1));
    setInput("");
    setFb(null);
    setNewBest(false);
    setTimeLeft(MATH_CONFIG.duration);
    setPaused(false);
    remainingRef.current = MATH_CONFIG.duration * 1000;
    endAtRef.current = Date.now() + MATH_CONFIG.duration * 1000;
    setPhase("playing");
  }

  function pause() {
    if (phaseRef.current !== "playing") return;
    remainingRef.current = Math.max(0, endAtRef.current - Date.now());
    setPaused(true);
  }
  function resume() {
    endAtRef.current = Date.now() + remainingRef.current;
    setPaused(false);
  }
  // Quit part-way: the points so far are saved.
  function quit() {
    if (!recordedRef.current && statsRef.current.total > 0) {
      recordedRef.current = true;
      recordMathRound(statsRef.current);
    }
    onExit();
  }

  // Pause by itself if the tab is hidden, and save the round if the screen is left.
  useEffect(() => {
    function onHide() { if (document.visibilityState === "hidden") pause(); }
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (phaseRef.current === "playing" && !recordedRef.current && statsRef.current.total > 0) {
        recordedRef.current = true;
        recordMathRound(statsRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clock: based on the real end time, so a slow phone can't stretch the round.
  useEffect(() => {
    if (phase !== "playing" || paused) return;
    const id = setInterval(() => {
      const remaining = endAtRef.current - Date.now();
      if (remaining <= 0) { setTimeLeft(0); setPhase("done"); }
      else setTimeLeft(Math.ceil(remaining / 1000));
    }, 200);
    return () => clearInterval(id);
  }, [phase, paused]);

  // Save the finished round once.
  useEffect(() => {
    if (phase !== "done" || recordedRef.current) return;
    recordedRef.current = true;
    const final = statsRef.current;
    const was = prevBestRef.current;
    if (final.score > was && final.total > 0) setNewBest(true);
    recordMathRound(final);
    prevBestRef.current = Math.max(was, final.score);
  }, [phase]);

  const press = useCallback((d) => {
    setInput((cur) => {
      if (cur.replace("-", "").length >= 5) return cur;
      if (cur === "0") return d;
      if (cur === "-0") return "-" + d;
      return cur + d;
    });
  }, []);
  const toggleMinus = useCallback(() => {
    setInput((cur) => (cur.startsWith("-") ? cur.slice(1) : "-" + cur));
  }, []);
  const clear = useCallback(() => setInput(""), []);

  const submit = useCallback(() => {
    if (phase !== "playing" || paused || busyRef.current || !qRef.current) return;
    if (input === "" || input === "-") return;
    busyRef.current = true;
    setTimeout(() => { busyRef.current = false; }, 150);

    const ok = parseInt(input, 10) === qRef.current.answer;
    const s = statsRef.current;
    let { tier, run, score, correct } = s;
    if (ok) {
      score += MATH_CONFIG.basePoints * MATH_CONFIG.multipliers[tier];
      correct += 1;
      run += 1;
      if (run >= MATH_CONFIG.correctToLevelUp && tier < 3) { tier += 1; run = 0; }
    } else {
      tier = Math.max(1, tier - MATH_CONFIG.wrongPenaltyLevels);
      run = 0;
    }
    const next = { score, total: s.total + 1, correct, tier, run, maxTier: Math.max(s.maxTier, tier) };
    statsRef.current = next;
    setStats(next);
    setFb({ ok, answer: qRef.current.answer, id: Date.now() });
    setQ(makeQuestion(tier, Math.random, qRef.current.prompt));
    setInput("");
  }, [phase, paused, input]);

  // Physical keyboard (desktop)
  useEffect(() => {
    if (phase !== "playing" || paused) return;
    function onKey(e) {
      if (e.key >= "0" && e.key <= "9") press(e.key);
      else if (e.key === "-") toggleMinus();
      else if (e.key === "Backspace") setInput((c) => c.slice(0, -1));
      else if (e.key === "Enter") submit();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, paused, press, toggleMinus, submit]);

  useEffect(() => {
    if (!fb) return;
    const id = setTimeout(() => setFb(null), 900);
    return () => clearTimeout(id);
  }, [fb]);

  const accuracy = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
  const pct = Math.max(0, Math.min(100, (timeLeft / MATH_CONFIG.duration) * 100));

  if (phase === "ready") {
    return (
      <div className="mg">
        <button className="mg-back" onClick={onExit}><ArrowLeft size={16} /> Mind Gym</button>
        <div className="mg-eyebrow">60 seconds</div>
        <h1 className="mg-title">Quick Math</h1>
        <div className="mg-howto">
          <p>Answer as many as you can before the clock runs out.</p>
          <p>Three right in a row moves you up a tier. A miss drops you one. Higher tiers score more.</p>
        </div>
        <div className="mg-tiers">
          <div><b>1</b><span>Sums and gaps</span><em>x1</em></div>
          <div><b>2</b><span>Times tables, brackets</span><em>x2</em></div>
          <div><b>3</b><span>Find x</span><em>x3</em></div>
        </div>
        <p className="mg-meta">{prevBestRef.current > 0 ? `Your best: ${prevBestRef.current}` : "No score yet. Go set one."}</p>
        <button className="mg-cta" onClick={start}>Start</button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="mg">
        <div className="mg-eyebrow">Time</div>
        <h1 className="mg-title">{stats.total === 0 ? "No answers this time" : "Round over"}</h1>
        <div className="mg-result">
          <div className="mg-result-score">{stats.score}</div>
          <div className="mg-result-cap">points{newBest ? " · new personal best" : ""}</div>
        </div>
        <div className="mg-stats">
          <div><b>{stats.total}</b><span>answered</span></div>
          <div><b>{stats.correct}</b><span>correct</span></div>
          <div><b>{accuracy}%</b><span>accuracy</span></div>
          <div><b>{stats.maxTier}</b><span>top tier</span></div>
        </div>
        <p className="mg-meta">Neuron rewards switch on when the wallet launches. This score is saved on this device.</p>
        <button className="mg-cta" onClick={start}>Go again</button>
        <button className="mg-ghost" onClick={onExit}>Back to Mind Gym</button>
      </div>
    );
  }

  const urgent = timeLeft <= 10;
  return (
    <div className="mg mg-play">
      <div className="mg-timebar"><i style={{ width: pct + "%" }} className={urgent ? "urgent" : ""} /></div>
      <div className="mg-hud">
        <div className={`mg-clock ${urgent ? "urgent" : ""}`}>{timeLeft}<small>s</small></div>
        <div className="mg-chip">Tier {stats.tier} &middot; x{MATH_CONFIG.multipliers[stats.tier]}</div>
        <div className="mg-score">{stats.score}</div>
        <button className="mg-pausebtn" onClick={pause} aria-label="Pause"><Pause size={16} /></button>
      </div>

      <div key={fb ? fb.id : "q"} className={`mg-qcard ${fb ? (fb.ok ? "ok" : "bad mg-shake") : ""}`}>
        <div className="mg-q">{q && q.prompt}</div>
        <div className="mg-qhint">{q && q.hint ? q.hint : " "}</div>
        <div className="mg-fb">{fb ? (fb.ok ? "Right" : `It was ${fb.answer}`) : " "}</div>
      </div>

      <div className={`mg-answer ${input ? "" : "empty"}`}>{input ? input.replace("-", MINUS) : "?"}</div>

      <div className="mg-pad">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((d) => (
          <button key={d} className="mg-key" onClick={() => press(d)}>{d}</button>
        ))}
        <button className="mg-key alt" onClick={toggleMinus} aria-label="Minus sign">{MINUS}</button>
        <button className="mg-key" onClick={() => press("0")}>0</button>
        <button className="mg-key alt small" onClick={clear}>Clear</button>
      </div>
      <button className="mg-key submit" onClick={submit} disabled={input === "" || input === "-"}>Submit</button>

      {paused && (
        <div className="mg-pause" role="dialog" aria-label="Paused">
          <div className="mg-pause-card">
            <h2>Paused</h2>
            <p>The clock is stopped. You have {Math.ceil(remainingRef.current / 1000)}s left and {stats.score} points.</p>
            <button className="mg-cta" onClick={resume}><Play size={16} style={{ verticalAlign: "-2px" }} /> Resume</button>
            <button className="mg-ghost" onClick={quit}>Quit and save {stats.score} points</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════ SUDOKU ═══════════════ */
function msUntilNextUtcMidnight() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}
function untilText(ms) {
  const mins = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function SudokuGame({ seedKey, puzzle, solution, onSolved }) {
  const saved = useMemo(() => {
    try {
      const raw = localStorage.getItem(PROGRESS_PREFIX + seedKey);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!Array.isArray(p.vals) || p.vals.length !== 81) return null;
      for (let i = 0; i < 81; i++) if (puzzle[i] && p.vals[i] !== puzzle[i]) return null;
      return p;
    } catch { return null; }
  }, [seedKey, puzzle]);

  const [vals, setVals] = useState(() => (saved ? saved.vals : puzzle.slice()));
  const [notes, setNotes] = useState(() => (saved && Array.isArray(saved.notes) && saved.notes.length === 81 ? saved.notes : new Array(81).fill(0)));
  const [seconds, setSeconds] = useState(() => (saved && saved.seconds) || 0);
  const [sel, setSel] = useState(null);
  const [noteMode, setNoteMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const solvedRef = useRef(false);

  // Always holds the latest numbers so leaving the screen can save them.
  const liveRef = useRef({});
  liveRef.current = { vals, seconds };

  const conflicts = useMemo(() => findConflicts(vals), [vals]);
  const complete = useMemo(() => vals.every((v) => v) && conflicts.size === 0, [vals, conflicts]);
  const counts = useMemo(() => {
    const c = new Array(10).fill(0);
    vals.forEach((v) => { if (v) c[v]++; });
    return c;
  }, [vals]);

  // Timer: stops when paused, when the tab is hidden, or when the puzzle is solved.
  useEffect(() => {
    if (complete || paused) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [complete, paused]);

  // Switching tabs or apps pauses the puzzle (and hides the board until Resume).
  useEffect(() => {
    function onHide() { if (document.visibilityState === "hidden") setPaused(true); }
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // Leaving part-way counts: the time and how far you got are saved, the day counts
  // toward your streak, and the puzzle is waiting where you left it.
  useEffect(() => {
    return () => {
      const { vals: v, seconds: sec } = liveRef.current;
      if (!v || solvedRef.current) return;
      const filled = v.reduce((n, x, i) => n + (x && !puzzle[i] ? 1 : 0), 0);
      if (filled === 0 && sec < 5) return;
      updateStore((st) => {
        st.sudoku.partial[seedKey] = { seconds: sec, filled, at: Date.now() };
        return markPlayedToday(st);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep progress so leaving mid-puzzle doesn't lose it.
  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_PREFIX + seedKey, JSON.stringify({ vals, notes, seconds }));
    } catch {}
  }, [vals, notes, seconds, seedKey]);

  // Record the solve once (also checks the filled grid against the stored solution).
  useEffect(() => {
    if (!complete || solvedRef.current) return;
    const matches = vals.every((v, i) => v === solution[i]);
    if (!matches) return;
    solvedRef.current = true;
    updateStore((s) => {
      if (!s.sudoku.done[seedKey]) s.sudoku.done[seedKey] = { seconds, at: Date.now() };
      delete s.sudoku.partial[seedKey];
      return markPlayedToday(s);
    });
    onSolved && onSolved();
  }, [complete]); // eslint-disable-line react-hooks/exhaustive-deps

  const place = useCallback((d) => {
    if (sel === null || complete || paused || puzzle[sel]) return;
    if (noteMode) {
      if (vals[sel]) return;
      setNotes((n) => { const c = n.slice(); c[sel] = c[sel] ^ (1 << d); return c; });
      return;
    }
    const newVal = vals[sel] === d ? 0 : d;
    setVals((v) => { const c = v.slice(); c[sel] = newVal; return c; });
    setNotes((n) => {
      const c = n.slice();
      c[sel] = 0;
      if (newVal) {
        const r = (sel / 9) | 0, col = sel % 9, bx = boxOf(sel);
        for (let i = 0; i < 81; i++) {
          if (((i / 9) | 0) === r || i % 9 === col || boxOf(i) === bx) c[i] &= ~(1 << newVal);
        }
      }
      return c;
    });
  }, [sel, complete, paused, puzzle, noteMode, vals]);

  const erase = useCallback(() => {
    if (sel === null || complete || paused || puzzle[sel]) return;
    setVals((v) => { const c = v.slice(); c[sel] = 0; return c; });
    setNotes((n) => { const c = n.slice(); c[sel] = 0; return c; });
  }, [sel, complete, paused, puzzle]);

  useEffect(() => {
    function onKey(e) {
      if (e.key >= "1" && e.key <= "9") place(Number(e.key));
      else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") erase();
      else if (e.key === "n" || e.key === "N") setNoteMode((m) => !m);
      else if (e.key.startsWith("Arrow")) {
        setSel((s) => {
          const cur = s === null ? 40 : s;
          const r = (cur / 9) | 0, c = cur % 9;
          if (e.key === "ArrowUp") return Math.max(0, r - 1) * 9 + c;
          if (e.key === "ArrowDown") return Math.min(8, r + 1) * 9 + c;
          if (e.key === "ArrowLeft") return r * 9 + Math.max(0, c - 1);
          return r * 9 + Math.min(8, c + 1);
        });
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [place, erase]);

  const selRow = sel === null ? -1 : (sel / 9) | 0;
  const selCol = sel === null ? -1 : sel % 9;
  const selBox = sel === null ? -1 : boxOf(sel);
  const selVal = sel === null ? 0 : vals[sel];

  return (
    <>
      <div className="mg-sbar">
        <span className="mg-stime">{formatTime(seconds)}{paused ? " · paused" : ""}</span>
        {!complete && (
          <button className="mg-notes" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Resume" : "Pause"}>
            {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? "Resume" : "Pause"}
          </button>
        )}
        <button
          className={`mg-notes ${noteMode ? "on" : ""}`}
          onClick={() => setNoteMode((m) => !m)}
          aria-pressed={noteMode}
        >
          <Pencil size={14} /> Notes {noteMode ? "on" : "off"}
        </button>
      </div>

      <div className="mg-boardwrap">
      <div className={`mg-board ${complete ? "solved" : ""} ${paused ? "hidden" : ""}`} role="grid" aria-label="Sudoku board">
        {vals.map((v, i) => {
          const r = (i / 9) | 0, c = i % 9;
          const cls = ["mg-cell"];
          if (c === 2 || c === 5) cls.push("rb");
          if (r === 2 || r === 5) cls.push("bb");
          if (puzzle[i]) cls.push("given"); else if (v) cls.push("entered");
          if (sel !== null) {
            if (i === sel) cls.push("sel");
            else if (v && v === selVal) cls.push("same");
            else if (r === selRow || c === selCol || boxOf(i) === selBox) cls.push("peer");
          }
          if (conflicts.has(i)) cls.push("conflict");
          return (
            <button
              key={i}
              className={cls.join(" ")}
              onClick={() => setSel(i)}
              role="gridcell"
              aria-label={`Row ${r + 1}, column ${c + 1}${v ? ", " + v : ", empty"}`}
            >
              {v ? v : notes[i] ? (
                <span className="mg-pencil">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <i key={d}>{notes[i] & (1 << d) ? d : ""}</i>)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {paused && !complete && (
        <div className="mg-pause" role="dialog" aria-label="Paused">
          <div className="mg-pause-card">
            <h2>Paused</h2>
            <p>The clock is stopped and the board is hidden.</p>
            <button className="mg-cta" onClick={() => setPaused(false)}><Play size={16} style={{ verticalAlign: "-2px" }} /> Resume</button>
          </div>
        </div>
      )}
      </div>

      {complete ? (
        <div className="mg-solved">
          <b>Solved in {formatTime(seconds)}.</b>
          <span>Next puzzle in {untilText(msUntilNextUtcMidnight())} (00:00 UTC).</span>
        </div>
      ) : (
        <div className="mg-spad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button key={d} className="mg-key" disabled={paused || counts[d] >= 9} onClick={() => place(d)}>{d}</button>
          ))}
          <button className="mg-key alt" onClick={erase} aria-label="Erase cell"><Eraser size={20} /></button>
        </div>
      )}
    </>
  );
}

function Sudoku({ onExit }) {
  const [difficulty, setDifficulty] = useState("easy");
  const [tick, setTick] = useState(0);
  const dayKey = useMemo(() => utcDayKey(), []);
  const seedKey = `${dayKey}:${difficulty}`;
  const { puzzle, solution } = useMemo(() => makePuzzle(seedKey, difficulty), [seedKey, difficulty]);
  const store = useMemo(() => loadStore(), [tick, difficulty]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mg">
      <button className="mg-back" onClick={onExit}><ArrowLeft size={16} /> Mind Gym</button>
      <div className="mg-eyebrow">Same puzzle for everyone &middot; {dayKey}</div>
      <h1 className="mg-title">Sudoku</h1>
      <div className="mg-seg" role="tablist" aria-label="Difficulty">
        {["easy", "medium", "hard"].map((d) => (
          <button key={d} role="tab" aria-selected={difficulty === d} className={difficulty === d ? "on" : ""} onClick={() => setDifficulty(d)}>
            {d[0].toUpperCase() + d.slice(1)}
            {store.sudoku.done[`${dayKey}:${d}`] ? <span className="mg-tick" aria-label="solved">{"✓"}</span> : store.sudoku.partial[`${dayKey}:${d}`] ? <span className="mg-tick" aria-label="in progress">{"…"}</span> : null}
          </button>
        ))}
      </div>
      <SudokuGame key={seedKey} seedKey={seedKey} puzzle={puzzle} solution={solution} onSolved={() => setTick((t) => t + 1)} />
    </div>
  );
}/* ═══════════════ HUB ═══════════════ */

function Card({ title, desc, meta, art, resume, onClick }) {
  return (
    <button className="mg-card" onClick={onClick}>
      {resume ? <span className="mg-resume">RESUME</span> : null}
      <div className="mg-art2">{art}</div>
      <b>{title}</b>
      <span>{desc}</span>
      <em>{meta}</em>
    </button>
  );
}

function Hub({ onOpen }) {
  const store = loadStore();
  const today = localDayKey();
  const utcToday = utcDayKey();
  const played = new Set(store.playedDays);
  const streak = streakFromDays(store.playedDays, today);
  const levels = ["easy", "medium", "hard"];
  const solvedToday = levels.filter((d) => store.sudoku.done[`${utcToday}:${d}`]).length;
  const sudokuOpen = levels.some((d) => !store.sudoku.done[`${utcToday}:${d}`] && store.sudoku.partial[`${utcToday}:${d}`]);
  const resumeIds = inProgressIds();
  if (sudokuOpen) resumeIds.push("sudoku");

  const week = [];
  for (let i = 6; i >= 0; i--) {
    const key = shiftDay(today, -i);
    const [y, m, d] = key.split("-").map(Number);
    week.push({ key, letter: new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "narrow" }), done: played.has(key), isToday: i === 0 });
  }

  const titleOf = (id) => (id === "sudoku" ? "Sudoku" : (GAMES.find((g) => g.id === id) || {}).title || id);
  const mathCard = (
    <Card
      key="math"
      title="Quick Math"
      desc="Beat the clock and climb from sums to algebra."
      meta={store.math.best > 0 ? `Best: ${store.math.best}` : "No score yet"}
      art={<GlossIcon name="math" size={58} />}
      onClick={() => onOpen("math")}
    />
  );
  const sudokuCard = (
    <Card
      key="sudoku"
      title="Daily Sudoku"
      desc="A fresh puzzle every day. Three levels."
      meta={`${solvedToday} of 3 solved today`}
      art={<GlossIcon name="sudoku" size={60} />}
      resume={sudokuOpen}
      onClick={() => onOpen("sudoku")}
    />
  );

  return (
    <div className="mg">
      <ArtDefs />
      <div className="mg-eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>
      <h1 className="mg-title">Mind Gym</h1>
      <p className="mg-sub">A few minutes of sharp thinking before you open the books.</p>

      <div className="mg-streak">
        <div>
          <div className="mg-streak-num">{streak}</div>
          <div className="mg-streak-cap">{streak > 0 ? `day${streak === 1 ? "" : "s"} in a row` : "Play anything today to start a streak"}</div>
        </div>
        <div className="mg-week" aria-hidden="true">
          {week.map((d) => (
            <div key={d.key}>
              <i className={`${d.done ? "done" : ""} ${d.isToday ? "today" : ""}`} />
              {d.letter}
            </div>
          ))}
        </div>
      </div>

      {resumeIds.length > 0 && (
        <>
          <div className="mg-cat" style={{ marginTop: 6 }}>Pick up where you left off</div>
          <div className="mg-tools" style={{ justifyContent: "flex-start", marginTop: 0 }}>
            {resumeIds.map((id) => (
              <button key={id} className="mg-tool on" onClick={() => onOpen(id)}>
                <Play size={14} /> {titleOf(id)}
              </button>
            ))}
          </div>
        </>
      )}

      {CATEGORIES.map((cat) => (
        <section key={cat.id}>
          <div className="mg-cat">{cat.title}</div>
          <div className="mg-cards">
            {cat.id === "numbers" ? [mathCard, sudokuCard] : null}
            {GAMES.filter((g) => g.cat === cat.id).map((g) => (
              <Card
                key={g.id}
                title={g.title}
                desc={g.desc}
                meta={gameMeta(g.id)}
                art={<GameArt id={g.id} />}
                resume={resumeIds.includes(g.id)}
                onClick={() => onOpen(g.id)}
              />
            ))}
          </div>
        </section>
      ))}

      <p className="mg-meta" style={{ marginTop: 22 }}>Every game saves where you stopped and counts toward your streak. Neuron rewards arrive with the wallet.</p>
    </div>
  );
}

/* ═══════════════ PAGE ═══════════════ */
export default function MindGymPage() {
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState("hub");
  useEffect(() => { setMounted(true); }, []);

  const open = useCallback((v) => {
    setView(v);
    try { window.scrollTo(0, 0); } catch {}
  }, []);
  const exit = useCallback(() => open("hub"), [open]);
  const game = GAMES.find((g) => g.id === view);

  return (
    <>
      <style>{CSS}</style>
      <GamesStyle />
      {!mounted ? <div className="mg" style={{ minHeight: "60vh" }} /> : (
        view === "math" ? <QuickMath onExit={exit} /> :
        view === "sudoku" ? <Sudoku onExit={exit} /> :
        game ? <game.Comp onExit={exit} /> :
        <Hub onOpen={open} />
      )}
    </>
  );
}

const CSS = `
.mg { max-width: 520px; margin: 0 auto; padding: 16px 16px 28px; color: var(--text); }
.mg button { font-family: inherit; }
.mg-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-muted); }
.mg-title { font-family: var(--font-display); font-size: 42px; line-height: 1.05; margin: 2px 0 6px; color: var(--text); }
.mg-sub { font-size: 14.5px; color: var(--text-muted); margin: 0 0 18px; line-height: 1.4; }
.mg-meta { font-size: 12.5px; color: var(--text-muted); line-height: 1.4; margin: 12px 0; }
.mg-back { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--text-muted); font-size: 13px; font-weight: 600; padding: 4px 0 10px; cursor: pointer; }

/* hub */
.mg-streak { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: 20px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 4px 0 var(--border); margin-bottom: 16px; }
.mg-streak-num { font-size: 40px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.mg-streak-cap { font-size: 12.5px; color: var(--text-muted); margin-top: 3px; max-width: 150px; line-height: 1.3; }
.mg-week { display: flex; gap: 5px; }
.mg-week > div { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10px; font-weight: 600; color: var(--text-muted); }
.mg-week i { width: 22px; height: 22px; border-radius: 7px; border: 1.5px solid var(--border); display: block; }
.mg-week i.done { background: var(--accent); border-color: var(--accent); }
.mg-week i.today { border-color: var(--accent); }
.mg-game { display: flex; gap: 14px; align-items: stretch; width: 100%; text-align: left; padding: 14px; border-radius: 20px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 4px 0 var(--border); cursor: pointer; margin-bottom: 14px; color: var(--text); transition: transform .1s ease, box-shadow .1s ease; }
.mg-game:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--border); }
.mg-art { width: 88px; height: 88px; border-radius: 16px; flex-shrink: 0; }
.mg-art.math { background: var(--accent-soft); display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--accent); }
.mg-art.math span { margin-top: 2px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.mg-art.sudoku { background: var(--accent-soft); display: flex; align-items: center; justify-content: center; }
.mg-pausebtn { margin-left: 8px; width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.mg-boardwrap { position: relative; }
.mg-board.hidden .mg-cell { color: transparent; }
.mg-board.hidden .mg-pencil { visibility: hidden; }
.mg-pause { position: absolute; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(8, 3, 22, .72); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-radius: 14px; }
.mg-play .mg-pause { position: fixed; border-radius: 0; }
.mg-pause-card { width: 100%; max-width: 320px; text-align: center; padding: 22px 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 6px 0 var(--border); }
.mg-pause-card h2 { font-family: var(--font-display); font-size: 30px; margin: 0 0 6px; color: var(--text); }
.mg-pause-card p { font-size: 14px; color: var(--text-muted); line-height: 1.4; margin: 0 0 16px; }
.mg-game-body { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.mg-game-title { font-size: 17px; font-weight: 700; }
.mg-game-desc { font-size: 13px; color: var(--text-muted); line-height: 1.35; margin-top: 2px; }
.mg-game-meta { font-size: 12px; font-weight: 700; color: var(--accent); margin-top: 6px; }

/* shared buttons */
.mg-cta { width: 100%; height: 54px; border-radius: 16px; border: none; background: var(--accent-btn); color: #fff; font-size: 17px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 0 rgba(60,0,70,.45); transition: transform .1s ease, box-shadow .1s ease; }
.mg-cta:active { transform: translateY(3px); box-shadow: 0 1px 0 rgba(60,0,70,.45); }
.mg-ghost { width: 100%; margin-top: 10px; height: 46px; border-radius: 14px; background: transparent; border: 1px solid var(--border); color: var(--text); font-size: 14px; font-weight: 600; cursor: pointer; }
.mg-key { height: 56px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 3px 0 var(--border); font-size: 23px; font-weight: 600; color: var(--text); cursor: pointer; font-variant-numeric: tabular-nums; user-select: none; -webkit-user-select: none; touch-action: manipulation; transition: transform .06s ease, box-shadow .06s ease; display: flex; align-items: center; justify-content: center; }
.mg-key:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 var(--border); }
.mg-key.alt { background: var(--surface-2); }
.mg-key.small { font-size: 15px; }
.mg-key:disabled { opacity: .35; cursor: not-allowed; }
.mg-key.submit { width: 100%; margin-top: 10px; background: var(--accent-btn); color: #fff; border-color: transparent; box-shadow: 0 3px 0 rgba(60,0,70,.45); font-size: 17px; font-weight: 700; }

/* quick math */
.mg-howto p { font-size: 14.5px; line-height: 1.45; margin: 0 0 8px; color: var(--text); }
.mg-tiers { margin: 14px 0 6px; border: 1px solid var(--border); border-radius: 16px; overflow: hidden; background: var(--surface); }
.mg-tiers > div { display: flex; align-items: center; gap: 12px; padding: 11px 14px; font-size: 14px; }
.mg-tiers > div + div { border-top: 1px solid var(--border); }
.mg-tiers b { width: 26px; height: 26px; border-radius: 8px; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 13px; }
.mg-tiers span { flex: 1; }
.mg-tiers em { font-style: normal; font-weight: 700; color: var(--text-muted); }
.mg-play { padding-top: 10px; }
.mg-timebar { height: 6px; border-radius: 99px; background: var(--surface-2); overflow: hidden; margin-bottom: 10px; }
.mg-timebar i { display: block; height: 100%; background: var(--accent); transition: width .2s linear; border-radius: 99px; }
.mg-timebar i.urgent { background: var(--danger); }
.mg-hud { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.mg-clock { font-size: 34px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; }
.mg-clock small { font-size: 14px; font-weight: 600; color: var(--text-muted); margin-left: 2px; }
.mg-clock.urgent { color: var(--danger); }
.mg-chip { font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 99px; background: var(--accent-soft); color: var(--accent); }
.mg-score { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; }
.mg-qcard { text-align: center; padding: 18px 12px 12px; border-radius: 20px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 4px 0 var(--border); margin-bottom: 10px; transition: background .15s ease, border-color .15s ease; }
.mg-qcard.ok { border-color: var(--success); background: var(--success-soft); }
.mg-qcard.bad { border-color: var(--danger); background: var(--danger-soft); }
.mg-q { font-size: clamp(30px, 9vw, 44px); font-weight: 800; letter-spacing: .01em; font-variant-numeric: tabular-nums; line-height: 1.1; }
.mg-qhint { font-size: 12.5px; color: var(--text-muted); margin-top: 4px; min-height: 16px; }
.mg-fb { font-size: 12.5px; font-weight: 700; min-height: 16px; margin-top: 4px; }
.mg-qcard.ok .mg-fb { color: var(--success); }
.mg-qcard.bad .mg-fb { color: var(--danger); }
.mg-answer { height: 56px; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 700; border-radius: 14px; background: var(--surface-2); border: 1px solid var(--border); margin-bottom: 10px; font-variant-numeric: tabular-nums; }
.mg-answer.empty { color: var(--text-muted); opacity: .6; }
.mg-pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
@keyframes mg-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
.mg-shake { animation: mg-shake .28s ease; }

/* results */
.mg-result { text-align: center; padding: 22px 0 14px; }
.mg-result-score { font-size: 76px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; color: var(--accent); }
.mg-result-cap { font-size: 13px; color: var(--text-muted); margin-top: 6px; }
.mg-stats { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--border); border-radius: 16px; background: var(--surface); overflow: hidden; margin-bottom: 8px; }
.mg-stats > div { padding: 12px 4px; text-align: center; }
.mg-stats > div + div { border-left: 1px solid var(--border); }
.mg-stats b { display: block; font-size: 22px; font-variant-numeric: tabular-nums; }
.mg-stats span { font-size: 11px; color: var(--text-muted); }

/* sudoku */
.mg-seg { display: flex; gap: 4px; padding: 4px; border-radius: 14px; background: var(--surface-2); border: 1px solid var(--border); margin: 10px 0 12px; }
.mg-seg button { flex: 1; height: 38px; border-radius: 10px; border: none; background: transparent; color: var(--text-muted); font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
.mg-seg button.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 0 var(--border); }
.mg-tick { color: var(--success); font-size: 13px; }
.mg-sbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.mg-stime { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text-muted); }
.mg-notes { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); font-size: 13px; font-weight: 600; cursor: pointer; }
.mg-notes.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.mg-board { display: grid; grid-template-columns: repeat(9, 1fr); width: min(100%, 440px); aspect-ratio: 1; margin: 0 auto; border: 2px solid var(--text); border-radius: 8px; overflow: hidden; background: var(--surface); }
.mg-board.solved { border-color: var(--success); }
.mg-cell { position: relative; display: flex; align-items: center; justify-content: center; padding: 0; margin: 0; border: 0; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); background: transparent; color: var(--text); font-size: min(5.8vw, 25px); font-variant-numeric: tabular-nums; cursor: pointer; touch-action: manipulation; border-radius: 0; }
.mg-cell:nth-child(9n) { border-right: 0; }
.mg-cell:nth-child(n+73) { border-bottom: 0; }
.mg-cell.rb { border-right: 2px solid var(--text); }
.mg-cell.bb { border-bottom: 2px solid var(--text); }
.mg-cell.given { font-weight: 800; }
.mg-cell.entered { color: var(--accent); font-weight: 500; }
.mg-cell.peer { background: var(--surface-2); }
.mg-cell.same { background: var(--accent-soft); }
.mg-cell.sel { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent); }
.mg-cell.conflict { color: var(--danger); background: var(--danger-soft); }
.mg-pencil { position: absolute; inset: 1px; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); }
.mg-pencil i { font-style: normal; font-size: min(2.5vw, 10px); line-height: 1; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.mg-spad { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; width: min(100%, 440px); margin: 12px auto 0; }
.mg-solved { width: min(100%, 440px); margin: 14px auto 0; padding: 14px 16px; border-radius: 16px; background: var(--success-soft); border: 1px solid var(--success); display: flex; flex-direction: column; gap: 2px; color: var(--text); }
.mg-solved b { font-size: 16px; color: var(--success); }
.mg-solved span { font-size: 13px; color: var(--text-muted); }
@media (prefers-reduced-motion: reduce) { .mg-shake { animation: none; } .mg-timebar i { transition: none; } }
`;