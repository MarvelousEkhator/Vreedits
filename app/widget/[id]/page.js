import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CommunityWidgetPage({ params }) {
  let community = null;
  let widget = null;
  try {
    widget = await prisma.communityWidget.findUnique({ where: { communityId: params.id } });
    if (widget && widget.enabled) {
      community = await prisma.community.findUnique({ where: { id: params.id } });
    }
  } catch (err) {
    console.error("Widget page error:", err);
  }

  const dark = !widget || widget.theme !== "light";
  const colors = dark
    ? { bg: "#16171d", card: "#1f2029", text: "#f2f2f5", muted: "#9a9cab" }
    : { bg: "#ffffff", card: "#f3f4f7", text: "#16171d", muted: "#6b6d7c" };

  const wrap = {
    minHeight: "100vh",
    margin: 0,
    padding: 16,
    boxSizing: "border-box",
    background: colors.bg,
    color: colors.text,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  };

  if (!community) {
    return (
      <div style={wrap}>
        <p style={{ color: colors.muted, fontSize: 14 }}>This widget isn't available.</p>
      </div>
    );
  }

  const joinHref = widget.inviteCode ? "/invite/" + widget.inviteCode : "/communities/" + community.id;

  return (
    <div style={wrap}>
      <div style={{ background: colors.card, borderRadius: 16, overflow: "hidden" }}>
        <div
          style={{
            height: 90,
            background: community.bannerDataUrl
              ? "url(" + community.bannerDataUrl + ") center/cover"
              : community.accentColor || "#6c63ff",
          }}
        />
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            {community.iconDataUrl ? (
              <img
                src={community.iconDataUrl}
                alt=""
                width={48}
                height={48}
                style={{ borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: 48, height: 48, borderRadius: "50%", background: colors.bg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 20,
                }}
              >
                {community.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{community.name}</div>
              {widget.showMembers && (
                <div style={{ color: colors.muted, fontSize: 13 }}>
                  {(community.memberIds || []).length} members
                </div>
              )}
            </div>
          </div>
          {community.description && (
            <p style={{ color: colors.muted, fontSize: 14, lineHeight: 1.45, margin: "0 0 14px" }}>
              {community.description}
            </p>
          )}
          <a
            href={joinHref}
            target="_top"
            style={{
              display: "block", textAlign: "center", padding: "10px 14px", borderRadius: 999,
              background: community.accentColor || "#6c63ff", color: "#fff",
              textDecoration: "none", fontWeight: 600, fontSize: 14,
            }}
          >
            Join community
          </a>
        </div>
      </div>
    </div>
  );
}