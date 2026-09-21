"use client";
import { useState } from "react";

export default function GlossIcon({ name, size = 36, fallback: Fallback }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return Fallback ? <Fallback size={Math.round(size * 0.5)} /> : null;
  }

  return (
    <img
      src={`/icons/${name}.png`}
      width={size}
      height={size}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      style={{ objectFit: "contain", flexShrink: 0 }}
    />
  );
}