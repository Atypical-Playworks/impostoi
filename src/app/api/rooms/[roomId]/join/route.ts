import { NextResponse } from "next/server";

import {
  normalizeRoomCode,
  roomError,
  validateAlias,
  validateAvatar,
  validateRoomCode,
} from "@/lib/room-lifecycle";
import { readServerRuntimeConfig } from "@/lib/server-env-config";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const code = normalizeRoomCode((await params).roomId);
  if (!validateRoomCode(code))
    return NextResponse.json(roomError("invalid-room"), { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user)
    return NextResponse.json(roomError("session-expired"), { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(roomError("alias-invalid"), { status: 400 });
  }
  if (!isRecord(body) || !validateAlias(body.alias))
    return NextResponse.json(roomError("alias-invalid"), { status: 400 });
  if (!validateAvatar(body.avatar))
    return NextResponse.json(roomError("avatar-invalid"), { status: 400 });
  const admin = createSupabaseAdminClient(
    readServerRuntimeConfig().supabaseSecretKey,
  );
  await admin.rpc("cleanup_stale_room_participants", {
    requested_code: code,
  });
  const { data, error } = await admin.rpc("join_room", {
    requested_code: code,
    requested_player_id: user.user.id,
    requested_alias: body.alias.trim(),
    requested_avatar: body.avatar.trim(),
  });
  if (error) {
    const safeCode = error.message.match(
      /room-(full|started|expired|cancelled)/,
    )?.[1];
    const errorCode =
      safeCode === "full"
        ? "room-full"
        : safeCode === "started"
          ? "room-started"
          : safeCode === "expired"
            ? "room-expired"
            : safeCode === "cancelled"
              ? "room-cancelled"
              : "room-unavailable";
    return NextResponse.json(roomError(errorCode), {
      status: errorCode === "room-unavailable" ? 503 : 400,
    });
  }
  return NextResponse.json(data);
}
