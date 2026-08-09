import { describe, expect, test } from "bun:test";

import { readFileSync } from "node:fs";

const route = readFileSync(
  new URL("../app/api/portal/token/route.ts", import.meta.url),
  "utf8",
);

describe("Portal token route contract", () => {
  test("keeps the Portal secret server-side and scopes tokens to a room", () => {
    expect(route).toContain('"@/lib/server-env-config"');
    expect(route).toContain("const roomCode = normalizeRoomCode(body.roomId)");
    expect(route).toContain("config.portalSecret");
    expect(route).toContain('"is_room_member"');
    expect(route).toContain('error: "access-denied"');
    expect(route).toContain("const channelId = roomChannelId(roomCode)");
    expect(route).not.toContain("NEXT_PUBLIC_PORTAL");
  });

  test("requires an active room membership before issuing a token", () => {
    const roomsMigration = readFileSync(
      new URL("../../supabase/migrations/20260809000000_rooms.sql", import.meta.url),
      "utf8",
    );
    expect(roomsMigration).toContain("r.status = 'started'");
    expect(roomsMigration).toContain("r.expires_at > now()");
  });

  test("rejects unauthenticated, invalid, and failed token requests safely", () => {
    expect(route).toContain("status: 401");
    expect(route).toContain("status: 400");
    expect(route).toContain("status: 503");
    expect(route).toContain('error: "room-unavailable"');
    expect(route).toContain("!isRecord(body)");
    expect(route).toContain("await response.json()");
  });
});
