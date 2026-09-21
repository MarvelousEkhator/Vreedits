"use client";
import { useState, useEffect } from "react";

// The app looks for the icon sheet in these places, in this order.
const CANDIDATES = [
  "/icons/sprite.png",
  "/icons/1000021901.png",
  "/sprite.png",
  "/1000021901.png",
];
const COLS = 5;
const ROWS = 4;

const POS = {
  home: [0, 0], inbox: [1, 0], "ai-tools": [2, 0], school: [3, 0], business: [4, 0],
  writing: [0, 1], travel: [1, 1], "home-tools": [2, 1], communities: [3, 1], favorites: [4, 1],
  history: [0, 2], collections: [1, 2], notifications: [2, 2], premium: [3, 2], settings: [4, 2],
  profile: [0, 3], search: [1, 3],
};

// Remember which file worked so every icon doesn't re-check.
let spriteStatus = "unknown"; // "unknown" | "ok" | "fail"
let spriteSrc = null;
let spritePromise = null;

function tryLoad(i, resolve) {
  if (i >= CANDIDATES.length) {
    spriteStatus = "fail";
    resolve("fail");
    return;
  }
  const img = new window.Image();
  img.onload = () => {
    spriteSrc = CANDIDATES[i];
    spriteStatus = "ok";
    resolve("ok");
  };
  img.onerror = () => tryLoad(i + 1, resolve);
  img.src = CANDIDATES[i];
}

function checkSprite() {
  if (spriteStatus !== "unknown") return Promise.resolve(spriteStatus);
  if (!spritePromise) {
    spritePromise = new Promise((resolve) => tryLoad(0, resolve));
  }
  return spritePromise;
}

function Gem({ size, Fallback }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: "32%", flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: "#fff",
        background: "radial-gradient(circle at 30% 22%, #e9c2ff 0%, #b84dff 38%, #7a02a3 72%, #3a0559 100%)",
        boxShadow: "inset 0 2px 3px rgba(255,255,255,0.55), inset 0 -3px 6px rgba(0,0,0,0.4), 0 3px 8px rgba(147,3,197,0.45)",
      }}
    >
      {Fallback ? <Fallback size={Math.round(size * 0.5)} /> : null}
    </span>
  );
}

export default function GlossIcon({ name, size = 36, fallback: Fallback }) {
  const [ready, setReady] = useState(spriteStatus === "ok");

  useEffect(() => {
    let alive = true;
    checkSprite().then((s) => { if (alive) setReady(s === "ok"); });
    return () => { alive = false; };
  }, []);

  const pos = POS[name];
  if (!ready || !pos || !spriteSrc) return <Gem size={size} Fallback={Fallback} />;

  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block", width: size, height: size, flexShrink: 0,
        backgroundImage: `url(${spriteSrc})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${COLS * size}px ${ROWS * size}px`,
        backgroundPosition: `${-pos[0] * size}px ${-pos[1] * size}px`,
        filter: "drop-shadow(0 2px 5px rgba(147,3,197,0.5))",
      }}
    />
  );
}