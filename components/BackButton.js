"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// One shared back/exit arrow for the whole app.
// - Default: goes to browser history if there is any, otherwise falls back to `fallbackHref`.
// - Pass `onClick` to override with custom logic (e.g. "close this panel" instead of navigating).
export default function BackButton({ fallbackHref = "/", onClick, size = 22, label = "Back", variant = "plain" }) {
  const router = useRouter();

  function handleClick() {
    if (onClick) {
      onClick();
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  const style =
    variant === "circle"
      ? {
          width: 34, height: 34, borderRadius: 10, border: "1px solid var(--border)",
          background: "var(--surface-2)", color: "var(--text-muted)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }
      : { background: "none", border: "none", color: "var(--text)", padding: 0 };

  return (
    <button type="button" onClick={handleClick} aria-label={label} className="tappable" style={style}>
      <ArrowLeft size={size} />
    </button>
  );
}