import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import NavShell from "@/components/NavShell";
import SectionDashboard from "@/components/SectionDashboard";
import { TOOLS } from "@/lib/aiTools";
import GlossIcon from "@/components/GlossIcon";

export default async function HomeToolsPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.verified) redirect("/login");

  const items = TOOLS.filter((t) => t.category === "Home Tools").map((t) => ({
    label: t.label,
    sub: t.description,
    href: `/ai-tools/${t.id}`,
  }));

  return (
    <NavShell user={user}>
      <SectionDashboard
        title="Home Tools"
        icon={<GlossIcon name="home-tools" size={28} />}
        description="Everyday utilities for daily life."
        items={items}
      />
    </NavShell>
  );
}