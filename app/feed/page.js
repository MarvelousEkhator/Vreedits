// app/feed/page.js
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import NavShell from "@/components/NavShell";
import FeedClient from "@/components/FeedClient";
import FeedViewRecorder from "@/components/FeedViewRecorder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FeedPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");

  // Only the fields the app needs. Never pass the whole row to client
  // components: it would put the password hash and codes in the page data.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarDataUrl: true,
      online: true,
      language: true,
      isGuest: true,
      verified: true,
    },
  });
  if (!user || !user.verified) redirect("/login");

  return (
    <NavShell user={user}>
      <FeedViewRecorder />
      <FeedClient user={user} />
    </NavShell>
  );
}