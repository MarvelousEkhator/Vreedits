"use client";
import { useEffect, useMemo, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

const CURSOR_COLORS = ["#e57373", "#64b5f6", "#81c784", "#ffb74d", "#ba68c8", "#4db6ac"];

// Builds the sync server URL from the current page's own origin instead
// of a hardcoded onrender.com hostname — so this keeps working whether
// you're on the current onrender.com URL, a future custom domain, or a
// local dev server, with nothing to update by hand when that changes.
function syncServerUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/coderoom-sync`;
}

export function useCodeRoomSync(roomId, user) {
  const ydoc = useMemo(() => new Y.Doc(), [roomId]);
  const [provider, setProvider] = useState(null);
  const [status, setStatus] = useState("connecting"); // connecting | connected | disconnected

  useEffect(() => {
    if (!roomId) return;

    const wsProvider = new WebsocketProvider(syncServerUrl(), roomId, ydoc);

    const color = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
    wsProvider.awareness.setLocalStateField("user", {
      name: user?.displayName || user?.username || "Anonymous",
      color,
    });

    wsProvider.on("status", (event) => setStatus(event.status));
    setProvider(wsProvider);

    return () => {
      wsProvider.destroy();
      ydoc.destroy();
      setProvider(null);
    };
  }, [roomId, ydoc, user?.displayName, user?.username]);

  const ytext = useMemo(() => ydoc.getText("codemirror"), [ydoc]);

  return { ydoc, ytext, provider, status };
}
