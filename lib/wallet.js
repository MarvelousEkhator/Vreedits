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
    const remaining = DAILY_NEURON_CAP - (agg._sum.amount || 0);
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
  if (pay.status === "paid") return { ok: true, already: true, vcoins: pay.vcoins };

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
      data: { status: "paid", paidAt: new Date(), flwId: String(d.id) },
    });
    if (upd.count === 0) return { duplicate: true }; // someone else (e.g. the webhook) already credited it
    return applyChange(tx, pay.userId, "vcoins", pay.vcoins, {
      type: "purchase", reason: `Bought ${pay.vcoins} V-Coins`, refType: "payment", refId: pay.id,
      idempotencyKey: `flw:${txRef}`,
    });
  }, `flw:${txRef}`);
  return { ok: true, vcoins: pay.vcoins };
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

// What one V-Coin is really worth to you: real dollars collected divided by V-Coins sold.
// Bonus packs give extra coins, so this is a little under the face value.
async function realUsdPerVcoin() {
  const sold = await prisma.payment.aggregate({ _sum: { amount: true, vcoins: true }, where: { status: "paid" } });
  const coins = sold._sum.vcoins || 0;
  return coins > 0 ? (sold._sum.amount || 0) / coins : USD_PER_VCOIN;
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
export const SHOP_ITEMS = [
  { id: "frame-violet", slot: "frame", name: "Violet Glow", desc: "A soft violet ring around your photo.", neurons: 50, vcoins: 0,
    ring: "conic-gradient(from 0deg, #c4b5fd, #7c3aed, #c4b5fd)" },
  { id: "frame-gold", slot: "frame", name: "Golden Hour", desc: "A warm gold ring for steady learners.", neurons: 150, vcoins: 0,
    ring: "conic-gradient(from 0deg, #fde68a, #f59e0b, #fef3c7, #f59e0b, #fde68a)" },
  { id: "frame-aurora", slot: "frame", name: "Aurora", desc: "Shifting northern-lights colours.", neurons: 300, vcoins: 20,
    ring: "conic-gradient(from 0deg, #22d3ee, #a78bfa, #f472b6, #22d3ee)" },
  { id: "frame-diamond", slot: "frame", name: "Diamond", desc: "Icy and rare. Stands out anywhere.", neurons: 500, vcoins: 50,
    ring: "conic-gradient(from 0deg, #e0f2fe, #38bdf8, #ffffff, #38bdf8, #e0f2fe)" },
  { id: "badge-bookworm", slot: "badge", name: "Bookworm", desc: "For people who never put the book down.", neurons: 40, vcoins: 0, icon: "book" },
  { id: "badge-owl", slot: "badge", name: "Night Owl", desc: "Studying while everyone sleeps.", neurons: 80, vcoins: 0, icon: "moon" },
  { id: "badge-brain", slot: "badge", name: "Big Brain", desc: "Mind Gym champion.", neurons: 200, vcoins: 10, icon: "brain" },
  { id: "badge-legend", slot: "badge", name: "Legend", desc: "The top of the leaderboard.", neurons: 400, vcoins: 40, icon: "trophy" },
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
  const rows = await prisma.userItem.findMany({ where: { userId, equipped: true } });
  const out = { frame: null, badge: null };
  for (const r of rows) {
    const it = shopItem(r.itemId);
    if (it && out[it.slot] === null) out[it.slot] = it;
  }
  return out;
}

// One all-or-nothing step: take the Neurons, take the V-Coins (and give them to the platform), grant the item.
export async function buyShopItem(userId, itemId) {
  const item = shopItem(itemId);
  if (!item) throw new WalletError("That item doesn't exist.", "bad_item");
  try {
    return await prisma.$transaction(async (tx) => {
      const have = await tx.userItem.findUnique({ where: { userId_itemId: { userId, itemId } } });
      if (have) throw new WalletError("You already own this.", "already_owned");
      if (item.neurons > 0) {
        await applyChange(tx, userId, "neurons", -item.neurons, {
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
  const sameSlot = SHOP_ITEMS.filter((i) => i.slot === item.slot).map((i) => i.id);
  await prisma.$transaction([
    prisma.userItem.updateMany({ where: { userId, itemId: { in: sameSlot } }, data: { equipped: false } }),
    ...(on ? [prisma.userItem.update({ where: { userId_itemId: { userId, itemId } }, data: { equipped: true } })] : []),
  ]);
  return getEquipped(userId);
}
