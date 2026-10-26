"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

/* ═══════════════════════════════════════════════════════════════
   WHAT SHOWS WHERE (so you can see it all in one place)
   - Everywhere a person's photo shows:   photo + frame            -> <WornAvatar />
   - Inbox, member lists, side menu, Home: photo + frame + nameplate -> <WornAvatar /> + <NameTag />
   - Study room, community chat:           photo + frame only
   - Feed (TikTok side) and profiles:      the full package (frame, nameplate, badge, crown)
   ═══════════════════════════════════════════════════════════════ */

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

// A round photo with the frame someone wears around it, big sizes (profile, home). The frame grows outward.
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

// Photo + frame for lists, chats and menus. It always takes exactly `size` pixels of room, so rows
// never get pushed around; the frame's decoration just spills a little over the edge.
// Use: <WornAvatar frame={worn.frame} size={44} render={(s) => <Avatar user={u} size={s} />} />
export function WornAvatar({ frame, size = 40, render, children }) {
  const file = frame && frame.sheet ? frame.sheet.file : null;
  const ok = useSheetOk(file);
  const draw = (s) => (render ? render(s) : children);
  if (frame && frame.sheet && frame.sprite != null && ok) {
    const photo = Math.round(size * 0.8);
    const O = Math.round(photo / Math.max(frame.fit || 0.6, 0.62));
    return (
      <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, flexShrink: 0 }}>
        {draw(photo)}
        <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: O, height: O, marginLeft: -O / 2, marginTop: -O / 2, pointerEvents: "none", ...spriteBg(frame.sheet, frame.sprite) }} />
      </span>
    );
  }
  if (frame && frame.ring) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, flexShrink: 0 }}>
        <span style={{ display: "inline-flex", padding: 2, borderRadius: "50%", background: frame.ring }}>{draw(size - 4 - 2)}</span>
      </span>
    );
  }
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, flexShrink: 0 }}>{draw(size)}</span>;
}

/* ───────── Nameplates ─────────
   Each banner picture is either "filled" (full artwork), "hollow" (just a decorated border) or "light"
   (pale paper). [hue, saturation, kind] is taken from the artwork so the name colour matches it. */
const PLATE_LOOK = {0:[329,0.47,"f"], 1:[344,0.0,"h"], 2:[216,0.71,"f"], 3:[3,0.75,"h"], 4:[256,0.63,"f"], 5:[99,0.51,"h"], 6:[269,0.75,"h"], 8:[324,0.71,"f"], 9:[8,0.0,"h"], 10:[355,0.75,"h"], 11:[21,0.0,"l"], 12:[276,0.75,"h"], 13:[215,0.75,"f"], 14:[92,0.67,"h"], 15:[270,0.75,"f"], 16:[54,0.63,"f"], 17:[205,0.75,"f"], 18:[325,0.58,"f"], 19:[3,0.75,"f"], 20:[280,0.75,"h"], 21:[254,0.55,"f"], 22:[24,0.47,"f"], 23:[224,0.7,"f"], 24:[359,0.75,"h"], 25:[233,0.75,"h"], 26:[206,0.74,"h"], 27:[5,0.6,"f"], 28:[339,0.59,"f"], 29:[325,0.0,"h"], 30:[258,0.54,"f"], 31:[276,0.75,"h"], 32:[113,0.61,"h"], 33:[297,0.75,"f"], 34:[321,0.59,"h"], 35:[266,0.62,"f"]};
function plateStyles(sprite) {
  const [h, s, kind] = PLATE_LOOK[sprite] || [270, 0.4, "f"];
  const sat = Math.round(Math.min(s, 0.7) * 100);
  const deep = `hsl(${h}, ${Math.max(sat, 25)}%, 9%)`;
  const glow = `hsl(${h}, ${Math.max(sat, 40)}%, 58%)`;
  if (kind === "l") {
    return {
      ink: `hsl(${h}, 40%, 12%)`,
      shadow: "0 1px 0 rgba(255,250,240,.85), 0 0 6px rgba(255,250,240,.9)",
      scrim: "radial-gradient(ellipse at center, rgba(255,250,240,.55) 0%, rgba(255,250,240,.25) 55%, rgba(255,250,240,0) 78%)",
    };
  }
  if (kind === "h") {
    return {
      ink: `hsl(${h}, ${Math.min(sat, 55)}%, 93%)`,
      shadow: `0 0 6px ${glow}, 0 0 14px ${glow}, 0 1px 2px ${deep}`,
      scrim: `radial-gradient(ellipse at center, ${deep} 0%, ${deep} 62%, rgba(0,0,0,0) 100%)`,
    };
  }
  return {
    ink: `hsl(${h}, ${Math.min(sat, 40)}%, 96%)`,
    shadow: `0 1px 2px ${deep}, 0 0 8px ${deep}, 0 0 14px ${deep}`,
    scrim: "radial-gradient(ellipse at center, rgba(0,0,0,.42) 0%, rgba(0,0,0,.22) 52%, rgba(0,0,0,0) 78%)",
  };
}

