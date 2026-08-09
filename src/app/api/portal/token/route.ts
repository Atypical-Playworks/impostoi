import { NextResponse } from "next/server";

import { roomChannelId, validateRoomId } from "@/lib/portal-room";
import { validateRoomCode } from "@/lib/room-lifecycle";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "session-expired" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-room" }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    typeof body.roomId !== "string" ||
    !validateRoomId(body.roomId) ||
    !validateRoomCode(body.roomId)
  ) {
    return NextResponse.json({ error: "invalid-room" }, { status: 400 });
  }

  const config = readServerRuntimeConfig();
  const admin = createSupabaseAdminClient(config.supabaseSecretKey);
  const { data: isMember, error: membershipError } = await admin.rpc(
    "is_room_member",
    { requested_code: body.roomId, requested_player_id: user.id },
  );
  if (membershipError) {
    return NextResponse.json({ error: "room-unavailable" }, { status: 503 });
  }
  if (isMember !== true) {
    return NextResponse.json({ error: "access-denied" }, { status: 403 });
  }

  const channelId = roomChannelId(body.roomId);
  let response: Response;
  try {
    response = await fetch(`${config.portalApiUrl}/v1/tokens`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.portalSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        userId: user.id,
        channelId,
      }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "room-unavailable" }, { status: 503 });
  }

  if (!response.ok) {
    const status = response.status >= 500 ? 503 : 502;
    return NextResponse.json({ error: "room-unavailable" }, { status });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return NextResponse.json({ error: "room-unavailable" }, { status: 502 });
  }

  if (
    !isRecord(payload) ||
    typeof payload.token !== "string" ||
    payload.token.length === 0
  ) {
    return NextResponse.json({ error: "room-unavailable" }, { status: 502 });
  }

  return NextResponse.json({
    token: payload.token,
    channelId,
  });
}
