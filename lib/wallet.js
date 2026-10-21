import { prisma } from "@/lib/prisma";

export const CURRENCIES = ["neurons", "gems", "vcoins"];
export const VCOINS_PER_USD = 100;
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
  return Math.round(usd * VCOINS_PER_USD);
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