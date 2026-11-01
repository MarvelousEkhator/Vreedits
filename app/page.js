import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LandingClient from "@/components/LandingClient";

export default async function Home() {
  const userId = getSessionUserId();
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.verified) redirect("/dashboard");
  }
  return <LandingClient />;
}
