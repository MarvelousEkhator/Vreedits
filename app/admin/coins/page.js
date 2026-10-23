import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

// Who may open this page. Add more emails in Render → Environment → ADMIN_EMAILS (comma separated).
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "lillianhenryvague@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function fmt(n) {
  return Number(n || 0).toLocaleString("en-US");
}
function when(d) {
  return new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default async function AdminCoinsPage() {
  // Anyone who is not an admin just sees a normal "not found" page.
  let user = null;
  try {
    user = await requireUser();
  } catch {}
  if (!user || !user.id || user.isGuest) notFound();
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true } });
  if (!me || !me.email || !ADMIN_EMAILS.includes(me.email.toLowerCase())) notFound();

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [totals, holders, earnedToday, spentToday, byType, top, recent, totalUsers] = await Promise.all([
    prisma.wallet.aggregate({ _sum: { neurons: true, gems: true, vcoins: true } }),
    prisma.wallet.count(),
    prisma.walletTransaction.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { currency: "neurons", amount: { gt: 0 }, createdAt: { gte: startOfDay } },
    }),
    prisma.walletTransaction.aggregate({
      _sum: { amount: true },
      where: { currency: "neurons", amount: { lt: 0 }, createdAt: { gte: startOfDay } },
    }),
    prisma.walletTransaction.groupBy({
      by: ["currency", "type"],
      _sum: { amount: true },
      _count: true,
    }),
    prisma.walletTransaction.groupBy({
      by: ["userId"],
      _sum: { amount: true },
      where: { currency: "neurons", type: "earn", createdAt: { gte: startOfDay } },
      orderBy: { _sum: { amount: "desc" } },
      take: 8,
    }),
    prisma.walletTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.user.count(),
  ]);

  const ids = Array.from(new Set([...top.map((t) => t.userId), ...recent.map((t) => t.userId)]));
  const people = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, displayName: true } })
    : [];
  const nameOf = (id) => {
    const p = people.find((x) => x.id === id);
    return p ? p.displayName || p.username || id.slice(0, 8) : id.slice(0, 8);
  };

  const s = totals._sum;
  const tiles = [
    ["Neurons in circulation", fmt(s.neurons)],
    ["Gems in circulation", fmt(s.gems)],
    ["V-Coins in circulation", fmt(s.vcoins)],
    ["Neurons earned today", fmt(earnedToday._sum.amount)],
    ["Earn events today", fmt(earnedToday._count)],
    ["Neurons spent today", fmt(Math.abs(spentToday._sum.amount || 0))],
    ["Accounts with a wallet", `${fmt(holders)} of ${fmt(totalUsers)}`],
  ];

  return (
    <div className="ad">
      <style>{`
        .ad { max-width: 760px; margin: 0 auto; padding: 20px 16px 40px; }
        .ad h1 { font-size: 22px; margin: 6px 0 4px; }
        .ad h2 { font-size: 15px; margin: 26px 0 10px; opacity: .8; }
        .ad-sub { font-size: 13px; opacity: .65; margin: 0 0 16px; }
        .ad-back { font-size: 13px; opacity: .7; text-decoration: none; color: inherit; }
        .ad-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
        .ad-tile { border: 1px solid var(--border, rgba(128,128,128,.3)); border-radius: 12px; padding: 12px 14px; }
        .ad-tile b { display: block; font-size: 22px; margin-top: 4px; }
        .ad-tile span { font-size: 12px; opacity: .65; }
        .ad-wrap { overflow-x: auto; border: 1px solid var(--border, rgba(128,128,128,.3)); border-radius: 12px; }
        .ad table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ad th, .ad td { text-align: left; padding: 8px 12px; white-space: nowrap; border-bottom: 1px solid var(--border, rgba(128,128,128,.2)); }
        .ad th { font-size: 12px; opacity: .6; font-weight: 600; }
        .ad tr:last-child td { border-bottom: 0; }
        .ad .num { text-align: right; }
      `}</style>

      <Link href="/dashboard" className="ad-back">← Back to Home</Link>
      <h1>Coins overview</h1>
      <p className="ad-sub">Private admin page. Only the emails in ADMIN_EMAILS can see it. Times are UTC.</p>

      <div className="ad-grid">
        {tiles.map(([label, value]) => (
          <div className="ad-tile" key={label}>
            <span>{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>

      <h2>All-time totals by type</h2>
      <div className="ad-wrap">
        <table>
          <thead>
            <tr><th>Currency</th><th>Type</th><th className="num">Events</th><th className="num">Total</th></tr>
          </thead>
          <tbody>
            {byType.length === 0 && <tr><td colSpan={4}>Nothing recorded yet.</td></tr>}
            {byType.map((r) => (
              <tr key={r.currency + r.type}>
                <td>{r.currency}</td>
                <td>{r.type}</td>
                <td className="num">{fmt(r._count)}</td>
                <td className="num">{fmt(r._sum.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Top Neuron earners today</h2>
      <div className="ad-wrap">
        <table>
          <thead>
            <tr><th>User</th><th className="num">Neurons today</th></tr>
          </thead>
          <tbody>
            {top.length === 0 && <tr><td colSpan={2}>No earnings yet today.</td></tr>}
            {top.map((t) => (
              <tr key={t.userId}>
                <td>{nameOf(t.userId)}</td>
                <td className="num">{fmt(t._sum.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Latest 25 transactions</h2>
      <div className="ad-wrap">
        <table>
          <thead>
            <tr><th>When</th><th>User</th><th>Currency</th><th className="num">Amount</th><th className="num">Balance</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {recent.length === 0 && <tr><td colSpan={6}>Nothing yet.</td></tr>}
            {recent.map((t) => (
              <tr key={t.id}>
                <td>{when(t.createdAt)}</td>
                <td>{nameOf(t.userId)}</td>
                <td>{t.currency}</td>
                <td className="num">{t.amount > 0 ? "+" : ""}{fmt(t.amount)}</td>
                <td className="num">{fmt(t.balanceAfter)}</td>
                <td>{t.reason || t.refType || t.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
