"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { Download, Share2, Star, Check, Plus, Copy, Trash2, Pencil, X } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   TIMETABLE — draws a weekly study timetable. You can keep several,
   duplicate them, rename them, delete them, and tap any box to change
   the subject or clear it. No AI needed, so it is instant. Everything is
   saved on this device.
   ═══════════════════════════════════════════════════════════════ */

const STORE = "vreedits.timetable.v2";
const OLD_STORE = "vreedits.timetable.v1";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRESETS = {
  "UTME": ["English", "Mathematics", "Biology", "Physics", "Chemistry"],
  "WAEC / NECO": ["English", "Mathematics", "Biology", "Physics", "Chemistry", "Economics", "Government"],
  "GCSE": ["Maths", "English", "Biology", "Chemistry", "Physics", "History"],
  "SAT / ACT": ["Math", "Reading & Writing", "Science"],
};
const HUES = [285, 200, 150, 35, 340, 175, 250, 60, 15, 110];
const colorFor = (i) => `hsl(${HUES[((i % HUES.length) + HUES.length) % HUES.length]}, 62%, 42%)`;
const uid = () => Math.random().toString(36).slice(2, 9);

function blank(name = "My timetable") {
  return {
    id: uid(), name, preset: "UTME", subjects: PRESETS["UTME"].slice(), weak: [],
    days: DAYS.slice(), perDay: 3, len: 45, start: "16:00", mockDay: true, built: false, edits: {},
  };
}
function fmt(mins) {
  const h24 = Math.floor(mins / 60) % 24, m = mins % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${h24 >= 12 ? "pm" : "am"}`;
}

// Weighted round-robin: hard subjects count double, no subject twice in a day or back to back.
function buildPlan({ subjects, weak, days, perDay, mockDay }) {
  const counts = Object.fromEntries(subjects.map((s) => [s, 0]));
  const plan = {};
  let last = null;
  days.forEach((d, di) => {
    if (mockDay && di === days.length - 1 && days.length > 1) { plan[d] = Array(perDay).fill("MOCK"); return; }
    const used = new Set();
    plan[d] = [];
    for (let k = 0; k < perDay; k++) {
      let list = subjects.filter((s) => !used.has(s) && s !== last);
      if (!list.length) list = subjects.filter((s) => !used.has(s));
      if (!list.length) list = subjects;
      const pick = list.slice().sort((a, b) => counts[a] / (weak.includes(a) ? 2 : 1) - counts[b] / (weak.includes(b) ? 2 : 1))[0];
      counts[pick]++; used.add(pick); last = pick;
      plan[d].push(pick);
    }
  });
  return plan;
}

export default function TimetablePage() {
  const [tables, setTables] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [custom, setCustom] = useState("");
  const [msg, setMsg] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [cell, setCell] = useState(null); // { d, k }
  const canvasRef = useRef(null);

  // load (and bring over a timetable saved by the first version)
  useEffect(() => {
    let list = [], active = null;
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || "null");
      if (s && Array.isArray(s.tables) && s.tables.length) { list = s.tables; active = s.activeId; }
      else {
        const o = JSON.parse(localStorage.getItem(OLD_STORE) || "null");
        if (o) list = [{ ...blank("My timetable"), ...o, edits: {} }];
      }
    } catch {}
    if (!list.length) list = [blank("My timetable")];
    setTables(list);
    setActiveId(list.find((t) => t.id === active) ? active : list[0].id);
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORE, JSON.stringify({ tables, activeId })); } catch {}
  }, [tables, activeId, loaded]);

  const t = tables.find((x) => x.id === activeId) || tables[0];
  const patch = (p) => setTables((all) => all.map((x) => (x.id === t.id ? { ...x, ...p } : x)));
  const rebuild = (p) => patch({ ...p, built: false });

  const orderedDays = t ? DAYS.filter((d) => t.days.includes(d)) : [];
  const basePlan = useMemo(
    () => (t && t.subjects.length && orderedDays.length ? buildPlan({ ...t, days: orderedDays }) : {}),
    [t && t.subjects, t && t.weak, t && t.days, t && t.perDay, t && t.mockDay] // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!t) return null;

  const cellValue = (d, k) => {
    const e = t.edits[`${d}-${k}`];
    if (e === "") return "FREE";
    if (e) return e;
    return (basePlan[d] && basePlan[d][k]) || "FREE";
  };
  const [sh, sm] = t.start.split(":").map(Number);
  const startMin = (sh || 0) * 60 + (sm || 0);
  const slotStart = (k) => startMin + k * (t.len + 10);
  const colorOf = (s) => (s === "MOCK" ? "hsl(0,0%,28%)" : s === "FREE" ? "hsla(0,0%,50%,0.18)" : colorFor(t.subjects.indexOf(s) >= 0 ? t.subjects.indexOf(s) : 9));
  const labelOf = (s) => (s === "MOCK" ? "Mock exam" : s === "FREE" ? "Free" : s);

  /* ----- timetable list actions ----- */
  function addNew() { const n = blank(`Timetable ${tables.length + 1}`); setTables([...tables, n]); setActiveId(n.id); setCell(null); setMsg(""); }
  function duplicate() {
    const copy = { ...t, id: uid(), name: `${t.name} (copy)`, edits: { ...t.edits }, subjects: t.subjects.slice(), weak: t.weak.slice(), days: t.days.slice() };
    setTables([...tables, copy]); setActiveId(copy.id); setCell(null); setMsg("Copied. Change anything in the copy.");
  }
  function remove() {
    const rest = tables.filter((x) => x.id !== t.id);
    const next = rest.length ? rest : [blank("My timetable")];
    setTables(next); setActiveId(next[0].id); setConfirmDel(false); setCell(null); setMsg("");
  }
  function saveName() { const v = nameDraft.trim().slice(0, 30); if (v) patch({ name: v }); setRenaming(false); }

  /* ----- editing ----- */
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  function choosePreset(p) { rebuild({ preset: p, subjects: PRESETS[p].slice(), weak: [], edits: {} }); }
  function addCustom() {
    const v = custom.trim().slice(0, 24);
    if (v && !t.subjects.includes(v) && t.subjects.length < 10) rebuild({ subjects: [...t.subjects, v], edits: {} });
    setCustom("");
  }
  function removeSubject(s) { rebuild({ subjects: t.subjects.filter((x) => x !== s), weak: t.weak.filter((x) => x !== s), edits: {} }); }
  function setCellValue(d, k, v) {
    const e = { ...t.edits };
    if (v === null) delete e[`${d}-${k}`]; else e[`${d}-${k}`] = v;
    patch({ edits: e }); setCell(null);
  }

  /* ----- picture ----- */
  function draw() {
    const cols = orderedDays.length, W = 1200, pad = 40, head = 120, rowH = 90, tcol = 150;
    const H = head + t.perDay * rowH + 90 + Math.ceil(t.subjects.length / 4) * 40;
    const c = canvasRef.current || document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#16062a"); grad.addColorStop(1, "#5a0b86");
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = "#fff"; g.font = "bold 44px sans-serif"; g.fillText(t.name, pad, 70);
    g.font = "22px sans-serif"; g.fillStyle = "#d9b8f0"; g.fillText("Made on Vreedits", pad, 102);
    const cw = (W - pad * 2 - tcol) / cols;
    orderedDays.forEach((d, i) => { g.fillStyle = "#fff"; g.font = "bold 24px sans-serif"; g.fillText(d, pad + tcol + i * cw + 10, head - 12); });
    for (let k = 0; k < t.perDay; k++) {
      const y = head + k * rowH;
      g.fillStyle = "#d9b8f0"; g.font = "20px sans-serif"; g.fillText(fmt(slotStart(k)), pad, y + 52);
      orderedDays.forEach((d, i) => {
        const s = cellValue(d, k), x = pad + tcol + i * cw + 4;
        g.fillStyle = colorOf(s);
        g.beginPath(); g.roundRect ? g.roundRect(x, y + 6, cw - 8, rowH - 12, 14) : g.rect(x, y + 6, cw - 8, rowH - 12); g.fill();
        g.fillStyle = "#fff"; g.font = "bold 21px sans-serif";
        const label = labelOf(s);
        g.fillText(label.length > 13 ? label.slice(0, 12) + "…" : label, x + 12, y + 54);
      });
    }
    let ly = head + t.perDay * rowH + 40;
    t.subjects.forEach((s, i) => {
      const lx = pad + (i % 4) * 280;
      if (i % 4 === 0 && i > 0) ly += 40;
      g.fillStyle = colorOf(s); g.fillRect(lx, ly - 18, 22, 22);
      g.fillStyle = "#fff"; g.font = "20px sans-serif"; g.fillText(s, lx + 32, ly);
    });
    return c;
  }
  function download() {
    const c = draw();
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png"); a.download = `${t.name.replace(/[^\w-]+/g, "-")}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setMsg("Saved to your downloads. You can print it from there.");
  }
  async function share() {
    const c = draw();
    try {
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      const file = new File([blob], "vreedits-timetable.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: t.name });
      else download();
    } catch {}
  }

  const wrap = { maxWidth: 520, margin: "0 auto", padding: "16px 16px 40px" };
  const chip = (on) => ({ padding: "7px 12px", borderRadius: 999, fontSize: 13, fontWeight: 700, border: "1px solid var(--border)", background: on ? "var(--accent)" : "var(--surface-2)", color: on ? "#fff" : "var(--text)" });
  const iconBtn = { display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 12, fontSize: 12.5, fontWeight: 700, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" };

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", margin: "4px 0 4px" }}>Timetable maker</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 14px" }}>
        Keep as many timetables as you like. Tap any box in your week to change it or clear it.
      </p>

      {/* my timetables */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {tables.map((x) => (
          <button key={x.id} style={chip(x.id === t.id)} onClick={() => { setActiveId(x.id); setCell(null); setMsg(""); setConfirmDel(false); setRenaming(false); }}>
            {x.name}
          </button>
        ))}
        <button style={{ ...chip(false), display: "inline-flex", alignItems: "center", gap: 4 }} onClick={addNew}><Plus size={14} /> New</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {renaming ? (
          <>
            <input className="input" style={{ paddingLeft: 12, flex: 1, minWidth: 140 }} autoFocus value={nameDraft} maxLength={30}
              onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} />
            <button style={iconBtn} onClick={saveName}><Check size={14} /> Save</button>
            <button style={iconBtn} onClick={() => setRenaming(false)}><X size={14} /></button>
          </>
        ) : confirmDel ? (
          <>
            <span style={{ fontSize: 13, color: "var(--text)", alignSelf: "center" }}>Delete “{t.name}”?</span>
            <button style={{ ...iconBtn, color: "var(--danger)" }} onClick={remove}><Trash2 size={14} /> Yes, delete</button>
            <button style={iconBtn} onClick={() => setConfirmDel(false)}>Keep it</button>
          </>
        ) : (
          <>
            <button style={iconBtn} onClick={() => { setNameDraft(t.name); setRenaming(true); }}><Pencil size={14} /> Rename</button>
            <button style={iconBtn} onClick={duplicate}><Copy size={14} /> Duplicate</button>
            <button style={iconBtn} onClick={() => setConfirmDel(true)}><Trash2 size={14} /> Delete</button>
          </>
        )}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>1. Preparing for</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.keys(PRESETS).map((p) => (<button key={p} style={chip(p === t.preset)} onClick={() => choosePreset(p)}>{p}</button>))}
        </div>

        <div style={{ fontWeight: 800, color: "var(--text)", margin: "16px 0 4px" }}>2. Subjects</div>
        <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8 }}>Tap ★ on the ones you find hard. They get more sessions. Tap × to remove one.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {t.subjects.map((s, i) => (
            <span key={s} style={{ ...chip(false), display: "inline-flex", alignItems: "center", gap: 6, borderColor: colorFor(i) }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: colorFor(i) }} />
              {s}
              <button aria-label={`Hard: ${s}`} onClick={() => rebuild({ weak: toggle(t.weak, s), edits: {} })} style={{ color: t.weak.includes(s) ? "#f5b301" : "var(--text-muted)" }}>
                <Star size={15} fill={t.weak.includes(s) ? "#f5b301" : "none"} />
              </button>
              <button aria-label={`Remove ${s}`} onClick={() => removeSubject(s)} style={{ color: "var(--text-muted)", fontWeight: 800 }}>×</button>
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
          {DAYS.map((d) => (<button key={d} style={chip(t.days.includes(d))} onClick={() => rebuild({ days: toggle(t.days, d), edits: {} })}>{d}</button>))}
        </div>

        <div style={{ fontWeight: 800, color: "var(--text)", margin: "16px 0 8px" }}>4. Time</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Start
            <input className="input" type="time" style={{ paddingLeft: 10, marginTop: 4 }} value={t.start} onChange={(e) => rebuild({ start: e.target.value })} />
          </label>
          <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Sessions/day
            <select className="input" style={{ paddingLeft: 10, marginTop: 4 }} value={t.perDay} onChange={(e) => rebuild({ perDay: Number(e.target.value), edits: {} })}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Minutes each
            <select className="input" style={{ paddingLeft: 10, marginTop: 4 }} value={t.len} onChange={(e) => rebuild({ len: Number(e.target.value) })}>
              {[30, 45, 60, 90].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 14, color: "var(--text)" }}>
          <input type="checkbox" checked={t.mockDay} onChange={(e) => rebuild({ mockDay: e.target.checked, edits: {} })} />
          Make the last day a mock exam day (use Exam practice)
        </label>

        <button className="btn-primary" style={{ marginTop: 16 }} disabled={!t.subjects.length || !orderedDays.length}
          onClick={() => { patch({ built: true }); setMsg(""); }}>
          {t.built ? "Rebuild my timetable" : "Build my timetable"}
        </button>
        {t.built && Object.keys(t.edits).length > 0 && (
          <button className="btn-soft" style={{ marginTop: 10, width: "100%" }} onClick={() => patch({ edits: {} })}>Undo my box changes</button>
        )}
      </div>

      {t.built && t.subjects.length > 0 && orderedDays.length > 0 && (
        <div className="card rise" style={{ padding: 14, marginTop: 14 }}>
          <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 2 }}>{t.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>Tap a box to change the subject or clear it.</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "separate", borderSpacing: 4, minWidth: 100 + orderedDays.length * 78, width: "100%" }}>
              <thead>
                <tr>
                  <th />
                  {orderedDays.map((d) => <th key={d} style={{ fontSize: 12, color: "var(--text)", fontWeight: 800, padding: 4 }}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: t.perDay }).map((_, k) => (
                  <tr key={k}>
                    <td style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", paddingRight: 6 }}>{fmt(slotStart(k))}</td>
                    {orderedDays.map((d) => {
                      const s = cellValue(d, k);
                      const sel = cell && cell.d === d && cell.k === k;
                      return (
                        <td key={d} onClick={() => setCell(sel ? null : { d, k })}
                          style={{ background: colorOf(s), color: "#fff", borderRadius: 10, fontSize: 11.5, fontWeight: 700, textAlign: "center", padding: "10px 4px", cursor: "pointer",
                            boxShadow: sel ? "0 0 0 3px #fff" : "0 2px 0 rgba(0,0,0,0.3)", opacity: s === "FREE" ? 0.8 : 1 }}>
                          {labelOf(s)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {cell && (
            <div className="pop" style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>{cell.d}, {fmt(slotStart(cell.k))}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {t.subjects.map((s) => (<button key={s} style={chip(false)} onClick={() => setCellValue(cell.d, cell.k, s)}>{s}</button>))}
                <button style={chip(false)} onClick={() => setCellValue(cell.d, cell.k, "MOCK")}>Mock exam</button>
                <button style={{ ...chip(false), color: "var(--danger)" }} onClick={() => setCellValue(cell.d, cell.k, "")}>Clear (free)</button>
                <button style={chip(false)} onClick={() => setCellValue(cell.d, cell.k, null)}>Back to automatic</button>
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
            Each session is {t.len} minutes with a 10 minute break. Slide sideways if it is wide.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn-soft" style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }} onClick={download}><Download size={15} /> Save picture</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={share}><Share2 size={15} /> Share</button>
          </div>
        </div>
      )}
      {msg && <div className="alert alert-success" style={{ marginTop: 10 }}><Check size={14} />{msg}</div>}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
