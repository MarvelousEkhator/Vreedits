"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";

function NewProjectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const businessId = searchParams.get("businessId") || null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          businessId: businessId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create project.");
        setSaving(false);
        return;
      }
      router.push(`/projects/${data.project.id}`);
    } catch {
      setError("Network error.");
      setSaving(false);
    }
  }

  const backHref = businessId ? "/business/dashboard" : "/projects";

  return (
    <div className="px-4 pt-6 pb-10" style={{ maxWidth: 560, margin: "0 auto" }}>
      <Link href={backHref} className="flex items-center gap-2 mb-4" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={16} /> Back
      </Link>

      <h1 className="text-xl font-semibold mb-4">New Project</h1>

      <form onSubmit={handleCreate} className="flex flex-col gap-3">
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>
            Name
          </label>
          <input
            className="input"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>
            Description (optional)
          </label>
          <textarea
            className="input"
            placeholder="What's this project about?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            style={{ resize: "none" }}
          />
        </div>

        {error && <p className="text-sm" style={{ color: "#e55" }}>{error}</p>}

        <button
          type="submit"
          className="btn btn-primary flex items-center justify-center gap-2"
          disabled={saving || !name.trim()}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : "Create Project"}
        </button>
      </form>
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <Suspense fallback={null}>
      <NewProjectInner />
    </Suspense>
  );
}