import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import NavShell from "@/components/NavShell";

// Wraps every Mind Gym screen in the same shell as the rest of the app,
// so it gets the top bar with the exit arrow and the bottom tab bar.
export default async function MindGymLayout({ children }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.verified) redirect("/login");
  return <NavShell user={user}>{children}</NavShell>;
}
