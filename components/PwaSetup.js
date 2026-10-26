"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, X, Share, MoreVertical } from "lucide-react";

const DISMISS_KEY = "vreedits_install_dismissed_at";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // after "x", ask again in 3 days

// The browser hands over the install prompt once; keep it so the banner and the Notifications row can both use it.
function savedPrompt() {
  return typeof window !== "undefined" ? window.__vreeditsInstall || null : null;
}
function isInstalled() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isIos() {
  return typeof window !== "undefined" && /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

// Shared by the banner and the Notifications row: { installed, canPrompt, ios, install() }
export function useInstall() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    window.addEventListener("vreedits-install-ready", f);
    window.addEventListener("appinstalled", f);
    return () => {
      window.removeEventListener("vreedits-install-ready", f);
      window.removeEventListener("appinstalled", f);
    };
  }, []);
  const prompt = savedPrompt();
  async function install() {
    const p = savedPrompt();
    if (!p) return false;
    p.prompt();
    try { await p.userChoice; } catch {}
    window.__vreeditsInstall = null;
    window.dispatchEvent(new Event("vreedits-install-ready"));
    return true;
  }
  return { installed: isInstalled(), canPrompt: !!prompt, ios: isIos(), install };
}

// What to tell people when the browser has no one-tap install button.
export function InstallSteps({ ios }) {
  return (
    <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", lineHeight: 1.5 }}>
      {ios ? (
        <>Tap <Share size={12} /> Share, then "Add to Home Screen".</>
      ) : (
        <>Open the browser menu <MoreVertical size={12} /> and tap "Install app" or "Add to Home screen".</>
      )}
    </div>
  );
}

// Registers the service worker, catches the install prompt, and shows a "Download Vreedits" banner.
export default function PwaSetup() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(true);
  const inst = useInstall();

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    function onPrompt(e) {
      e.preventDefault();
      window.__vreeditsInstall = e;
      window.dispatchEvent(new Event("vreedits-install-ready"));
    }
    window.addEventListener("beforeinstallprompt", onPrompt);

    // Fade away the opening screen once the app is up (it stays at least a moment so it never just flashes).
    const splashTimer = setTimeout(() => {
      const el = document.getElementById("vr-splash");
      if (el) el.classList.add("done");
    }, 900);

    // Show the banner a few seconds after opening, unless they already installed it or said "not now" recently.
    let t;
    if (!isInstalled()) {
      let at = 0;
      try { at = Number(localStorage.getItem(DISMISS_KEY) || 0); } catch {}
      if (!at || Date.now() - at > SNOOZE_MS) t = setTimeout(() => setHidden(false), 4000);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      if (t) clearTimeout(t);
      clearTimeout(splashTimer);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  }

  const quiet = pathname === "/feed" || (pathname || "").startsWith("/login") || (pathname || "").startsWith("/register");
  if (hidden || quiet || inst.installed) return null;

  return (
    <div
      role="dialog"
      aria-label="Download Vreedits"
      style={{
        position: "fixed", left: 12, right: 12, zIndex: 80,
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)",
        background: "var(--surface)", color: "var(--text)",
        border: "1px solid var(--border)", borderRadius: 16,
        boxShadow: "var(--shadow)", padding: "12px 14px",
        display: "flex", alignItems: "center", gap: 12,
        maxWidth: 520, margin: "0 auto",
      }}
    >
      <img src="/icon-192.png" alt="" style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Download Vreedits</div>
        {inst.canPrompt ? (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Add it to your home screen. It opens like a real app.</div>
        ) : (
          <InstallSteps ios={inst.ios} />
        )}
      </div>
      {inst.canPrompt && (
        <button
          onClick={async () => { await inst.install(); setHidden(true); }}
          className="flex items-center gap-1.5"
          style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: 20, padding: "9px 14px", fontSize: 13, fontWeight: 600, flexShrink: 0 }}
        >
          <Download size={14} /> Install
        </button>
      )}
      <button onClick={dismiss} aria-label="Not now" style={{ background: "none", border: "none", color: "var(--text-muted)", padding: 4, flexShrink: 0 }}>
        <X size={16} />
      </button>
    </div>
  );
}
