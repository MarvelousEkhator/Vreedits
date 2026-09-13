"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Loader2, Users, FileText, Plus, ArrowLeft } from "lucide-react";

function StatusBadge({ status }) {
  const colors = {
    draft: "var(--text-muted)",
    sent: "var(--accent)",
    paid: "#3ba55d",
    overdue: "#e55",
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
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

export default function BusinessDashboard() {
  const [businesses, setBusinesses] = useState([]);
  const [activeBusinessId, setActiveBusinessId] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [error, setError] = useState("");

  const loadBusinesses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/business");
      const data = await res.json();
      if (res.ok) {
        setBusinesses(data.businesses || []);
        if (data.businesses?.length > 0) setActiveBusinessId(data.businesses[0].id);
      } else {
        setError(data.error || "Could not load businesses.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInvoices = useCallback(async (businessId) => {
    if (!businessId) return;
    setLoadingInvoices(true);
    try {
      const res = await fetch(`/api/business/${businessId}/invoices`);
      const data = await res.json();
      if (res.ok) setInvoices(data.invoices || []);
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  useEffect(() => { loadBusinesses(); }, [loadBusinesses]);
  useEffect(() => { loadInvoices(activeBusinessId); }, [activeBusinessId, loadInvoices]);

  const activeBusiness = businesses.find((b) => b.id === activeBusinessId);

  const totals = invoices.reduce(
    (acc, inv) => {
      const sum = (inv.items || []).reduce((s, i) => s + (i.quantity || 1) * (i.unitPrice || 0), 0);
      acc.total += sum;
      if (inv.status === "paid") acc.paid += sum;
      if (inv.status === "sent" || inv.status === "overdue") acc.outstanding += sum;
      return acc;
    },
    { total: 0, paid: 0, outstanding: 0 }
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center" style={{ height: "60vh" }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (businesses.length === 0) {
    return (
      <div className="px-4 pt-6" style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link href="/business" className="flex items-center gap-2 mb-4" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft size={16} /> Back
        </Link>
        <h1 className="text-xl font-semibold mb-2">Business Dashboard</h1>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          You don't have a business set up yet.
        </p>
        <CreateBusinessButton onCreated={loadBusinesses} />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-10" style={{ maxWidth: 720, margin: "0 auto" }}>
      <Link href="/business" className="flex items-center gap-2 mb-4" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={16} /> Back
      </Link>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">{activeBusiness?.name || "Business Dashboard"}</h1>
        {businesses.length > 1 && (
          <select
            value={activeBusinessId || ""}
            onChange={(e) => setActiveBusinessId(e.target.value)}
            className="input"
            style={{ width: "auto", padding: "6px 10px" }}
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="card p-3">
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Total billed</div>
          <div className="text-lg font-semibold">${totals.total.toFixed(2)}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Paid</div>
          <div className="text-lg font-semibold" style={{ color: "#3ba55d" }}>${totals.paid.toFixed(2)}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Outstanding</div>
          <div className="text-lg font-semibold" style={{ color: "var(--accent)" }}>${totals.outstanding.toFixed(2)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Users size={14} /> Team
        </h2>
        <Link href={`/business/${activeBusinessId}/team`} className="text-xs" style={{ color: "var(--accent)" }}>
          Manage
        </Link>
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {activeBusiness?.members?.map((m) => (
          <span
            key={m.id}
            className="text-xs px-2 py-1 rounded-full"
            style={{ background: "var(--surface-2)" }}
          >
            {m.user?.name || m.user?.email} · {m.role}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <FileText size={14} /> Invoices
        </h2>
        <Link
          href={`/business/${activeBusinessId}/invoices/new`}
          className="text-xs flex items-center gap-1"
          style={{ color: "var(--accent)" }}
        >
          <Plus size={13} /> New invoice
        </Link>
      </div>

      {loadingInvoices ? (
        <Loader2 size={16} className="animate-spin" />
      ) : invoices.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No invoices yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {invoices.map((inv) => {
            const sum = (inv.items || []).reduce((s, i) => s + (i.quantity || 1) * (i.unitPrice || 0), 0);
            return (
              <Link
                key={inv.id}
                href={`/business/${activeBusinessId}/invoices/${inv.id}`}
                className="card p-3 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium">{inv.clientName}</div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {inv.dueDate ? `Due ${new Date(inv.dueDate).toLocaleDateString()}` : "No due date"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">${sum.toFixed(2)}</span>
                  <StatusBadge status={inv.status} />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm mt-4" style={{ color: "#e55" }}>{error}</p>}
    </div>
  );
}

function CreateBusinessButton({ onCreated }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-2">
      <input
        className="input"
        placeholder="Business name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !name.trim()}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : "Create"}
      </button>
    </div>
  );
}