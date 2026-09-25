"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// One shared back/exit arrow for the whole app.
//
// It never uses router.back() by default. Mixing the bottom tab bar
// (which pushes a new history entry every tap) with history-based "back"
// is what caused the arrow to sometimes land on a stale screen. Instead,
// every arrow goes to one explicit `fallbackHref` you set per screen, so
// where it takes you is always predictable, no matter how you got there.
//
// Pass `onClick` instead of relying on navigation when the arrow should
// just close a panel within the same screen (e.g. leaving Settings but
// staying inside a community) rather than change the URL.
export default function BackButton({ fallbackHref = "/feed", onClick, size = 22, label = "Back", variant = "plain" }) {
  const router = useRouter();

  function handleClick() {
    if (onClick) {
      onClick();
      return;
    }
    router.push(fallbackHref);
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