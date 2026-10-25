"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Remember which shop picture files load, so a missing file never leaves a blank gap.
const sheetState = {};
export function useSheetOk(file) {
  const [ok, setOk] = useState(file && sheetState[file] !== undefined ? sheetState[file] : null);
  useEffect(() => {
    if (!file) return;
    if (sheetState[file] !== undefined) { setOk(sheetState[file]); return; }
    const im = new Image();
    im.onload = () => { sheetState[file] = true; setOk(true); };
    im.onerror = () => { sheetState[file] = false; setOk(false); };
    im.src = file;
  }, [file]);
  return ok;
}

// Every shop picture is one square of a bigger image laid out as a grid.
export function spriteBg(sheet, sprite) {
  const col = sprite % sheet.cols, row = Math.floor(sprite / sheet.cols);
  return {
    backgroundImage: `url(${sheet.file})`, backgroundRepeat: "no-repeat",
    backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
    backgroundPosition: `${sheet.cols > 1 ? (col / (sheet.cols - 1)) * 100 : 0}% ${sheet.rows > 1 ? (row / (sheet.rows - 1)) * 100 : 0}%`,
  };
}

// A round photo with the frame someone wears around it. `frame` comes from /api/store (equipped.frame).
export function FramedAvatar({ frame, size = 48, children }) {
  const file = frame && frame.sheet ? frame.sheet.file : null;
  const ok = useSheetOk(file);
  if (frame && frame.sheet && frame.sprite != null && ok) {
    const fit = Math.max(frame.fit || 0.6, 0.5);
    const O = Math.round(size / fit);
    const m = Math.round((O - size) / 2);
    return (
      <span style={{ position: "relative", display: "inline-flex", width: size, height: size, margin: m, flexShrink: 0 }}>
        {children}
        <span aria-hidden="true" style={{ position: "absolute", left: (size - O) / 2, top: (size - O) / 2, width: O, height: O, pointerEvents: "none", ...spriteBg(frame.sheet, frame.sprite) }} />
      </span>
    );
  }
  if (frame && frame.ring) {
    return <span style={{ display: "inline-flex", padding: 3, borderRadius: "50%", background: frame.ring, flexShrink: 0 }}>{children}</span>;
  }
  return <span style={{ display: "inline-flex", flexShrink: 0 }}>{children}</span>;
}

// Loads the equipped items for a list of people in one request: { userId: { frame, badge, ... } }
export function useEquippedMap(ids) {
  const [map, setMap] = useState({});
  const key = Array.from(new Set((ids || []).filter(Boolean))).sort().join(",");
  useEffect(() => {
    if (!key) return;
    let dead = false;
    fetch(`/api/store?userIds=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!dead && d && d.equippedMap) setMap(d.equippedMap); })
      .catch(() => {});
    return () => { dead = true; };
  }, [key]);
  return map;
}

// Makes whatever is inside (an avatar, a name) open that person's profile when tapped.
// Without a user id it just renders the children unchanged.
export function TapUser({ user, userId, children, style, inline = true }) {
  const router = useRouter();
  const id = userId || (user && user.id);
  if (!id) return children;
  function go(e) {
    e.stopPropagation();
    e.preventDefault();
    router.push(`/profile/${id}`);
  }
  return (
    <span
      role="link" tabIndex={0} onClick={go}
      onKeyDown={(e) => { if (e.key === "Enter") go(e); }}
      style={{ cursor: "pointer", display: inline ? "inline-flex" : "block", flexShrink: 0, minWidth: 0, ...style }}
    >
      {children}
    </span>
  );
}
