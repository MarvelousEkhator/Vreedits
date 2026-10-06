// components/BirthdayPicker.js
"use client";
import { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parse(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!m) return { year: "", month: "", day: "" };
  return { year: m[1], month: String(Number(m[2])), day: String(Number(m[3])) };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// How many days the chosen month has. Feb 29 stays available until a year is picked.
function daysIn(month, year) {
  if (!month) return 31;
  const y = year ? Number(year) : 2000;
  return new Date(Date.UTC(y, Number(month), 0)).getUTCDate();
}

export default function BirthdayPicker({ value, onChange }) {
  const [parts, setParts] = useState(() => parse(value));

  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear; y >= thisYear - 110; y--) years.push(y);
  const dayCount = daysIn(parts.month, parts.year);

  function update(next) {
    const merged = { ...parts, ...next };
    if (merged.day && Number(merged.day) > daysIn(merged.month, merged.year)) {
      merged.day = "";
    }
    setParts(merged);
    if (merged.year && merged.month && merged.day) {
      onChange(`${merged.year}-${pad(merged.month)}-${pad(merged.day)}`);
    } else {
      onChange("");
    }
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select
        className="input"
        aria-label="Month"
        value={parts.month}
        onChange={(e) => update({ month: e.target.value })}
        style={{ flex: 2, minWidth: 0 }}
      >
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={String(i + 1)}>{name}</option>
        ))}
      </select>

      <select
        className="input"
        aria-label="Day"
        value={parts.day}
        onChange={(e) => update({ day: e.target.value })}
        style={{ flex: 1, minWidth: 0 }}
      >
        <option value="">Day</option>
        {Array.from({ length: dayCount }, (_, i) => (
          <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
        ))}
      </select>

      <select
        className="input"
        aria-label="Year"
        value={parts.year}
        onChange={(e) => update({ year: e.target.value })}
        style={{ flex: 1.3, minWidth: 0 }}
      >
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={String(y)}>{y}</option>
        ))}
      </select>
    </div>
  );
}