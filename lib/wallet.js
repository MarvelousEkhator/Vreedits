import { prisma } from "@/lib/prisma";

export const CURRENCIES = ["neurons", "gems", "vcoins"];
// V-Coins are the paid currency (like Robux). Users BUY them with real money and SPEND them in the app;
// everything spent lands in the platform wallet below, which is yours to withdraw.
export const USD_PER_VCOIN = 0.01;          // face value: 100 V-Coins = $1 (bigger packs add a bonus)
export const PLATFORM_ID = "platform";      // the wallet that collects everything users spend
export const PREMIUM_PRICE_VCOINS = 300;    // Premium cost per period
export const PREMIUM_DAYS = 30;
export const PACKS = [                      // what users can buy (usd -> V-Coins)
  { id: "v200", usd: 2, vcoins: 200 },
  { id: "v550", usd: 5, vcoins: 550 },      // +10% bonus
  { id: "v1200", usd: 10, vcoins: 1200 },   // +20% bonus
  { id: "v3200", usd: 25, vcoins: 3200 },   // +28% bonus
];
const PAY_CURRENCY = (process.env.FLW_CURRENCY || "USD").toUpperCase();
const DAILY_NEURON_CAP = 500;
// What Premium gives (shown on the Premium page too)
export const PREMIUM_NEURON_CAP = 1000;     // double the daily Neuron limit
export const PREMIUM_SHOP_DISCOUNT = 0.2;   // 20% off the Neuron price of shop items
export const PREMIUM_RESEARCH_PER_HOUR = 60; // Syna web research per hour (everyone else gets 20)

export class WalletError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function checkCurrency(c) {
  if (!CURRENCIES.includes(c)) throw new WalletError("Unknown currency", "bad_currency");
}
function checkAmount(n) {
  if (!Number.isInteger(n) || n <= 0)
    throw new WalletError("Amount must be a positive whole number", "bad_amount");
}
function pickBalances(w) {
  return { neurons: w.neurons, gems: w.gems, vcoins: w.vcoins };
}

export function usdToVcoins(usd) {
  return Math.round(usd / USD_PER_VCOIN);
}

// Core: one atomic balance change + ledger row. Must run inside prisma.$transaction.
async function applyChange(tx, userId, currency, delta, meta = {}) {
  if (meta.idempotencyKey) {
    const dup = await tx.walletTransaction.findUnique({
      where: { idempotencyKey: meta.idempotencyKey },
    });
    if (dup) return { duplicate: true, transaction: dup };
  }

  // Create the wallet row if missing (safe under concurrency)
  await tx.wallet.createMany({ data: [{ userId }], skipDuplicates: true });

  if (delta < 0) {
    // Conditional update: only succeeds if enough balance, so it can never go negative
    const r = await tx.wallet.updateMany({
      where: { userId, [currency]: { gte: -delta } },
      data: { [currency]: { increment: delta } },
    });
    if (r.count === 0)
      throw new WalletError(`Not enough ${currency}`, "insufficient_funds");
  } else {
    await tx.wallet.update({
      where: { userId },
      data: { [currency]: { increment: delta } },
    });
  }

  const w = await tx.wallet.findUnique({ where: { userId } });
  const transaction = await tx.walletTransaction.create({
    data: {
      userId,
      currency,
      amount: delta,
      balanceAfter: w[currency],
      type: meta.type || (delta > 0 ? "earn" : "spend"),
      reason: meta.reason || null,
      refType: meta.refType || null,
      refId: meta.refId || null,
      idempotencyKey: meta.idempotencyKey || null,
    },
  });
  return { duplicate: false, transaction, balances: pickBalances(w) };
}

// Runs fn in a transaction; if the same idempotency key raced in twice, return the first result
async function run(fn, idempotencyKey) {
  try {
    return await prisma.$transaction(fn);
  } catch (err) {
    if (err?.code === "P2002" && idempotencyKey) {
      const existing = await prisma.walletTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) return { duplicate: true, transaction: existing };
    }
    throw err;
  }
}

export async function getWallet(userId) {
  const w = await prisma.wallet.findUnique({ where: { userId } });
  return w ? pickBalances(w) : { neurons: 0, gems: 0, vcoins: 0 };
}

