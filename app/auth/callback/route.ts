import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth/server-client";
import { isOwnerEmail } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const email = data.user.email;
      if (email && isOwnerEmail(email)) {
        await prisma.user.upsert({
          where: { id: data.user.id },
          update: { email },
          create: { id: data.user.id, email },
        });
      }
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
