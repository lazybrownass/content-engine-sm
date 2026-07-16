"use client"; // client: needs to call Supabase signOut and navigate on click

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/auth/browser-client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button onClick={handleSignOut} variant="outline" className="w-full">
      Back to login
    </Button>
  );
}
