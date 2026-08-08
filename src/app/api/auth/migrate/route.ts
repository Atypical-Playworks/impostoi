import { NextResponse } from "next/server";

import { validateGuestMigration } from "@/lib/auth-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json(
      { error: "Authentication is required" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const guestUserId = typeof body?.guestUserId === "string" ? body.guestUserId : "";

  try {
    validateGuestMigration(authData.user, guestUserId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid migration" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("migrate_guest_progress", {
    source_guest_id: guestUserId.trim(),
  });

  if (error) {
    const status = error.code === "23505" ? 409 : 502;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({
    migratedMatches: data?.[0]?.migrated_matches ?? 0,
  });
}
