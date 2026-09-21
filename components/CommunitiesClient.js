"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, Users, Plus, Check, X, Loader2, Crown, ImageIcon, ArrowRight, ArrowLeft, UserPlus, Sparkles,
} from "lucide-react";
import GlossIcon from "@/components/GlossIcon";

const CATEGORY_OPTIONS = ["Social", "Gaming", "Education", "Technology", "Art", "Business", "Music", "Photography", "AI", "Writing", "General"];

function Avatar({ name, iconDataUrl, size = 44 }) {
  if (iconDataUrl) {
    return <img src={iconDataUrl} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: "var(--accent-soft)", color: "var(--accent)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-display)", fontWeight: 600, fontSize: size * 0.4,
      }}
    >
      {name?.slice(0, 2).toUpperCase() || "?"}
    </div>
  );
}

function centerCropDataUrl(file, targetW, targetH) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const targetRatio = targetW / targetH;
        const imgRatio = img.width / img.height;
        let sw, sh, sx, sy;
        if (imgRatio > targetRatio) {
          sh = img.height;
          sw = sh * targetRatio;
          sx = (img.width - sw) / 2;
          sy = 0;
        } else {
          sw = img.width;
          sh = sw / targetRatio;
          sx = 0;
          sy = (img.height - sh) / 2;
        }
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function CommunitiesClient() {
  const router = useRouter();
  const iconInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState("Social");
  const [newVisibility, setNewVisibility] = useState("public");
  const [newIconDataUrl, setNewIconDataUrl] = useState("");
  const [newBannerDataUrl, setNewBannerDataUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [createdCommunity, setCreatedCommunity] = useState(null);

  const load = useCallback(async (q) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/communities?q=${encodeURIComponent(q || "")}`);
      const data = await res.json();
      if (!res.ok) {
        setCommunities([]);
        setLoading(false);
        return;
      }
      setCommunities(data.communities || []);
    } catch (err) {
      setCommunities([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => load(query), 300);
    return () => clearTimeout(handle);
  }, [query, load]);

  function openWizard() {
    setStep(1);
    setNewName("");
    setNewDescription("");
    setNewCategory("Social");
    setNewVisibility("public");
    setNewIconDataUrl("");
    setNewBannerDataUrl("");
    setError("");
    setCreatedCommunity(null);
    setWizardOpen(true);
  }

  async function handleIconFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await centerCropDataUrl(file, 300, 300);
    setNewIconDataUrl(dataUrl);
    e.target.value = "";
  }

  async function handleBannerFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await centerCropDataUrl(file, 900, 320);
    setNewBannerDataUrl(dataUrl);
    e.target.value = "";
  }

  function goToReview(e) {
    e.preventDefault();
    if (!newName.trim()) {
      setError("Community name is required.");
      return;
    }
    setError("");
    setStep(2);
  }

  async function handleCreate() {
    setError("");
    setCreating(true);
    const res = await fetch("/api/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        description: newDescription,
        category: newCategory,
        visibility: newVisibility,
        iconDataUrl: newIconDataUrl,
        bannerDataUrl: newBannerDataUrl,
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error || "Could not create community.");
      return;
    }
    setCreatedCommunity(data.community);
    setStep(3);
    load(query);
  }

  async function toggleMembership(c, e) {
    e.preventDefault();
    e.stopPropagation();
    if (c.isMember) {
      await fetch(`/api/communities/${c.id}/membership`, { method: "DELETE" });
    } else {
      await fetch(`/api/communities/${c.id}/membership`, { method: "POST" });
    }
    load(query);
  }

  const showEmptyState = !loading && communities.length === 0 && !query.trim();
  const showNoResults = !loading && communities.length === 0 && query.trim();

  return (
    <div>
      <div className="v-search mb-4">
        <GlossIcon name="search" size={34} fallback={Search} />
        <input
          type="text"
          placeholder="Search communities…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {!showEmptyState && (
        <button
          onClick={openWizard}
          className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm font-medium"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <Plus size={16} /> Create Community
        </button>
      )}

      {loading && (
        <div className="flex justify-center py-10" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {showEmptyState && (
        <div className="text-center py-10 px-4">
          <div
            style={{
              width: 88, height: 88, borderRadius: "50%", margin: "0 auto 16px",
              background: "var(--accent-soft)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Sparkles size={36} style={{ color: "var(--accent)" }} />
          </div>
          <h2 className="text-base font-semibold mb-1">You don&apos;t have a community yet.</h2>
          <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
            Create your first community and build something amazing.
          </p>
          <button
            onClick={openWizard}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold mx-auto"
            style={{ background: "var(--accent)", color: "white", width: "fit-content" }}
          >
            <Plus size={16} /> Create Community
          </button>
        </div>
      )}

      {showNoResults && (
        <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
          No communities found.
        </p>
      )}

      <div className="space-y-2">
        {communities.map((c) => (
          <Link key={c.id} href={`/communities/${c.id}`} className="card flex items-center justify-between p-3.5">
            <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
              <Avatar name={c.name} iconDataUrl={c.iconDataUrl} size={44} />
              <div style={{ minWidth: 0 }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </span>
                  {c.isOwner && <Crown size={12} style={{ color: "var(--premium, #F0B75E)" }} />}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
                </div>
              </div>
            </div>
            {!c.isOwner && (
              <button
                onClick={(e) => toggleMembership(c, e)}
                className="text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0"
                style={
                  c.isMember
                    ? { background: "var(--surface-2)", color: "var(--text-muted)" }
                    : { background: "var(--accent)", color: "white" }
                }
              >
                {c.isMember ? "Joined" : "Join"}
              </button>
            )}
          </Link>
        ))}
      </div>

      {wizardOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "var(--surface)", zIndex: 150,
            display: "flex", flexDirection: "column", overflowY: "auto",
          }}
        >
          <div
            className="flex items-center gap-3 p-4"
            style={{ borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}
          >
            {step < 3 && (
              <button
                onClick={() => (step === 1 ? setWizardOpen(false) : setStep(step - 1))}
                aria-label="Back"
                style={{ background: "none", border: "none", color: "var(--text)" }}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h1 className="text-base font-semibold">
              {step === 1 ? "Create Community" : step === 2 ? "Review" : "Community Created"}
            </h1>
          </div>

          <div className="p-4" style={{ maxWidth: 460, margin: "0 auto", width: "100%" }}>
            {step === 1 && (
              <form onSubmit={goToReview} className="space-y-4">
                <div>
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>Community Banner (optional)</label>
                  <div
                    onClick={() => bannerInputRef.current?.click()}
                    style={{
                      height: 100, borderRadius: 12, marginTop: 6, cursor: "pointer",
                      background: newBannerDataUrl ? `url(${newBannerDataUrl}) center/cover` : "var(--surface-2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "1px dashed var(--border)",
                    }}
                  >
                    {!newBannerDataUrl && <ImageIcon size={20} style={{ color: "var(--text-muted)" }} />}
                  </div>
                  <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerFileChange} style={{ display: "none" }} />
                </div>

                <div className="flex flex-col items-center gap-2 mb-2">
                  <div onClick={() => iconInputRef.current?.click()} style={{ cursor: "pointer", position: "relative" }}>
                    <Avatar name={newName || "?"} iconDataUrl={newIconDataUrl} size={72} />
                    <div style={{ position: "absolute", bottom: -2, right: -2, background: "var(--accent)", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ImageIcon size={12} color="white" />
                    </div>
                  </div>
                  <button type="button" onClick={() => iconInputRef.current?.click()} className="text-xs font-semibold" style={{ color: "var(--accent)", background: "none", border: "none" }}>
                    {newIconDataUrl ? "Change icon" : "Add icon"}
                  </button>
                  <input ref={iconInputRef} type="file" accept="image/*" onChange={handleIconFileChange} style={{ display: "none" }} />
                </div>

                {error && <div className="alert alert-error">{error}</div>}

                <div>
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>Community Name</label>
                  <input
                    className="input pl-3 mt-1"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>Description (optional)</label>
                  <input
                    className="input pl-3 mt-1"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>Community Type</label>
                  <select
                    className="input pl-3 mt-1"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>Visibility</label>
                  <select
                    className="input pl-3 mt-1"
                    value={newVisibility}
                    onChange={(e) => setNewVisibility(e.target.value)}
                  >
                    <option value="public">Public — anyone can find and join</option>
                    <option value="private">Private — invite only</option>
                  </select>
                </div>

                <button type="submit" className="btn-primary">
                  Next <ArrowRight size={15} />
                </button>
              </form>
            )}

            {step === 2 && (
              <div>
                <div className="card mb-4" style={{ padding: 0, overflow: "hidden" }}>
                  <div
                    style={{
                      height: 130,
                      background: newBannerDataUrl
                        ? `url(${newBannerDataUrl}) center/cover`
                        : "linear-gradient(135deg, var(--accent-soft), var(--surface-2))",
                    }}
                  />
                  <div className="p-4" style={{ marginTop: -36 }}>
                    <div style={{ border: "3px solid var(--surface)", borderRadius: "50%", width: 66, height: 66, overflow: "hidden", marginBottom: 8 }}>
                      <Avatar name={newName} iconDataUrl={newIconDataUrl} size={60} />
                    </div>
                    <div className="text-base font-semibold">{newName}</div>
                    {newDescription && <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>{newDescription}</div>}
                    <div className="text-xs space-y-1 mt-2" style={{ color: "var(--text-muted)" }}>
                      <div>Type: <span style={{ color: "var(--text)" }}>{newCategory}</span></div>
                      <div>Visibility: <span style={{ color: "var(--text)" }}>{newVisibility === "public" ? "Public" : "Private"}</span></div>
                    </div>
                  </div>
                </div>
                {error && <div className="alert alert-error mb-3">{error}</div>}
                <button onClick={handleCreate} className="btn-primary" disabled={creating}>
                  {creating ? <Loader2 size={15} className="animate-spin" /> : <>Create Community</>}
                </button>
              </div>
            )}

            {step === 3 && createdCommunity && (
              <div className="text-center py-6">
                <div
                  style={{
                    width: 56, height: 56, borderRadius: "50%", background: "var(--accent-soft)",
                    display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
                  }}
                >
                  <Check size={26} style={{ color: "var(--accent)" }} />
                </div>
                <h2 className="text-lg font-semibold mb-1">Your community is ready!</h2>
                <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                  Start building it your way. Add channels and invite members to get started.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => router.push(`/communities/${createdCommunity.id}`)}
                    className="btn-primary"
                  >
                    Go to Community
                  </button>
                  <button
                    onClick={() => router.push(`/communities/${createdCommunity.id}`)}
                    className="btn-primary"
                    style={{ background: "var(--surface-2)", color: "var(--text)" }}
                  >
                    <UserPlus size={15} /> Invite Members
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}