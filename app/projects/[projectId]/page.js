"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Plus, Code2, CheckSquare, Trash2, Check } from "lucide-react";

function TaskStatusBadge({ status }) {
  const colors = {
    todo: "var(--text-muted)",
    in_progress: "var(--accent)",
    done: "#3ba55d",
  };
  const labels = {
    todo: "To do",
    in_progress: "In progress",
    done: "Done",
  };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: colors[status] || "var(--text-muted)",
        background: "var(--surface-2)",
        borderRadius: 6,
        padding: "2px 8px",
      }}
    >
      {labels[status] || status}
    </span>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.projectId;

  const [project, setProject] = useState(null);
  const [codeRooms, setCodeRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [error, setError] = useState("");

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);

  const loadProject = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      if (res.ok) {
        setProject(data.project);
      } else {
        setError(data.error || "Could not load project.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadCodeRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/coderooms`);
      const data = await res.json();
      if (res.ok) setCodeRooms(data.codeRooms || []);
    } finally {
      setLoadingRooms(false);
    }
  }, [projectId]);

  useEffect(() => { loadProject(); }, [loadProject]);
  useEffect(() => { loadCodeRooms(); }, [loadCodeRooms]);

  async function handleAddTask(e) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    setAddingTask(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTaskTitle.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setProject((p) => ({ ...p, tasks: [...(p.tasks || []), data.task] }));
        setNewTaskTitle("");
      }
    } finally {
      setAddingTask(false);
    }
  }

  async function toggleTaskDone(task) {
    const nextStatus = task.status === "done" ? "todo" : "done";
    // optimistic update
    setProject((p) => ({
      ...p,
      tasks: p.tasks.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)),
    }));
    await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
  }

  async function deleteTask(taskId) {
    setProject((p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== taskId) }));
    await fetch(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
  }

  async function handleCreateRoom(e) {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    setCreatingRoom(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/coderooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRoomName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setCodeRooms((rooms) => [data.codeRoom, ...rooms]);
        setNewRoomName("");
        setNewRoomOpen(false);
      }
    } finally {
      setCreatingRoom(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center" style={{ height: "60vh" }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="px-4 pt-6" style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link href="/business/dashboard" className="flex items-center gap-2 mb-4" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft size={16} /> Back
        </Link>
        <p className="text-sm" style={{ color: "#e55" }}>{error || "Project not found."}</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-10" style={{ maxWidth: 720, margin: "0 auto" }}>
      <Link href="/business/dashboard" className="flex items-center gap-2 mb-4" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={16} /> Back
      </Link>

      <h1 className="text-xl font-semibold mb-1">{project.name}</h1>
      {project.description && (
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>{project.description}</p>
      )}
      {!project.description && <div className="mb-6" />}

      {/* Tasks */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <CheckSquare size={14} /> Tasks
        </h2>
      </div>

      <div className="flex flex-col gap-2 mb-3">
        {(project.tasks || []).length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No tasks yet.</p>
        )}
        {(project.tasks || []).map((task) => (
          <div key={task.id} className="card p-3 flex items-center justify-between gap-2">
            <button
              onClick={() => toggleTaskDone(task)}
              className="flex items-center gap-2 flex-1"
              style={{ textAlign: "left", background: "none", border: "none" }}
            >
              <span
                style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  border: `1.5px solid ${task.status === "done" ? "#3ba55d" : "var(--border)"}`,
                  background: task.status === "done" ? "#3ba55d" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {task.status === "done" && <Check size={12} color="white" />}
              </span>
              <span
                className="text-sm"
                style={{ textDecoration: task.status === "done" ? "line-through" : "none", color: task.status === "done" ? "var(--text-muted)" : "var(--text)" }}
              >
                {task.title}
              </span>
            </button>
            <div className="flex items-center gap-2">
              <TaskStatusBadge status={task.status} />
              <button onClick={() => deleteTask(task.id)} aria-label="Delete task" style={{ color: "var(--text-muted)", background: "none", border: "none" }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleAddTask} className="flex gap-2 mb-6">
        <input
          className="input"
          placeholder="Add a task…"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={addingTask || !newTaskTitle.trim()}>
          {addingTask ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </button>
      </form>

      {/* Code Rooms */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Code2 size={14} /> Code Rooms
        </h2>
        <button
          onClick={() => setNewRoomOpen((v) => !v)}
          className="text-xs flex items-center gap-1"
          style={{ color: "var(--accent)", background: "none", border: "none" }}
        >
          <Plus size={13} /> New room
        </button>
      </div>

      {newRoomOpen && (
        <form onSubmit={handleCreateRoom} className="flex gap-2 mb-3">
          <input
            className="input"
            placeholder="Room name…"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn btn-primary" disabled={creatingRoom || !newRoomName.trim()}>
            {creatingRoom ? <Loader2 size={14} className="animate-spin" /> : "Create"}
          </button>
        </form>
      )}

      {loadingRooms ? (
        <Loader2 size={16} className="animate-spin" />
      ) : codeRooms.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No code rooms yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {codeRooms.map((room) => (
            <Link
              key={room.id}
              href={`/projects/${projectId}/coderooms/${room.id}`}
              className="card p-3 flex items-center justify-between"
            >
              <div>
                <div className="text-sm font-medium">{room.name}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {room.language} · hosted by {room.host?.displayName || room.host?.username}
                </div>
              </div>
              <Code2 size={16} style={{ color: "var(--text-muted)" }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}