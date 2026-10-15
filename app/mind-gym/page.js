"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ArrowLeft, Eraser, Pencil } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   MIND GYM — Quick Math Sprint + Daily Sudoku
   One file on purpose. Progress is kept on this device for now;
   rewards and server-side validation arrive with the wallet.
   ═══════════════════════════════════════════════════════════════ */

const STORE_KEY = "vreedits.mindgym.v1";
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

/* ───────── Local progress (this device only) ───────── */
const EMPTY_STORE = { playedDays: [], math: { best: 0, plays: 0 }, sudoku: { done: {} } };

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        playedDays: Array.isArray(s.playedDays) ? s.playedDays : [],
        math: { ...EMPTY_STORE.math, ...(s.math || {}) },
        sudoku: { done: (s.sudoku && s.sudoku.done) || {} },
      };
    }
  } catch {}
  return { playedDays: [], math: { best: 0, plays: 0 }, sudoku: { done: {} } };
}
function updateStore(fn) {
  const next = fn(loadStore());
  next.playedDays = Array.from(new Set(next.playedDays)).sort().slice(-90);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
  return next;
}
function markPlayedToday(s) { s.playedDays = [...s.playedDays, localDayKey()]; return s; }