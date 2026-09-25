"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import NavShell from "@/components/NavShell";
import ProfileClient from "@/components/ProfileClient";

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSession = useCallback(async () => {
    setError("");
    try {
      const sessionRes = await fetch("/api/auth/session");
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok || !sessionData?.user?.id) {
        throw new Error("Could not load your session.");
      }
      setUser(sessionData.user);
    } catch (err) {
      setError(err.message || "Something went wrong loading your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

  if (loading) {
    return (
      <NavShell user={user}>
        <div className="min-h-[60vh] flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      </NavShell>
    );
  }

  if (error || !user) {
    return (
      <NavShell user={user}>
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center gap-2" style={{ color: "var(--text-muted)" }}>
          <AlertCircle size={22} />
          <p className="text-sm">{error || "Could not load your profile."}</p>
        </div>
      </NavShell>
    );
  }

  return (
    <NavShell user={user}>
      <ProfileClient profileId={user.id} />
    </NavShell>
  );
}