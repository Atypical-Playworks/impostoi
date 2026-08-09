import { NextResponse } from "next/server";

import {
  normalizeRoomCode,
  roomError,
  validateRoomCode,
} from "@/lib/room-lifecycle";
import { readServerRuntimeConfig } from "@/lib/server-env-config";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

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
  await admin.rpc("cleanup_stale_room_participants", {
    requested_code: code,
  });
  const { data, error } = await admin.rpc("get_public_room", {
    requested_code: code,
  });
  if (error || !data)
    return NextResponse.json(roomError("room-unavailable"), { status: 503 });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: room } = user
    ? await admin
        .from("rooms")
        .select("host_player_id")
        .eq("code", code)
        .maybeSingle()
    : { data: null };
  return NextResponse.json({
    ...data,
    isHost: user !== null && room?.host_player_id === user.id,
  });
}
