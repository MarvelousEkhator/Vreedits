"use client";
import { useEffect, useRef } from "react";

const HEARTBEAT_MS = 25000;

export default function PresenceHeartbeat() {
  const intervalRef = useRef(null);
  const offlineSentRef = useRef(false);

  useEffect(() => {
    function sendOnline() {
      if (document.visibilityState !== "visible") return;
      offlineSentRef.current = false;
      fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: true }),
        keepalive: true,
      }).catch(() => {});
    }

    function sendOffline() {
      if (offlineSentRef.current) return;
      offlineSentRef.current = true;
      let queued = false;
      try {
        queued = !!navigator.sendBeacon?.("/api/presence/offline");
      } catch {}
      if (!queued) {
        fetch("/api/presence/offline", { method: "POST", keepalive: true }).catch(() => {});
      }
    }

    function stopHeartbeat() {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    function startHeartbeat() {
      stopHeartbeat(); // never let two timers run at once
      sendOnline();
      intervalRef.current = setInterval(sendOnline, HEARTBEAT_MS);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        startHeartbeat();
      } else {
        stopHeartbeat();
        sendOffline();
      }
    }

    function handlePageHide() {
      stopHeartbeat();
      sendOffline();
    }

    function handlePageShow(e) {
      // Page restored from the back/forward cache
      if (e.persisted) startHeartbeat();
    }

    function handleFocus() {
      if (document.visibilityState === "visible" && !intervalRef.current) startHeartbeat();
    }

    function handleBackOnline() {
      sendOnline();
    }

    startHeartbeat();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleBackOnline);

    return () => {
      stopHeartbeat();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleBackOnline);
    };
  }, []);

  return null;
}