import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import NavShell from "@/components/NavShell";
import FeedClient from "@/components/FeedClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FeedPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.verified) redirect("/login");

  return (
    <NavShell user={user}>
      <FeedClient user={user} />
    </NavShell>
  );
}