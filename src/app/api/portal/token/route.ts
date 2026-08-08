import { NextResponse } from "next/server";

import { roomChannelId, validateRoomId } from "@/lib/portal-room";
import { readServerRuntimeConfig } from "@/lib/server-env-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type TokenResponse = { token?: unknown };

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "session-expired" }, { status: 401 });
  }

  let body: { roomId?: unknown };
  try {
    body = (await request.json()) as { roomId?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid-room" }, { status: 400 });
  }

  if (typeof body.roomId !== "string" || !validateRoomId(body.roomId)) {
    return NextResponse.json({ error: "invalid-room" }, { status: 400 });
  }

  const config = readServerRuntimeConfig();
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
        channelId: roomChannelId(body.roomId),
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

  const payload = (await response.json()) as TokenResponse;
  if (typeof payload.token !== "string" || payload.token.length === 0) {
    return NextResponse.json({ error: "room-unavailable" }, { status: 502 });
  }

  return NextResponse.json({
    token: payload.token,
    channelId: roomChannelId(body.roomId),
  });
}
