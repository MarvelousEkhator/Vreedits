"use client";
// components/Tracker.js
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Edit these to match your real routes. First matching prefix wins.
// [route prefix, feature name shown on the dashboard]
const FEATURE_ROUTES = [
  ["/syna", "syna"],
  ["/community", "community"],
  ["/feed", "feed"],
  ["/coding-room", "coding_room"],
  ["/ai-tools", "ai_tools"],
  ["/school", "school"],
];

let guestNow = false;

function rid() {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function stored(store, key) {
  try {
    let v = store.getItem(key);
    if (!v) {
      v = rid();
      store.setItem(key, v);
    }
    return v;
  } catch {
    return rid();
  }
}

function read(store, key) {
  try {
    return store.getItem(key) || "";
  } catch {
    return "";
  }
}

function send(type, extra = {}) {
  try {
    fetch("/api/track", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        visitorId: stored(localStorage, "vre_v"), // same person across visits
        sessionId: stored(sessionStorage, "vre_s"), // one per browser tab session
        ref: read(sessionStorage, "vre_ref"),
        utm: read(sessionStorage, "vre_utm"),
        isGuest: guestNow,
        ...extra,
      }),
    }).catch(() => {});
  } catch {}
}

// Call these from anywhere in client code:
//   trackFeature("syna_message")  when someone actually uses a feature
//   trackSignup()                 right after a successful sign up
//   trackLogin()                  right after a successful login
export const trackFeature = (name) => send("feature", { name });
export const trackSignup = () => send("signup");
export const trackLogin = () => send("login");

export default function Tracker({ isGuest = false }) {
  const pathname = usePathname();
  guestNow = Boolean(isGuest);
  const skip = !pathname || pathname.startsWith("/analytics");

  // Page views (+ remember where the visitor came from, once per session)
  useEffect(() => {
    if (skip) return;
    try {
      if (!sessionStorage.getItem("vre_init")) {
        sessionStorage.setItem("vre_init", "1");
        const p = new URLSearchParams(location.search);
        sessionStorage.setItem("vre_utm", p.get("utm_source") || p.get("ref") || "");
        sessionStorage.setItem("vre_ref", document.referrer || "");
      }
    } catch {}
    const hit = FEATURE_ROUTES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"));
    send("pageview", { path: pathname, name: hit ? hit[1] : null });
  }, [pathname, skip]);

  // Fires once per session when someone is in Guest Mode
  useEffect(() => {
    if (!isGuest) return;
    try {
      if (sessionStorage.getItem("vre_g")) return;
      sessionStorage.setItem("vre_g", "1");
    } catch {}
    send("guest_start");
  }, [isGuest]);

  // Heartbeat every 15s while the tab is visible -> measures time on site
  useEffect(() => {
    const beat = () => {
      if (location.pathname.startsWith("/analytics")) return;
      send("heartbeat", { path: location.pathname });
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") beat();
    }, 15000);
    const onHide = () => {
      if (document.visibilityState === "hidden") beat();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return null;
}
