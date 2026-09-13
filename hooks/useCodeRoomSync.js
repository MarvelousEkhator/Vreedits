import { useEffect, useMemo } from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

export function useCodeRoomSync(roomId) {
  const ydoc = useMemo(() => new Y.Doc(), [roomId]);

  useEffect(() => {
    if (!roomId) return;

    const provider = new WebsocketProvider(
      "wss://synovra-i8yr.onrender.com/coderoom-sync",
      roomId,
      ydoc
    );

    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [roomId, ydoc]);

  return ydoc;
}