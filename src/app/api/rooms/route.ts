import { NextResponse } from "next/server";

import {
  generateRoomCode,
  roomError,
  roomErrorStatus,
  validateAlias,
  validateAvatar,
  validateRoomCapacity,
} from "@/lib/room-lifecycle";
import { readServerRuntimeConfig } from "@/lib/server-env-config";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user)
    return NextResponse.json(roomError("session-expired"), { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(roomError("capacity-invalid"), { status: 400 });
  }
  if (!isRecord(body) || !validateRoomCapacity(body.capacity)) {
    return NextResponse.json(roomError("capacity-invalid"), { status: 400 });
  }
  if (!validateAlias(body.alias))
    return NextResponse.json(roomError("alias-invalid"), { status: 400 });
  if (!validateAvatar(body.avatar))
    return NextResponse.json(roomError("avatar-invalid"), { status: 400 });

  const admin = createSupabaseAdminClient(
    readServerRuntimeConfig().supabaseSecretKey,
  );
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: room, error } = await admin.rpc("create_room", {
      requested_code: generateRoomCode(),
      requested_capacity: body.capacity,
      requested_host_id: data.user.id,
      requested_alias: body.alias.trim(),
      requested_avatar: body.avatar.trim(),
    });
    if (!error && isRecord(room) && typeof room.code === "string") {
      return NextResponse.json(room, { status: 201 });
    }
    if (
      error?.message.includes("duplicate") ||
      error?.message.includes("unique")
    )
      continue;
    return NextResponse.json(roomError("room-unavailable"), {
      status: roomErrorStatus("room-unavailable"),
    });
  }
  return NextResponse.json(roomError("room-unavailable"), { status: 503 });
}
