"use client";
import { useState, useEffect, useRef } from "react";
import { ArrowLeft, RotateCw } from "lucide-react";

// Change this to wherever Notes in School are loaded from.
// It should return a list like [{ id, title, content }] (or { notes: [...] }).
const NOTES_ENDPOINT = "/api/notes";
const QUIZ_ENDPOINT = "/api/mind-gym/notes-quiz";
const STORE_KEY = "vreedits.mindgym.v1";
const ROUND = 8;

// Notes in School are saved as a list of blocks ({ type, text, ... }), not plain
// text. This turns either shape into plain text the quiz can read.
function toText(c) {
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  const out = [];
  for (const b of c) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "image" || b.type === "file" || b.type === "divider") continue;
    if (b.type === "table" && Array.isArray(b.rows)) {
      for (const row of b.rows) {
        const line = (Array.isArray(row) ? row : []).map((x) => String(x || "").trim()).filter(Boolean).join(", ");
        if (line) out.push(line + ".");
      }
      continue;
    }
    const t = typeof b.text === "string" ? b.text.trim() : "";
    if (!t) continue;
    // Make sure each block ends like a sentence so questions can be built from it.
    out.push(/[.!?]$/.test(t) ? t : t + ".");
  }
  return out.join(" ");
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dayKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Counts the round and the day toward the Mind Gym streak.
function recordPlay(score) {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const s = raw ? JSON.parse(raw) : {};
    const games = s.games && typeof s.games === "object" ? s.games : {};
    const g = games.notes || { plays: 0, wins: 0, best: 0 };
    g.plays = (g.plays || 0) + 1;
    if (score >= 6) g.wins = (g.wins || 0) + 1;
    g.best = Math.max(g.best || 0, score);
    games.notes = g;
    const days = Array.isArray(s.playedDays) ? s.playedDays : [];
    s.playedDays = Array.from(new Set([...days, dayKey()])).sort().slice(-90);
    s.games = games;
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {}
}

const STOP = new Set([
  "about", "which", "their", "there", "these", "those", "would", "could",
  "should", "because", "between", "through", "during", "before", "after",
  "where", "while", "other", "being", "using", "called", "often",
]);

