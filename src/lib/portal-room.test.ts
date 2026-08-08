import { describe, expect, test } from "bun:test";

import {
  canReconnect,
  createRoomSnapshot,
  mapPortalError,
  roomChannelId,
  safePresence,
} from "./portal-room";

describe("Portal room lifecycle", () => {
  test("maps one Match room to one standard Portal channel", () => {
    expect(roomChannelId("abc_123")).toBe("room-abc_123");
    expect(() => roomChannelId("bad room")).toThrow();
  });

  test("exposes only safe presence metadata", () => {
    expect(
      safePresence("user-1", {
        alias: "A".repeat(100),
        avatar: "avatar-1",
        activity: "clue",
      }),
    ).toEqual({
      id: "user-1",
      alias: "A".repeat(24),
      avatar: "avatar-1",
      activity: "clue",
    });
    const invalidMetadata = { alias: "Ana", avatar: "sun" };
    Object.defineProperty(invalidMetadata, "activity", {
      value: "private-role",
    });
    expect(safePresence("user-1", invalidMetadata)).toEqual({
      id: "user-1",
      alias: "Ana",
      avatar: "sun",
    });
  });

  test("bounds reconnects and preserves a late-join snapshot contract", () => {
    const disconnectedAt = 1_000;
    expect(canReconnect(disconnectedAt, 31_000)).toBe(true);
    expect(canReconnect(disconnectedAt, 31_001)).toBe(false);

    expect(
      createRoomSnapshot({
        roomId: "abc",
        channelId: "room-abc",
        status: "ready",
        phase: "lobby",
        participants: [
          { id: "user-1", alias: "Ana", avatar: "sun", activity: "idle" },
        ],
        receivedAt: 10,
      }),
    ).toMatchObject({
      roomId: "abc",
      channelId: "room-abc",
      phase: "lobby",
      participants: [{ id: "user-1", alias: "Ana", avatar: "sun" }],
    });
    expect(() =>
      createRoomSnapshot({
        roomId: "abc",
        channelId: "xroom-abc",
        status: "ready",
        phase: "lobby",
        participants: [],
        receivedAt: 10,
      }),
    ).toThrow("channel mismatch");
  });

  test("maps Portal failures to safe user-facing states", () => {
    expect(mapPortalError("token_expired")).toBe("session-expired");
    expect(mapPortalError("channel_at_capacity")).toBe("room-full");
    expect(mapPortalError("unexpected")).toBe("room-unavailable");
  });
});
