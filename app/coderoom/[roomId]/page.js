"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, Loader2 } from "lucide-react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import Editor from "@monaco-editor/react";

const SYNC_SERVER_URL = process.env.NEXT_PUBLIC_CODEROOM_SYNC_URL;
const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";

const DEFAULT_CODE = {
  javascript: "console.log('Hello from JavaScript!');",
  python: "print('Hello from Python!')",
  html: "<!DOCTYPE html>\n<html>\n  <body>\n    <h1>Hello!</h1>\n  </body>\n</html>",
};

let pyodideLoadPromise = null;
function loadPyodide() {
  if (pyodideLoadPromise) return pyodideLoadPromise;
  pyodideLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PYODIDE_CDN;
    script.onload = async () => {
      try {
        resolve(await window.loadPyodide());
      } catch (err) {
        reject(err);
      }
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
  return pyodideLoadPromise;
}

export default function CodeRoomPage() {
  const { roomId } = useParams();
  const editorRef = useRef(null);
  const providerRef = useRef(null);
  const ydocRef = useRef(null);
  const pyodideRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState(null);
  const [language, setLanguage] = useState("javascript");
  const [output, setOutput] = useState("");
  const [previewSrcDoc, setPreviewSrcDoc] = useState("");
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/coderooms/${roomId}`);
        const data = await res.json();
        if (res.ok) {
          setRoom(data.room);
          setLanguage(data.room.language || "javascript");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [roomId]);

  const handleEditorMount = useCallback((editor) => {
    editorRef.current = editor;

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const provider = new WebsocketProvider(SYNC_SERVER_URL, `coderoom-${roomId}`, ydoc);
    providerRef.current = provider;

    provider.on("status", ({ status }) => setConnected(status === "connected"));

    const yText = ydoc.getText("monaco");
    new MonacoBinding(yText, editor.getModel(), new Set([editor]), provider.awareness);
  }, [roomId]);

  useEffect(() => {
    return () => {
      providerRef.current?.destroy();
      ydocRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const code = editorRef.current?.getValue();
      if (code !== undefined) {
        fetch(`/api/coderooms/${roomId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, language }),
        }).catch(() => {});
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [roomId, language]);

  async function handleLanguageChange(e) {
    const next = e.target.value;
    setLanguage(next);
    setOutput("");
    setPreviewSrcDoc("");
    await fetch(`/api/coderooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: next }),
    }).catch(() => {});
  }

  function runJavaScript(code) {
    return new Promise((resolve) => {
      const iframe = document.createElement("iframe");
      iframe.sandbox = "allow-scripts";
      iframe.style.display = "none";
      document.body.appendChild(iframe);

      let collected = "";
      const listener = (event) => {
        if (event.source !== iframe.contentWindow) return;
        if (event.data?.type === "log") collected += event.data.text + "\n";
        else if (event.data?.type === "error") collected += "Error: " + event.data.text + "\n";
        else if (event.data?.type === "done") {
          window.removeEventListener("message", listener);
          document.body.removeChild(iframe);
          resolve(collected);
        }
      };
      window.addEventListener("message", listener);

      iframe.srcdoc = `
        <script>
          const send = (type, text) => parent.postMessage({ type, text }, "*");
          console.log = (...args) => send("log", args.map(String).join(" "));
          console.error = (...args) => send("error", args.map(String).join(" "));
          try { ${code} } catch (e) { send("error", e.message); }
          send("done", "");
        </script>
      `;

      setTimeout(() => {
        if (document.body.contains(iframe)) {
          window.removeEventListener("message", listener);
          document.body.removeChild(iframe);
          resolve(collected + "(stopped — took too long)\n");
        }
      }, 5000);
    });
  }

  async function runPython(code) {
    if (!pyodideRef.current) {
      try {
        pyodideRef.current = await loadPyodide();
      } catch {
        return "Failed to load Python runtime. Check your connection and try again.\n";
      }
    }

    const pyodide = pyodideRef.current;
    let collected = "";
    pyodide.setStdout({ batched: (text) => { collected += text + "\n"; } });
    pyodide.setStderr({ batched: (text) => { collected += "Error: " + text + "\n"; } });

    try {
      await pyodide.runPythonAsync(code);
    } catch (err) {
      collected += "Error: " + err.message + "\n";
    }
    return collected;
  }

  async function runCode() {
    const code = editorRef.current?.getValue() || "";
    setRunning(true);

    if (language === "html") {
      // No "output" to capture — just render it in a live sandboxed preview.
      setPreviewSrcDoc(code);
      setRunning(false);
      return;
    }

    setOutput("Running…\n");
    const result = language === "python" ? await runPython(code) : await runJavaScript(code);
    setOutput(result || "(no output)\n");
    setRunning(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center" style={{ height: "60vh" }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="px-4 pt-6" style={{ maxWidth: 900, margin: "0 auto" }}>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Room not found.</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-10" style={{ maxWidth: 900, margin: "0 auto" }}>
      <Link href="/business/dashboard" className="flex items-center gap-2 mb-4" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={16} /> Back
      </Link>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">{room.name}</h1>
        <div className="flex items-center gap-2">
          <select value={language} onChange={handleLanguageChange} className="input" style={{ width: "auto", padding: "6px 10px" }}>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="html">HTML</option>
          </select>
          <span
            className="text-xs px-2 py-1 rounded-full"
            style={{ background: "var(--surface-2)", color: connected ? "#3ba55d" : "var(--text-muted)" }}
          >
            {connected ? "Live" : "Connecting…"}
          </span>
          <button onClick={runCode} disabled={running} className="btn btn-primary flex items-center gap-2">
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {language === "html" ? "Preview" : "Run"}
          </button>
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden", marginBottom: 12 }}>
        <Editor
          height="45vh"
          language={language === "html" ? "html" : language}
          defaultValue={room.code || DEFAULT_CODE[language]}
          theme="vs-dark"
          onMount={handleEditorMount}
          options={{ minimap: { enabled: false }, fontSize: 14 }}
        />
      </div>

      {language === "html" ? (
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="text-xs p-2" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
            Preview
          </div>
          <iframe
            sandbox="allow-scripts"
            srcDoc={previewSrcDoc}
            style={{ width: "100%", height: "40vh", border: "none", background: "white" }}
          />
        </div>
      ) : (
        <div className="card p-3">
          <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Output</div>
          <pre style={{ fontSize: 13, whiteSpace: "pre-wrap", margin: 0 }}>
            {output || "(nothing yet — click Run)"}
          </pre>
        </div>
      )}
    </div>
  );
}