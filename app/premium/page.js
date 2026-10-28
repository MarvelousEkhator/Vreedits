"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Crown, Coins, Check, Zap, BookOpen, Moon, Brain, Trophy } from "lucide-react";
import NavShell from "@/components/NavShell";

const BADGE_ICONS = { book: BookOpen, moon: Moon, brain: Brain, trophy: Trophy };

// Remember which picture files load, so a missing file never leaves a blank gap.
const sheetState = {};
function useSheetOk(file) {
  const [ok, setOk] = useState(file && sheetState[file] !== undefined ? sheetState[file] : null);
  useEffect(() => {
    if (!file) return;
    if (sheetState[file] !== undefined) { setOk(sheetState[file]); return; }
    const im = new Image();
    im.onload = () => { sheetState[file] = true; setOk(true); };
    im.onerror = () => { sheetState[file] = false; setOk(false); };
    im.src = file;
  }, [file]);
  return ok;
}

// Every picture in the shop is one square of a bigger image file (public/*.webp) laid out as a grid.
function spriteBg(sheet, sprite) {
  const col = sprite % sheet.cols, row = Math.floor(sprite / sheet.cols);
  return {
    backgroundImage: `url(${sheet.file})`, backgroundRepeat: "no-repeat",
    backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
    backgroundPosition: `${sheet.cols > 1 ? (col / (sheet.cols - 1)) * 100 : 0}% ${sheet.rows > 1 ? (row / (sheet.rows - 1)) * 100 : 0}%`,
  };
}

// A round photo with a shop frame around it (picture frames, or the older gradient rings).
function FramedAvatar({ frame, size = 48, children }) {
  if (frame && frame.sheet && frame.sprite != null) {
    const fit = Math.max(frame.fit || 0.6, 0.5);
    const O = Math.round(size / fit);
    const m = Math.round((O - size) / 2);
    return (
      <span style={{ position: "relative", display: "inline-flex", width: size, height: size, margin: m, flexShrink: 0 }}>
        {children}
        <span aria-hidden="true" style={{ position: "absolute", left: (size - O) / 2, top: (size - O) / 2, width: O, height: O, pointerEvents: "none", ...spriteBg(frame.sheet, frame.sprite) }} />
      </span>
    );
  }
  if (frame && frame.ring) {
    return <span style={{ display: "inline-flex", padding: 3, borderRadius: "50%", background: frame.ring, flexShrink: 0 }}>{children}</span>;
  }
  return <span style={{ display: "inline-flex", flexShrink: 0 }}>{children}</span>;
}

// Shown only when this tab's picture file isn't on the site yet
function SheetNote({ file }) {
  const ok = useSheetOk(file);
  if (ok !== false) return null;
  return <div className="pm-note err">The pictures for this tab ({file}) have not been added to the site yet.</div>;
}

const TABS = [
  { id: "frame", label: "Frames" },
  { id: "nameplate", label: "Nameplates" },
  { id: "effect", label: "Effects" },
  { id: "badge", label: "Badges" },
];

// What an item looks like in the shop
function Preview({ it, Icon }) {
  const ok = useSheetOk(it.sheet ? it.sheet.file : null);
  if (it.sheet && ok === false) return <span className="pm-dummy" style={{ opacity: .4 }} />;
  if (it.slot === "frame") return <FramedAvatar frame={it} size={44}><span className="pm-dummy" /></FramedAvatar>;
  if (it.slot === "nameplate" && it.sheet) {
    return (
      <span className="pm-plate">
        <span className="pm-plate-dark" />
        <span className="pm-plate-art" style={spriteBg(it.sheet, it.sprite)} />
        <b>Your name</b>
      </span>
    );
  }
  if (it.slot === "effect" && it.sheet) {
    return (
      <span className="pm-fx">
        <span className="pm-plate-art" style={spriteBg(it.sheet, it.sprite)} />
        <span className="pm-fx-dot" />
      </span>
    );
  }
  if (it.slot === "badge" && it.sheet) return <span className="pm-bdimg" style={spriteBg(it.sheet, it.sprite)} />;
  return <span className="pm-badge">{Icon ? <Icon size={22} /> : null}</span>;
}

