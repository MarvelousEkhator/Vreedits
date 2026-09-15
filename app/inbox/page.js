import { getSessionUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import NavShell from "@/components/NavShell";
import InboxClient from "@/components/InboxClient";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function InboxPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: userId } });

  return (
    <NavShell user={user}>
      <InboxClient currentUserId={userId} />
    </NavShell>
  );
}