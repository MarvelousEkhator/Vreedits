"use client";
import spriteImg from "./sprite.png";

// Glassy purple icons for the whole app.
// 1) Most come from components/sprite.png (a 5 x 4 grid).
// 2) The few the sprite doesn't have (Mind Gym, Math, Sudoku) are drawn here as
//    glass-style SVGs in the same purple, so every icon looks like one set.
// Nothing else needs to change: <GlossIcon name="mind-gym" size={30} />

const COLS = 5;
const ROWS = 4;

const POS = {
  home: [0, 0], inbox: [1, 0], "ai-tools": [2, 0], school: [3, 0], business: [4, 0],
  writing: [0, 1], travel: [1, 1], "home-tools": [2, 1], communities: [3, 1], favorites: [4, 1],
  history: [0, 2], collections: [1, 2], notifications: [2, 2], premium: [3, 2], settings: [4, 2],
  profile: [0, 3], search: [1, 3],
};

// Friendly names that reuse a sprite icon.
const ALIAS = {
  chat: "ai-tools",
  syna: "ai-tools",
  planner: "history",
  summarizer: "collections",
  notes: "collections",
  bell: "notifications",
  messages: "inbox",
};

const GLASS = {
  "mind-gym": (
    <>
      <rect x="10" y="29" width="44" height="6" rx="3" fill="url(#vg-g)" stroke="url(#vg-s)" strokeWidth="1" />
      <rect x="5" y="17" width="10" height="30" rx="5" fill="url(#vg-g)" stroke="url(#vg-s)" strokeWidth="1" />
      <rect x="13" y="22" width="8" height="20" rx="4" fill="url(#vg-g)" stroke="url(#vg-s)" strokeWidth="1" />
      <rect x="49" y="17" width="10" height="30" rx="5" fill="url(#vg-g)" stroke="url(#vg-s)" strokeWidth="1" />
      <rect x="43" y="22" width="8" height="20" rx="4" fill="url(#vg-g)" stroke="url(#vg-s)" strokeWidth="1" />
      <rect x="7" y="19" width="3" height="12" rx="1.5" fill="#fff" opacity=".55" />
      <rect x="51" y="19" width="3" height="12" rx="1.5" fill="#fff" opacity=".55" />
      <rect x="22" y="30" width="20" height="1.6" rx=".8" fill="#fff" opacity=".5" />
    </>
  ),
  math: (
    <>
      <rect x="25" y="6" width="14" height="52" rx="7" fill="url(#vg-g)" stroke="url(#vg-s)" strokeWidth="1" />
      <rect x="6" y="25" width="52" height="14" rx="7" fill="url(#vg-g)" stroke="url(#vg-s)" strokeWidth="1" />
      <rect x="28" y="10" width="3" height="16" rx="1.5" fill="#fff" opacity=".55" />
      <rect x="10" y="28" width="14" height="3" rx="1.5" fill="#fff" opacity=".5" />
    </>
  ),
  sudoku: (
    <>
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => {
          const x = 5 + c * 19;
          const y = 5 + r * 19;
          const mid = r === 1 && c === 1;
          return (
            <g key={`${r}${c}`}>
              <rect x={x} y={y} width="16" height="16" rx="4.5" fill={mid ? "url(#vg-g2)" : "url(#vg-g)"} stroke="url(#vg-s)" strokeWidth="1" />
              <rect x={x + 2.5} y={y + 2.5} width="7" height="2.2" rx="1.1" fill="#fff" opacity={mid ? 0.7 : 0.45} />
            </g>
          );
        })
      )}
    </>
  ),
};

function Glass({ name, size }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ flexShrink: 0, display: "inline-block", filter: "drop-shadow(0 2px 5px rgba(147,3,197,0.5))" }}
    >
      <defs>
        <linearGradient id="vg-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6ccff" />
          <stop offset="0.45" stopColor="#9a55e6" />
          <stop offset="1" stopColor="#4b1a8a" />
        </linearGradient>
        <linearGradient id="vg-g2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6e6ff" />
          <stop offset="0.5" stopColor="#c27cf2" />
          <stop offset="1" stopColor="#6a2bb5" />
        </linearGradient>
        <linearGradient id="vg-s" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      {GLASS[name]}
    </svg>
  );
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
  if (GLASS[name]) return <Glass name={name} size={size} />;

  const key = ALIAS[name] || name;
  const pos = POS[key];
  const src = spriteImg && (spriteImg.src || spriteImg);

  // Only shows the old purple tile if the icon name is unknown.
  if (!pos || !src) return <Gem size={size} Fallback={Fallback} />;

  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${COLS * size}px ${ROWS * size}px`,
        backgroundPosition: `${-pos[0] * size}px ${-pos[1] * size}px`,
        filter: "drop-shadow(0 2px 5px rgba(147,3,197,0.5))",
      }}
    />
  );
}
