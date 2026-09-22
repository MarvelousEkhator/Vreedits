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

export default async function SchoolPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.verified) redirect("/login");

  const cookieStore = await cookies();
  const lang = cookieStore.get("vreedits-lang")?.value || "en";
  const t = (key) => translate(lang, key);

  const items = [
    { label: t("section.school.notes"), sub: t("section.school.notesSub"), href: "/notes" },
    { label: t("section.school.smartTools"), sub: t("section.school.smartToolsSub"), href: "/tools/school/flashcards" },
    { label: t("section.school.studyRoom"), sub: t("section.school.studyRoomSub"), href: "/tools/school/study-room" },
    { label: t("section.school.studyProgress"), sub: t("section.school.studyProgressSub"), href: "/tools/school/study-progress" },
    { label: t("section.school.aiTutor"), sub: t("section.school.aiTutorSub"), href: "/tools/school/ai-tutor" },
    ...TOOLS.filter((t) => t.category === "School").map((tool) => ({
      label: tool.label,
      sub: tool.description,
      href: `/ai-tools/${tool.id}`,
    })),
  ];

  return (
    <NavShell user={user}>
      <SectionDashboard
        title={t("section.school.title")}
        icon={<GlossIcon name="school" size={28} />}
        description={t("section.school.description")}
        items={items}
      />
    </NavShell>
  );
}