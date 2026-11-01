"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { Flag, Clock, ChevronLeft, ChevronRight, CheckCircle2, XCircle } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   PRACTICE — timed, computer-style exam practice (Nigeria first).
   One file: the question bank, the exam screen and the results.
   Questions are written for Vreedits in UTME style (not copied from any
   past paper). Attempts are saved on this device only.
   ═══════════════════════════════════════════════════════════════ */

const EXAM_DATE = new Date("2027-03-15T08:00:00+01:00"); // provisional UTME start
const STORE_KEY = "vreedits.practice.attempts";

const SUBJECTS = ["English", "Mathematics", "Biology", "Physics", "Chemistry"];

// [subject, question, [options], correctIndex, explanation]
const BANK = [
  ["English", "Neither of the boys ___ present.", ["were", "was", "are", "have been"], 1, "“Neither” takes a singular verb, so the answer is “was”."],
  ["English", "Choose the opposite of “generous”.", ["Stingy", "Kind", "Rich", "Proud"], 0, "Generous means giving freely. Stingy means unwilling to give."],
  ["English", "Which is the correct spelling?", ["Acommodation", "Accomodation", "Accommodation", "Acomodation"], 2, "Accommodation has double c and double m."],
  ["English", "She is the ___ of the two sisters.", ["tallest", "taller", "more tall", "most tall"], 1, "Use the comparative (taller) when comparing two people."],
  ["English", "“The wind whispered through the trees” is an example of", ["simile", "metaphor", "personification", "hyperbole"], 2, "The wind is given a human action (whispering), which is personification."],
  ["English", "Choose the word nearest in meaning to “obstinate”.", ["Stubborn", "Gentle", "Weak", "Lazy"], 0, "Obstinate means refusing to change your mind, which is stubborn."],
  ["English", "The idiom “to let the cat out of the bag” means to", ["lose a pet", "reveal a secret", "waste money", "start a fight"], 1, "It means to reveal something that was meant to stay secret."],
  ["English", "He ___ to school yesterday.", ["goes", "going", "went", "gone"], 2, "“Yesterday” needs the simple past tense: went."],

  ["Mathematics", "What is 2⁵?", ["10", "16", "32", "64"], 2, "2×2×2×2×2 = 32."],
  ["Mathematics", "Simplify 3/4 + 1/8.", ["4/12", "5/8", "7/8", "1"], 2, "3/4 = 6/8, and 6/8 + 1/8 = 7/8."],
  ["Mathematics", "Solve x² − 5x + 6 = 0.", ["x = 1 or 6", "x = 2 or 3", "x = −2 or −3", "x = −2 or 3"], 1, "Factorise: (x − 2)(x − 3) = 0, so x = 2 or 3."],
  ["Mathematics", "What is the area of a rectangle 8 cm by 5 cm?", ["13 cm²", "26 cm²", "40 cm²", "80 cm²"], 2, "Area = length × width = 8 × 5 = 40 cm²."],
  ["Mathematics", "Find the mean of 2, 4, 6, 8 and 10.", ["5", "6", "8", "30"], 1, "Sum = 30, and 30 ÷ 5 = 6."],
  ["Mathematics", "Convert 0.25 to a percentage.", ["2.5%", "0.25%", "25%", "250%"], 2, "Multiply by 100: 0.25 × 100 = 25%."],
  ["Mathematics", "A square has side 7 cm. What is its perimeter?", ["14 cm", "28 cm", "49 cm", "21 cm"], 1, "Perimeter = 4 × 7 = 28 cm."],
  ["Mathematics", "If y = 3x − 2 and x = 4, find y.", ["6", "10", "12", "14"], 1, "y = 3(4) − 2 = 12 − 2 = 10."],

  ["Biology", "Which part of the cell is called its powerhouse?", ["Nucleus", "Ribosome", "Mitochondrion", "Vacuole"], 2, "Mitochondria release energy from food during respiration."],
  ["Biology", "Which blood group is the universal donor?", ["AB", "A", "B", "O"], 3, "Group O can be given to people of any blood group."],
  ["Biology", "A lack of vitamin C causes", ["rickets", "scurvy", "night blindness", "beriberi"], 1, "Scurvy comes from too little vitamin C."],
  ["Biology", "Which organ produces insulin?", ["Liver", "Kidney", "Pancreas", "Stomach"], 2, "The pancreas makes insulin, which controls blood sugar."],
  ["Biology", "Plants lose water vapour through their leaves by", ["transpiration", "respiration", "digestion", "excretion"], 0, "Transpiration is loss of water vapour mainly through stomata."],
  ["Biology", "Which gas do plants release during photosynthesis?", ["Carbon dioxide", "Nitrogen", "Oxygen", "Methane"], 2, "Photosynthesis uses carbon dioxide and water and releases oxygen."],
  ["Biology", "Malaria is spread by the female", ["housefly", "Anopheles mosquito", "tsetse fly", "cockroach"], 1, "The female Anopheles mosquito carries the malaria parasite."],
  ["Biology", "The basic unit of heredity is the", ["cell", "tissue", "gene", "organ"], 2, "A gene carries inherited information from parent to offspring."],

  ["Physics", "What is the SI unit of power?", ["Joule", "Watt", "Newton", "Pascal"], 1, "Power is measured in watts (W)."],
  ["Physics", "A car covers 120 km in 2 hours. Its average speed is", ["60 km/h", "100 km/h", "120 km/h", "240 km/h"], 0, "Speed = distance ÷ time = 120 ÷ 2 = 60 km/h."],
  ["Physics", "Which of these is a vector quantity?", ["Mass", "Speed", "Time", "Velocity"], 3, "Velocity has both size and direction, so it is a vector."],
  ["Physics", "The SI unit of electrical resistance is the", ["ampere", "volt", "ohm", "coulomb"], 2, "Resistance is measured in ohms (Ω)."],
  ["Physics", "The bending of light as it passes from air into water is called", ["reflection", "refraction", "diffraction", "dispersion"], 1, "Light changes speed and bends at the boundary: refraction."],
  ["Physics", "The acceleration due to gravity is about", ["1 m/s²", "5 m/s²", "10 m/s²", "100 m/s²"], 2, "It is about 9.8 m/s², usually rounded to 10 in exams."],
  ["Physics", "Which type of mirror is used in car headlamps?", ["Plane", "Convex", "Concave", "Cylindrical"], 2, "A concave mirror makes a strong parallel beam from the bulb."],
  ["Physics", "A stretched spring stores", ["heat energy", "elastic potential energy", "sound energy", "kinetic energy only"], 1, "Stretching a spring stores elastic potential energy."],

  ["Chemistry", "What is the chemical symbol for gold?", ["Go", "Gd", "Ag", "Au"], 3, "Au comes from the Latin word aurum."],
  ["Chemistry", "A neutral solution has a pH of", ["0", "7", "10", "14"], 1, "pH 7 is neutral. Below 7 is acidic and above 7 is alkaline."],
  ["Chemistry", "How many protons does a carbon atom have?", ["4", "6", "8", "12"], 1, "Carbon has atomic number 6, so it has 6 protons."],
  ["Chemistry", "Which gas is produced when zinc reacts with dilute hydrochloric acid?", ["Oxygen", "Carbon dioxide", "Hydrogen", "Chlorine"], 2, "A metal and an acid give a salt and hydrogen gas."],
  ["Chemistry", "Which of these is a noble gas?", ["Oxygen", "Argon", "Nitrogen", "Chlorine"], 1, "Argon is in Group 18 with the unreactive noble gases."],
  ["Chemistry", "Which of these is an acid?", ["NaOH", "NaCl", "KOH", "HCl"], 3, "HCl (hydrochloric acid) is an acid. NaOH and KOH are bases."],
  ["Chemistry", "Salt can be separated from sea water by", ["filtration", "evaporation", "magnetism", "decanting"], 1, "Heating drives off the water and leaves the salt behind."],
  ["Chemistry", "Rusting of iron needs", ["oxygen only", "water only", "oxygen and water", "nitrogen"], 2, "Iron rusts when both oxygen and water are present."],
].map((r, i) => ({ id: i, sub: r[0], q: r[1], o: r[2], a: r[3], why: r[4] }));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
function loadAttempts() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; }
}
function saveAttempt(a) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify([a, ...loadAttempts()].slice(0, 20))); } catch {}
}

