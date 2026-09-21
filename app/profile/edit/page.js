"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2, Camera, ChevronRight, X } from "lucide-react";
import NavShell from "@/components/NavShell";
import AvatarCropper from "@/components/AvatarCropper";

const MAX_UPLOAD_BYTES = 1_000_000;
const MAX_BIO_LENGTH = 150;

function FieldSheet({ label, value, onSave, onClose, multiline, maxLength }) {
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) onClose();
    else setError("Could not save. Try again.");
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 400 }}
      />
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0,
          background: "var(--surface)", borderRadius: "20px 20px 0 0",
          zIndex: 401, padding: 16,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">{label}</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>
        {error && <div className="alert alert-error mb-2">{error}</div>}
        {multiline ? (
          <textarea
            className="input pl-3 mb-2"
            style={{ minHeight: 90, resize: "vertical", paddingTop: 10 }}
            value={draft}
            maxLength={maxLength}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
        ) : (
          <input
            className="input mb-2"
            value={draft}
            maxLength={maxLength}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
        )}
        {maxLength && (
          <div className="text-xs mb-2" style={{ color: "var(--text-muted)", textAlign: "right" }}>
            {draft.length}/{maxLength}
          </div>
        )}
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : "Save"}
        </button>
      </div>
    </>
  );
}

export default function EditProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [cropSource, setCropSource] = useState(null);
  const [activeField, setActiveField] = useState(null); // "displayName" | "username" | "bio" | null
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef(null);

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/profile");
    }
  }

  async function loadEverything() {
    try {
      const [sessionRes, profileRes] = await Promise.all([
        fetch("/api/auth/session"),
        fetch("/api/profile"),
      ]);
      const sessionData = await sessionRes.json();
      if (!profileRes.ok) throw new Error(`Profile request failed (${profileRes.status})`);
      const profileData = await profileRes.json();
      setUser(sessionData.user);
      setProfile(profileData.profile);
    } catch (err) {
      setError(`Could not load your profile: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEverything(); }, []);

  async function saveField(field, value) {
    setSuccess("");
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save changes.");
        return false;
      }
      setProfile(data.profile);
      setSuccess("Saved.");
      return true;
    } catch {
      setError("Network error. Please try again.");
      return false;
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setSuccess("");
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Image is too large — please choose one under 1MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setCropSource(dataUrl);
    e.target.value = "";
  }

  async function handleCropSave(croppedDataUrl) {
    setCropSource(null);
    setUploading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: croppedDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed.");
        return;
      }
      setProfile((p) => ({ ...p, avatarDataUrl: croppedDataUrl }));
      setSuccess("Profile picture updated.");
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <NavShell user={user}>
        <div className="min-h-[60vh] flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      </NavShell>
    );
  }

  const ROWS = [
    { key: "displayName", label: "Name", value: profile?.displayName, multiline: false, maxLength: 50 },
    { key: "username", label: "Username", value: profile?.username, multiline: false, maxLength: 30 },
    { key: "bio", label: "Bio", value: profile?.bio || "", multiline: true, maxLength: MAX_BIO_LENGTH },
  ];

  return (
    <NavShell user={user}>
      {cropSource && (
        <AvatarCropper imageSrc={cropSource} onCancel={() => setCropSource(null)} onSave={handleCropSave} />
      )}
      <div className="min-h-screen flex flex-col items-center px-4 pb-16">
        <div className="w-full max-w-[480px] mt-4">
          <div className="flex items-center gap-3 mb-6">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Back"
              style={{ background: "none", border: "none", color: "var(--text)", padding: 0 }}
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-semibold">Edit profile</h1>
          </div>

          {error && <div className="alert alert-error mb-4"><AlertCircle size={15} />{error}</div>}
          {success && <div className="alert alert-success mb-4"><CheckCircle2 size={15} />{success}</div>}

          <div className="flex flex-col items-center mb-6">
            <div className="relative">
              {profile?.avatarDataUrl ? (
                <img
                  src={profile.avatarDataUrl}
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-cover"
                  style={{ boxShadow: "0 0 0 3px var(--border)" }}
                />
              ) : (
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-semibold"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)", fontFamily: "var(--font-display)" }}
                >
                  {profile?.username?.slice(0, 2).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "var(--accent)", color: "white" }}
                aria-label="Change photo"
                disabled={uploading}
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-text mt-2 text-sm"
            >
              Change photo
            </button>
          </div>

          <div className="card" style={{ padding: 6 }}>
            {ROWS.map((row, i) => (
              <button
                key={row.key}
                onClick={() => setActiveField(row.key)}
                className="flex items-center justify-between w-full p-3 rounded-xl text-left"
                style={{
                  background: "none", border: "none",
                  borderBottom: i < ROWS.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <span className="text-sm font-medium">{row.label}</span>
                <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                  <span
                    className="text-sm"
                    style={{
                      color: "var(--text-muted)", maxWidth: 160, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {row.value || "—"}
                  </span>
                  <ChevronRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeField && (
        <FieldSheet
          label={ROWS.find((r) => r.key === activeField).label}
          value={ROWS.find((r) => r.key === activeField).value}
          multiline={ROWS.find((r) => r.key === activeField).multiline}
          maxLength={ROWS.find((r) => r.key === activeField).maxLength}
          onSave={(val) => saveField(activeField, val)}
          onClose={() => setActiveField(null)}
        />
      )}
    </NavShell>
  );
}
