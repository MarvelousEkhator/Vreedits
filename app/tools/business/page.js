import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import NavShell from "@/components/NavShell";
import SectionDashboard from "@/components/SectionDashboard";
import { TOOLS } from "@/lib/aiTools";
import GlossIcon from "@/components/GlossIcon";
import { translate } from "@/lib/i18n";
import "@/lib/i18n-extra";

export default async function BusinessPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.verified) redirect("/login");

  const cookieStore = await cookies();
  const lang = cookieStore.get("vreedits-lang")?.value || "en";
  const t = (key) => translate(lang, key);

  const items = [
    { label: t("section.business.dashboard"), sub: t("section.business.dashboardSub"), href: "/business/dashboard" },
    { label: t("section.business.clientNotes"), sub: t("section.business.clientNotesSub"), href: "/client-notes" },
    { label: t("section.business.projects"), sub: t("section.business.projectsSub"), href: "/tools/business/projects" },
    ...TOOLS.filter((t) => t.category === "Business").map((tool) => ({
      label: tool.label,
      sub: tool.description,
      href: `/ai-tools/${tool.id}`,
    })),
  ];

  return (
    <NavShell user={user}>
      <SectionDashboard
        title={t("section.business.title")}
        icon={<GlossIcon name="business" size={28} />}
        description={t("section.business.description")}
        items={items}
      />
    </NavShell>
  );
}