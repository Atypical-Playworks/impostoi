import { NextResponse } from "next/server";
import { z } from "zod";

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
    options: { emailRedirectTo: `${new URL(request.url).origin}/auth/callback` },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ sent: true });
}
