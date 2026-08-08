import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const current = await supabase.auth.getUser();

  if (current.data.user) {
    return NextResponse.json({ user: current.data.user });
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ user: data.user }, { status: 201 });
}
