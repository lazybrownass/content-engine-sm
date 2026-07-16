"use client"; // client: form state + Supabase OAuth/magic-link calls need browser interaction

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabaseClient } from "@/lib/auth/browser-client";

export function AuthButtons() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function signInWithProvider(provider: "github" | "google") {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <div className="flex flex-col gap-4">
      <Button onClick={() => signInWithProvider("github")} className="w-full">
        Continue with GitHub
      </Button>
      <Button
        onClick={() => signInWithProvider("google")}
        variant="outline"
        className="w-full"
      >
        Continue with Google
      </Button>

      <div className="text-muted-foreground text-center text-sm">or</div>

      <form onSubmit={sendMagicLink} className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />
        <Button type="submit" disabled={status === "sending"} className="w-full">
          {status === "sending" ? "Sending link…" : "Send magic link"}
        </Button>
        {status === "sent" && (
          <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
            Check your email for a sign-in link.
          </p>
        )}
        {status === "error" && (
          <p role="alert" aria-live="assertive" className="text-destructive text-sm">
            Couldn&apos;t send the link. Try again.
          </p>
        )}
      </form>
    </div>
  );
}
