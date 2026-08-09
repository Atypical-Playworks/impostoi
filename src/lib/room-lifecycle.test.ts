import { describe, expect, test } from "bun:test";

import {
  generateRoomCode,
  normalizeRoomCode,
  roomErrorStatus,
  validateAlias,
  validateAvatar,
  validateRoomCapacity,
  validateRoomCode,
} from "./room-lifecycle";

describe("server room lifecycle contract", () => {
  test("generates six-character codes without ambiguous characters", () => {
    const code = generateRoomCode(() => 0);
    expect(code).toBe("AAAAAA");
    expect(validateRoomCode("ahjkmnp234".slice(0, 6))).toBe(true);
    expect(validateRoomCode("A0O1IL")).toBe(false);
    expect(validateRoomCode("ABC12")).toBe(false);
  });

  test("normalizes shared links before validating them", () => {
    expect(normalizeRoomCode("  abcd23 ")).toBe("ABCD23");
    expect(validateRoomCode(" abcd23 ")).toBe(true);
  });

  test("accepts only configured capacities and confirmed profile fields", () => {
    expect(validateRoomCapacity(4)).toBe(true);
    expect(validateRoomCapacity(6)).toBe(false);
    expect(validateAlias("Ana")).toBe(true);
    expect(validateAlias(" ")).toBe(false);
    expect(validateAlias("A".repeat(25))).toBe(false);
    expect(validateAvatar("sun")).toBe(true);
    expect(validateAvatar("A".repeat(65))).toBe(false);
  });

  test("maps safe room errors to transport statuses", () => {
    expect(roomErrorStatus("room-full")).toBe(400);
    expect(roomErrorStatus("session-expired")).toBe(401);
    expect(roomErrorStatus("room-unavailable")).toBe(503);
  });
});
