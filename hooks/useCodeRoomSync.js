"use client";
import { useEffect, useMemo, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

const CURSOR_COLORS = ["#e57373", "#64b5f6", "#81c784", "#ffb74d", "#ba68c8", "#4db6ac"];

export function useCodeRoomSync(roomId, user) {
  const ydoc = useMemo(() => new Y.Doc(), [roomId]);
  const [provider, setProvider] = useState(null);
  const [status, setStatus] = useState("connecting"); // connecting | connected | disconnected

  useEffect(() => {
    if (!roomId) return;

    const wsProvider = new WebsocketProvider(
      "wss://synovra-i8yr.onrender.com/coderoom-sync",
      roomId,
      ydoc
    );

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