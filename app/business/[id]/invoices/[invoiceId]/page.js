"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

const STATUSES = ["draft", "sent", "paid", "overdue"];

export default function InvoiceDetailPage() {
  const { id: businessId, invoiceId } = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  const loadInvoice = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/business/${businessId}/invoices`);
      const data = await res.json();
      if (res.ok) {
        const found = (data.invoices || []).find((i) => i.id === invoiceId);
        setInvoice(found || null);
      } else {
        setError(data.error || "Could not load invoice.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [businessId, invoiceId]);

  useEffect(() => { loadInvoice(); }, [loadInvoice]);

  async function updateStatus(status) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/business/${businessId}/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (res.ok) setInvoice(data.invoice);
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this invoice? This can't be undone.")) return;
    await fetch(`/api/business/${businessId}/invoices/${invoiceId}`, { method: "DELETE" });
    router.push("/business/dashboard");
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center" style={{ height: "60vh" }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="px-4 pt-6" style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link href="/business/dashboard" className="flex items-center gap-2 mb-4" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft size={16} /> Back
        </Link>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{error || "Invoice not found."}</p>
      </div>
    );
  }

  const total = (invoice.items || []).reduce(
    (sum, i) => sum + (i.quantity || 1) * (i.unitPrice || 0),
    0
  );

  return (
    <div className="px-4 pt-6 pb-10" style={{ maxWidth: 720, margin: "0 auto" }}>
      <Link href="/business/dashboard" className="flex items-center gap-2 mb-4" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>

      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold">{invoice.clientName}</h1>
        <button onClick={handleDelete} style={{ color: "#e55" }}>
          <Trash2 size={18} />
        </button>
      </div>
      {invoice.dueDate && (
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Due {new Date(invoice.dueDate).toLocaleDateString()}
        </p>
      )}

      <div className="flex gap-2 mb-6">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => updateStatus(s)}
            disabled={updating}
            className="text-xs px-3 py-1.5 rounded-full"
            style={{
              textTransform: "capitalize",
              background: invoice.status === s ? "var(--accent)" : "var(--surface-2)",
              color: invoice.status === s ? "white" : "var(--text)",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {(invoice.items || []).map((item, i) => (
          <div key={i} className="card p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{item.description}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {item.quantity} × ${Number(item.unitPrice).toFixed(2)}
              </div>
            </div>
            <span className="text-sm font-semibold">
              ${(item.quantity * item.unitPrice).toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <span className="text-sm font-semibold">Total</span>
        <span className="text-lg font-semibold">${total.toFixed(2)}</span>
      </div>
    </div>
  );
}