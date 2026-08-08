import { describe, expect, test } from "bun:test";

import {
  canReconnect,
  createRoomSnapshot,
  joinRoom,
  leaveRoom,
  mapPortalError,
  reconnectRoom,
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
    expect(() =>
      createRoomSnapshot({
        roomId: "",
        channelId: "room-",
        status: "ready",
        phase: "lobby",
        participants: [],
        receivedAt: 10,
      }),
    ).toThrow("channel mismatch");
  });

  test("joins and leaves participants using safe presence metadata", () => {
    const snapshot = createRoomSnapshot({
      roomId: "abc",
      channelId: "room-abc",
      status: "ready",
      phase: "lobby",
      participants: [{ id: "user-1", alias: "Ana", avatar: "sun" }],
      receivedAt: 10,
    });

    const joined = joinRoom(snapshot, {
      id: "user-2",
      alias: "B".repeat(30),
      avatar: "moon",
      activity: "discussion",
    });
    expect(joined.participants).toEqual([
      { id: "user-1", alias: "Ana", avatar: "sun" },
      {
        id: "user-2",
        alias: "B".repeat(24),
        avatar: "moon",
        activity: "discussion",
      },
    ]);

    const replaced = joinRoom(joined, {
      id: "user-2",
      alias: "Bea",
      avatar: "star",
    });
    expect(replaced.participants).toHaveLength(2);
    expect(replaced.participants[1]).toEqual({
      id: "user-2",
      alias: "Bea",
      avatar: "star",
    });
    expect(leaveRoom(replaced, "user-1").participants).toEqual([
      { id: "user-2", alias: "Bea", avatar: "star" },
    ]);
  });

  test("reconnects only while the bounded window is open", () => {
    const snapshot = createRoomSnapshot({
      roomId: "abc",
      channelId: "room-abc",
      status: "reconnecting",
      phase: "discussion",
      participants: [],
      receivedAt: 10,
    });
    const participant = { id: "user-1", alias: "Ana", avatar: "sun" };

    expect(reconnectRoom(snapshot, participant, 1_000, 31_000)).toMatchObject({
      participants: [participant],
    });
    expect(reconnectRoom(snapshot, participant, 1_000, 31_001)).toBeNull();
  });

  test("maps Portal failures to safe user-facing states", () => {
    expect(mapPortalError("token_expired")).toBe("session-expired");
    expect(mapPortalError("channel_at_capacity")).toBe("room-full");
    expect(mapPortalError("unexpected")).toBe("room-unavailable");
  });
});
