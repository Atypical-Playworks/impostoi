import { NextResponse } from "next/server";
import { z } from "zod";

import { isGuestUser, validateGuestMigration } from "@/lib/auth-policy";
import { readServerRuntimeConfig } from "@/lib/server-env-config";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

const migrationSchema = z.object({
  guestUserId: z.string().trim().min(1),
  guestAccessToken: z.string().min(1),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json(
      { error: "Authentication is required" },
      { status: 401 },
    );
  }

  const parsed = migrationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Guest migration" },
      { status: 400 },
    );
  }

  const { guestUserId, guestAccessToken } = parsed.data;

  const source = await supabase.auth.getUser(guestAccessToken);
  if (
    !source.data.user ||
    !isGuestUser(source.data.user) ||
    source.data.user.id !== guestUserId
  ) {
    return NextResponse.json(
      { error: "Guest session verification failed" },
      { status: 403 },
    );
  }

  try {
    validateGuestMigration(authData.user, guestUserId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid migration" },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient(
    readServerRuntimeConfig().supabaseSecretKey,
  );
  const { data, error } = await admin.rpc("migrate_guest_progress", {
    source_guest_id: guestUserId.trim(),
    destination_player_id: authData.user.id,
  });

  if (error) {
    const status = error.code === "23505" ? 409 : 502;
    return NextResponse.json({ error: "Guest migration failed" }, { status });
  }

  return NextResponse.json({
    migratedMatches: data?.[0]?.migrated_matches ?? 0,
  });
}
