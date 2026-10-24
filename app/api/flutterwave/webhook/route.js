import { NextResponse } from "next/server";
import crypto from "crypto";
import { settlePayment } from "@/lib/wallet";

export const dynamic = "force-dynamic";

// Flutterwave calls this when a payment finishes. Set this address as the webhook URL in the
// Flutterwave dashboard, with FLW_WEBHOOK_HASH as the "Secret hash".
function sameSecret(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function POST(req) {
  const expected = process.env.FLW_WEBHOOK_HASH;
  if (!expected || !sameSecret(req.headers.get("verif-hash"), expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const data = payload?.data;
  const isCharge = payload?.event === "charge.completed" || payload?.type === "CARD" || data?.tx_ref;
  if (!isCharge || !data?.tx_ref) return NextResponse.json({ ok: true, ignored: true });

  // The webhook is only a nudge: settlePayment asks Flutterwave itself before crediting anything.
  try {
    const out = await settlePayment({ txRef: String(data.tx_ref), transactionId: data.id ? String(data.id) : undefined });
    return NextResponse.json({ ok: !!out.ok, pending: !!out.pending });
  } catch (err) {
    console.error("Flutterwave webhook error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 }); // Flutterwave will retry
  }
}
