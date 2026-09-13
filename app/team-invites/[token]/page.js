"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function AcceptInvitePage() {
  const { token } = useParams();
  const router = useRouter();
  const [status, setStatus] = useState("loading"); // "loading" | "success" | "error"
  const [error, setError] = useState("");
  const [businessId, setBusinessId] = useState(null);

  useEffect(() => {
    async function accept() {
      try {
        const res = await fetch(`/api/team-invites/${token}/accept`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) {
          setStatus("error");
          setError(data.error || "This invite could not be accepted.");
          return;
        }
        setBusinessId(data.businessId);
        setStatus("success");
      } catch {
        setStatus("error");
        setError("Network error.");
      }
    }
    accept();
  }, [token]);

  return (
    <div className="flex flex-col items-center justify-center gap-3" style={{ height: "80vh", padding: 24, textAlign: "center" }}>
      {status === "loading" && (
        <>
          <Loader2 size={28} className="animate-spin" />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Accepting invite…</p>
        </>
      )}
      {status === "success" && (
        <>
          <CheckCircle size={32} style={{ color: "#3ba55d" }} />
          <p className="text-sm font-medium">You've joined the team!</p>
          <button className="btn btn-primary mt-2" onClick={() => router.push(`/business/dashboard`)}>
            Go to Dashboard
          </button>
        </>
      )}
      {status === "error" && (
        <>
          <XCircle size={32} style={{ color: "#e55" }} />
          <p className="text-sm">{error}</p>
        </>
      )}
    </div>
  );
}