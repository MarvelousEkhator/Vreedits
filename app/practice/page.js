"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { Download, Share2, Star, Check } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   TIMETABLE — builds a drawn weekly study timetable from a few choices.
   No AI needed, so it is instant and always works. Weak subjects get more
   sessions, no subject repeats back to back, and the result can be saved
   as a picture and shared. Choices are saved on this device.
   ═══════════════════════════════════════════════════════════════ */

const STORE = "vreedits.timetable.v1";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRESETS = {
  "UTME": ["English", "Mathematics", "Biology", "Physics", "Chemistry"],
  "WAEC / NECO": ["English", "Mathematics", "Biology", "Physics", "Chemistry", "Economics", "Government"],
  "GCSE": ["Maths", "English", "Biology", "Chemistry", "Physics", "History"],
  "SAT / ACT": ["Math", "Reading & Writing", "Science"],
};
const HUES = [285, 200, 150, 35, 340, 175, 250, 60];
const colorFor = (i) => `hsl(${HUES[i % HUES.length]}, 62%, 42%)`;

function fmt(mins) {
  const h24 = Math.floor(mins / 60) % 24, m = mins % 60;
  const ap = h24 >= 12 ? "pm" : "am";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

// Builds the week. Weighted round-robin: weak subjects count double.
function buildPlan({ subjects, weak, days, perDay, mockDay }) {
  const counts = Object.fromEntries(subjects.map((s) => [s, 0]));
  const plan = {};
  let last = null;
  days.forEach((d, di) => {
    if (mockDay && di === days.length - 1 && days.length > 1) {
      plan[d] = Array(perDay).fill("MOCK");
      return;
    }
    const used = new Set();
    plan[d] = [];
    for (let k = 0; k < perDay; k++) {
      const pool = subjects.filter((s) => !used.has(s) && s !== last);
      const list = pool.length ? pool : subjects.filter((s) => !used.has(s)).length ? subjects.filter((s) => !used.has(s)) : subjects;
      const pick = list.slice().sort((a, b) => counts[a] / (weak.includes(a) ? 2 : 1) - counts[b] / (weak.includes(b) ? 2 : 1))[0];
      counts[pick]++; used.add(pick); last = pick;
      plan[d].push(pick);
    }
  });
  return { plan, counts };
}

export default function TimetablePage() {
  const [preset, setPreset] = useState("UTME");
  const [subjects, setSubjects] = useState(PRESETS["UTME"]);
  const [custom, setCustom] = useState("");
  const [weak, setWeak] = useState([]);
  const [days, setDays] = useState(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  const [perDay, setPerDay] = useState(3);
  const [len, setLen] = useState(45);
  const [start, setStart] = useState("16:00");
  const [mockDay, setMockDay] = useState(true);
  const [built, setBuilt] = useState(false);
  const [msg, setMsg] = useState("");
  const canvasRef = useRef(null);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || "null");
      if (!s) return;
      s.preset && setPreset(s.preset); s.subjects && setSubjects(s.subjects); s.weak && setWeak(s.weak);
      s.days && setDays(s.days); s.perDay && setPerDay(s.perDay); s.len && setLen(s.len);
      s.start && setStart(s.start); typeof s.mockDay === "boolean" && setMockDay(s.mockDay);
      if (s.built) setBuilt(true);
    } catch {}
  }, []);

  function save(extra = {}) {
    try { localStorage.setItem(STORE, JSON.stringify({ preset, subjects, weak, days, perDay, len, start, mockDay, built: true, ...extra })); } catch {}
  }

  const orderedDays = DAYS.filter((d) => days.includes(d));
  const { plan, counts } = useMemo(
    () => (subjects.length && orderedDays.length ? buildPlan({ subjects, weak, days: orderedDays, perDay, mockDay }) : { plan: {}, counts: {} }),
    [subjects, weak, days, perDay, mockDay] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [sh, sm] = start.split(":").map(Number);
  const startMin = (sh || 0) * 60 + (sm || 0);
  const slotStart = (k) => startMin + k * (len + 10);
  const colorOf = (s) => (s === "MOCK" ? "hsl(0, 0%, 28%)" : colorFor(subjects.indexOf(s)));

  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  function choosePreset(p) { setPreset(p); setSubjects(PRESETS[p]); setWeak([]); setBuilt(false); }
  function addCustom() {
    const v = custom.trim().slice(0, 24);
    if (v && !subjects.includes(v) && subjects.length < 10) setSubjects([...subjects, v]);
    setCustom("");
  }

  // Draws the timetable as a picture
  function draw() {
    const cols = orderedDays.length, W = 1200, pad = 40, head = 120, rowH = 90, tcol = 150;
    const H = head + perDay * rowH + 90 + Math.ceil(subjects.length / 4) * 40;
    const c = canvasRef.current || document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#16062a"); grad.addColorStop(1, "#5a0b86");
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = "#fff"; g.font = "bold 44px sans-serif"; g.fillText("My study timetable", pad, 70);
    g.font = "22px sans-serif"; g.fillStyle = "#d9b8f0"; g.fillText("Made on Vreedits", pad, 102);
    const cw = (W - pad * 2 - tcol) / cols;
    orderedDays.forEach((d, i) => {
      g.fillStyle = "#fff"; g.font = "bold 24px sans-serif";
      g.fillText(d, pad + tcol + i * cw + 10, head - 12);
    });
    for (let k = 0; k < perDay; k++) {
      const y = head + k * rowH;
      g.fillStyle = "#d9b8f0"; g.font = "20px sans-serif";
      g.fillText(fmt(slotStart(k)), pad, y + 52);
      orderedDays.forEach((d, i) => {
        const s = plan[d][k];
        const x = pad + tcol + i * cw + 4;
        g.fillStyle = colorOf(s);
        g.beginPath(); g.roundRect ? g.roundRect(x, y + 6, cw - 8, rowH - 12, 14) : g.rect(x, y + 6, cw - 8, rowH - 12); g.fill();
        g.fillStyle = "#fff"; g.font = "bold 21px sans-serif";
        const label = s === "MOCK" ? "Mock exam" : s;
        g.fillText(label.length > 13 ? label.slice(0, 12) + "…" : label, x + 12, y + 54);
      });
    }
    let ly = head + perDay * rowH + 40;
    subjects.forEach((s, i) => {
      const lx = pad + (i % 4) * 280;
      if (i % 4 === 0 && i > 0) ly += 40;
      g.fillStyle = colorOf(s); g.fillRect(lx, ly - 18, 22, 22);
      g.fillStyle = "#fff"; g.font = "20px sans-serif"; g.fillText(s, lx + 32, ly);
    });
    return c;
  }

  async function download() {
    const c = draw();
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png"); a.download = "vreedits-timetable.png";
    document.body.appendChild(a); a.click(); a.remove();
    setMsg("Saved to your downloads.");
  }
  async function share() {
    const c = draw();
    try {
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      const file = new File([blob], "vreedits-timetable.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "My study timetable" });
      } else { await download(); }
    } catch {}
  }

  const wrap = { maxWidth: 520, margin: "0 auto", padding: "16px 16px 40px" };
  const chip = (on) => ({ padding: "7px 12px", borderRadius: 999, fontSize: 13, fontWeight: 700, border: "1px solid var(--border)", background: on ? "var(--accent)" : "var(--surface-2)", color: on ? "#fff" : "var(--text)" });

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", margin: "4px 0 4px" }}>Timetable maker</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 14px" }}>
        Pick your subjects and times. Vreedits draws your week, and you can save it as a picture.
      </p>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>1. Preparing for</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.keys(PRESETS).map((p) => (
            <button key={p} style={chip(p === preset)} onClick={() => choosePreset(p)}>{p}</button>
          ))}
        </div>

        <div style={{ fontWeight: 800, color: "var(--text)", margin: "16px 0 4px" }}>2. Subjects</div>
        <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8 }}>Tap ★ on the ones you find hard. They get more sessions.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {subjects.map((s, i) => (
            <span key={s} style={{ ...chip(false), display: "inline-flex", alignItems: "center", gap: 6, borderColor: colorFor(i), }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: colorFor(i) }} />
              {s}
              <button aria-label={`Hard: ${s}`} onClick={() => { toggle(weak, setWeak, s); setBuilt(false); }} style={{ color: weak.includes(s) ? "#f5b301" : "var(--text-muted)" }}>
                <Star size={15} fill={weak.includes(s) ? "#f5b301" : "none"} />
              </button>
              <button aria-label={`Remove ${s}`} onClick={() => { setSubjects(subjects.filter((x) => x !== s)); setWeak(weak.filter((x) => x !== s)); setBuilt(false); }} style={{ color: "var(--text-muted)", fontWeight: 800 }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input className="input" style={{ paddingLeft: 12 }} placeholder="Add a subject" value={custom} maxLength={24}
            onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()} />
          <button className="btn-soft" onClick={addCustom}>Add</button>
        </div>

        <div style={{ fontWeight: 800, color: "var(--text)", margin: "16px 0 8px" }}>3. Days you can study</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {DAYS.map((d) => (<button key={d} style={chip(days.includes(d))} onClick={() => { toggle(days, setDays, d); setBuilt(false); }}>{d}</button>))}
        </div>

        <div style={{ fontWeight: 800, color: "var(--text)", margin: "16px 0 8px" }}>4. Time</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Start
            <input className="input" type="time" style={{ paddingLeft: 10, marginTop: 4 }} value={start} onChange={(e) => { setStart(e.target.value); setBuilt(false); }} />
          </label>
          <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Sessions/day
            <select className="input" style={{ paddingLeft: 10, marginTop: 4 }} value={perDay} onChange={(e) => { setPerDay(Number(e.target.value)); setBuilt(false); }}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Minutes each
            <select className="input" style={{ paddingLeft: 10, marginTop: 4 }} value={len} onChange={(e) => { setLen(Number(e.target.value)); setBuilt(false); }}>
              {[30, 45, 60, 90].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 14, color: "var(--text)" }}>
          <input type="checkbox" checked={mockDay} onChange={(e) => { setMockDay(e.target.checked); setBuilt(false); }} />
          Make the last day a mock exam day (use Exam practice)
        </label>

        <button className="btn-primary" style={{ marginTop: 16 }} disabled={!subjects.length || !orderedDays.length}
          onClick={() => { setBuilt(true); save({ built: true }); setMsg(""); }}>
          Build my timetable
        </button>
      </div>

      {built && subjects.length > 0 && orderedDays.length > 0 && (
        <div className="card rise" style={{ padding: 14, marginTop: 14 }}>
          <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Your week</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "separate", borderSpacing: 4, minWidth: 100 + orderedDays.length * 78, width: "100%" }}>
              <thead>
                <tr>
                  <th />
                  {orderedDays.map((d) => <th key={d} style={{ fontSize: 12, color: "var(--text)", fontWeight: 800, padding: 4 }}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: perDay }).map((_, k) => (
                  <tr key={k}>
                    <td style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", paddingRight: 6 }}>{fmt(slotStart(k))}</td>
                    {orderedDays.map((d) => {
                      const s = plan[d][k];
                      return (
                        <td key={d} style={{ background: colorOf(s), color: "#fff", borderRadius: 10, fontSize: 11.5, fontWeight: 700, textAlign: "center", padding: "10px 4px", boxShadow: "0 2px 0 rgba(0,0,0,0.3)" }}>
                          {s === "MOCK" ? "Mock exam" : s}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
            Each session is {len} minutes with a 10 minute break. Slide sideways if it is wide.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn-soft" style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }} onClick={download}><Download size={15} /> Save picture</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={share}><Share2 size={15} /> Share</button>
          </div>
          {msg && <div className="alert alert-success" style={{ marginTop: 10 }}><Check size={14} />{msg}</div>}
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
