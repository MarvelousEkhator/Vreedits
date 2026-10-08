// app/u/[userId]/page.js
import { redirect } from "next/navigation";

// Short profile links (/u/<id>) open the real profile page.
export default function ShortProfileLink({ params }) {
  redirect(`/profile/${params.userId}`);
}