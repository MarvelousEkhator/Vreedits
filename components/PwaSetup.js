"use client";
import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

const DISMISS_KEY = "vreedits_install_dismissed";

// Registers the service worker and shows a small "Install Vreedits" card.
// Android and desktop Chrome get a real install button; iPhone gets a how-to hint.
export default function PwaSetup() {
  const [deferred, setDeferred] = useState(null);
  const [showIos, setShowIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;

    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch {}
    if (standalone || dismissed) return;

    if (/iphone|ipad|ipod/i.test(window.navigator.userAgent)) {
      setShowIos(true);
      setHidden(false);
    }

    function onPrompt(e) {
      e.preventDefault();
      setDeferred(e);
      setHidden(false);
    }
    function onInstalled() {
      setDeferred(null);
      setHidden(true);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
  }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    setDeferred(null);
    setHidden(true);
  }

  if (hidden || (!deferred && !showIos)) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Vreedits"
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
      <img src="/icon-192.png" alt="" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Install Vreedits</div>
        {deferred ? (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Add it to your home screen. It opens like a real app.
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            Tap <Share size={12} /> Share, then "Add to Home Screen".
          </div>
        )}
      </div>
      {deferred && (
        <button
          onClick={install}
          className="flex items-center gap-1.5"
          style={{
            background: "var(--accent)", color: "white", border: "none",
            borderRadius: 20, padding: "9px 14px", fontSize: 13, fontWeight: 600, flexShrink: 0,
          }}
        >
          <Download size={14} /> Install
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ background: "none", border: "none", color: "var(--text-muted)", padding: 4, flexShrink: 0 }}
      >
        <X size={16} />
      </button>
    </div>
  );
}