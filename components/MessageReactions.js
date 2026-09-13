"use client";

import { useState } from "react";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export default function MessageReactions({ messageId, initialGrouped, currentUserId }) {
  const [grouped, setGrouped] = useState(initialGrouped || {});
  const [pickerOpen, setPickerOpen] = useState(false);

  async function toggleReaction(emoji) {
    // optimistic update
    setGrouped((prev) => {
      const next = { ...prev };
      const list = next[emoji] ? [...next[emoji]] : [];
      const idx = list.indexOf(currentUserId);
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        list.push(currentUserId);
      }
      if (list.length === 0) {
        delete next[emoji];
      } else {
        next[emoji] = list;
      }
      return next;
    });

    setPickerOpen(false);

    await fetch(`/api/messages/${messageId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
      {Object.entries(grouped).map(([emoji, userIds]) => (
        <button
          key={emoji}
          onClick={() => toggleReaction(emoji)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 12,
            border: userIds.includes(currentUserId)
              ? "1px solid #5865f2"
              : "1px solid #333",
            background: userIds.includes(currentUserId)
              ? "rgba(88,101,242,0.15)"
              : "transparent",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <span>{emoji}</span>
          <span>{userIds.length}</span>
        </button>
      ))}

      <div style={{ position: "relative" }}>
        <button
          onClick={() => setPickerOpen((v) => !v)}
          style={{
            padding: "2px 8px",
            borderRadius: 12,
            border: "1px solid #333",
            background: "transparent",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          +
        </button>
        {pickerOpen && (
          <div
            style={{
              position: "absolute",
              bottom: "120%",
              left: 0,
              display: "flex",
              gap: 4,
              padding: 6,
              background: "#1e1f22",
              border: "1px solid #333",
              borderRadius: 8,
              zIndex: 10,
            }}
          >
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => toggleReaction(e)}
                style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer" }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}