function wordsOf(s) {
  return (s.match(/[A-Za-z][A-Za-z'-]{5,}/g) || []).filter(
    (w) => !STOP.has(w.toLowerCase())
  );
}

// Backup questions built straight from the note text.
function localQuestions(content) {
  const flat = content.replace(/\s+/g, " ");
  const sentences = (flat.match(/[^.!?]+[.!?]+/g) || [])
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 220);
  const pool = Array.from(new Set(wordsOf(flat).map((w) => w.toLowerCase())));
  if (pool.length < 4) return [];
  const out = [];
  for (const s of shuffle(sentences)) {
    const ws = wordsOf(s).sort((a, b) => b.length - a.length);
    if (!ws.length) continue;
    const target = ws[0];
    const t = target.toLowerCase();
    const distract = shuffle(pool.filter((w) => w !== t)).slice(0, 3);
    if (distract.length < 3) continue;
    const blanked = s.replace(new RegExp(`\\b${target}\\b`, "i"), "_____");
    out.push({
      q: `Fill in the blank: ${blanked}`,
      options: [t, ...distract],
      answer: 0,
      why: s,
    });
    if (out.length >= ROUND) break;
  }
  return out;
}

function prepare(list) {
  return list.map((q) => {
    const correct = q.options[q.answer];
    const options = shuffle(q.options);
    return { ...q, options, answer: options.indexOf(correct) };
  });
}

export function GameNotes({ onExit }) {
  const [phase, setPhase] = useState("loading");
  const [notes, setNotes] = useState([]);
  const [qs, setQs] = useState([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(-1);
  const [score, setScore] = useState(0);
  const recorded = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(NOTES_ENDPOINT, { cache: "no-store" });
        if (!res.ok) throw new Error("bad");
        const data = await res.json();
        const list = (Array.isArray(data) ? data : data.notes || [])
          .map((n, i) => ({
            id: n.id ?? i,
            title: String(n.title || "Untitled note"),
            content: toText(n.content ?? n.body ?? n.text ?? ""),
          }))
          .filter((n) => n.content.trim().length >= 60);
        if (!alive) return;
        setNotes(list);
        setPhase(list.length ? "pick" : "empty");
      } catch {
        if (alive) setPhase("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Takes one note, or a list of notes (a "mix"), and builds one round of questions.
  async function start(sel) {
    const chosen = Array.isArray(sel) ? sel : [sel];
    setPhase("making");
    const per = chosen.length > 1 ? Math.ceil(ROUND / chosen.length) + 1 : ROUND;
    const parts = await Promise.all(
      chosen.map(async (note) => {
        let list = [];
        try {
          const res = await fetch(QUIZ_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: note.title, content: note.content }),
          });
          if (res.ok) {
            const d = await res.json();
            if (Array.isArray(d.questions)) list = d.questions;
          }
        } catch {}
        if (list.length < 4) list = localQuestions(note.content);
        return list.slice(0, per).map((q) => ({ ...q, from: note.title }));
      })
    );
    const all = chosen.length > 1 ? shuffle(parts.flat()) : parts[0];
    if (all.length < 3) {
      setPhase("short");
      return;
    }
    setQs(prepare(all).slice(0, ROUND));
    setIdx(0);
    setPicked(-1);
    setScore(0);
    recorded.current = false;
    setPhase("playing");
  }

  // A mix of up to 3 different notes, so one round covers more than one topic.
  function mixOf() {
    return shuffle(notes).slice(0, 3);
  }

  // First time in: pick one of your notes and start the questions straight away.
  // "New round" afterwards lets you choose a note yourself.
  const auto = useRef(false);
  useEffect(() => {
    if (phase === "pick" && !auto.current && notes.length) {
      auto.current = true;
      start(mixOf());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, notes]);

  function choose(i) {
    if (picked !== -1) return;
    setPicked(i);
    if (i === qs[idx].answer) setScore((s) => s + 1);
  }

  function next() {
    if (idx + 1 >= qs.length) {
      if (!recorded.current) {
        recorded.current = true;
        recordPlay(score);
      }
      setPhase("done");
    } else {
      setIdx(idx + 1);
      setPicked(-1);
    }
  }

  const q = qs[idx];

  return (
    <div className="mg">
      <button className="mg-back" onClick={onExit}>
        <ArrowLeft size={20} /> Mind Gym
      </button>
      <div className="mg-eyebrow">Straight from your notes</div>
      <h1 className="mg-title">Notes Challenge</h1>

      {phase === "loading" || phase === "making" ? (
        <p className="mg-meta">
          {phase === "loading" ? "Loading your notes…" : "Getting your questions ready…"}
        </p>
      ) : null}

      {phase === "empty" || phase === "short" ? (
        <p className="mg-meta">
          {phase === "empty"
            ? "Write a few notes in School first. Once a note has a few sentences, your questions show up here."
            : "That note is too short for a full round. Add a bit more detail and try again."}
        </p>
      ) : null}
      {phase === "short" ? (
        <div className="mg-tools">
          <button className="mg-tool" onClick={() => setPhase("pick")}>Pick another note</button>
        </div>
      ) : null}

      {phase === "error" ? (
        <>
          <p className="mg-meta">Couldn't load your notes. Check your connection and try again.</p>
          <div className="mg-tools">
            <button className="mg-tool" onClick={() => { setPhase("loading"); window.location.reload(); }}>
              <RotateCw size={15} /> Try again
            </button>
          </div>
        </>
      ) : null}

      {phase === "pick" ? (
        <>
          <p className="mg-meta">
            You have {notes.length} note{notes.length === 1 ? "" : "s"} to be quizzed on.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {notes.length > 1 ? (
              <button className="mg-cta" onClick={() => start(mixOf())}>
                Mix of my notes
              </button>
            ) : null}
            <button
              className={notes.length > 1 ? "mg-tool" : "mg-cta"}
              style={notes.length > 1 ? { width: "100%", justifyContent: "center", height: 46 } : undefined}
              onClick={() => start(notes[Math.floor(Math.random() * notes.length)])}
            >
              {notes.length > 1 ? "One random note" : "Start"}
            </button>
            {notes.length > 1 ? (
              <p className="mg-meta" style={{ margin: "6px 0 0" }}>Or pick one:</p>
            ) : null}
            {notes.length > 1 &&
              notes.slice(0, 30).map((n) => (
                <button
                  key={n.id}
                  className="mg-tool"
                  style={{ width: "100%", justifyContent: "flex-start", height: 46 }}
                  onClick={() => start(n)}
                >
                  {n.title}
                </button>
              ))}
          </div>
        </>
      ) : null}

      {phase === "playing" && q ? (
        <>
          <div className="mg-sbar">
            <span className="mg-stime">Question {idx + 1} of {qs.length}</span>
            <span className="mg-meta" style={{ margin: 0 }}>{score} right</span>
          </div>
          <div className="mg-boardwrap">
            {q.from && notes.length > 1 ? (
              <div className="mg-meta" style={{ margin: "0 2px 4px" }}>From: {q.from}</div>
            ) : null}
            <p style={{ fontSize: 17, lineHeight: 1.45, fontWeight: 600, margin: "6px 2px 16px" }}>{q.q}</p>
            <div className="mg-sq-opts" style={{ gridTemplateColumns: "1fr" }}>
              {q.options.map((o, i) => (
                <button
                  key={i}
                  className={`mg-sq-o ${picked !== -1 && i === q.answer ? "right" : ""} ${picked === i && i !== q.answer ? "wrong" : ""}`}
                  style={{ height: "auto", minHeight: 54, padding: "10px 14px", fontSize: 16, textAlign: "left" }}
                  onClick={() => choose(i)}
                  disabled={picked !== -1}
                >
                  {o}
                </button>
              ))}
            </div>
            {picked !== -1 ? (
              <div className="mg-sq-why">
                <b>{picked === q.answer ? "Correct." : "Not quite."}</b>
                {q.why ? <span>{q.why}</span> : null}
                <button className="mg-cta" onClick={next}>
                  {idx + 1 >= qs.length ? "See score" : "Next"}
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {phase === "done" ? (
        <>
          <div className="mg-sq-end">
            <h2>{score} out of {qs.length}</h2>
            <p>
              {score >= 6
                ? "You know this note well."
                : "Read the note again, then try another round."}
            </p>
          </div>
          <div className="mg-tools">
            <button className="mg-tool" onClick={() => setPhase("pick")}>
              <RotateCw size={15} /> New round
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}