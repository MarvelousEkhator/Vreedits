// components/FeedViewRecorder.js
"use client";
import { useEffect } from "react";

const WATCH_MS = 1500; // how long a post must stay on screen
const VISIBLE_RATIO = 0.6; // how much of it must be on screen

// Watches the posts on the feed page (the cards marked with data-post-id)
// and tells the server when one has really been watched.
export default function FeedViewRecorder() {
  useEffect(() => {
    const sent = new Set();
    const timers = new Map();
    const observed = new WeakSet();
    let frame = 0;

    async function record(id) {
      if (sent.has(id)) return;
      sent.add(id);
      try {
        // Refusals (guest, private post) aren't retried; only network errors are.
        await fetch(`/api/feed/${id}/view`, { method: "POST" });
      } catch {
        sent.delete(id);
      }
    }

    function clearTimer(id) {
      const t = timers.get(id);
      if (t) clearTimeout(t);
      timers.delete(id);
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-post-id");
          if (!id || sent.has(id)) continue;

          if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) {
            if (!timers.has(id)) {
              timers.set(
                id,
                setTimeout(() => {
                  timers.delete(id);
                  if (document.visibilityState === "visible") record(id);
                }, WATCH_MS)
              );
            }
          } else {
            clearTimer(id);
          }
        }
      },
      { threshold: [0, VISIBLE_RATIO, 1] }
    );

    function observeAll() {
      document.querySelectorAll("[data-post-id]").forEach((el) => {
        if (!observed.has(el)) {
          observed.add(el);
          io.observe(el);
        }
      });
    }

    // New posts load as the person scrolls, so keep looking for them.
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(observeAll);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    observeAll();

    function onVisibility() {
      if (document.visibilityState !== "visible") {
        timers.forEach((t) => clearTimeout(t));
        timers.clear();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      io.disconnect();
      timers.forEach((t) => clearTimeout(t));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}