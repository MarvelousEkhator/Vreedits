"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, Zap, Gem, Coins } from "lucide-react";
import NavShell from "@/components/NavShell";
import ProfileClient from "@/components/ProfileClient";

function timeAgo(value) {
  const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const CURRENCY_LABEL = { neurons: "Neurons", gems: "Gems", vcoins: "V-Coins" };

// Your coins: balances plus the latest activity. Stays hidden if the wallet can't be loaded
// (for example for guests), so it can never break the profile page.
function WalletCard() {
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json && json.balances) setData(json);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("vreedits:wallet-changed", load);
    return () => window.removeEventListener("vreedits:wallet-changed", load);
  }, [load]);

  if (!data) return null;
  const { balances, history = [] } = data;
  const recent = history.slice(0, 6);

  return (
    <div className="vw" id="wallet">
      <style>{`
        .vw { max-width: 520px; margin: 0 auto; padding: 16px 16px 0; }
        .vw-title { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 10px; }
        .vw-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .vw-tile {
          display: flex; flex-direction: column; gap: 2px; padding: 12px 12px 11px; border-radius: 16px;
          background: var(--surface); border: 1px solid var(--border); box-shadow: 0 3px 0 var(--border);
        }
        .vw-ico { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent); margin-bottom: 6px; }
        .vw-num { font-size: 24px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; color: var(--text); }
        .vw-name { font-size: 12.5px; font-weight: 700; color: var(--text); }
        .vw-sub { font-size: 11px; color: var(--text-muted); line-height: 1.3; }
        .vw-list { margin-top: 12px; border-radius: 16px; background: var(--surface); border: 1px solid var(--border); overflow: hidden; }
        .vw-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; }
        .vw-row + .vw-row { border-top: 1px solid var(--border); }
        .vw-what { font-size: 13.5px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .vw-when { font-size: 11.5px; color: var(--text-muted); }
        .vw-amt { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; flex-shrink: 0; color: var(--success); }
        .vw-amt.neg { color: var(--danger); }
        .vw-empty { padding: 14px; font-size: 13px; color: var(--text-muted); line-height: 1.4; }
      `}</style>

      <div className="vw-title">Your wallet</div>
      <div className="vw-grid">
        <div className="vw-tile">
          <span className="vw-ico"><Zap size={16} /></span>
          <span className="vw-num">{balances.neurons}</span>
          <span className="vw-name">Neurons</span>
          <span className="vw-sub">Earned in Mind Gym</span>
        </div>
        <div className="vw-tile">
          <span className="vw-ico"><Gem size={16} /></span>
          <span className="vw-num">{balances.gems}</span>
          <span className="vw-name">Gems</span>
          <span className="vw-sub">Bought, not earned</span>
        </div>
        <div className="vw-tile">
          <span className="vw-ico"><Coins size={16} /></span>
          <span className="vw-num">{balances.vcoins}</span>
          <span className="vw-name">V-Coins</span>
          <span className="vw-sub">100 = 1 US dollar</span>
        </div>
      </div>

      <div className="vw-list">
        {recent.length === 0 ? (
          <div className="vw-empty">Nothing yet. Finish a Quick Math round or solve the daily Sudoku in Mind Gym to earn your first Neurons.</div>
        ) : (
          recent.map((tx) => (
            <div key={tx.id} className="vw-row">
              <div style={{ minWidth: 0 }}>
                <div className="vw-what">{tx.reason || (CURRENCY_LABEL[tx.currency] || "Wallet") + " " + tx.type}</div>
                <div className="vw-when">{timeAgo(tx.createdAt)}</div>
              </div>
              <span className={`vw-amt ${tx.amount < 0 ? "neg" : ""}`}>
                {tx.amount > 0 ? "+" : ""}{tx.amount} {CURRENCY_LABEL[tx.currency] || ""}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSession = useCallback(async () => {
    setError("");
    try {
      const sessionRes = await fetch("/api/auth/session");
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok || !sessionData?.user?.id) {
        throw new Error("Could not load your session.");
      }
      setUser(sessionData.user);
    } catch (err) {
      setError(err.message || "Something went wrong loading your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

  if (loading) {
    return (
      <NavShell user={user}>
        <div className="min-h-[60vh] flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      </NavShell>
    );
  }

  if (error || !user) {
    return (
      <NavShell user={user}>
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center gap-2" style={{ color: "var(--text-muted)" }}>
          <AlertCircle size={22} />
          <p className="text-sm">{error || "Could not load your profile."}</p>
        </div>
      </NavShell>
    );
  }

  return (
    <NavShell user={user}>
      {!user.isGuest && <WalletCard />}
      <ProfileClient profileId={user.id} />
    </NavShell>
  );
}