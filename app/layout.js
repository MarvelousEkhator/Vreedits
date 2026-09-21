@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #FAFAFB;
  --surface: #FFFFFF;
  --surface-2: #F2F2F5;
  --border: #E7E7EC;
  --text: #14151A;
  --text-muted: #71727E;
  --accent: #6D4FF2;
  --accent-soft: rgba(109, 79, 242, 0.10);
  --danger: #E4574C;
  --danger-soft: rgba(228, 87, 76, 0.10);
  --success: #17A398;
  --success-soft: rgba(23, 163, 152, 0.10);
  --shadow: 0 20px 60px rgba(20, 21, 26, 0.14);
}

.dark {
  --bg: #0E0F14;
  --surface: #16171F;
  --surface-2: #1D1F29;
  --border: #272935;
  --text: #EDEDF2;
  --text-muted: #8A8C99;
  --accent: #8B70FF;
  --accent-soft: rgba(139, 112, 255, 0.14);
  --danger: #F0776C;
  --danger-soft: rgba(240, 119, 108, 0.12);
  --success: #2DD4C4;
  --success-soft: rgba(45, 212, 196, 0.12);
  --shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

body {
  background: var(--bg);
  color: var(--text);
  transition: background 0.25s ease, color 0.25s ease;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: var(--shadow);
}

.input {
  width: 100%;
  padding: 11px 12px 11px 38px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.input:focus {
  border-color: var(--accent);
  background: var(--surface);
}

.btn-primary {
  width: 100%;
  padding: 12px;
  border-radius: 10px;
  background: var(--accent);
  color: white;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: filter 0.15s ease, transform 0.1s ease;
}
.btn-primary:hover { filter: brightness(1.08); }
.btn-primary:active { transform: scale(0.98); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
}

.alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.4;
}
.alert-error { background: var(--danger-soft); color: var(--danger); }
.alert-success { background: var(--success-soft); color: var(--success); }

.pw-req {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  transition: color 0.15s ease;
}
.pw-req.met { color: var(--success); }
.pw-req.taken { color: var(--danger); }

/* ───────── Desktop / PC layout for communities ───────── */
.cd-page { max-width: 960px; margin: 0 auto; }
.cd-hide-mobile { display: none; }

@media (min-width: 1024px) {
  .cd-page .btn-primary {
    width: fit-content;
    padding-left: 20px;
    padding-right: 20px;
  }

  .cd-overlay > *      { width: 100%; max-width: 900px;  margin-left: auto; margin-right: auto; }
  .cd-overlay-wide > * { width: 100%; max-width: 1100px; margin-left: auto; margin-right: auto; }

  .cd-settings-body {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 32px;
    align-items: start;
  }
  .cd-hide-mobile { display: block !important; }
}