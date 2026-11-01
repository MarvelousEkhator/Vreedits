import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import NavShell from "@/components/NavShell";

// Same shell as the rest of the app (top bar + bottom tabs) around the practice screens.
export default async function PracticeLayout({ children }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.verified) redirect("/login");
  return <NavShell user={user}>{children}</NavShell>;
}
