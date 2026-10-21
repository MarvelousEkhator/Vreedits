import { NextResponse } from "next/server";
import { requireUser, guestBlockedResponse } from "@/lib/requireUser";
import { getWallet, getHistory } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (user.isGuest) return guestBlockedResponse();

  const [balances, history] = await Promise.all([
    getWallet(user.id),
    getHistory(user.id, { limit: 30 }),
  ]);
  return NextResponse.json({ balances, history });
}