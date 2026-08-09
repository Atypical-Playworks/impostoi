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

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const code = normalizeRoomCode((await params).roomId);
  if (!validateRoomCode(code))
    return NextResponse.json(roomError("invalid-room"), { status: 400 });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(roomError("session-expired"), { status: 401 });
  const admin = createSupabaseAdminClient(
    readServerRuntimeConfig().supabaseSecretKey,
  );
  const { data: participant, error: participantError } = await admin
    .from("room_participants")
    .select("seat_status, reservation_expires_at")
    .eq("room_code", code)
    .eq("player_id", user.id)
    .maybeSingle();
  if (participantError)
    return NextResponse.json(roomError("room-unavailable"), { status: 503 });
  if (participant?.seat_status === "confirmed")
    return NextResponse.json({ ok: true });
  const { data: confirmed, error } = await admin.rpc(
    "confirm_room_participant",
    { requested_code: code, requested_player_id: user.id },
  );
  if (error)
    return NextResponse.json(roomError("room-unavailable"), { status: 503 });
  if (confirmed !== true)
    return NextResponse.json(roomError("room-expired"), { status: 409 });
  return NextResponse.json({ ok: true });
}
