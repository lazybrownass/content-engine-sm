import { createServerSupabaseClient } from "./server-client";
import { isOwnerEmail } from "./session";

export class AuthError extends Error {}

export async function requireOwner(): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isOwnerEmail(user.email)) {
    throw new AuthError("Not authenticated");
  }

  return user.id;
}
