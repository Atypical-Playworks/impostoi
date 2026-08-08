import { NextResponse } from "next/server";
import { z } from "zod";

import { publicRuntimeConfig } from "@/lib/public-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const signInSchema = z.object({ email: z.string().trim().email() });

export async function POST(request: Request) {
  const parsed = signInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid email is required" },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: new URL(
        "/auth/callback",
        publicRuntimeConfig.appUrl,
      ).toString(),
    },
  });

  if (error) {
    return NextResponse.json(
      { error: "Unable to send sign-in email" },
      { status: 502 },
    );
  }

  return NextResponse.json({ sent: true });
}
