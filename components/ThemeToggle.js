"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.setAttribute("data-theme", theme);
  try { localStorage.setItem("vreedits-theme", theme); } catch {}
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem("vreedits-theme"); } catch {}
    const t = saved === "light" ? "light" : "dark";
    setTheme(t);
    applyTheme(t);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: 42, height: 42, borderRadius: 12, cursor: "pointer",
        border: "1px solid var(--border)", background: "var(--surface-2)",
        color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}