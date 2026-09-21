import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import NavShell from "@/components/NavShell";
import SectionDashboard from "@/components/SectionDashboard";
import { TOOLS } from "@/lib/aiTools";
import GlossIcon from "@/components/GlossIcon";


export default async function SchoolPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.verified) redirect("/login");

  const items = [
    { label: "Notes", sub: "Write notes, attach files, and turn them into flashcards.", href: "/notes" },
    { label: "Smart Tools", sub: "Turn your notes into flashcards, quizzes, summaries, and more.", href: "/tools/school/flashcards" },
    { label: "Study Room", sub: "Study solo, or invite friends to join you.", href: "/tools/school/study-room" },
    { label: "Study Progress", sub: "Track your study time and see your breakdown by subject.", href: "/tools/school/study-progress" },
    { label: "AI Tutor", sub: "A patient tutor that helps you actually understand, not just get answers.", href: "/tools/school/ai-tutor" },
    ...TOOLS.filter((t) => t.category === "School").map((t) => ({
      label: t.label,
      sub: t.description,
      href: `/ai-tools/${t.id}`,
    })),
  ];

  return (
    <NavShell user={user}>
      <SectionDashboard
        title="School"
        icon={<GraduationCap size={20} />}
        description="Homework, studying, and everything class-related."
        items={items}
      />
    </NavShell>
  );
}