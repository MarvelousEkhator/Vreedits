"use client";
import GlossIcon from "./GlossIcon";

export default function GlossSearchBar({
  value,
  onChange,
  placeholder = "Search Vreedits",
}) {
  return (
    <div className="v-search">
      <GlossIcon name="search" size={34} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}