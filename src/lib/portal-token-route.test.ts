import { describe, expect, test } from "bun:test";

import { readFileSync } from "node:fs";

const route = readFileSync(
  new URL("../app/api/portal/token/route.ts", import.meta.url),
  "utf8",
);

describe("Portal token route contract", () => {
  test("keeps the Portal secret server-side and scopes tokens to a room", () => {
    expect(route).toContain('"@/lib/server-env-config"');
    expect(route).toContain("config.portalSecret");
    expect(route).toContain("channelId: roomChannelId(body.roomId)");
    expect(route).not.toContain("NEXT_PUBLIC_PORTAL");
  });

  test("rejects unauthenticated, invalid, and failed token requests safely", () => {
    expect(route).toContain("status: 401");
    expect(route).toContain("status: 400");
    expect(route).toContain("status: 503");
    expect(route).toContain('error: "room-unavailable"');
  });
});
