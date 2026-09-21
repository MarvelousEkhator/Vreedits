"use client";

const SPRITE_INDEX = {
  home: 0,
  inbox: 1,
  ai: 2,
  school: 3,
  business: 4,
  writing: 5,
  travel: 6,
  tools: 7,
  communities: 8,
  favorites: 9,
  history: 10,
  collections: 11,
  notifications: 12,
  premium: 13,
  settings: 14,
  profile: 15,
  search: 16,
};

const COLS = 5;
const ROWS = 4;

export default function SpriteIcon({ name, size = 28, style = {} }) {
  const index = SPRITE_INDEX[name];
  if (index === undefined) return null;

  const col = index % COLS;
  const row = Math.floor(index / COLS);

  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        backgroundImage: "url(/sprite.png)",
        backgroundRepeat: "no-repeat",
        backgroundSize: `${size * COLS}px ${size * ROWS}px`,
        backgroundPosition: `-${col * size}px -${row * size}px`,
        filter: "drop-shadow(0 2px 6px rgba(109, 79, 242, 0.45))",
        ...style,
      }}
    />
  );
}