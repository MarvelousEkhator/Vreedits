"use client";
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Play, Circle } from "lucide-react";
import { EditorView } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { yCollab } from "y-codemirror.next";
import { useCodeRoomSync } from "@/hooks/useCodeRoomSync";
import { CODE_ROOM_LANGUAGES, getLanguageExtension } from "@/lib/codeRoomLanguages";

const STATUS_LABEL = {
  connecting: "Connecting…",
  connected: "Live",
  disconnected: "Offline — reconnecting…",
};

export default function CodeRoomEditorPage() {
  const params = useParams();
  const { projectId, roomId } = params;

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState(null);

  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const languageCompartmentRef = useRef(new Compartment());
  const initializedRef = useRef(false);
  const saveTimeoutRef = useRef(null);

  const { ytext, provider, status } = useCodeRoomSync(roomId, room?.host);

  // Load room metadata (name, saved code snapshot, language) once.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/coderooms/${roomId}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setRoom(data.codeRoom);
          setLanguage(data.codeRoom.language || "javascript");
        } else {
          setError(data.error || "Could not load room.");
        }
      } catch {
        if (!cancelled) setError("Network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId, roomId]);

  // Seed the Yjs doc with the saved snapshot the first time it's empty
  // (i.e. this is the first person opening the room since a server restart).
  useEffect(() => {
    if (!room || !provider || initializedRef.current) return;
    if (status !== "connected") return;

    if (ytext.length === 0 && room.code) {
      ytext.insert(0, room.code);
    }
    initializedRef.current = true;
  }, [room, provider, status, ytext]);

  // Create the CodeMirror view once the container and Yjs text are ready.
  useEffect(() => {
    if (!editorRef.current || !provider || viewRef.current) return;

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        basicSetup,
        EditorView.lineWrapping, // avoids horizontal scroll fights on phones
        EditorView.theme({
          "&": { fontSize: "16px", height: "100%" }, // 16px avoids iOS auto-zoom on focus
          ".cm-scroller": { overflow: "auto", WebkitOverflowScrolling: "touch" },
        }),
        languageCompartmentRef.current.of(getLanguageExtension(language)),
        yCollab(ytext, provider.awareness),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, ytext]);

  // Swap the language extension in place when the dropdown changes,
  // without tearing down the editor or the live collaboration binding.
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: languageCompartmentRef.current.reconfigure(getLanguageExtension(language)),
    });
  }, [language]);

  // Debounced autosave: flush current text to Postgres a few seconds
  // after typing stops. This is a backup snapshot — the live state
  // lives in the Yjs doc, synced over the WebSocket in real time.
  useEffect(() => {
    if (!provider) return;

    const onUpdate = () => {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        fetch(`/api/projects/${projectId}/coderooms/${roomId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: ytext.toString() }),
        }).catch(() => {});
      }, 3000);
    };

    ytext.observe(onUpdate);
    return () => {
      ytext.unobserve(onUpdate);
      clearTimeout(saveTimeoutRef.current);
    };
  }, [provider, ytext, projectId, roomId]);

  // Final flush when leaving the room.
  useEffect(() => {
    return () => {
      if (!ytext) return;
      fetch(`/api/projects/${projectId}/coderooms/${roomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: ytext.toString() }),
        keepalive: true,
      }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLanguageChange(e) {
    const next = e.target.value;
    setLanguage(next);
    fetch(`/api/projects/${projectId}/coderooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: next }),
    }).catch(() => {});
  }

  async function handleRun() {
    setRunning(true);
    setOutput(null);
    try {
      const res = await fetch("/api/coderoom/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code: ytext.toString() }),
      });
      const data = await res.json();
      setOutput(res.ok ? data : { error: data.error || "Run failed." });
    } catch {
      setOutput({ error: "Network error." });
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center" style={{ height: "60vh" }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="px-4 pt-6" style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link href={`/projects/${projectId}`} className="flex items-center gap-2 mb-4" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft size={16} /> Back
        </Link>
        <p className="text-sm" style={{ color: "#e55" }}>{error || "Room not found."}</p>
      </div>
    );
  }

  const statusColor = status === "connected" ? "#3ba55d" : status === "connecting" ? "var(--accent)" : "#e55";

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "var(--surface)" }}>
      <div className="px-4 pt-4 pb-2" style={{ flexShrink: 0 }}>
        <div className="flex items-center justify-between mb-2">
          <Link href={`/projects/${projectId}`} className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
            <Circle size={8} fill={statusColor} color={statusColor} />
            {STATUS_LABEL[status] || status}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-semibold" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {room.name}
          </h1>
          <div className="flex items-center gap-2 flex-shrink-0">
            <select value={language} onChange={handleLanguageChange} className="input" style={{ width: "auto", padding: "6px 8px", fontSize: 13 }}>
              {CODE_ROOM_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
            <button onClick={handleRun} disabled={running} className="btn btn-primary flex items-center gap-1" style={{ padding: "6px 12px" }}>
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Run
            </button>
          </div>
        </div>
      </div>

      <div
        ref={editorRef}
        style={{ flex: 1, overflow: "hidden", borderTop: "1px solid var(--border)", borderBottom: output ? "1px solid var(--border)" : "none" }}
      />

      {output && (
        <div className="px-4 py-3" style={{ flexShrink: 0, maxHeight: "30vh", overflowY: "auto", background: "var(--surface-2)", fontFamily: "monospace", fontSize: 13 }}>
          {output.error ? (
            <div style={{ color: "#e55" }}>{output.error}</div>
          ) : (
            <>
              {output.stdout && <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{output.stdout}</pre>}
              {output.stderr && <pre style={{ whiteSpace: "pre-wrap", margin: 0, color: "#e55" }}>{output.stderr}</pre>}
              {!output.stdout && !output.stderr && <span style={{ color: "var(--text-muted)" }}>No output.</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
}