"use client";

import { useState, useRef } from "react";

const QUICK_EMOJIS = ["❤️", "😢", "😂", "🅾️", "💀", "🙂"];

export default function MessageActionSheet({
  message,
  currentUserId,
  onReact,
  onEdit,
  onReply,
  onForward,
  onCopyText,
  onMarkUnread,
  onMention,
  onCopyLink,
  onCopyId,
  onDelete,
}) {
  const [open, setOpen] = useState(false);
  const pressTimer = useRef(null);

  function startPress() {
    pressTimer.current = setTimeout(() => setOpen(true), 400);
  }

  function cancelPress() {
    clearTimeout(pressTimer.current);
  }

  const isOwner = message.authorId === currentUserId;

  return (
    <>
      <div
        onTouchStart={startPress}
        onTouchEnd={cancelPress}
        onMouseDown={startPress}
        onMouseUp={cancelPress}
      >
        {/* your existing message bubble renders here */}
      </div>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 50,
            display: "flex",
            alignItems: "flex-end",
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              width: "100%",
              background: "#1e1f22",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              paddingBottom: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "center", gap: 14, padding: "16px 12px" }}>
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => { onReact(e); setOpen(false); }}
                  style={{ fontSize: 26, background: "none", border: "none" }}
                >
                  {e}
                </button>
              ))}
            </div>

            <SheetRow icon="✏️" label="Edit Message" show={isOwner} onClick={() => { onEdit(); setOpen(false); }} />
            <SheetRow icon="↩️" label="Reply" onClick={() => { onReply(); setOpen(false); }} />
            <SheetRow icon="➡️" label="Forward" onClick={() => { onForward(); setOpen(false); }} />
            <div style={{ height: 8 }} />
            <SheetRow icon="📋" label="Copy Text" onClick={() => { onCopyText(); setOpen(false); }} />
            <SheetRow icon="👤" label="Mark Unread" onClick={() => { onMarkUnread(); setOpen(false); }} />
            <SheetRow icon="@" label="Mention" onClick={() => { onMention(); setOpen(false); }} />
            <SheetRow icon="🔗" label="Copy Message Link" onClick={() => { onCopyLink(); setOpen(false); }} />
            <SheetRow icon="🆔" label="Copy Message ID" onClick={() => { onCopyId(); setOpen(false); }} />
            <div style={{ height: 8 }} />
            <SheetRow
              icon="🗑️"
              label="Delete Message"
              show={isOwner}
              danger
              onClick={() => { onDelete(); setOpen(false); }}
            />
          </div>
        </div>
      )}
    </>
  );
}

function SheetRow({ icon, label, onClick, show = true, danger = false }) {
  if (!show) return null;
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        padding: "12px 20px",
        background: "none",
        border: "none",
        color: danger ? "#f23f42" : "#fff",
        fontSize: 16,
        textAlign: "left",
      }}
    >
      <span style={{ width: 22 }}>{icon}</span>
      {label}
    </button>
  );
}