export default function PracticePage() {
  const [phase, setPhase] = useState("setup"); // setup | exam | result
  const [qs, setQs] = useState([]);
  const [ans, setAns] = useState({});
  const [flags, setFlags] = useState({});
  const [cur, setCur] = useState(0);
  const [left, setLeft] = useState(0);
  const [mode, setMode] = useState("");
  const [attempts, setAttempts] = useState([]);
  const [confirm, setConfirm] = useState(false);
  const [usedSecs, setUsedSecs] = useState(0);
  const [topic, setTopic] = useState("");
  const [loadingFresh, setLoadingFresh] = useState("");
  const [freshErr, setFreshErr] = useState("");
  const retryRef = useRef(null);
  const endRef = useRef(0);
  const startRef = useRef(0);
  const doneRef = useRef(false);

  useEffect(() => { setAttempts(loadAttempts()); }, []);

  const days = Math.max(0, Math.ceil((EXAM_DATE - Date.now()) / 86400000));

  function start(label, list, minutes) {
    doneRef.current = false;
    setQs(list); setAns({}); setFlags({}); setCur(0); setConfirm(false);
    setMode(label);
    startRef.current = Date.now();
    endRef.current = Date.now() + minutes * 60000;
    setLeft(minutes * 60);
    setPhase("exam");
  }
  const startMixed = () => { retryRef.current = startMixed; start("Mixed mock", shuffle(BANK).slice(0, 20), 20); };
  const startSubject = (s) => { retryRef.current = () => startSubject(s); start(`${s} drill`, shuffle(BANK.filter((q) => q.sub === s)), 8); };
  async function startFresh(s) {
    if (loadingFresh) return;
    setFreshErr(""); setLoadingFresh(s);
    try {
      const r = await fetch("/api/practice/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: s, topic }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setFreshErr(d.error || "Could not get fresh questions."); return; }
      const list = d.questions.map((q, i) => ({ ...q, id: `f${i}`, sub: s }));
      retryRef.current = () => startFresh(s);
      start(`${s} · fresh from Syna`, list, 10);
    } catch {
      setFreshErr("Network problem. Check your connection and try again.");
    } finally {
      setLoadingFresh("");
    }
  }

  function submit() {
    if (doneRef.current) return;
    doneRef.current = true;
    const used = Math.min(Math.round((Date.now() - startRef.current) / 1000), Math.round((endRef.current - startRef.current) / 1000));
    setUsedSecs(used);
    const bySub = {};
    qs.forEach((q, i) => {
      bySub[q.sub] = bySub[q.sub] || { right: 0, total: 0 };
      bySub[q.sub].total++;
      if (ans[i] === q.a) bySub[q.sub].right++;
    });
    const score = qs.filter((q, i) => ans[i] === q.a).length;
    saveAttempt({ ts: Date.now(), mode, score, total: qs.length, used, bySub });
    setAttempts(loadAttempts());
    setPhase("result");
    setConfirm(false);
    window.scrollTo?.(0, 0);
  }

  useEffect(() => {
    if (phase !== "exam") return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) { clearInterval(t); submit(); }
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, qs]);

  const best = useMemo(() => {
    const m = attempts.filter((a) => a.mode === "Mixed mock").map((a) => Math.round((a.score / a.total) * 100));
    return m.length ? Math.max(...m) : null;
  }, [attempts]);

  const wrap = { maxWidth: 480, margin: "0 auto", padding: "16px 16px 40px" };

  /* ───────── setup ───────── */
  if (phase === "setup") {
    return (
      <div style={wrap}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", margin: "4px 0 4px" }}>Exam practice</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 14px" }}>
          Timed, like the real computer-based test. Answer first, then see the explanations.
        </p>

        <div className="card rise" style={{ padding: 16, marginBottom: 14, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>{days}</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            <b style={{ color: "var(--text)" }}>days to UTME</b> (provisional date: 15 March 2027, check JAMB for the final date)
          </div>
        </div>

        <div className="card rise" style={{ padding: 16, marginBottom: 14, "--i": 1 }}>
          <div style={{ fontWeight: 800, color: "var(--text)", fontSize: 16 }}>Mixed mock</div>
          <div style={{ color: "var(--text-muted)", fontSize: 13, margin: "2px 0 12px" }}>
            20 questions across all 5 subjects, 20 minutes.{best !== null && ` Your best: ${best}%.`}
          </div>
          <button className="btn-primary" onClick={startMixed}>Start mock exam</button>
        </div>

        <div style={{ fontWeight: 700, color: "var(--text)", margin: "18px 2px 8px" }}>Subject drills (8 questions, 8 minutes)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {SUBJECTS.map((s) => (
            <button key={s} className="raise" onClick={() => startSubject(s)} style={{ padding: "14px 12px", fontWeight: 700, color: "var(--text)", textAlign: "left" }}>
              {s}
            </button>
          ))}
        </div>

        <div className="card" style={{ padding: 16, marginTop: 22 }}>
          <div style={{ fontWeight: 800, color: "var(--text)", fontSize: 16 }}>Fresh questions from Syna</div>
          <div style={{ color: "var(--text-muted)", fontSize: 13, margin: "2px 0 10px" }}>
            10 new UTME-style questions every time, 10 minutes. Add a topic if you want (for example: Quadratic equations).
          </div>
          <input
            className="input"
            style={{ paddingLeft: 12, marginBottom: 10 }}
            placeholder="Topic (optional)"
            value={topic}
            maxLength={60}
            onChange={(e) => setTopic(e.target.value)}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {SUBJECTS.map((s) => (
              <button key={s} className="btn-soft" disabled={!!loadingFresh} onClick={() => startFresh(s)} style={{ opacity: loadingFresh && loadingFresh !== s ? 0.5 : 1 }}>
                {loadingFresh === s ? "Writing…" : s}
              </button>
            ))}
          </div>
          {freshErr && <div className="alert alert-error" style={{ marginTop: 10 }}>{freshErr}</div>}
          <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 10 }}>
            Written by AI, so double-check anything that looks wrong against your textbook.
          </div>
        </div>

        <div className="card" style={{ padding: 16, marginTop: 14 }}>
          <div style={{ fontWeight: 800, color: "var(--text)", fontSize: 16, marginBottom: 8 }}>Official sources</div>
          {[
            ["JAMB (UTME news, syllabus, registration)", "https://www.jamb.gov.ng"],
            ["WAEC Nigeria", "https://www.waecnigeria.org"],
            ["NECO", "https://www.neco.gov.ng"],
          ].map(([t, u]) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer" style={{ display: "block", padding: "9px 0", fontSize: 14, color: "var(--accent)", fontWeight: 600, borderTop: "1px solid var(--border)" }}>
              {t} ↗
            </a>
          ))}
          <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 6 }}>
            Beware of fake exam links and "leaked questions". Always check dates and news on these official sites.
          </div>
        </div>

        {attempts.length > 0 && (
          <>
            <div style={{ fontWeight: 700, color: "var(--text)", margin: "22px 2px 8px" }}>Your recent attempts</div>
            <div className="card" style={{ padding: 6 }}>
              {attempts.slice(0, 6).map((a) => (
                <div key={a.ts} style={{ display: "flex", justifyContent: "space-between", padding: "10px 10px", fontSize: 14, color: "var(--text)", borderBottom: "1px solid var(--border)" }}>
                  <span>{a.mode}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    <b style={{ color: "var(--text)" }}>{a.score}/{a.total}</b> · {mmss(a.used)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 14 }}>
          Questions are written for Vreedits in the style of the exams. Attempts are saved on this device.
        </p>
      </div>
    );
  }

  /* ───────── exam ───────── */
  if (phase === "exam") {
    const q = qs[cur];
    const answered = Object.keys(ans).length;
    return (
      <div style={wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>{mode} · {answered}/{qs.length} answered</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: left <= 60 ? "var(--danger)" : "var(--text)" }}>
            <Clock size={16} /> {mmss(left)}
          </div>
        </div>
        <div className="v-track" style={{ marginBottom: 14 }}>
          <div className="v-fill" style={{ width: `${(answered / qs.length) * 100}%` }} />
        </div>

        <div className="card" style={{ padding: 16 }} key={cur}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
            <span>Question {cur + 1} of {qs.length} · {q.sub}</span>
            <button onClick={() => setFlags((f) => ({ ...f, [cur]: !f[cur] }))} style={{ display: "flex", alignItems: "center", gap: 4, color: flags[cur] ? "var(--accent)" : "var(--text-muted)", fontWeight: 700 }}>
              <Flag size={14} fill={flags[cur] ? "currentColor" : "none"} /> {flags[cur] ? "Flagged" : "Flag"}
            </button>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", marginBottom: 14, lineHeight: 1.4 }}>{q.q}</div>
          <div style={{ display: "grid", gap: 10 }}>
            {q.o.map((t, n) => {
              const on = ans[cur] === n;
              return (
                <button
                  key={n}
                  className="raise"
                  onClick={() => { setAns((a) => ({ ...a, [cur]: n })); try { navigator.vibrate && navigator.vibrate(10); } catch {} }}
                  style={{ textAlign: "left", padding: "12px 14px", fontWeight: 600, color: "var(--text)", display: "flex", gap: 10, alignItems: "center", borderColor: on ? "var(--accent)" : undefined, background: on ? "var(--accent-soft)" : undefined }}
                >
                  <span style={{ width: 24, height: 24, borderRadius: 999, background: on ? "var(--accent)" : "var(--surface-2)", color: on ? "#fff" : "var(--text-muted)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                    {"ABCD"[n]}
                  </span>
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button className="btn-soft" disabled={cur === 0} onClick={() => setCur(cur - 1)} style={{ flex: 1, opacity: cur === 0 ? 0.5 : 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 4 }}>
            <ChevronLeft size={16} /> Back
          </button>
          {cur < qs.length - 1 ? (
            <button className="btn-primary" onClick={() => setCur(cur + 1)} style={{ flex: 1 }}>Next <ChevronRight size={16} /></button>
          ) : (
            <button className="btn-primary" onClick={() => setConfirm(true)} style={{ flex: 1 }}>Finish</button>
          )}
        </div>

        <div style={{ margin: "18px 2px 8px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Question palette</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6 }}>
          {qs.map((_, i) => (
            <button key={i} onClick={() => setCur(i)} style={{
              height: 34, borderRadius: 10, fontWeight: 700, fontSize: 13,
              border: `2px solid ${i === cur ? "var(--accent)" : flags[i] ? "#f59e0b" : "var(--border)"}`,
              background: ans[i] !== undefined ? "var(--accent-soft)" : "var(--surface-2)",
              color: "var(--text)",
            }}>{i + 1}</button>
          ))}
        </div>
        <button className="btn-soft" style={{ marginTop: 16, width: "100%" }} onClick={() => setConfirm(true)}>Submit exam</button>

        {confirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}>
            <div className="card pop" style={{ padding: 20, maxWidth: 340, width: "100%", background: "var(--surface)" }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text)" }}>Submit now?</div>
              <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "8px 0 16px" }}>
                You answered {answered} of {qs.length}.{answered < qs.length && " Unanswered questions count as wrong."}
                {Object.values(flags).some(Boolean) && " You still have flagged questions."}
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-soft" style={{ flex: 1 }} onClick={() => setConfirm(false)}>Keep going</button>
                <button className="btn-primary" style={{ flex: 1 }} onClick={submit}>Submit</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ───────── result ───────── */
  const score = qs.filter((q, i) => ans[i] === q.a).length;
  const pct = Math.round((score / qs.length) * 100);
  const bySub = {};
  qs.forEach((q, i) => {
    bySub[q.sub] = bySub[q.sub] || { right: 0, total: 0 };
    bySub[q.sub].total++;
    if (ans[i] === q.a) bySub[q.sub].right++;
  });
  const subs = Object.entries(bySub).sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total);
  const weakest = subs[0];

  return (
    <div style={wrap}>
      <div className="card rise" style={{ padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>{mode}</div>
        <div style={{ fontSize: 44, fontWeight: 800, color: "var(--text)" }}>{score}/{qs.length}</div>
        <div style={{ color: "var(--text-muted)" }}>{pct}% · time {mmss(usedSecs)}</div>
        {weakest && weakest[1].right < weakest[1].total && (
          <p style={{ marginTop: 12, fontSize: 14, color: "var(--text)" }}>
            Syna says: start with <b>{weakest[0]}</b> next. You got {weakest[1].right} of {weakest[1].total} there.
          </p>
        )}
      </div>

      {subs.length > 1 && (
        <div className="card" style={{ padding: 16, marginTop: 14 }}>
          <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>By subject</div>
          {subs.map(([s, v]) => (
            <div key={s} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text)", marginBottom: 4 }}>
                <span>{s}</span><span>{v.right}/{v.total}</span>
              </div>
              <div className="v-track"><div className="v-fill" style={{ width: `${(v.right / v.total) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontWeight: 800, color: "var(--text)", margin: "18px 2px 8px" }}>Review with Syna</div>
      <div style={{ display: "grid", gap: 10 }}>
        {qs.map((q, i) => {
          const ok = ans[i] === q.a;
          return (
            <div key={i} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                {ok ? <CheckCircle2 size={18} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} /> : <XCircle size={18} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />}
                <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 14 }}>{q.q}</div>
              </div>
              <div style={{ fontSize: 13, marginTop: 6, color: "var(--text-muted)" }}>
                {ans[i] === undefined ? "You did not answer. " : !ok ? `You chose: ${q.o[ans[i]]}. ` : ""}
                Correct answer: <b style={{ color: "var(--text)" }}>{q.o[q.a]}</b>
              </div>
              <div style={{ fontSize: 13, marginTop: 4, color: "var(--text)" }}>{q.why}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="btn-soft" style={{ flex: 1 }} onClick={() => setPhase("setup")}>Back</button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={() => { retryRef.current && retryRef.current(); }}>Try again</button>
      </div>
    </div>
  );
}
