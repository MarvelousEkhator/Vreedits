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

export default async function HomeToolsPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.verified) redirect("/login");

  const cookieStore = await cookies();
  const lang = cookieStore.get("vreedits-lang")?.value || "en";
  const t = (key) => translate(lang, key);

  const items = TOOLS.filter((t) => t.category === "Home Tools").map((tool) => ({
    label: tool.label,
    sub: tool.description,
    href: `/ai-tools/${tool.id}`,
  }));

  return (
    <NavShell user={user}>
      <SectionDashboard
        title={t("section.homeTools.title")}
        icon={<GlossIcon name="home-tools" size={28} />}
        description={t("section.homeTools.description")}
        items={items}
      />
    </NavShell>
  );
}