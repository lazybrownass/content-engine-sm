import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/auth/server-client";
import { isOwnerEmail } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!isOwnerEmail(user.email)) redirect("/forbidden");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center gap-6 border-b px-6 py-4">
        <span className="font-semibold">LinkedIn Content Engine</span>
        <nav className="flex gap-4 text-sm">
          <Link href="/generate" className="hover:underline">
            Generate
          </Link>
          <Link href="/knowledge" className="hover:underline">
            Knowledge
          </Link>
          <Link href="/topics" className="hover:underline">
            Topics
          </Link>
          <Link href="/posts" className="hover:underline">
            Posts
          </Link>
          <Link href="/schedule" className="hover:underline">
            Schedule
          </Link>
          <Link href="/analytics" className="hover:underline">
            Analytics
          </Link>
        </nav>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
