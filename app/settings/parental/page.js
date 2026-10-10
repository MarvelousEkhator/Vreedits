// app/settings/parental/page.js
"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Lock } from "lucide-react";

const LIMITS = [15, 30, 45, 60, 90, 120, 180, 240];
const BREAKS = [15, 20, 30, 45, 60, 90];
const AUDIENCE = [
  { id: "everyone", label: "Everyone" },
  { id: "friends", label: "Friends only" },
  { id: "none", label: "No one" },
];

function minutesLabel(m) {
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return Number.isInteger(h) ? `${h} hr` : `${m} min`;
}

function toTime(min) {
  const m = Number.isInteger(min) ? min : 0;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function fromTime(value) {
  const [h, m] = String(value || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

async function post(body) {
  try {
    const res = await fetch("/api/settings/parental", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Network problem. Try again." } };
  }
}

function Section({ title, children }) {
  return (
    <div style={{ padding: "16px 0", borderTop: "1px solid var(--border)" }}>
      <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <div className="text-sm font-semibold">{label}</div>
          {hint && <div className="text-xs" style={{ color: "var(--text-muted)" }}>{hint}</div>}
        </div>
        <div style={{ flexShrink: 0 }}>{children}</div>
      </div>
    </div>
  );
}

export default function ParentalControlsPage() {
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [unlocked, setUnlocked] = useState(null); // the PIN, kept only while this page is open
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [newPin, setNewPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Parent email (used to reset a forgotten PIN)
  const [emailInput, setEmailInput] = useState("");

  // "Forgot PIN?" flow
  const [mode, setMode] = useState("unlock"); // "unlock" | "reset"
  const [resetStep, setResetStep] = useState("send"); // "send" | "enter"
  const [sentTo, setSentTo] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPin, setResetNewPin] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/settings/parental?tz=${new Date().getTimezoneOffset()}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setInfo(data);
        setForm(data.settings);
      } else {
        setLoadError(data.error || "Couldn't load this page.");
      }
    } catch {
      setLoadError("Couldn't load this page.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function digits(setter) {
    return (e) => setter(e.target.value.replace(/\D/g, "").slice(0, 4));
  }

  function handleFail(r) {
    const message = r.data?.error || "Something went wrong.";
    setError(message);
    if (r.status === 429 || /PIN/i.test(message)) setUnlocked(null);
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setNotice("");
  }

  async function handleSetPin() {
    setError("");
    if (!/^\d{4}$/.test(pin)) return setError("The PIN must be 4 digits.");
    if (pin !== pin2) return setError("The two PINs don't match.");
    const email = emailInput.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setError("Enter a valid parent email, or leave it empty.");
    }
    setBusy(true);
    const body = { action: "setPin", pin };
    if (email) body.guardianEmail = email;
    const r = await post(body);
    setBusy(false);
    if (!r.ok) return handleFail(r);
    setUnlocked(pin);
    setPin("");
    setPin2("");
    setEmailInput("");
    await load();
  }

  async function handleUnlock() {
    setError("");
    if (!/^\d{4}$/.test(pin)) return setError("Enter the 4-digit PIN.");
    setBusy(true);
    const r = await post({ action: "verify", pin });
    setBusy(false);
    if (!r.ok) return setError(r.data?.error || "Wrong PIN.");
    setUnlocked(pin);
    setPin("");
  }

  function openReset() {
    setError("");
    setNotice("");
    setPin("");
    setResetCode("");
    setResetNewPin("");
    setResetStep("send");
    setMode("reset");
  }

  function closeReset() {
    setError("");
    setNotice("");
    setMode("unlock");
  }

  async function handleRequestReset() {
    setError("");
    setNotice("");
    setBusy(true);
    const r = await post({ action: "requestPinReset" });
    setBusy(false);
    if (!r.ok) return setError(r.data?.error || "Couldn't send the code.");
    setSentTo(r.data?.sentTo || info?.guardianEmailMasked || "");
    setResetStep("enter");
    setNotice("Code sent.");
  }

  async function handleResetPin() {
    setError("");
    setNotice("");
    const code = resetCode.trim();
    if (!code) return setError("Enter the code from the email.");
    if (!/^\d{4}$/.test(resetNewPin)) return setError("The new PIN must be 4 digits.");
    setBusy(true);
    const r = await post({ action: "resetPin", code, newPin: resetNewPin });
    setBusy(false);
    if (!r.ok) return setError(r.data?.error || "Couldn't reset the PIN.");
    setUnlocked(resetNewPin);
    setResetCode("");
    setResetNewPin("");
    setMode("unlock");
    setNotice("PIN reset.");
    await load();
  }

  async function handleSave() {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await post({
      action: "update",
      pin: unlocked,
      isPublic: form.isPublic,
      allowComments: form.allowComments,
      allowMentions: form.allowMentions,
      whoCanMessage: form.whoCanMessage,
      discoverable: form.discoverable,
      dailyLimitMinutes: form.dailyLimitMinutes,
      quietEnabled: form.quietEnabled,
      quietStart: form.quietStart,
      quietEnd: form.quietEnd,
      breakEveryMinutes: form.breakEveryMinutes,
    });
    setBusy(false);
    if (!r.ok) return handleFail(r);
    setNotice("Saved.");
  }

  async function handleAddTime(minutes) {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await post({ action: "addTime", pin: unlocked, minutes, day: info.day });
    setBusy(false);
    if (!r.ok) return handleFail(r);
    setNotice(`Added ${minutes} minutes for today.`);
  }

  async function handleSaveEmail() {
    setError("");
    setNotice("");
    const email = emailInput.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid parent email.");
    setBusy(true);
    const r = await post({ action: "setGuardianEmail", pin: unlocked, guardianEmail: email });
    setBusy(false);
    if (!r.ok) return handleFail(r);
    setEmailInput("");
    setNotice("Parent email saved.");
    await load();
  }

  async function handleChangePin() {
    setError("");
    if (!/^\d{4}$/.test(newPin)) return setError("The new PIN must be 4 digits.");
    setBusy(true);
    const r = await post({ action: "changePin", pin: unlocked, newPin });
    setBusy(false);
    if (!r.ok) return handleFail(r);
    setUnlocked(newPin);
    setNewPin("");
    setNotice("PIN changed.");
  }

  async function handleRemovePin() {
    if (!window.confirm("Remove the guardian PIN? The settings will no longer be locked.")) return;
    setBusy(true);
    setError("");
    const r = await post({ action: "removePin", pin: unlocked });
    setBusy(false);
    if (!r.ok) return handleFail(r);
    setUnlocked(null);
    setNotice("");
    await load();
  }

  const strict = info?.tier === "strict";
  const pinInputStyle = { textAlign: "center", letterSpacing: 6 };
  const secondaryButton = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" };
  const linkButton = { background: "none", border: "none", color: "var(--accent)", padding: 0 };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100, overflowY: "auto",
        background: "var(--surface)", color: "var(--text)",
      }}
    >
      <div
        className="flex items-center gap-3 px-4"
        style={{
          height: 56, borderBottom: "1px solid var(--border)",
          position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
        }}
      >
        <Link href="/settings" aria-label="Back" style={{ color: "var(--text)", display: "flex" }}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-sm font-semibold">Parental controls</h1>
      </div>

      <div className="p-4" style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 60 }}>
        {loadError && <div className="alert alert-error">{loadError}</div>}

        {!info && !loadError && (
          <div className="flex justify-center py-16" style={{ color: "var(--text-muted)" }}>
            <Loader2 size={22} className="animate-spin" />
          </div>
        )}

        {/* ── First-time setup ── */}
        {info && !info.hasPin && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Lock size={18} />
              <h2 className="text-base font-bold">Set a guardian PIN</h2>
            </div>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              A parent or guardian should choose this PIN. Once it's set, the settings on this page
              can only be changed with it.
            </p>
            <input className="input pl-3 mb-3" type="password" inputMode="numeric" maxLength={4}
              placeholder="Choose a 4-digit PIN" value={pin} onChange={digits(setPin)} style={pinInputStyle} />
            <input className="input pl-3 mb-3" type="password" inputMode="numeric" maxLength={4}
              placeholder="Type it again" value={pin2} onChange={digits(setPin2)} style={pinInputStyle} />
            <input className="input pl-3 mb-1" type="email" autoComplete="off"
              placeholder="Parent's email (recommended)" value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)} />
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Used only to reset the PIN if it's forgotten. Use an email the parent controls and the
              teen can't open. Without one, a forgotten PIN can't be reset.
            </p>
            <button className="btn-primary" onClick={handleSetPin} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : "Set PIN"}
            </button>
            {error && <div className="alert alert-error mt-3">{error}</div>}
          </>
        )}

        {/* ── Locked: enter PIN ── */}
        {info && info.hasPin && !unlocked && mode === "unlock" && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Lock size={18} />
              <h2 className="text-base font-bold">Enter guardian PIN</h2>
            </div>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              These settings are locked. Ask a parent or guardian to enter the PIN.
            </p>
            <input className="input pl-3 mb-3" type="password" inputMode="numeric" maxLength={4}
              placeholder="4-digit PIN" value={pin} onChange={digits(setPin)} style={pinInputStyle} />
            <button className="btn-primary" onClick={handleUnlock} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : "Unlock"}
            </button>
            {notice && <div className="mt-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>{notice}</div>}
            {error && <div className="alert alert-error mt-3">{error}</div>}

            <div className="mt-4 text-sm">
              {info.hasGuardianEmail ? (
                <button onClick={openReset} className="font-semibold" style={linkButton}>
                  Forgot PIN?
                </button>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>
                  No parent email is saved for this account, so a forgotten PIN can't be reset by email.
                </span>
              )}
            </div>
          </>
        )}

        {/* ── Forgot PIN ── */}
        {info && info.hasPin && !unlocked && mode === "reset" && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Lock size={18} />
              <h2 className="text-base font-bold">Reset the PIN</h2>
            </div>

            {resetStep === "send" && (
              <>
                <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
                  We'll email a code to the parent email on file
                  {info.guardianEmailMasked ? ` (${info.guardianEmailMasked})` : ""}.
                </p>
                <button className="btn-primary mb-3" onClick={handleRequestReset} disabled={busy}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : "Send code"}
                </button>
              </>
            )}

            {resetStep === "enter" && (
              <>
                <p className="text-sm mb-1" style={{ color: "var(--text-muted)" }}>
                  We sent a code to {sentTo || "the parent email"}. It can take a minute to arrive.
                </p>
                <p className="text-sm mb-4 font-semibold">
                  Check the spam or junk folder if you don't see it.
                </p>
                <input className="input pl-3 mb-3" type="text" inputMode="numeric" autoComplete="one-time-code"
                  maxLength={12} placeholder="Code from the email" value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.trim().slice(0, 12))}
                  style={{ textAlign: "center", letterSpacing: 4 }} />
                <input className="input pl-3 mb-3" type="password" inputMode="numeric" maxLength={4}
                  placeholder="New 4-digit PIN" value={resetNewPin} onChange={digits(setResetNewPin)}
                  style={pinInputStyle} />
                <button className="btn-primary mb-3" onClick={handleResetPin} disabled={busy}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : "Reset PIN"}
                </button>
                <div className="text-sm mb-3">
                  <button onClick={handleRequestReset} disabled={busy} className="font-semibold" style={linkButton}>
                    Send a new code
                  </button>
                </div>
              </>
            )}

            {notice && <div className="mb-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>{notice}</div>}
            {error && <div className="alert alert-error mb-3">{error}</div>}

            <button onClick={closeReset} disabled={busy} className="text-sm font-semibold" style={linkButton}>
              Back
            </button>
          </>
        )}

        {/* ── Unlocked: settings ── */}
        {info && info.hasPin && unlocked && form && (
          <>
            {strict && (
              <div className="alert mb-4" style={{ background: "var(--accent-soft)", color: "var(--text)" }}>
                This account is under 16, so some privacy settings stay on and can't be loosened.
              </div>
            )}

            <Section title="Screen time">
              <Field label="Daily limit" hint="The app locks when it's reached">
                <select className="input" value={form.dailyLimitMinutes ?? ""}
                  onChange={(e) => setField("dailyLimitMinutes", e.target.value === "" ? null : Number(e.target.value))}>
                  <option value="">No limit</option>
                  {LIMITS.map((m) => <option key={m} value={m}>{minutesLabel(m)}</option>)}
                </select>
              </Field>

              <Field label="Quiet hours" hint="The app is closed during this time">
                <input type="checkbox" style={{ width: 22, height: 22 }} checked={!!form.quietEnabled}
                  onChange={(e) => setField("quietEnabled", e.target.checked)} />
              </Field>
              {form.quietEnabled && (
                <div className="flex gap-3 mb-4">
                  <div style={{ flex: 1 }}>
                    <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>From</div>
                    <input type="time" className="input" value={toTime(form.quietStart)}
                      onChange={(e) => setField("quietStart", fromTime(e.target.value))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Until</div>
                    <input type="time" className="input" value={toTime(form.quietEnd)}
                      onChange={(e) => setField("quietEnd", fromTime(e.target.value))} />
                  </div>
                </div>
              )}

              <Field label="Break reminder" hint="A reminder after this much non-stop use">
                <select className="input" value={form.breakEveryMinutes ?? ""}
                  onChange={(e) => setField("breakEveryMinutes", e.target.value === "" ? null : Number(e.target.value))}>
                  <option value="">Off</option>
                  {BREAKS.map((m) => <option key={m} value={m}>Every {minutesLabel(m)}</option>)}
                </select>
              </Field>

              <div className="text-sm font-semibold mb-2">Add time for today</div>
              <div className="flex gap-2">
                {[15, 30, 60].map((m) => (
                  <button key={m} className="btn-primary" disabled={busy} onClick={() => handleAddTime(m)}
                    style={{ flex: 1, ...secondaryButton }}>
                    +{m} min
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Privacy">
              <Field label="Private account" hint="Only approved people see posts">
                <input type="checkbox" style={{ width: 22, height: 22 }} checked={!form.isPublic}
                  disabled={strict} onChange={(e) => setField("isPublic", !e.target.checked)} />
              </Field>
              <Field label="Show in suggestions" hint="Let others discover this account">
                <input type="checkbox" style={{ width: 22, height: 22 }} checked={!!form.discoverable}
                  disabled={strict} onChange={(e) => setField("discoverable", e.target.checked)} />
              </Field>
              <Field label="Who can message">
                <select className="input" value={form.whoCanMessage} onChange={(e) => setField("whoCanMessage", e.target.value)}>
                  {AUDIENCE.map((a) => (
                    <option key={a.id} value={a.id} disabled={strict && a.id === "everyone"}>{a.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Who can comment">
                <select className="input" value={form.allowComments} onChange={(e) => setField("allowComments", e.target.value)}>
                  {AUDIENCE.map((a) => (
                    <option key={a.id} value={a.id} disabled={strict && a.id === "everyone"}>{a.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Who can mention">
                <select className="input" value={form.allowMentions} onChange={(e) => setField("allowMentions", e.target.value)}>
                  {AUDIENCE.map((a) => (
                    <option key={a.id} value={a.id} disabled={strict && a.id === "everyone"}>{a.label}</option>
                  ))}
                </select>
              </Field>
            </Section>

            <button className="btn-primary" onClick={handleSave} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : "Save changes"}
            </button>

            {notice && <div className="mt-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>{notice}</div>}
            {error && <div className="alert alert-error mt-3">{error}</div>}

            <Section title="Parent email (for PIN reset)">
              <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                {info.hasGuardianEmail
                  ? `Current: ${info.guardianEmailMasked}. `
                  : "None saved yet. Without one, a forgotten PIN can't be reset. "}
                Use an email the parent controls and the teen can't open.
              </p>
              <input className="input pl-3 mb-3" type="email" autoComplete="off"
                placeholder={info.hasGuardianEmail ? "New parent email" : "Parent's email"}
                value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
              <button className="btn-primary" onClick={handleSaveEmail} disabled={busy} style={secondaryButton}>
                {info.hasGuardianEmail ? "Change email" : "Save email"}
              </button>
            </Section>

            <Section title="Guardian PIN">
              <input className="input pl-3 mb-3" type="password" inputMode="numeric" maxLength={4}
                placeholder="New 4-digit PIN" value={newPin} onChange={digits(setNewPin)} style={pinInputStyle} />
              <button className="btn-primary mb-3" onClick={handleChangePin} disabled={busy} style={secondaryButton}>
                Change PIN
              </button>
              <button onClick={handleRemovePin} disabled={busy} className="text-sm font-semibold"
                style={{ background: "none", border: "none", color: "var(--danger, #e55)", padding: 0 }}>
                Remove PIN
              </button>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}