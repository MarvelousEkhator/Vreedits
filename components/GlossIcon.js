"use client";
import spriteImg from "./sprite.png";

// Glassy purple icons for the whole app.
// 1) Most come from components/sprite.png (a 5 x 4 grid).
// 2) The few the sprite doesn't have (Mind Gym, Feed, Math, Sudoku) are drawn here as
//    glossy glass SVGs in the same purple, so every icon looks like one set.
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
      {/* soft floor glow */}
      <ellipse cx="32" cy="55" rx="23" ry="3.4" fill="#c27cf2" opacity=".3" />

      {/* handle bar */}
      <rect x="18" y="27" width="28" height="10" rx="5" fill="url(#vg-bar)" stroke="url(#vg-s)" strokeWidth="1" />
      <rect x="22" y="29" width="20" height="2.6" rx="1.3" fill="#fff" opacity=".75" />
      <rect x="22" y="33.4" width="20" height="1.4" rx=".7" fill="#f0b8ff" opacity=".4" />

      {/* left plates */}
      <rect x="3" y="14" width="13" height="36" rx="6.5" fill="url(#vg-plate)" stroke="url(#vg-s)" strokeWidth="1.1" />
      <rect x="13" y="19.5" width="9.5" height="25" rx="4.75" fill="url(#vg-plate)" stroke="url(#vg-s)" strokeWidth="1.1" />
      <rect x="5.6" y="16.4" width="3.6" height="15" rx="1.8" fill="url(#vg-gloss)" />
      <rect x="15.4" y="21.6" width="2.8" height="10" rx="1.4" fill="url(#vg-gloss)" />
      <rect x="5" y="44" width="9" height="3" rx="1.5" fill="#f0b8ff" opacity=".4" />

      {/* right plates */}
      <rect x="48" y="14" width="13" height="36" rx="6.5" fill="url(#vg-plate)" stroke="url(#vg-s)" strokeWidth="1.1" />
      <rect x="41.5" y="19.5" width="9.5" height="25" rx="4.75" fill="url(#vg-plate)" stroke="url(#vg-s)" strokeWidth="1.1" />
      <rect x="50.6" y="16.4" width="3.6" height="15" rx="1.8" fill="url(#vg-gloss)" />
      <rect x="43.4" y="21.6" width="2.8" height="10" rx="1.4" fill="url(#vg-gloss)" />
      <rect x="50" y="44" width="9" height="3" rx="1.5" fill="#f0b8ff" opacity=".4" />

      {/* sparkle */}
      <circle cx="30" cy="22" r="1.4" fill="#fff" opacity=".8" />
      <circle cx="35" cy="19" r=".8" fill="#fff" opacity=".6" />
    </>
  ),
  feed: (
    <>
      <ellipse cx="32" cy="60" rx="14" ry="2.6" fill="#c27cf2" opacity=".28" />
      <rect x="14" y="3" width="36" height="57" rx="10.5" fill="url(#vg-plate)" stroke="url(#vg-s)" strokeWidth="1.2" />
      <rect x="18.5" y="8.5" width="27" height="46" rx="6.5" fill="#26094d" opacity=".9" />
      <rect x="18.5" y="8.5" width="27" height="46" rx="6.5" fill="url(#vg-g2)" opacity=".22" />
      <path d="M27.5 24 L27.5 40 L41 32 Z" fill="#f2deff" stroke="#fff" strokeOpacity=".8" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="22.5" y="46.5" width="14" height="2.4" rx="1.2" fill="#fff" opacity=".6" />
      <circle cx="41" cy="47.7" r="1.5" fill="#f0b8ff" opacity=".8" />
      <rect x="16.4" y="6" width="4.2" height="20" rx="2.1" fill="url(#vg-gloss)" />
    </>
  ),
  math: (
    <>
      <ellipse cx="32" cy="60" rx="20" ry="2.8" fill="#c27cf2" opacity=".28" />
      <rect x="24.5" y="5" width="15" height="54" rx="7.5" fill="url(#vg-plate)" stroke="url(#vg-s)" strokeWidth="1.1" />
      <rect x="5" y="24.5" width="54" height="15" rx="7.5" fill="url(#vg-plate)" stroke="url(#vg-s)" strokeWidth="1.1" />
      <rect x="27.6" y="8.5" width="3.6" height="17" rx="1.8" fill="url(#vg-gloss)" />
      <rect x="9" y="27.6" width="15" height="3.4" rx="1.7" fill="url(#vg-gloss)" />
      <rect x="27" y="45" width="10" height="3" rx="1.5" fill="#f0b8ff" opacity=".35" />
    </>
  ),
  sudoku: (
    <>
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => {
          const x = 4.5 + c * 19.5;
          const y = 4.5 + r * 19.5;
          const mid = r === 1 && c === 1;
          return (
            <g key={`${r}${c}`}>
              <rect x={x} y={y} width="17" height="17" rx="5" fill={mid ? "url(#vg-g2)" : "url(#vg-plate)"} stroke="url(#vg-s)" strokeWidth="1" />
              <rect x={x + 2.6} y={y + 2.4} width="8" height="2.6" rx="1.3" fill="#fff" opacity={mid ? 0.85 : 0.6} />
              <rect x={x + 2.6} y={y + 12.4} width="11" height="1.8" rx=".9" fill="#f0b8ff" opacity=".3" />
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
      style={{ flexShrink: 0, display: "inline-block", filter: "drop-shadow(0 2px 6px rgba(147,3,197,0.6))" }}
    >
      <defs>
        <linearGradient id="vg-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6ccff" />
          <stop offset="0.45" stopColor="#9a55e6" />
          <stop offset="1" stopColor="#4b1a8a" />
        </linearGradient>
        <linearGradient id="vg-g2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f9ecff" />
          <stop offset="0.5" stopColor="#c27cf2" />
          <stop offset="1" stopColor="#6a2bb5" />
        </linearGradient>
        <radialGradient id="vg-plate" cx="0.3" cy="0.2" r="1">
          <stop offset="0" stopColor="#f6e8ff" />
          <stop offset="0.35" stopColor="#bb86f5" />
          <stop offset="0.72" stopColor="#6a2bb5" />
          <stop offset="1" stopColor="#2c0b63" />
        </radialGradient>
        <linearGradient id="vg-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1ddff" />
          <stop offset="0.45" stopColor="#9a55e6" />
          <stop offset="1" stopColor="#3a1275" />
        </linearGradient>
        <linearGradient id="vg-gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="vg-s" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#e6b5ff" stopOpacity="0.2" />
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