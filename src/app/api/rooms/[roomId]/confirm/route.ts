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

export async function POST(
  request: Request,
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
  let body: { alias?: unknown; avatar?: unknown } = {};
  try {
    body = (await request.json()) as { alias?: unknown; avatar?: unknown };
  } catch {
    // Existing confirmed sessions do not need profile data.
  }
  let { data: participantData, error: participantError } = await admin.rpc(
    "get_room_participants",
    { requested_code: code },
  );
  if (participantError)
    return NextResponse.json(roomError("room-unavailable"), { status: 503 });
  let participant = Array.isArray(participantData)
    ? participantData.find((item) => item.player_id === user.id)
    : null;
  if (
    !participant &&
    validateAlias(body.alias) &&
    validateAvatar(body.avatar)
  ) {
    const { data: hostId } = await admin.rpc("get_room_host", {
      requested_code: code,
    });
    if (hostId === user.id) {
      await admin.rpc("restore_lobby_host", {
        requested_code: code,
        requested_player_id: user.id,
        requested_alias: body.alias.trim(),
        requested_avatar: body.avatar.trim(),
      });
    } else {
      await admin.rpc("join_room", {
        requested_code: code,
        requested_player_id: user.id,
        requested_alias: body.alias.trim(),
        requested_avatar: body.avatar.trim(),
      });
    }
    const refreshed = await admin.rpc("get_room_participants", {
      requested_code: code,
    });
    participantData = refreshed.data;
    participant = Array.isArray(participantData)
      ? participantData.find((item) => item.player_id === user.id)
      : null;
  }
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
