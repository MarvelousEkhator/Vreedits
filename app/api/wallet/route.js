import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { getWallet, getHistory } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const userId = auth?.id ?? auth?.user?.id ?? auth?.userId;
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const [balances, history] = await Promise.all([
    getWallet(userId),
    getHistory(userId, { limit: 30 }),
  ]);
  return NextResponse.json({ balances, history });
}