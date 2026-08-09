import { NextResponse } from "next/server";

import {
  normalizeRoomCode,
  roomError,
  validateRoomCode,
} from "@/lib/room-lifecycle";
import { readServerRuntimeConfig } from "@/lib/server-env-config";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const code = normalizeRoomCode((await params).roomId);
  if (!validateRoomCode(code))
    return NextResponse.json(roomError("invalid-room"), { status: 400 });
  const admin = createSupabaseAdminClient(
    readServerRuntimeConfig().supabaseSecretKey,
  );
  const { data, error } = await admin.rpc("get_public_room", {
    requested_code: code,
  });
  if (error || !data)
    return NextResponse.json(roomError("room-unavailable"), { status: 503 });
  return NextResponse.json(data);
}
