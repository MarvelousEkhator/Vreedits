"use client";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function BirthdayPicker({ value, onChange }) {
  // value is expected as "YYYY-MM-DD" or ""
  const [year, month, day] = value ? value.split("-") : ["", "", ""];

  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear; y >= currentYear - 100; y--) years.push(y);

  const daysInMonth = month && year
    ? new Date(Number(year), Number(month), 0).getDate()
    : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  function update(part, val) {
    const next = {
      year: part === "year" ? val : year,
      month: part === "month" ? val : month,
      day: part === "day" ? val : day,
    };
    if (next.year && next.month && next.day) {
      const dd = String(next.day).padStart(2, "0");
      const mm = String(next.month).padStart(2, "0");
      onChange(`${next.year}-${mm}-${dd}`);
    } else {
      onChange("");
    }
  }

  const selectStyle = {
    padding: "10px 8px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text)",
    fontSize: 14,
    flex: 1,
  };

  return (
    <div className="flex gap-2">
      <select value={month} onChange={(e) => update("month", e.target.value)} style={selectStyle}>
        <option value="">Month</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </select>
      <select value={day} onChange={(e) => update("day", e.target.value)} style={{ ...selectStyle, flex: 0.6 }}>
        <option value="">Day</option>
        {days.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <select value={year} onChange={(e) => update("year", e.target.value)} style={selectStyle}>
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}