// Flutterwave's payment box (loaded only when someone taps Buy)
function loadFlutterwave() {
  return new Promise((resolve, reject) => {
    if (window.FlutterwaveCheckout) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.flutterwave.com/v3.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment box."));
    document.body.appendChild(s);
  });
}

function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }
function dateText(d) {
  try { return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; }
}

export default function PremiumPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null); // { kind: "ok" | "err", text }
  const [busy, setBusy] = useState("");
  const verified = useRef(false);
  const [tab, setTab] = useState("frame");

  const loadStore = useCallback(async () => {
    const res = await fetch("/api/store", { cache: "no-store" });
    if (res.status === 401) throw new Error("Please log in to use Premium.");
    if (res.status === 403) throw new Error("Create a free account to use Premium and V-Coins.");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load the store.");
    setStore(data);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await fetch("/api/auth/session");
        const sd = await s.json();
        if (!s.ok || !sd?.user?.id) throw new Error("Please log in to use Premium.");
        setUser(sd.user);
        await loadStore();
      } catch (err) {
        setError(err.message || "Something went wrong.");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadStore]);

  // Ask the server to confirm a payment with Flutterwave, then show the result and refresh the wallet.
  const verifyPayment = useCallback(async (txRef, transactionId) => {
    setBusy("verify");
    try {
      const res = await fetch("/api/store", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", txRef, transactionId: transactionId || null }),
      });
      const d = await res.json();
      if (d.ok) {
        setNotice({ kind: "ok", text: d.already ? "That payment was already added to your wallet." : `${fmt(d.vcoins)} V-Coins added to your wallet.` });
        await loadStore();
        window.dispatchEvent(new Event("vreedits:wallet-changed"));
      } else {
        setNotice({ kind: d.pending ? "ok" : "err", text: d.error || "We couldn't confirm the payment." });
      }
    } catch {
      setNotice({ kind: "err", text: "Couldn't confirm the payment. If you were charged, your V-Coins will appear shortly." });
    }
    setBusy("");
  }, [loadStore]);

  // Older way: coming back from Flutterwave's own page with the payment details in the address.
  useEffect(() => {
    if (!store || verified.current) return;
    const p = new URLSearchParams(window.location.search);
    const txRef = p.get("tx_ref");
    if (!txRef) return;
    verified.current = true;
    const status = p.get("status");
    // Clean the payment details out of the address bar the way Next.js expects (a raw history call can break the page).
    router.replace("/premium", { scroll: false });
    if (status === "cancelled") { setNotice({ kind: "err", text: "Payment cancelled. You were not charged." }); return; }
    verifyPayment(txRef, p.get("transaction_id"));
  }, [store, verifyPayment, router]);

  async function post(body) {
    const res = await fetch("/api/store", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  async function buyPack(packId) {
    setNotice(null); setBusy(packId);
    try {
      const { res, data } = await post({ action: "buy", packId });
      if (res.ok && data.inline) {
        // The payment box opens on top of this page. Nothing to return to, so nothing can go blank.
        const i = data.inline;
        await loadFlutterwave();
        let answered = false;
        window.FlutterwaveCheckout({
          public_key: i.publicKey,
          tx_ref: i.txRef,
          amount: i.amount,
          currency: i.currency,
          customer: i.customer,
          customizations: { title: "Vreedits", description: i.description, logo: window.location.origin + "/icon-192.png" },
          callback: (r) => {
            answered = true;
            const ok = r && (r.status === "successful" || r.status === "completed");
            if (ok) verifyPayment(i.txRef, r.transaction_id);
            else { setNotice({ kind: "err", text: "Payment was not completed. You were not charged." }); setBusy(""); }
          },
          onclose: () => {
            if (!answered) { setBusy(""); loadStore().catch(() => {}); } // paid but closed early? the wallet check below picks it up
          },
        });
        return;
      }
      if (res.ok && data.link) { window.location.href = data.link; return; }
      setNotice({ kind: "err", text: data.error || "Could not start the payment." });
    } catch {
      setNotice({ kind: "err", text: "Network problem. Please try again." });
    }
    setBusy("");
  }

  async function getPremium() {
    setNotice(null); setBusy("premium");
    try {
      const requestId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
      const { res, data } = await post({ action: "premium", requestId });
      if (res.ok) {
        setStore((s) => ({ ...s, balances: data.balances, premium: data.premium }));
        setNotice({ kind: "ok", text: `Premium is active until ${dateText(data.premium.expiresAt)}.` });
        window.dispatchEvent(new Event("vreedits:wallet-changed"));
      } else {
        setNotice({ kind: "err", text: data.error || "Could not complete that." });
      }
    } catch {
      setNotice({ kind: "err", text: "Network problem. Please try again." });
    }
    setBusy("");
  }

  async function buyItem(itemId) {
    setNotice(null); setBusy(itemId);
    try {
      const { res, data } = await post({ action: "buyItem", itemId });
      if (res.ok) {
        setStore((s) => ({ ...s, balances: data.balances, owned: data.owned, equipped: data.equipped }));
        setNotice({ kind: "ok", text: "It's yours! Tap Wear to use it." });
        window.dispatchEvent(new Event("vreedits:wallet-changed"));
      } else {
        setNotice({ kind: "err", text: data.error || "Could not buy that." });
      }
    } catch {
      setNotice({ kind: "err", text: "Network problem. Please try again." });
    }
    setBusy("");
  }

  async function equip(itemId, on) {
    setNotice(null); setBusy(itemId);
    try {
      const { res, data } = await post({ action: "equip", itemId, on });
      if (res.ok) setStore((s) => ({ ...s, owned: data.owned, equipped: data.equipped }));
      else setNotice({ kind: "err", text: data.error || "Could not change that." });
    } catch {
      setNotice({ kind: "err", text: "Network problem. Please try again." });
    }
    setBusy("");
  }

  const body = (() => {
    if (loading) {
      return <div className="pm-center"><Loader2 size={22} className="animate-spin" /></div>;
    }
    if (error || !store) {
      return <div className="pm-center"><AlertCircle size={22} /><p>{error || "Could not load Premium."}</p></div>;
    }
    const { balances, packs, premium, paymentsReady, testMode } = store;
    const items = store.items || [];
    const ownedMap = Object.fromEntries((store.owned || []).map((o) => [o.itemId, o]));
    const enough = balances.vcoins >= premium.price;
    return (
      <div className="pm">
        <div className="pm-bals">
          <div className="pm-bal">
            <span className="pm-ico"><Zap size={18} /></span>
            <div>
              <div className="pm-bal-num">{fmt(balances.neurons)}</div>
              <div className="pm-bal-lbl">Neurons</div>
            </div>
          </div>
          <div className="pm-bal">
            <span className="pm-ico"><Coins size={18} /></span>
            <div>
              <div className="pm-bal-num">{fmt(balances.vcoins)}</div>
              <div className="pm-bal-lbl">V-Coins</div>
            </div>
          </div>
        </div>

        {testMode && <div className="pm-note err">Test mode: payments here are practice only and no real money moves.</div>}
        {notice && <div className={`pm-note ${notice.kind}`}>{notice.text}</div>}

        <div className="pm-card pm-premium">
          <div className="pm-prow">
            <span className="pm-crown"><Crown size={20} /></span>
            <div>
              <div className="pm-title">Vreedits Premium</div>
              <div className="pm-sub">{premium.active ? `Active until ${dateText(premium.expiresAt)}` : `${premium.days} days of Premium`}</div>
            </div>
          </div>
          <div className="pm-perks">
            <div><b>Double the daily Neurons.</b> Earn up to {fmt(premium.neuronCap)} a day instead of 500.</div>
            <div><b>{Math.round((premium.discount || 0) * 100)}% off the shop.</b> Applies to the Neuron price of every item.</div>
            <div><b>Triple the Syna research.</b> Up to {premium.researchPerHour || 60} web searches an hour instead of 20.</div>
            <div><b>Crown and Royal frame.</b> A Premium crown on your profile, plus the Royal frame and Premium badge, free while you are a member.</div>
          </div>
          <p className="pm-text">Your membership starts counting right away{premium.active ? " and stacks on top of the time you have left" : ""}.</p>
          <button className="pm-btn" disabled={busy === "premium" || !enough} onClick={getPremium}>
            {busy === "premium" ? <Loader2 size={16} className="animate-spin" /> : <><Check size={15} /> {premium.active ? "Add" : "Get"} {premium.days} days · {fmt(premium.price)} V-Coins</>}
          </button>
          {!enough && <div className="pm-hint">You need {fmt(premium.price - balances.vcoins)} more V-Coins. Get some below.</div>}
        </div>

        <h2 className="pm-h">Shop</h2>
        <p className="pm-hint" style={{ textAlign: "left", marginBottom: 10 }}>Neurons come from Mind Gym. Rare items also need a few V-Coins.</p>
        {items.some((it) => it.slot === tab && it.sheet) && <SheetNote file={(items.find((it) => it.slot === tab && it.sheet) || {}).sheet.file} />}
        <div className="pm-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`pm-tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="pm-shop">
          {items.filter((it) => it.slot === tab).map((it) => {
            const own = ownedMap[it.id];
            const Icon = BADGE_ICONS[it.icon];
            const cost = it.price != null ? it.price : it.neurons;
            const canAfford = balances.neurons >= cost && balances.vcoins >= it.vcoins;
            return (
              <div key={it.id} className={`pm-item ${own && own.equipped ? "worn" : ""}`}>
                <div className="pm-item-art"><Preview it={it} Icon={Icon} /></div>
                <div className="pm-item-name">{it.name}</div>
                <div className="pm-item-desc">{it.desc}</div>
                {own ? (
                  <button className="pm-mini" disabled={busy === it.id} onClick={() => equip(it.id, !own.equipped)}>
                    {busy === it.id ? "…" : own.equipped ? "Take off" : "Wear"}
                  </button>
                ) : it.premiumOnly ? (
                  <button className="pm-mini buy" disabled={!!busy || !premium.active} onClick={() => buyItem(it.id)}>
                    {busy === it.id ? "…" : premium.active ? "Unlock free" : <><Crown size={12} /> Premium only</>}
                  </button>
                ) : (
                  <button className="pm-mini buy" disabled={!!busy || !canAfford} onClick={() => buyItem(it.id)}>
                    {busy === it.id ? "Buying…" : (
                      <>
                        {cost > 0 && <span className="pm-price"><Zap size={12} />{premium.active && cost < it.neurons ? <><s style={{ opacity: .6 }}>{fmt(it.neurons)}</s>&nbsp;{fmt(cost)}</> : fmt(cost)}</span>}
                        {it.vcoins > 0 && <span className="pm-price"><Coins size={12} />{fmt(it.vcoins)}</span>}
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <h2 className="pm-h">Get V-Coins</h2>
        {!paymentsReady && <div className="pm-note err">Buying V-Coins isn't switched on yet. Please check back soon.</div>}
        <div className="pm-grid">
          {packs.map((p) => (
            <button key={p.id} className="pm-pack" disabled={!paymentsReady || !!busy} onClick={() => buyPack(p.id)}>
              <span className="pm-pack-coins"><Coins size={15} /> {fmt(p.vcoins)}</span>
              <span className="pm-pack-price">{busy === p.id ? "Opening…" : `$${p.usd}`}</span>
            </button>
          ))}
        </div>
        <p className="pm-foot">Payments are handled securely by Flutterwave. V-Coins are added as soon as your payment is confirmed.</p>
      </div>
    );
  })();

  return (
    <NavShell user={user}>
      <style>{`
        .pm { max-width: 520px; margin: 0 auto; padding: 18px 16px 40px; }
        .pm-center { min-height: 60vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text-muted); text-align: center; padding: 0 24px; font-size: 14px; }
        .pm-bals { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .pm-shop { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        .pm-item { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px; border-radius: 16px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 3px 0 var(--border); }
        .pm-item.worn { border-color: var(--accent); }
        .pm-item-art { min-height: 88px; width: 100%; display: flex; align-items: center; justify-content: center; margin-bottom: 4px; overflow: hidden; }
        .pm-tabs { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 4px; }
        .pm-tab { flex: 0 0 auto; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); font-size: 13px; font-weight: 700; cursor: pointer; }
        .pm-tab.on { background: var(--accent); border-color: var(--accent); color: #fff; }
        .pm-plate { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 2.5; }
        .pm-plate b { position: relative; z-index: 2; color: #fff; font-size: 13px; text-shadow: 0 1px 3px #000, 0 0 6px #000; }
        .pm-plate-dark { position: absolute; inset: 18% 8%; border-radius: 999px; background: rgba(8,5,16,.92); }
        .pm-plate-art { position: absolute; inset: 0; z-index: 1; }
        .pm-fx { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 1.8; border-radius: 12px; background: #0b0814; overflow: hidden; }
        .pm-fx-dot { position: absolute; z-index: 2; width: 30%; aspect-ratio: 1; border-radius: 50%; background: var(--accent-soft); bottom: 6%; }
        .pm-bdimg { width: 78px; height: 78px; display: block; }
        .pm-dummy { width: 44px; height: 44px; border-radius: 50%; background: var(--accent-soft); }
        .pm-perks { margin: 14px 0 0; display: flex; flex-direction: column; gap: 10px; }
        .pm-perks > div { font-size: 13.5px; line-height: 1.45; color: var(--text-muted); padding-left: 12px; border-left: 2px solid var(--accent); }
        .pm-perks b { color: var(--text); font-weight: 700; }
        .pm-badge { width: 44px; height: 44px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent); }
        .pm-item-name { font-size: 14px; font-weight: 800; color: var(--text); }
        .pm-item-desc { font-size: 11.5px; color: var(--text-muted); line-height: 1.35; flex: 1; }
        .pm-mini { margin-top: 6px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 8px 10px; border-radius: 11px; border: 1px solid var(--accent); background: transparent; color: var(--accent); font-size: 13px; font-weight: 700; cursor: pointer; }
        .pm-mini.buy { background: var(--accent); color: #fff; }
        .pm-mini:disabled { opacity: .5; cursor: not-allowed; }
        .pm-price { display: inline-flex; align-items: center; gap: 4px; }
        .pm-bal { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 18px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 3px 0 var(--border); }
        .pm-ico { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent); }
        .pm-bal-num { font-size: 28px; font-weight: 800; line-height: 1.05; font-variant-numeric: tabular-nums; color: var(--text); }
        .pm-bal-lbl { font-size: 12px; font-weight: 700; color: var(--text-muted); letter-spacing: .04em; text-transform: uppercase; }
        .pm-note { margin-top: 12px; padding: 10px 14px; border-radius: 12px; font-size: 13.5px; line-height: 1.4; }
        .pm-note.ok { background: var(--accent-soft); color: var(--accent); }
        .pm-note.err { background: rgba(229,85,85,.12); color: var(--danger, #e55); }
        .pm-card { margin-top: 14px; padding: 16px; border-radius: 20px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 3px 0 var(--border); }
        .pm-premium { border-color: var(--accent); }
        .pm-prow { display: flex; align-items: center; gap: 12px; }
        .pm-crown { width: 42px; height: 42px; border-radius: 13px; display: flex; align-items: center; justify-content: center; background: var(--accent); color: #fff; }
        .pm-title { font-size: 17px; font-weight: 800; color: var(--text); }
        .pm-sub { font-size: 12.5px; color: var(--text-muted); }
        .pm-text { font-size: 13.5px; line-height: 1.5; color: var(--text-muted); margin: 12px 0 14px; }
        .pm-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 13px 16px; border-radius: 14px; border: none; background: var(--accent); color: #fff; font-size: 14.5px; font-weight: 700; cursor: pointer; }
        .pm-btn:disabled { opacity: .5; cursor: not-allowed; }
        .pm-hint { margin-top: 8px; font-size: 12px; color: var(--text-muted); text-align: center; }
        .pm-h { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-muted); margin: 24px 0 10px; }
        .pm-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        .pm-pack { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 14px; border-radius: 16px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 3px 0 var(--border); cursor: pointer; text-align: left; color: var(--text); }
        .pm-pack:disabled { opacity: .5; cursor: not-allowed; }
        .pm-pack-coins { display: flex; align-items: center; gap: 6px; font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
        .pm-pack-coins svg { color: var(--accent); }
        .pm-pack-price { font-size: 13px; font-weight: 700; color: var(--accent); }
        .pm-foot { margin-top: 14px; font-size: 11.5px; color: var(--text-muted); line-height: 1.5; text-align: center; }
      `}</style>
      {body}
    </NavShell>
  );
}
