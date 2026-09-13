"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";

function emptyItem() {
  return { description: "", quantity: 1, unitPrice: 0 };
}

export default function NewInvoicePage() {
  const { id: businessId } = useParams();
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateItem(index, field, value) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const total = items.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
    0
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const cleanItems = items
      .filter((i) => i.description.trim())
      .map((i) => ({
        description: i.description.trim(),
        quantity: Number(i.quantity) || 1,
        unitPrice: Number(i.unitPrice) || 0,
      }));

    if (!clientName.trim() || cleanItems.length === 0) {
      setError("Client name and at least one line item are required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/business/${businessId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: clientName.trim(),
          items: cleanItems,
          dueDate: dueDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create invoice.");
        return;
      }
      router.push(`/business/${businessId}/invoices/${data.invoice.id}`);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pt-6 pb-10" style={{ maxWidth: 720, margin: "0 auto" }}>
      <Link href="/business/dashboard" className="flex items-center gap-2 mb-4" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>

      <h1 className="text-xl font-semibold mb-4">New Invoice</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Client name</label>
          <input
            className="input"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="e.g. Acme Co."
            required
          />
        </div>

        <div>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Due date (optional)</label>
          <input
            type="date"
            className="input"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs" style={{ color: "var(--text-muted)" }}>Line items</label>
            <button type="button" onClick={addItem} className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }}>
              <Plus size={13} /> Add item
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {items.map((item, i) => (
              <div key={i} className="card p-3 flex flex-col gap-2">
                <input
                  className="input"
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateItem(i, "description", e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    className="input"
                    style={{ width: 80 }}
                    value={item.quantity}
                    onChange={(e) => updateItem(i, "quantity", e.target.value)}
                    placeholder="Qty"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input"
                    style={{ flex: 1 }}
                    value={item.unitPrice}
                    onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
                    placeholder="Unit price"
                  />
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} style={{ color: "var(--text-muted)" }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-lg font-semibold">${total.toFixed(2)}</span>
        </div>

        {error && <p className="text-sm" style={{ color: "#e55" }}>{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : "Create Invoice"}
        </button>
      </form>
    </div>
  );
}