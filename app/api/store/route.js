import { NextResponse } from "next/server";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";
import {
  PACKS, PREMIUM_PRICE_VCOINS, PREMIUM_DAYS,
  SHOP_ITEMS, getWallet, getPremium, startPurchase, settlePayment, buyPremium,
  getOwnedItems, getEquipped, buyShopItem, setEquipped, WalletError,
} from "@/lib/wallet";

export const dynamic = "force-dynamic";

// GET: everything the Premium / V-Coins page needs.
export async function GET(req) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  // ?userId=... : just the frame and badge someone is wearing (public, so profiles can show them).
  const target = new URL(req.url).searchParams.get("userId");
  if (target) {
    return NextResponse.json({ equipped: await getEquipped(String(target).slice(0, 64)) });
  }

  if (user.isGuest) return guestBlockedResponse();

  const [balances, premium, owned, equipped] = await Promise.all([
    getWallet(user.id), getPremium(user.id), getOwnedItems(user.id), getEquipped(user.id),
  ]);
  return NextResponse.json({
    balances,
    items: SHOP_ITEMS,
    owned,
    equipped,
    packs: PACKS,
    premium: { ...premium, price: PREMIUM_PRICE_VCOINS, days: PREMIUM_DAYS },
    paymentsReady: !!process.env.FLW_SECRET_KEY,
  });
}

// POST: { action: "buy", packId } | { action: "verify", txRef, transactionId } | { action: "premium", requestId }
export async function POST(req) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.isGuest) return guestBlockedResponse();

  const body = await req.json().catch(() => ({}));

  try {
    if (body.action === "buy") {
      const { link } = await startPurchase(user, String(body.packId || ""));
      return NextResponse.json({ ok: true, link });
    }

    if (body.action === "verify") {
      const out = await settlePayment({
        txRef: String(body.txRef || ""),
        transactionId: body.transactionId ? String(body.transactionId) : undefined,
      });
      const balances = await getWallet(user.id);
      return NextResponse.json({ ...out, balances }, { status: out.ok || out.pending ? 200 : 400 });
    }

    if (body.action === "premium") {
      const out = await buyPremium(user.id, body.requestId ? String(body.requestId) : undefined);
      const [balances, premium] = await Promise.all([getWallet(user.id), getPremium(user.id)]);
      return NextResponse.json({ ok: true, duplicate: !!out.duplicate, balances, premium: { ...premium, price: PREMIUM_PRICE_VCOINS, days: PREMIUM_DAYS } });
    }

    if (body.action === "buyItem") {
      await buyShopItem(user.id, String(body.itemId || ""));
      const [balances, owned, equipped] = await Promise.all([getWallet(user.id), getOwnedItems(user.id), getEquipped(user.id)]);
      return NextResponse.json({ ok: true, balances, owned, equipped });
    }

    if (body.action === "equip") {
      const equipped = await setEquipped(user.id, String(body.itemId || ""), body.on !== false);
      const owned = await getOwnedItems(user.id);
      return NextResponse.json({ ok: true, owned, equipped });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    if (err instanceof WalletError) {
      const status = err.code === "insufficient_funds" ? 402 : 400;
      const message = err.code === "insufficient_funds" ? "You don't have enough coins for that yet." : err.message;
      return NextResponse.json({ error: message, code: err.code }, { status });
    }
    console.error("POST /api/store error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
