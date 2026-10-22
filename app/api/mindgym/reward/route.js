import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";
import { awardNeurons, getWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";

/* ═══════════════════════════════════════════════════════════════
   MIND GYM REWARDS — the server decides how many Neurons a game earns.
   The browser only reports what happened; every claim is re-checked here.

   • Quick Math: the numbers must be possible (right scores for the tiers,
     sensible answer counts), one claim per round, at most one round a minute.
   • Sudoku: the submitted grid must equal today's real solution, which the
     server rebuilds itself from the date. One reward per puzzle per account.
   • Other games: a fixed payout per win (harder levels pay more), at most 5 paid wins per
     game per day, one every 20 seconds. The browser reports wins, so these are limited, not proven.
   • Everyone is also held to the daily Neuron limit in lib/wallet.js.
   ═══════════════════════════════════════════════════════════════ */

// Tweak the payouts here.
const SUDOKU_NEURONS = { easy: 10, medium: 20, hard: 30 };
const MATH_POINTS_PER_NEURON = 10; // 10 game points = 1 Neuron
const MATH_MAX_NEURONS = 25;       // top payout for one round
const MATH_MIN_GAP_MS = 50 * 1000; // at most one rewarded round a minute
// Every other game: Neurons for a win. Harder levels pay more (multiplier below).
const GAME_NEURONS = {
  "2048": 8, kenken: 12, sequences: 8, mastermind: 10, logicgrid: 12, queens: 8,
  chess: 25, checkers: 20, hanoi: 8, tangram: 12, nonogram: 12,
};
const LEVEL_MULT = { easy: 1, medium: 1.5, hard: 2 };
const GAME_MAX_WINS_PER_DAY = 5;     // paid wins per game per UTC day
const GAME_MIN_GAP_MS = 20 * 1000;   // at most one paid win every 20 seconds
const SUDOKU_CLUES = { easy: 40, medium: 32, hard: 27 }; // must match app/mind-gym/page.js

// ─── Sudoku engine: an exact copy of the one in app/mind-gym/page.js ───
// (Same code + same date = same puzzle on both sides. Keep the two in step.)
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

// Rebuilt puzzles are remembered for a while so we don't regenerate them on every claim.
const solutionCache = new Map();
function solutionFor(seedKey, difficulty) {
  if (solutionCache.has(seedKey)) return solutionCache.get(seedKey);
  const { solution } = makePuzzle(seedKey, difficulty);
  if (solutionCache.size > 12) solutionCache.delete(solutionCache.keys().next().value);
  solutionCache.set(seedKey, solution);
  return solution;
}function utcDay(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}
const isInt = (n) => Number.isInteger(n);
const bad = (error, status = 400) => NextResponse.json({ error }, { status });

async function reply(userId, res, extra = {}) {
  const balances = await getWallet(userId);
  return NextResponse.json({
    ok: true,
    awarded: res && !res.duplicate ? res.awarded || 0 : 0,
    duplicate: !!(res && res.duplicate),
    capped: !!(res && res.capped),
    balances,
    ...extra,
  });
}

async function handleMath(user, body) {
  const { score, total, correct, maxTier, roundId } = body;
  if (![score, total, correct, maxTier].every(isInt)) return bad("That round doesn't look right.");
  if (typeof roundId !== "string" || roundId.length < 6 || roundId.length > 40) return bad("That round doesn't look right.");
  // Every right answer is worth 10, 20 or 30 depending on the tier you were on.
  const possible =
    total >= 1 && total <= 80 &&
    correct >= 0 && correct <= total &&
    maxTier >= 1 && maxTier <= 3 &&
    score >= correct * 10 && score <= correct * 10 * maxTier &&
    (maxTier > 1 || score === correct * 10);
  if (!possible) return bad("That round doesn't look right.");

  const key = `math:${user.id}:${roundId}`;
  const already = await prisma.walletTransaction.findUnique({ where: { idempotencyKey: key } });
  if (already) return reply(user.id, { duplicate: true });

  const last = await prisma.walletTransaction.findFirst({
    where: { userId: user.id, refType: "mindgym-math" },
    orderBy: { createdAt: "desc" },
  });
  if (last && Date.now() - new Date(last.createdAt).getTime() < MATH_MIN_GAP_MS) {
    return reply(user.id, null, { message: "Neurons are paid at most once a minute for Quick Math. Play another full round." });
  }

  const neurons = Math.min(MATH_MAX_NEURONS, Math.floor(score / MATH_POINTS_PER_NEURON));
  if (neurons < 1) {
    return reply(user.id, null, { message: `Score at least ${MATH_POINTS_PER_NEURON} points in a round to earn Neurons.` });
  }
  const res = await awardNeurons(user.id, neurons, {
    reason: "Quick Math round",
    refType: "mindgym-math",
    refId: roundId,
    idempotencyKey: key,
  });
  return reply(user.id, res);
}

async function handleSudoku(user, body) {
  const { seedKey, vals } = body;
  const m = typeof seedKey === "string" ? /^(\d{4}-\d{2}-\d{2}):(easy|medium|hard)$/.exec(seedKey) : null;
  if (!m) return bad("That puzzle doesn't look right.");
  const [, day, difficulty] = m;
  // Today's puzzle (or yesterday's, for someone who finished just after midnight UTC).
  if (day !== utcDay() && day !== utcDay(-1)) {
    return reply(user.id, null, { message: "That puzzle is too old to earn Neurons. Today's puzzle is waiting." });
  }
  if (!Array.isArray(vals) || vals.length !== 81 || !vals.every((v) => isInt(v) && v >= 1 && v <= 9)) {
    return bad("That grid doesn't look right.");
  }
  const solution = solutionFor(seedKey, difficulty);
  if (!vals.every((v, i) => v === solution[i])) return bad("That grid isn't the solution.");

  const res = await awardNeurons(user.id, SUDOKU_NEURONS[difficulty], {
    reason: `Daily Sudoku (${difficulty})`,
    refType: "mindgym-sudoku",
    refId: seedKey,
    idempotencyKey: `sudoku:${user.id}:${seedKey}`,
  });
  return reply(user.id, res);
}

// Wins in the other games are reported by the browser, so they're limited, not proven:
// fixed payouts, one claim per win, a short gap, a daily limit per game and the overall daily cap.
async function handleGame(user, body) {
  const { gameId, level, claimId } = body;
  const base = typeof gameId === "string" && Object.prototype.hasOwnProperty.call(GAME_NEURONS, gameId) ? GAME_NEURONS[gameId] : 0;
  if (!base) return bad("Unknown game.");
  if (typeof claimId !== "string" || claimId.length < 6 || claimId.length > 40) return bad("That win doesn't look right.");
  const mult = LEVEL_MULT[level] || 1;

  const key = `game:${user.id}:${gameId}:${claimId}`;
  const already = await prisma.walletTransaction.findUnique({ where: { idempotencyKey: key } });
  if (already) return reply(user.id, { duplicate: true });

  const last = await prisma.walletTransaction.findFirst({
    where: { userId: user.id, refType: { startsWith: "mindgym-game" } },
    orderBy: { createdAt: "desc" },
  });
  if (last && Date.now() - new Date(last.createdAt).getTime() < GAME_MIN_GAP_MS) {
    return reply(user.id, null, { message: "Slow down a little. Neurons are paid for real wins, one at a time." });
  }
  const startOfDay = new Date(utcDay() + "T00:00:00.000Z");
  const today = await prisma.walletTransaction.count({
    where: { userId: user.id, refType: `mindgym-game-${gameId}`, createdAt: { gte: startOfDay } },
  });
  if (today >= GAME_MAX_WINS_PER_DAY) {
    return reply(user.id, null, { message: `You've earned the daily limit for this game (${GAME_MAX_WINS_PER_DAY} wins). Try another game or come back tomorrow.` });
  }
  const res = await awardNeurons(user.id, Math.round(base * mult), {
    reason: `${gameId} win${LEVEL_MULT[level] ? " (" + level + ")" : ""}`,
    refType: `mindgym-game-${gameId}`,
    refId: claimId,
    idempotencyKey: key,
  });
  return reply(user.id, res);
}

export async function POST(req) {
  const user = await requireUser();
  if (!user) return bad("Not signed in", 401);
  if (user.isGuest) return guestBlockedResponse();

  let body;
  try { body = await req.json(); } catch { return bad("Bad request."); }
  if (!body || typeof body !== "object") return bad("Bad request.");

  try {
    if (body.game === "math") return await handleMath(user, body);
    if (body.game === "sudoku") return await handleSudoku(user, body);
    if (body.game === "play") return await handleGame(user, body);
    return bad("Unknown game.");
  } catch (err) {
    console.error("mindgym reward failed", err);
    return bad("Couldn't add Neurons right now. Your score is still saved on this device.", 500);
  }
}