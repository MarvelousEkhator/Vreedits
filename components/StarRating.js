// components/StarRating.js
"use client";
import { useState } from "react";

export default function StarRating({ value, onChange, size = 34, label = "Rating" }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{ display: "flex", gap: 6, justifyContent: "center" }}
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          style={{ background: "none", border: "none", padding: 2, cursor: "pointer", lineHeight: 0 }}
        >
          <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
              fill={n <= shown ? "#f5b301" : "none"}
              stroke={n <= shown ? "#f5b301" : "#9aa7b2"}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ))}
    </div>
  );
}