// components/ScreenTimeGate.js
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Lock, Moon, Coffee, LogOut } from "lucide-react";

const TICK_SECONDS = 15;
const MAX_ELAPSED_SECONDS = 60;
const GAP_RESET_MS = 90 * 1000; // a longer gap means the app was closed

function readNum(key) {
  try {
    const v = Number(sessionStorage.getItem(key));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

function writeNum(key, value) {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {}
}

function formatClock(minutes) {
  if (!Number.isInteger(minutes)) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

const overlayStyle = {
  position: "fixed", inset: 0, zIndex: 9999,
  background: "var(--surface)", color: "var(--text)",
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  textAlign: "center", padding: 24, overflowY: "auto",
};

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {}
  window.location.href = "/login";
}

export default function ScreenTimeGate({ children }) {
  const [status, setStatus] = useState(null);
  const [breakDue, setBreakDue] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const statusRef = useRef(null);
  const lastTickRef = useRef(0);
  statusRef.current = status;

  const fetchStatus = useCallback(async () => {
    try {
      // The server reads this cookie to work out the person's local day.
      document.cookie = `tz=${new Date().getTimezoneOffset()}; path=/; max-age=31536000; SameSite=Lax`;
      const res = await fetch(`/api/screen-time?tz=${new Date().getTimezoneOffset()}`, { cache: "no-store" });
      if (res.ok) setStatus(await res.json());
    } catch {
      // If the check can't run, the app opens normally.
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Counts time while the app is open and visible. The clock is kept in
  // sessionStorage so moving between pages doesn't reset it.
  useEffect(() => {
    const start = Date.now();
    const saved = readNum("st_last");
    const continuing = saved > 0 && start - saved < GAP_RESET_MS;
    lastTickRef.current = continuing ? saved : start;
    if (!continuing) writeNum("st_cont", 0);

    const id = setInterval(async () => {
      const now = Date.now();
      if (document.visibilityState !== "visible") {
        lastTickRef.current = now;
        writeNum("st_last", now);
        return;
      }
      const elapsed = Math.min(
        MAX_ELAPSED_SECONDS,
        Math.max(0, Math.round((now - lastTickRef.current) / 1000))
      );
      lastTickRef.current = now;
      writeNum("st_last", now);

      const s = statusRef.current;
      if (s?.blocked || elapsed <= 0) return;

      try {
        const res = await fetch("/api/screen-time", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tz: new Date().getTimezoneOffset(), seconds: elapsed }),
        });
        if (!res.ok) return;
        const next = await res.json();
        setStatus(next);

        const cont = readNum("st_cont") + elapsed;
        writeNum("st_cont", cont);
        if (next.breakEveryMinutes && cont >= next.breakEveryMinutes * 60) {
          writeNum("st_cont", 0);
          setBreakDue(true);
        }
      } catch {}
    }, TICK_SECONDS * 1000);
    return () => clearInterval(id);
  }, []);

  // Coming back to the tab: re-check (limits may have changed, or a new day started).
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") fetchStatus();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fetchStatus]);

  async function addTime(minutes) {
    if (busy || !status) return;
    if (!/^\d{4}$/.test(pin)) {
      setError("Enter the 4-digit guardian PIN.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/settings/parental", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addTime", pin, minutes, day: status.day }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't add time.");
      } else {
        setPin("");
        await fetchStatus();
      }
    } catch {
      setError("Couldn't add time. Check your connection.");
    }
    setBusy(false);
  }

  if (status?.blocked === "quiet") {
    return (
      <div style={overlayStyle}>
        <Moon size={44} style={{ marginBottom: 16, color: "var(--accent)" }} />
        <h2 className="text-lg font-bold mb-2">Quiet hours</h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)", maxWidth: 300 }}>
          This app is resting for now. It opens again at {formatClock(status.quietEnd)}.
        </p>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm font-semibold"
          style={{ background: "none", border: "none", color: "var(--accent)" }}
        >
          <LogOut size={15} /> Log out
        </button>
      </div>
    );
  }

  if (status?.blocked === "limit") {
    return (
      <div style={overlayStyle}>
        <Lock size={44} style={{ marginBottom: 16, color: "var(--accent)" }} />
        <h2 className="text-lg font-bold mb-2">Daily limit reached</h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)", maxWidth: 300 }}>
          You've used your {status.limitMinutes} minutes for today. Come back tomorrow.
        </p>

        {status.hasPin && (
          <div style={{ width: "100%", maxWidth: 300, marginBottom: 20 }}>
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
              Parent or guardian: enter the PIN to add time.
            </p>
            <input
              className="input pl-3 mb-3"
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="4-digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              style={{ textAlign: "center" }}
            />
            <div className="flex gap-2">
              {[15, 30, 60].map((m) => (
                <button key={m} className="btn-primary" disabled={busy} onClick={() => addTime(m)} style={{ flex: 1 }}>
                  +{m} min
                </button>
              ))}
            </div>
            {error && <div className="alert alert-error mt-3">{error}</div>}
          </div>
        )}

        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm font-semibold"
          style={{ background: "none", border: "none", color: "var(--accent)" }}
        >
          <LogOut size={15} /> Log out
        </button>
      </div>
    );
  }

  return (
    <>
      {children}
      {breakDue && (
        <div style={overlayStyle}>
          <Coffee size={44} style={{ marginBottom: 16, color: "var(--accent)" }} />
          <h2 className="text-lg font-bold mb-2">Time for a break</h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)", maxWidth: 300 }}>
            You've been on for a while. Stretch, drink some water, rest your eyes.
          </p>
          <div className="flex gap-3" style={{ width: "100%", maxWidth: 300 }}>
            <button
              className="btn-primary"
              onClick={logout}
              style={{ flex: 1, background: "var(--surface-2)", color: "var(--text)" }}
            >
              Log out
            </button>
            <button className="btn-primary" onClick={() => setBreakDue(false)} style={{ flex: 1 }}>
              Keep going
            </button>
          </div>
        </div>
      )}
    </>
  );
}