export async function getHistory(userId, { limit = 30, currency } = {}) {
  return prisma.walletTransaction.findMany({
    where: { userId, ...(currency ? { currency } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
}

// NEURONS: earned only. Call this from server code (e.g. a validated Mind Gym result),
// never from a route that trusts the client's claimed amount.
export async function awardNeurons(userId, amount, { reason, refType, refId, idempotencyKey } = {}) {
  checkAmount(amount);
  return run(async (tx) => {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const agg = await tx.walletTransaction.aggregate({
      _sum: { amount: true },
      where: { userId, currency: "neurons", type: "earn", createdAt: { gte: startOfDay } },
    });
    const sub = await tx.premiumSub.findUnique({ where: { userId } });
    const cap = sub && sub.expiresAt > new Date() ? PREMIUM_NEURON_CAP : DAILY_NEURON_CAP;
    const remaining = cap - (agg._sum.amount || 0);
    if (remaining <= 0) return { capped: true, awarded: 0 };
    const grant = Math.min(amount, remaining);
    const res = await applyChange(tx, userId, "neurons", grant, {
      type: "earn", reason, refType, refId, idempotencyKey,
    });
    return { ...res, awarded: grant, capped: grant < amount };
  }, idempotencyKey);
}

// GEMS: purchased. Only call this from a verified payment confirmation.
export async function creditGemsFromPurchase(userId, amount, { reason, refId, idempotencyKey } = {}) {
  checkAmount(amount);
  return run(
    (tx) => applyChange(tx, userId, "gems", amount, {
      type: "purchase", reason: reason || "Gem purchase", refType: "payment", refId, idempotencyKey,
    }),
    idempotencyKey
  );
}

// Spend any currency (unlocking frames/themes, bounty escrow, etc.)
export async function spend(userId, currency, amount, { reason, refType, refId, idempotencyKey } = {}) {
  checkCurrency(currency);
  checkAmount(amount);
  return run(
    (tx) => applyChange(tx, userId, currency, -amount, {
      type: "spend", reason, refType, refId, idempotencyKey,
    }),
    idempotencyKey
  );
}

// V-COINS: move between two users atomically (both ledger rows or neither)
export async function transferVcoins(fromUserId, toUserId, amount, { reason, refType, refId, idempotencyKey } = {}) {
  checkAmount(amount);
  if (fromUserId === toUserId) throw new WalletError("Can't send to yourself", "self_transfer");
  return run(async (tx) => {
    const out = await applyChange(tx, fromUserId, "vcoins", -amount, {
      type: "transfer_out", reason, refType, refId,
      idempotencyKey: idempotencyKey ? idempotencyKey + ":out" : undefined,
    });
    if (out.duplicate) return out;
    await applyChange(tx, toUserId, "vcoins", amount, {
      type: "transfer_in", reason, refType, refId,
      idempotencyKey: idempotencyKey ? idempotencyKey + ":in" : undefined,
    });
    return out;
  }, idempotencyKey ? idempotencyKey + ":out" : undefined);
}
/* ═══════════════════════════════════════════════════════════════
   BUYING V-COINS (Flutterwave) — money in
   ═══════════════════════════════════════════════════════════════ */

// Flutterwave test keys start with FLWSECK_TEST. Test payments give coins but are never counted as your money.
export function paymentsAreTest() {
  return String(process.env.FLW_SECRET_KEY || "").toUpperCase().includes("_TEST");
}

export function appUrl() {
  return (process.env.APP_URL || "https://synovra-i8yr.onrender.com").replace(/\/$/, "");
}

// Step 1: record the purchase as "pending" and ask Flutterwave for a checkout link.
export async function startPurchase(user, packId) {
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) throw new WalletError("That pack doesn't exist.", "bad_pack");
  const secret = process.env.FLW_SECRET_KEY;
  if (!secret) throw new WalletError("Buying V-Coins isn't switched on yet.", "payments_off");

  // At most 10 checkouts an hour per person
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.payment.count({ where: { userId: user.id, createdAt: { gte: since } } });
  if (recent >= 10) throw new WalletError("Too many attempts. Please try again later.", "rate_limited");

  // Tidy up checkouts that were never finished
  await prisma.payment.updateMany({
    where: { userId: user.id, status: "pending", createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    data: { status: "expired" },
  }).catch(() => {});

  const txRef = `vrd_${user.id.slice(-6)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await prisma.payment.create({
    data: { userId: user.id, txRef, packId: pack.id, amount: pack.usd, currency: PAY_CURRENCY, vcoins: pack.vcoins },
  });

  const res = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_ref: txRef,
      amount: pack.usd,
      currency: PAY_CURRENCY,
      redirect_url: `${appUrl()}/premium`,
      customer: { email: user.email || "customer@vreedits.com", name: user.displayName || user.username || "Vreedits user" },
      customizations: { title: "Vreedits", description: `${pack.vcoins} V-Coins` },
      meta: { userId: user.id, packId: pack.id },
    }),
  });
  const json = await res.json().catch(() => null);
  const link = json?.data?.link;
  if (!res.ok || !link) {
    console.error("Flutterwave init failed:", res.status, JSON.stringify(json)?.slice(0, 300));
    await prisma.payment.update({ where: { txRef }, data: { status: "failed" } }).catch(() => {});
    throw new WalletError("Couldn't start the payment. Please try again.", "init_failed");
  }
  return { link, txRef };
}

// Step 2: after paying (browser comes back, or Flutterwave's webhook calls). Never trusts what the
// browser says: it asks Flutterwave directly, checks the amount, and credits exactly once.
export async function settlePayment({ txRef, transactionId }) {
  if (!txRef) return { ok: false, error: "Missing payment reference." };
  const pay = await prisma.payment.findUnique({ where: { txRef } });
  if (!pay) return { ok: false, error: "Unknown payment." };
  if (pay.status === "paid" || pay.status === "paid_test") return { ok: true, already: true, vcoins: pay.vcoins };

  const secret = process.env.FLW_SECRET_KEY;
  if (!secret) return { ok: false, error: "Payments aren't set up yet." };

  const url = transactionId
    ? `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`
    : `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" });
  const json = await res.json().catch(() => null);
  const d = json?.data;
  if (!res.ok || !d) return { ok: false, pending: true, error: "We couldn't confirm the payment yet." };
  if (d.tx_ref !== txRef) return { ok: false, error: "Payment reference mismatch." };
  if (d.status !== "successful") {
    return { ok: false, pending: d.status === "pending", error: d.status === "pending" ? "Payment is still processing." : "Payment was not completed." };
  }
  if (String(d.currency).toUpperCase() !== String(pay.currency).toUpperCase() || Number(d.amount) < Number(pay.amount)) {
    console.error("Payment amount mismatch", txRef, d.amount, d.currency);
    return { ok: false, error: "Payment amount didn't match." };
  }

  await run(async (tx) => {
    const upd = await tx.payment.updateMany({
      where: { id: pay.id, status: "pending" },
      // Test-key payments are marked "paid_test" so they never count as your money
      data: { status: paymentsAreTest() ? "paid_test" : "paid", paidAt: new Date(), flwId: String(d.id) },
    });
    if (upd.count === 0) return { duplicate: true }; // someone else (e.g. the webhook) already credited it
    return applyChange(tx, pay.userId, "vcoins", pay.vcoins, {
      type: "purchase", reason: `Bought ${pay.vcoins} V-Coins`, refType: "payment", refId: pay.id,
      idempotencyKey: `flw:${txRef}`,
    });
  }, `flw:${txRef}`);
  return { ok: true, vcoins: pay.vcoins };
}

// If someone paid but closed the tab (and the webhook was missed), their next visit finishes the job.
export async function reconcileUserPayments(userId) {
  const rows = await prisma.payment.findMany({
    where: { userId, status: "pending", createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000), lt: new Date(Date.now() - 2 * 60 * 1000) } },
    orderBy: { createdAt: "desc" }, take: 3,
  });
  let credited = 0;
  for (const p of rows) {
    try {
      const r = await settlePayment({ txRef: p.txRef });
      if (r.ok && !r.already) credited += r.vcoins || 0;
    } catch {}
  }
  return credited;
}

/* ═══════════════════════════════════════════════════════════════
   SPENDING V-COINS — everything spent goes to the platform wallet
   ═══════════════════════════════════════════════════════════════ */

export async function getPremium(userId) {
  const sub = await prisma.premiumSub.findUnique({ where: { userId } });
  const active = !!sub && sub.expiresAt > new Date();
  return { active, expiresAt: sub ? sub.expiresAt : null };
}

// Takes V-Coins from the user, gives the same amount to the platform wallet, and extends Premium,
// all in one step: either everything happens or nothing does.
export async function buyPremium(userId, requestId) {
  const key = requestId ? `premium:${userId}:${String(requestId).slice(0, 60)}` : undefined;
  return run(async (tx) => {
    const out = await applyChange(tx, userId, "vcoins", -PREMIUM_PRICE_VCOINS, {
      type: "spend", reason: `Premium (${PREMIUM_DAYS} days)`, refType: "premium", idempotencyKey: key,
    });
    if (out.duplicate) return { duplicate: true };
    await applyChange(tx, PLATFORM_ID, "vcoins", PREMIUM_PRICE_VCOINS, {
      type: "revenue", reason: "Premium purchase", refType: "premium", refId: userId,
    });
    const now = new Date();
    const cur = await tx.premiumSub.findUnique({ where: { userId } });
    const base = cur && cur.expiresAt > now ? cur.expiresAt : now;
    const expiresAt = new Date(base.getTime() + PREMIUM_DAYS * 24 * 60 * 60 * 1000);
    await tx.premiumSub.upsert({ where: { userId }, update: { expiresAt }, create: { userId, expiresAt } });
    return { duplicate: false, expiresAt, balances: out.balances };
  }, key);
}

/* ═══════════════════════════════════════════════════════════════
   OWNER: platform wallet + withdrawals
   ═══════════════════════════════════════════════════════════════ */

export async function isAdminUser(userId) {
  if (!userId) return false;
  const list = (process.env.ADMIN_EMAILS || "lillianhenryvague@gmail.com")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return !!u?.email && list.includes(u.email.toLowerCase());
}

// What one V-Coin is really worth to you: real dollars collected (minus Flutterwave's fee) divided by V-Coins sold.
// FLW_FEE_PERCENT is an estimate (default 3.8). Set it in Render to match what Flutterwave charges you.
export const FEE_PERCENT = Number(process.env.FLW_FEE_PERCENT || 3.8);
async function realUsdPerVcoin() {
  const sold = await prisma.payment.aggregate({ _sum: { amount: true, vcoins: true }, where: { status: "paid" } });
  const coins = sold._sum.vcoins || 0;
  return coins > 0 ? ((sold._sum.amount || 0) * (1 - FEE_PERCENT / 100)) / coins : USD_PER_VCOIN * (1 - FEE_PERCENT / 100);
}

export async function getTreasury() {
  const [wallet, earned, paidOut, paid, recentWithdrawals] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId: PLATFORM_ID } }),
    prisma.walletTransaction.aggregate({ _sum: { amount: true }, where: { userId: PLATFORM_ID, currency: "vcoins", type: "revenue" } }),
    prisma.withdrawal.aggregate({ _sum: { vcoins: true, usd: true } }),
    prisma.payment.aggregate({ _sum: { amount: true }, _count: true, where: { status: "paid" } }),
    prisma.withdrawal.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const available = wallet ? wallet.vcoins : 0;
  const rate = await realUsdPerVcoin();
  return {
    rate,
    available,
    availableUsd: Math.round(available * rate * 100) / 100,
    earned: earned._sum.amount || 0,
    withdrawn: paidOut._sum.vcoins || 0,
    withdrawnUsd: paidOut._sum.usd || 0,
    soldUsd: paid._sum.amount || 0,
    feesUsd: Math.round((paid._sum.amount || 0) * FEE_PERCENT) / 100,
    feePercent: FEE_PERCENT,
    purchases: paid._count || 0,
    recentWithdrawals,
  };
}

