"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

const MARKETS = {
  NG: {
    label: "Nigeria",
    title: "Practise for UTME, WAEC and NECO. Free, in 5 minutes.",
    questions: [
      { q: "If 2x + 6 = 14, what is x?", o: ["3", "4", "5", "8"], a: 1, why: "Take 6 from both sides: 2x = 8. Then divide by 2: x = 4." },
      { q: "Which word is nearest in meaning to “scarce”?", o: ["Plenty", "Cheap", "Rare", "Heavy"], a: 2, why: "Scarce means hard to find, so “rare” fits best." },
      { q: "Which gas do plants take in for photosynthesis?", o: ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"], a: 1, why: "Plants take in carbon dioxide and give out oxygen." },
      { q: "What is 15% of 200?", o: ["15", "20", "30", "45"], a: 2, why: "10% of 200 is 20 and 5% is 10, so 15% is 30." },
      { q: "What is the SI unit of force?", o: ["Joule", "Watt", "Pascal", "Newton"], a: 3, why: "Force is measured in newtons (N)." },
    ],
  },
  GB: {
    label: "UK",
    title: "Practise for GCSEs and A-levels. Free, in 5 minutes.",
    questions: [
      { q: "Solve 3x − 5 = 16.", o: ["5", "7", "8", "21"], a: 1, why: "Add 5 to both sides: 3x = 21. Then divide by 3: x = 7." },
      { q: "Which word is nearest in meaning to “benevolent”?", o: ["Kind", "Cruel", "Lazy", "Loud"], a: 0, why: "Benevolent means well-meaning and kind." },
      { q: "What is the chemical symbol for sodium?", o: ["S", "So", "Na", "N"], a: 2, why: "Na comes from the Latin word natrium." },
      { q: "A circle has radius 3 cm. What is its area, in terms of π?", o: ["3π", "6π", "9π", "18π"], a: 2, why: "Area = πr², so π × 3² = 9π." },
      { q: "Which part of a cell releases energy in respiration?", o: ["Nucleus", "Mitochondria", "Cell wall", "Ribosome"], a: 1, why: "Mitochondria are where aerobic respiration releases energy." },
    ],
  },
  US: {
    label: "US",
    title: "Practise for the SAT and ACT. Free, in 5 minutes.",
    questions: [
      { q: "If 3x + 2 = 20, what is x?", o: ["4", "5", "6", "7"], a: 2, why: "Subtract 2: 3x = 18. Then divide by 3: x = 6." },
      { q: "The scientist's findings were so ____ that no one could dispute them.", o: ["Ambiguous", "Conclusive", "Tentative", "Trivial"], a: 1, why: "Findings nobody can dispute are conclusive." },
      { q: "What is the slope of the line y = 4x − 7?", o: ["−7", "4", "7", "−4"], a: 1, why: "In y = mx + b, the slope m is the number in front of x." },
      { q: "What is the median of 3, 9, 4, 7, 12?", o: ["4", "7", "7.5", "9"], a: 1, why: "In order: 3, 4, 7, 9, 12. The middle value is 7." },
      { q: "Which planet is closest to the Sun?", o: ["Venus", "Earth", "Mars", "Mercury"], a: 3, why: "Mercury is the closest planet to the Sun." },
    ],
  },
};

function guessMarket() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz === "Africa/Lagos") return "NG";
    if (tz === "Europe/London") return "GB";
    if (tz.startsWith("America/") || tz.startsWith("US/") || tz === "Pacific/Honolulu") return "US";
    const l = (navigator.language || "").toLowerCase();
    if (l.endsWith("-ng")) return "NG";
    if (l.endsWith("-gb")) return "GB";
    if (l.endsWith("-us")) return "US";
  } catch {}
  return "NG";
}

