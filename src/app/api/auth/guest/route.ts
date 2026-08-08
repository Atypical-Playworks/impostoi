import { NextResponse } from "next/server";

import { isGuestUser } from "@/lib/auth-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const current = await supabase.auth.getUser();

  if (current.data.user) {
    const session = await supabase.auth.getSession();
    return NextResponse.json({
      user: current.data.user,
      accessToken: isGuestUser(current.data.user)
        ? session.data.session?.access_token
        : undefined,
    });
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json(
    { user: data.user, accessToken: data.session?.access_token },
    { status: 201 },
  );
}
