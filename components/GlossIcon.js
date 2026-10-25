"use client";
import iconsImg from "@/icons.webp";
import {
  Pencil, Users, Layers, TrendingUp, GraduationCap, BookOpen, PenLine, Wand2, Globe, Plane, Home as HomeI,
  Briefcase, Stethoscope, Languages, FileText, ListChecks, Timer, Calculator, Brain, Mail, Search as SearchI,
  Share2, Camera, Lightbulb, Wrench, MapPin, Utensils, Shirt, Scale, Target, Megaphone, Sparkles,
} from "lucide-react";

// Glassy purple icons for the whole app. Every icon comes from one sprite stored in
// components/spriteData.js (a 5 x 5 grid of 128px cells). Use it like: <GlossIcon name="mind-gym" size={30} />

const COLS = 5;
const ROWS = 10;

const POS = {
  home: [0, 0], inbox: [1, 0], "ai-tools": [2, 0], school: [3, 0], business: [4, 0],
  writing: [0, 1], travel: [1, 1], "home-tools": [2, 1], communities: [3, 1], favorites: [4, 1],
  history: [0, 2], collections: [1, 2], notifications: [2, 2], premium: [3, 2], settings: [4, 2],
  profile: [0, 3], search: [1, 3], "mind-gym": [2, 3], feed: [3, 3], math: [4, 3],
  sudoku: [0, 4], flashcards: [1, 4], progress: [2, 4], quiz: [3, 4], notes: [4, 4],
  calendar: [0, 5], translate: [1, 5], legal: [3, 5], food: [4, 5],
  clothing: [0, 6], idea: [1, 6], health: [2, 6], marketing: [3, 6], camera: [4, 6],
  mail: [0, 7], share: [1, 7], vcoin: [2, 7], brain: [3, 7], shop: [4, 7],
  trophy: [0, 8], code: [1, 8], timer: [2, 8], star: [3, 8], lock: [4, 8], trash: [1, 9],
};

// Feature names that borrow one of the hand-made pictures above (the pen is "Edit", the group is "Study room", ...).
const SPRITE_FOR = {
  edit: "writing", "study-room": "communities", progress: "progress", tutor: "school", study: "school",
  tool: "ai-tools", web: "translate", trip: "travel", house: "home-tools", work: "business", health: "health",
  language: "translate", document: "notes", checklist: "quiz", calc: "math", goal: "trophy", style: "clothing",
  find: "search", place: "travel", fix: "home-tools", promo: "marketing", generic: "ai-tools",
  coins: "vcoin", neurons: "brain", community: "communities", system: "notifications", logout: "settings", user: "profile",
};

// Friendly names that reuse another icon.
const ALIAS = {
  chat: "ai-tools",
  syna: "ai-tools",
  planner: "history",
  summarizer: "collections",
  bell: "notifications",
  messages: "inbox",
};

// Glossy purple tiles for features that have no hand-made picture yet (drawn in code, same look in light and dark).
const GLYPHS = {
  edit: Pencil, "study-room": Users, flashcards: Layers, progress: TrendingUp, tutor: GraduationCap,
  study: BookOpen, writing: PenLine, tool: Wand2, web: Globe, trip: Plane, house: HomeI, work: Briefcase,
  health: Stethoscope, language: Languages, document: FileText, checklist: ListChecks, timer: Timer,
  calc: Calculator, brain: Brain, mail: Mail, find: SearchI, share: Share2, camera: Camera, idea: Lightbulb,
  fix: Wrench, place: MapPin, food: Utensils, style: Shirt, legal: Scale, goal: Target, promo: Megaphone, generic: Sparkles,
};

// Picks a glyph from a link or label, e.g. "/tools/school/flashcards" -> flashcards.
export function glyphFor(text = "") {
  const t = String(text).toLowerCase();
  const rules = [
    ["study-room", "study-room"], ["room", "study-room"], ["flash", "flashcards"], ["progress", "progress"],
    ["tutor", "tutor"], ["quiz", "checklist"], ["summar", "document"], ["note", "document"], ["essay", "writing"],
    ["write", "writing"], ["email", "mail"], ["translat", "language"], ["language", "language"], ["travel", "trip"],
    ["trip", "trip"], ["itinerar", "trip"], ["visa", "web"], ["budget", "calc"], ["math", "calc"], ["recipe", "food"],
    ["meal", "food"], ["cloth", "style"], ["outfit", "style"], ["repair", "fix"], ["fix", "fix"], ["home", "house"],
    ["business", "work"], ["name", "idea"], ["website", "web"], ["market", "promo"], ["social", "promo"],
    ["legal", "legal"], ["health", "health"], ["plan", "goal"], ["goal", "goal"], ["time", "timer"], ["study", "study"],
    ["school", "study"], ["code", "tool"], ["image", "camera"], ["photo", "camera"],
  ];
  for (const [k, g] of rules) if (t.includes(k)) return g;
  return "generic";
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

export default function GlossIcon({ name, size = 36, fallback: FallbackProp }) {
  let Fallback = FallbackProp;
  const pos = POS[ALIAS[name] || name] || POS[SPRITE_FOR[name]];
  const src = iconsImg.src;
  if (!pos && !Fallback && GLYPHS[name]) Fallback = GLYPHS[name];

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