function Syna({ size = 120 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" className="syna-bob">
      <defs>
        <linearGradient id="synaBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e879f9" />
          <stop offset="1" stopColor="#9303c5" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="110" rx="30" ry="6" fill="rgba(0,0,0,0.18)" />
      <rect x="14" y="14" width="92" height="92" rx="40" fill="#6b0a8f" />
      <rect x="14" y="8" width="92" height="92" rx="40" fill="url(#synaBody)" />
      <ellipse cx="42" cy="26" rx="20" ry="9" fill="rgba(255,255,255,0.35)" />
      <g fill="#fff">
        <ellipse className="syna-eye" cx="43" cy="52" rx="9" ry="11" />
        <ellipse className="syna-eye" cx="77" cy="52" rx="9" ry="11" />
      </g>
      <g fill="#2a0a3d">
        <circle cx="45" cy="54" r="5" />
        <circle cx="79" cy="54" r="5" />
      </g>
      <path d="M46 76 Q60 90 74 76" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function LandingClient() {
  const [market, setMarket] = useState("NG");
  useEffect(() => { setMarket(guessMarket()); }, []);
  const QUESTIONS = MARKETS[market].questions;
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [pick, setPick] = useState(null);
  const [score, setScore] = useState(0);
  const done = started && i >= QUESTIONS.length;
  const cur = QUESTIONS[i];

  function choose(n) {
    if (pick !== null) return;
    setPick(n);
    if (n === cur.a) setScore((s) => s + 1);
    try { navigator.vibrate && navigator.vibrate(n === cur.a ? 15 : [10, 40, 10]); } catch {}
  }
  function next() { setPick(null); setI((x) => x + 1); }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 18px 40px" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 20, color: "var(--text)" }}>Vreedits</div>
          <Link href="/login" className="btn-soft" style={{ textDecoration: "none" }}>Log in</Link>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
          {Object.entries(MARKETS).map(([k, m]) => (
            <button
              key={k}
              className={k === market ? "btn-soft" : "raise"}
              style={{ padding: "6px 14px", fontSize: 13, fontWeight: 700, color: k === market ? undefined : "var(--text-muted)" }}
              onClick={() => { setMarket(k); setStarted(false); setI(0); setPick(null); setScore(0); }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {!started && (
          <div className="rise" style={{ textAlign: "center" }}>
            <Syna />
            <h1 style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 800, color: "var(--text)", margin: "14px 0 10px" }}>
              {MARKETS[market].title}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: 15, lineHeight: 1.5, margin: "0 0 22px" }}>
              Syna, your study buddy, makes you try first, then explains. Study with your school mates, not alone.
            </p>
            <button className="btn-primary" onClick={() => setStarted(true)}>Try 5 questions now</button>
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--text-muted)" }}>
              No sign-up needed to try.{" "}
              <Link href="/register" className="btn-text">Create account</Link>
            </div>
          </div>
        )}

        {started && !done && (
          <div className="card rise" style={{ padding: 18 }} key={i}>
            <div className="v-track" style={{ marginBottom: 14 }}>
              <div className="v-fill" style={{ width: `${(i / QUESTIONS.length) * 100}%` }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Question {i + 1} of {QUESTIONS.length}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 14 }}>{cur.q}</div>
            <div style={{ display: "grid", gap: 10 }}>
              {cur.o.map((t, n) => {
                const right = pick !== null && n === cur.a;
                const wrong = pick === n && n !== cur.a;
                return (
                  <button
                    key={n}
                    className="raise"
                    onClick={() => choose(n)}
                    style={{
                      textAlign: "left", padding: "12px 14px", fontWeight: 600, color: "var(--text)",
                      borderColor: right ? "var(--success)" : wrong ? "var(--danger)" : undefined,
                      background: right ? "var(--success-soft)" : wrong ? "var(--danger-soft)" : undefined,
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            {pick !== null && (
              <div className="pop" style={{ marginTop: 14 }}>
                <div className={`alert ${pick === cur.a ? "alert-success" : "alert-error"}`}>
                  <span><b>{pick === cur.a ? "Correct! " : "Not quite. "}</b>{cur.why}</span>
                </div>
                <button className="btn-primary" style={{ marginTop: 12 }} onClick={next}>
                  {i + 1 === QUESTIONS.length ? "See my score" : "Next"}
                </button>
              </div>
            )}
          </div>
        )}

        {done && (
          <div className="card rise" style={{ padding: 22, textAlign: "center" }}>
            <Syna size={96} />
            <div style={{ fontSize: 34, fontWeight: 800, color: "var(--text)", marginTop: 8 }}>{score} / {QUESTIONS.length}</div>
            <p style={{ color: "var(--text-muted)", fontSize: 15, margin: "6px 0 18px" }}>
              {score >= 4 ? "Strong start!" : score >= 2 ? "Good try. Syna can help you close the gaps." : "Everyone starts somewhere. Syna will walk you through it."}
              {" "}Create a free account to save your score and keep practising.
            </p>
            <Link href="/register" style={{ textDecoration: "none" }}>
              <span className="btn-primary" style={{ display: "flex" }}>Create free account</span>
            </Link>
            <button className="btn-soft" style={{ marginTop: 12 }} onClick={() => { setI(0); setPick(null); setScore(0); }}>Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}
