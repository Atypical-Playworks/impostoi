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
  const { data: participantData } = await admin.rpc("get_room_participants", {
    requested_code: code,
  });
  const participantRows = Array.isArray(participantData) ? participantData : [];
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: hostId } = user
    ? await admin.rpc("get_room_host", { requested_code: code })
    : { data: null };
  return NextResponse.json({
    ...data,
    humanCount: participantRows?.length ?? data.humanCount,
    confirmedCount:
      participantRows?.filter((item) => item.seat_status === "confirmed")
        .length ?? 0,
    pendingCount:
      participantRows?.filter((item) => item.seat_status === "pending")
        .length ?? 0,
    participants:
      participantRows?.map((item) => ({
        id: item.player_id,
        alias: item.alias,
        avatar: item.avatar,
        status: item.seat_status,
        isHost: item.is_host,
      })) ?? [],
    isHost: user !== null && hostId === user.id,
  });
}
