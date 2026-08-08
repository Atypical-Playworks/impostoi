import { describe, expect, test } from "bun:test";

import {
  isGuestUser,
  isPersistentUser,
  validateGuestMigration,
} from "@/lib/auth-policy";

describe("authentication policy", () => {
  test("classifies anonymous Supabase users as Guest sessions", () => {
    expect(isGuestUser({ is_anonymous: true })).toBe(true);
    expect(isPersistentUser({ is_anonymous: true })).toBe(false);
  });

  test("classifies registered Supabase users as persistent Players", () => {
    expect(isGuestUser({ is_anonymous: false })).toBe(false);
    expect(isPersistentUser({ is_anonymous: false })).toBe(true);
  });

  test("rejects migration without a persistent destination or guest source", () => {
    expect(() => validateGuestMigration({ is_anonymous: true }, "guest-id")).toThrow(
      "persistent account",
    );
    expect(() => validateGuestMigration({ is_anonymous: false }, "")).toThrow(
      "Guest session",
    );
  });

  test("accepts a persistent destination and a guest source", () => {
    expect(validateGuestMigration({ is_anonymous: false }, "guest-id")).toEqual({
      guestUserId: "guest-id",
    });
  });
});
