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
      <header className="border-b px-6 py-4">
        <span className="font-semibold">LinkedIn Content Engine</span>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