// Records money you took out (the actual bank transfer is done from your Flutterwave dashboard).
export async function recordWithdrawal(adminId, vcoins, note) {
  checkAmount(vcoins);
  return prisma.$transaction(async (tx) => {
    await applyChange(tx, PLATFORM_ID, "vcoins", -vcoins, {
      type: "withdrawal", reason: note || "Withdrawal", refType: "withdrawal", refId: adminId,
    });
    return tx.withdrawal.create({
      data: { vcoins, usd: Math.round(vcoins * (await realUsdPerVcoin()) * 100) / 100, note: note || null, adminId },
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   THE SHOP — items you make, paid for in Neurons, V-Coins, or both
   • Neuron part: free coins, they simply leave the user's wallet (no cash value).
   • V-Coin part: real-money coins, they go to the platform wallet (yours to withdraw).
   Add or change items here: slot is "frame" or "badge".
   ═══════════════════════════════════════════════════════════════ */
// Everything in the shop lives in a few image files in public/ (each holds many pictures in a grid).
const SHEETS = {
  frame:     { file: "/api/shop-art/frames.webp",     cols: 8, rows: 7 },
  nameplate: { file: "/api/shop-art/nameplates.webp", cols: 4, rows: 9 },
  effect:    { file: "/api/shop-art/effects.webp",    cols: 5, rows: 8 },
  badge:     { file: "/api/shop-art/badges.webp",     cols: 8, rows: 6 },
};
// Picture frames. FR(id, name, spot, fit, neurons, vcoins, description). fit = how much of the frame's width the photo fills.
const FR = (id, name, sprite, fit, neurons, vcoins, desc) => ({
  id: "frame-" + id, slot: "frame", name, desc: desc || "", neurons, vcoins, sprite, fit, sheet: SHEETS.frame,
});
// Nameplates, profile effects and picture badges: SP(slot, idPrefix, spot, name, neurons, vcoins, extra)
const SLOT_DESC = { nameplate: "A banner behind your name.", effect: "A decoration around the top of your profile.", badge: "A badge shown under your name." };
const SP = (slot, prefix, sprite, name, neurons, vcoins, extra = {}) => ({
  id: `${prefix}-${sprite}`, slot, name, desc: extra.desc || SLOT_DESC[slot], neurons, vcoins, sprite, sheet: SHEETS[slot], ...extra,
});
export const SHOP_ITEMS = [
  // Starter rings (made with colours only). No longer sold, but anyone who owns one keeps it.
  { id: "frame-violet", slot: "frame", name: "Violet Glow", desc: "A soft violet ring.", neurons: 50, vcoins: 0, retired: true,
    ring: "conic-gradient(from 0deg, #c4b5fd, #7c3aed, #c4b5fd)" },
  { id: "frame-gold", slot: "frame", name: "Golden Hour", desc: "A warm gold ring.", neurons: 150, vcoins: 0, retired: true,
    ring: "conic-gradient(from 0deg, #fde68a, #f59e0b, #fef3c7, #f59e0b, #fde68a)" },
  { id: "frame-aurora", slot: "frame", name: "Aurora", desc: "Shifting northern-lights colours.", neurons: 300, vcoins: 20, retired: true,
    ring: "conic-gradient(from 0deg, #22d3ee, #a78bfa, #f472b6, #22d3ee)" },
  { id: "frame-diamond", slot: "frame", name: "Diamond", desc: "Icy and rare.", neurons: 500, vcoins: 50, retired: true,
    ring: "conic-gradient(from 0deg, #e0f2fe, #38bdf8, #ffffff, #38bdf8, #e0f2fe)" },

  // Premium members only (free while Premium is active)
  { id: "frame-royal", slot: "frame", name: "Royal", desc: "Premium only. Wear it while your Premium is active.", neurons: 0, vcoins: 0, premiumOnly: true,
    ring: "conic-gradient(from 0deg, #fde68a, #f59e0b, #b45309, #fde68a, #fef3c7, #f59e0b, #fde68a)" },

  // Frames
  FR("ribbon", "Violet Ribbon", 21, 0.678, 100, 0, "Silky violet ribbons with a star."),
  FR("sky", "Sky Ring", 22, 0.678, 100, 0, "A bright blue sky ring with clouds."),
  FR("pinkwing", "Pink Wings", 24, 0.633, 120, 0, "Soft pink ribbon with a butterfly."),
  FR("leaf", "Leaf Wreath", 26, 0.63, 150, 0, "Fresh green leaves."),
  FR("silver", "Silver Veil", 28, 0.678, 150, 0, "Flowing silver ribbons."),
  FR("goldbrush", "Gold Brush", 23, 0.654, 200, 0, "Black and gold brush strokes with a crown."),
  FR("sunset", "Sunset", 27, 0.582, 200, 0, "A warm sunset ring."),
  FR("night", "Night Sky", 29, 0.678, 200, 0, "Deep purple night with a crescent moon."),
  FR("tech", "Tech Ring", 25, 0.678, 250, 0, "A glowing blue game-HUD ring."),
  FR("sakura", "Sakura Bloom", 0, 0.5, 300, 0, "Cherry blossoms and a torii gate."),
  FR("ocean", "Ocean Wave", 1, 0.5, 300, 0, "A crashing blue wave."),
  FR("flame", "Flame Edge", 2, 0.5, 350, 0, "A ring of fire."),
  FR("forest", "Forest Whispers", 4, 0.627, 350, 0, "Vines, white flowers and a lantern."),
  FR("lilies", "White Lilies", 15, 0.504, 350, 0, "A wreath of white lilies."),
  FR("autumn", "Autumn Leaves", 12, 0.61, 350, 0, "Red and orange maple leaves."),
  FR("hearts", "Sweet Hearts", 8, 0.5, 400, 0, "Pink bows and hearts."),
  FR("roses", "Dark Roses", 9, 0.616, 400, 0, "Black roses and thorns."),
  FR("wind", "Silent Wind", 20, 0.5, 400, 0, "Swirling grey mist."),
  FR("ice", "Ice Crystal", 13, 0.61, 450, 0, "Frozen crystals and snowflakes."),
  FR("bookworm", "Bookworm", 16, 0.511, 400, 20, "Stacked books and a candle."),
  FR("moonlight", "Moonlight", 3, 0.5, 400, 20, "A crescent moon over violet clouds."),
  FR("butterfly", "Butterfly Dreams", 5, 0.556, 450, 20, "Glowing violet butterflies."),
  FR("galaxy", "Galaxy", 6, 0.62, 500, 30, "A ringed planet among the stars."),
  FR("starry", "Starry Night", 10, 0.62, 500, 30, "Golden stars on a glowing chain."),
  FR("clouds", "Dreamy Clouds", 11, 0.509, 500, 30, "Pink-purple clouds and a crescent moon."),
  FR("neonheart", "Neon Heart", 14, 0.59, 500, 30, "Neon hearts and chains."),
  FR("dragon", "Dragon Spirit", 7, 0.569, 600, 40, "A blue water dragon circling you."),
  FR("kawaii", "Kawaii Clouds", 17, 0.5, 600, 40, "Pastel clouds with a little bunny."),
  FR("underwater", "Underwater", 18, 0.568, 600, 40, "Glowing jellyfish in deep blue."),
  FR("glitch", "Glitch", 19, 0.651, 700, 50, "A digital glitch ring."),
  FR("blossomgate", "Blossom Gate", 30, 0.474, 300, 0, "Cherry blossoms around a red torii gate."),
  FR("moontide", "Moon Tide", 31, 0.472, 300, 0, "A crescent moon rising over crashing waves."),
  FR("dragonflame", "Dragon Flame", 32, 0.509, 450, 25, "A fire dragon circling you."),
  FR("violetwings", "Violet Wings", 33, 0.523, 250, 0, "Violet butterflies and ribbons."),
  FR("moonclouds", "Moon Clouds", 34, 0.452, 300, 0, "A moon over soft blue clouds."),
  FR("springwreath", "Spring Wreath", 35, 0.54, 250, 0, "Green vines and white flowers."),
  FR("chaincrown", "Chain Crown", 36, 0.557, 350, 0, "Purple chains under a little crown."),
  FR("mangacards", "Manga Cards", 37, 0.524, 350, 0, "Black and white comic cards with petals."),
  FR("duskcity", "Dusk City", 38, 0.457, 350, 0, "A purple city sky at dusk."),
  FR("foxspirit", "Fox Spirit", 39, 0.658, 450, 25, "A white fox mask and red flowers."),
  FR("paperplanes", "Paper Planes", 40, 0.492, 300, 0, "Clouds and paper planes in flight."),
  FR("headphones", "Headphones", 41, 0.625, 300, 0, "Music notes around a pair of headphones."),
  FR("sunflower", "Sunflower", 42, 0.473, 250, 0, "Golden sunflowers and leaves."),
  FR("pixelcrown", "Pixel Crown", 43, 0.583, 350, 0, "Green pixel blocks and a game controller."),
  FR("cosmicstorm", "Cosmic Storm", 44, 0.51, 500, 30, "Planets in a purple lightning storm."),
  FR("bluebutterflies", "Blue Butterflies", 45, 0.614, 350, 0, "Glowing blue butterflies."),
  FR("thorncrown", "Thorn Crown", 46, 0.547, 400, 0, "Silver thorns, roses and a crown."),
  FR("lightning", "Lightning", 47, 0.62, 450, 25, "Purple lightning around you."),
  FR("pinkdreams", "Pink Dreams", 48, 0.6, 250, 0, "Pink clouds, stars and a crescent moon."),

  // Nameplates
  SP("nameplate", "np", 0, "Blossom Moon", 300, 0),
  SP("nameplate", "np", 1, "Manga Panels", 250, 0),
  SP("nameplate", "np", 2, "Great Wave", 400, 25),
  SP("nameplate", "np", 3, "Oni Flame", 400, 25),
  SP("nameplate", "np", 4, "Crescent Dreams", 350, 0),
  SP("nameplate", "np", 5, "Jasmine Vine", 200, 0),
  SP("nameplate", "np", 6, "Butterfly Night", 250, 0),
  SP("nameplate", "np", 8, "City Dusk", 400, 25),
  SP("nameplate", "np", 9, "Orbit", 200, 0),
  SP("nameplate", "np", 10, "Red Torii", 250, 0),
  SP("nameplate", "np", 11, "Old Letter", 150, 0),
  SP("nameplate", "np", 12, "Skull Roses", 300, 0),
  SP("nameplate", "np", 13, "Sky Flight", 350, 0),
  SP("nameplate", "np", 14, "Headphone Beat", 300, 0),
  SP("nameplate", "np", 15, "Spiral Galaxy", 450, 30),
  SP("nameplate", "np", 16, "Forest Light", 400, 25),
  SP("nameplate", "np", 17, "Deep Sea", 450, 30),
  SP("nameplate", "np", 18, "Sakura Sky", 400, 25),
  SP("nameplate", "np", 19, "Blood Sunset", 400, 25),
  SP("nameplate", "np", 20, "Shadow Cat", 250, 0),
  SP("nameplate", "np", 21, "Storm", 300, 0),
  SP("nameplate", "np", 22, "Library", 300, 0),
  SP("nameplate", "np", 23, "Cloud Nine", 350, 0),
  SP("nameplate", "np", 24, "Spider Lily", 250, 0),
  SP("nameplate", "np", 25, "Game Night", 250, 0),
  SP("nameplate", "np", 26, "Blue Butterflies", 250, 0),
  SP("nameplate", "np", 27, "Shadow Eyes", 350, 0),
  SP("nameplate", "np", 28, "Golden Sea", 400, 25),
  SP("nameplate", "np", 29, "Gothic Cross", 300, 0),
  SP("nameplate", "np", 30, "Bunny Clouds", 350, 0),
  SP("nameplate", "np", 31, "Purple Flame", 350, 0),
  SP("nameplate", "np", 32, "Pixel Frame", 200, 0),
  SP("nameplate", "np", 33, "Neon Palms", 450, 30),
  SP("nameplate", "np", 34, "Pink Butterflies", 250, 0),
  SP("nameplate", "np", 35, "Night Window", 450, 30),

  // Profile effects
  SP("effect", "fx", 0, "Torii Blossom", 500, 30),
  SP("effect", "fx", 1, "Moon Veil", 500, 30),
  SP("effect", "fx", 2, "Water Dragon", 700, 50),
  SP("effect", "fx", 3, "Sunset Shrine", 600, 40),
  SP("effect", "fx", 4, "Raven Blade", 600, 40),
  SP("effect", "fx", 5, "Wave Dance", 500, 30),
  SP("effect", "fx", 6, "Violet Wings", 450, 25),
  SP("effect", "fx", 7, "Fire Moon", 550, 35),
  SP("effect", "fx", 8, "Study Nook", 450, 25),
  SP("effect", "fx", 9, "Crystal Butterflies", 500, 30),
  SP("effect", "fx", 10, "Rose Crown", 500, 30),
  SP("effect", "fx", 11, "Forest Glade", 550, 35),
  SP("effect", "fx", 12, "Cotton Candy", 450, 25),
  SP("effect", "fx", 13, "Storm Clouds", 450, 25),
  SP("effect", "fx", 14, "Golden Sun", 550, 35),
  SP("effect", "fx", 15, "Manga Wall", 400, 20),
  SP("effect", "fx", 16, "Neon City", 550, 35),
  SP("effect", "fx", 17, "Torii Lantern", 500, 30),
  SP("effect", "fx", 18, "Beat Drop", 450, 25),
  SP("effect", "fx", 19, "Little Ghosts", 450, 25),
  SP("effect", "fx", 20, "Classroom", 500, 30),
  SP("effect", "fx", 21, "Phoenix", 700, 50),
  SP("effect", "fx", 22, "Planets", 500, 30),
  SP("effect", "fx", 23, "Lily Garden", 450, 25),
  SP("effect", "fx", 24, "Oni Mask", 600, 40),
  SP("effect", "fx", 25, "Moon Silk", 500, 30),
  SP("effect", "fx", 26, "Bamboo Lantern", 450, 25),
  SP("effect", "fx", 27, "Moon Shrine", 550, 35),
  SP("effect", "fx", 28, "Frost", 500, 30),
  SP("effect", "fx", 29, "Sunflowers", 400, 20),
  SP("effect", "fx", 30, "Neon Skyline", 550, 35),
  SP("effect", "fx", 31, "Silver Butterflies", 450, 25),
  SP("effect", "fx", 32, "Red Roses", 450, 25),
  SP("effect", "fx", 33, "Autumn Bridge", 500, 30),
  SP("effect", "fx", 34, "Astronaut", 600, 40),
  SP("effect", "fx", 35, "Sakura Waves", 550, 35),
  SP("effect", "fx", 36, "Candle Skull", 500, 30),
  SP("effect", "fx", 37, "Kitsune", 600, 40),

  // Badges (pictures)
  SP("badge", "bd", 0, "Founder", 0, 0, { hidden: true, desc: "Given by the owner. Not for sale." }),
  SP("badge", "bd", 1, "VIP", 500, 50),
  SP("badge", "bd", 2, "Supporter", 100, 0),
  SP("badge", "bd", 3, "Student", 60, 0),
  SP("badge", "bd", 4, "Anime Lover", 80, 0),
  SP("badge", "bd", 5, "Gamer", 60, 0),
  SP("badge", "bd", 6, "Music", 60, 0),
  SP("badge", "bd", 7, "Bookworm Cat", 60, 0),
  SP("badge", "bd", 8, "Nature Lover", 60, 0),
  SP("badge", "bd", 9, "Sports", 60, 0),
  SP("badge", "bd", 10, "Foodie", 60, 0),
  SP("badge", "bd", 11, "Fashion", 60, 0),
  SP("badge", "bd", 13, "Artist", 60, 0),
  SP("badge", "bd", 14, "Writer", 60, 0),
  SP("badge", "bd", 15, "Dreamer", 60, 0),
  SP("badge", "bd", 16, "Explorer", 80, 0),
  SP("badge", "bd", 17, "Problem Solver", 80, 0),
  SP("badge", "bd", 18, "Creative Mind", 80, 0),
  SP("badge", "bd", 19, "Chill", 60, 0),
  SP("badge", "bd", 20, "Anime", 80, 0),
  SP("badge", "bd", 21, "Royal", 300, 20),
  SP("badge", "bd", 22, "Kind Heart", 80, 0),
  SP("badge", "bd", 24, "Traveler", 80, 0),
  SP("badge", "bd", 25, "Hustler", 80, 0),
  SP("badge", "bd", 26, "Introvert", 60, 0),
  SP("badge", "bd", 27, "Silly", 60, 0),
  SP("badge", "bd", 28, "Emotional", 60, 0),
  SP("badge", "bd", 29, "Night Cat", 80, 0),
  SP("badge", "bd", 30, "Optimist", 80, 0),
  SP("badge", "bd", 31, "Realistic", 60, 0),
  SP("badge", "bd", 32, "Fire", 100, 0),
  SP("badge", "bd", 33, "Water", 100, 0),
  SP("badge", "bd", 34, "Earth", 100, 0),
  SP("badge", "bd", 35, "Air", 100, 0),
  SP("badge", "bd", 36, "Lightning", 100, 0),
  SP("badge", "bd", 37, "Galaxy", 120, 0),
  SP("badge", "bd", 38, "Star", 100, 0),
  SP("badge", "bd", 39, "Love", 100, 0),
  SP("badge", "bd", 40, "Good Vibes", 80, 0),
  SP("badge", "bd", 41, "Sad", 60, 0),
  SP("badge", "bd", 42, "Angry", 60, 0),
  SP("badge", "bd", 43, "No Bad Days", 80, 0),
  SP("badge", "bd", 44, "Level Up", 200, 0),
  SP("badge", "bd", 45, "Premium", 0, 0, { premiumOnly: true, desc: "Premium only. Free while your Premium is active." }),
  SP("badge", "bd", 46, "Collector", 400, 30),
  SP("badge", "bd", 47, "Just Me", 60, 0),

  // Badges (small icons)
  { id: "badge-bookworm", slot: "badge", name: "Bookworm", desc: "For people who never put the book down.", neurons: 40, vcoins: 0, retired: true, icon: "book" },
  { id: "badge-owl", slot: "badge", name: "Night Owl", desc: "Studying while everyone sleeps.", neurons: 80, vcoins: 0, retired: true, icon: "moon" },
  { id: "badge-brain", slot: "badge", name: "Big Brain", desc: "Mind Gym champion.", neurons: 200, vcoins: 10, retired: true, icon: "brain" },
  { id: "badge-legend", slot: "badge", name: "Legend", desc: "The top of the leaderboard.", neurons: 400, vcoins: 40, retired: true, icon: "trophy" },
];

export function shopItem(id) {
  return SHOP_ITEMS.find((i) => i.id === id) || null;
}

export async function getOwnedItems(userId) {
  const rows = await prisma.userItem.findMany({ where: { userId } });
  return rows.map((r) => ({ itemId: r.itemId, equipped: r.equipped }));
}

// { frame: item | null, badge: item | null } — what a person is wearing right now
export async function getEquipped(userId) {
  const [rows, prem] = await Promise.all([
    prisma.userItem.findMany({ where: { userId, equipped: true } }),
    getPremium(userId),
  ]);
  const out = { frame: null, badge: null, nameplate: null, effect: null, premium: prem.active };
  for (const r of rows) {
    const it = shopItem(r.itemId);
    if (!it || out[it.slot] !== null) continue;
    if (it.premiumOnly && !prem.active) continue; // Premium lapsed: the exclusive item stops showing
    out[it.slot] = it;
  }
  return out;
}

// The same thing for many people at once (inbox lists, etc.): { userId: { frame, badge, nameplate, effect, premium } }
export async function getEquippedMany(userIds) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean))).slice(0, 60);
  const out = {};
  if (ids.length === 0) return out;
  const [rows, subs] = await Promise.all([
    prisma.userItem.findMany({ where: { userId: { in: ids }, equipped: true } }),
    prisma.premiumSub.findMany({ where: { userId: { in: ids }, expiresAt: { gt: new Date() } }, select: { userId: true } }),
  ]);
  const prem = new Set(subs.map((s) => s.userId));
  for (const id of ids) out[id] = { frame: null, badge: null, nameplate: null, effect: null, premium: prem.has(id) };
  for (const r of rows) {
    const it = shopItem(r.itemId);
    const slot = out[r.userId];
    if (!it || !slot || slot[it.slot] !== null) continue;
    if (it.premiumOnly && !slot.premium) continue;
    slot[it.slot] = it;
  }
  return out;
}

// Neuron price for this person (Premium members pay less)
export function neuronPrice(item, isPremium) {
  return isPremium ? Math.ceil(item.neurons * (1 - PREMIUM_SHOP_DISCOUNT)) : item.neurons;
}

// One all-or-nothing step: take the Neurons, take the V-Coins (and give them to the platform), grant the item.
export async function buyShopItem(userId, itemId) {
  const item = shopItem(itemId);
  if (!item) throw new WalletError("That item doesn't exist.", "bad_item");
  if (item.hidden) throw new WalletError("This one is not for sale.", "not_for_sale");
  const prem = await getPremium(userId);
  if (item.premiumOnly) {
    // Free for Premium members: unlocked while active, never sold
    if (!prem.active) throw new WalletError("This one is for Premium members.", "premium_only");
    await prisma.userItem.createMany({ data: [{ userId, itemId }], skipDuplicates: true });
    return { ok: true };
  }
  const neuronCost = neuronPrice(item, prem.active);
  try {
    return await prisma.$transaction(async (tx) => {
      const have = await tx.userItem.findUnique({ where: { userId_itemId: { userId, itemId } } });
      if (have) throw new WalletError("You already own this.", "already_owned");
      if (neuronCost > 0) {
        await applyChange(tx, userId, "neurons", -neuronCost, {
          type: "spend", reason: `Shop: ${item.name}`, refType: "shop", refId: item.id,
        });
      }
      if (item.vcoins > 0) {
        await applyChange(tx, userId, "vcoins", -item.vcoins, {
          type: "spend", reason: `Shop: ${item.name}`, refType: "shop", refId: item.id,
        });
        await applyChange(tx, PLATFORM_ID, "vcoins", item.vcoins, {
          type: "revenue", reason: `Shop: ${item.name}`, refType: "shop", refId: userId,
        });
      }
      await tx.userItem.create({ data: { userId, itemId } });
      return { ok: true };
    });
  } catch (err) {
    if (err?.code === "P2002") throw new WalletError("You already own this.", "already_owned"); // double tap
    throw err;
  }
}

// Wear an item you own (one frame and one badge at a time), or take it off.
export async function setEquipped(userId, itemId, on) {
  const item = shopItem(itemId);
  if (!item) throw new WalletError("That item doesn't exist.", "bad_item");
  const owned = await prisma.userItem.findUnique({ where: { userId_itemId: { userId, itemId } } });
  if (!owned) throw new WalletError("You don't own this yet.", "not_owned");
  if (on && item.premiumOnly && !(await getPremium(userId)).active) throw new WalletError("Premium has ended. Renew it to wear this.", "premium_only");
  const sameSlot = SHOP_ITEMS.filter((i) => i.slot === item.slot).map((i) => i.id);
  await prisma.$transaction([
    prisma.userItem.updateMany({ where: { userId, itemId: { in: sameSlot } }, data: { equipped: false } }),
    ...(on ? [prisma.userItem.update({ where: { userId_itemId: { userId, itemId } }, data: { equipped: true } })] : []),
  ]);
  return getEquipped(userId);
}