// A name written on the banner they own (centred, coloured to match), or plain text when they have none.
// Plain text takes `className` / `style` so each screen keeps its own look.
export function NameTag({ plate, name, width = 150, className, style, plainTag: Tag = "span" }) {
  const file = plate && plate.sheet ? plate.sheet.file : null;
  const ok = useSheetOk(file);
  if (!(plate && plate.sheet && plate.sprite != null && ok)) {
    return <Tag className={className} style={style}>{name}</Tag>;
  }
  const look = plateStyles(plate.sprite);
  const hollow = (PLATE_LOOK[plate.sprite] || [])[2] === "h";
  const len = Math.max(String(name || "").length, 5);
  const fs = Math.max(9, Math.min(width * 0.098, (width * 0.6) / (len * 0.56)));
  const H = Math.round(width / 2.5);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width, height: H, flexShrink: 0, maxWidth: "100%" }} title={name}>
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, ...spriteBg(plate.sheet, plate.sprite) }} />
      <span aria-hidden="true" style={{ position: "absolute", left: hollow ? "11%" : "14%", right: hollow ? "11%" : "14%", top: hollow ? "20%" : "26%", bottom: hollow ? "20%" : "26%", borderRadius: 999, background: look.scrim, filter: hollow ? "none" : "blur(3px)" }} />
      <span style={{ position: "relative", maxWidth: "66%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs, lineHeight: 1.15, letterSpacing: ".01em", color: look.ink, textShadow: look.shadow }}>
        {name}
      </span>
    </span>
  );
}

// The little picture badge someone wears (feed and profile).
export function WornBadge({ badge, size = 22 }) {
  const file = badge && badge.sheet ? badge.sheet.file : null;
  const ok = useSheetOk(file);
  if (!(badge && badge.sheet && badge.sprite != null && ok)) return null;
  return <span title={badge.name} aria-label={badge.name} style={{ width: size, height: size, display: "inline-block", flexShrink: 0, ...spriteBg(badge.sheet, badge.sprite) }} />;
}

/* ───────── Who wears what ─────────
   Everything is fetched in batches (one request for a whole screen) and remembered for a short while. */
const EMPTY_WORN = { frame: null, badge: null, nameplate: null, effect: null, premium: false };
const WORN_TTL = 20000;
const wornCache = {};
const wornSubs = {};
let wornQueue = new Set();
let wornTimer = null;

function wornFresh(id) {
  const c = wornCache[id];
  return c && Date.now() - c.t < WORN_TTL ? c.v : null;
}
function wornSet(id, v) {
  wornCache[id] = { v, t: Date.now() };
  const subs = wornSubs[id];
  if (subs) subs.forEach((f) => f(v));
}
function wornFlush() {
  wornTimer = null;
  const ids = Array.from(wornQueue);
  wornQueue = new Set();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    fetch(`/api/store?userIds=${encodeURIComponent(chunk.join(","))}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const m = (d && d.equippedMap) || {};
        chunk.forEach((id) => wornSet(id, m[id] || EMPTY_WORN));
      })
      .catch(() => chunk.forEach((id) => wornSet(id, EMPTY_WORN)));
  }
}
function wornRequest(id) {
  wornQueue.add(id);
  if (!wornTimer) wornTimer = setTimeout(wornFlush, 25);
}
function wornSubscribe(id, fn) {
  (wornSubs[id] || (wornSubs[id] = new Set())).add(fn);
  return () => { if (wornSubs[id]) wornSubs[id].delete(fn); };
}

// What one person wears: { frame, badge, nameplate, effect, premium } (all empty until loaded or if none).
export function useWorn(id) {
  const [w, setW] = useState(() => (id && wornFresh(id)) || EMPTY_WORN);
  useEffect(() => {
    if (!id) { setW(EMPTY_WORN); return; }
    const fresh = wornFresh(id);
    if (fresh) { setW(fresh); return; }
    const off = wornSubscribe(id, setW);
    wornRequest(id);
    return off;
  }, [id]);
  return w;
}

// What a list of people wear in one request: { userId: { frame, badge, nameplate, ... } }
export function useEquippedMap(ids) {
  const [, bump] = useState(0);
  const key = Array.from(new Set((ids || []).filter(Boolean))).sort().join(",");
  useEffect(() => {
    if (!key) return;
    const list = key.split(",");
    const f = () => bump((n) => n + 1);
    const offs = list.map((id) => wornSubscribe(id, f));
    list.forEach((id) => { if (!wornFresh(id)) wornRequest(id); });
    return () => offs.forEach((o) => o());
  }, [key]);
  const out = {};
  if (key) key.split(",").forEach((id) => { if (wornCache[id]) out[id] = wornCache[id].v; });
  return out;
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
