import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260808000000_guest_progress.sql"),
  "utf8",
);

test("guest progress migration removes the legacy RPC overload", () => {
  expect(migration).toContain(
    "drop function if exists public.migrate_guest_progress(uuid);",
  );
  expect(migration).toContain(
    "revoke all on function public.migrate_guest_progress(uuid, uuid) from public, anon, authenticated;",
  );
});

test("guest access tokens are not returned by the guest endpoint", () => {
  const guestRoute = readFileSync(
    join(process.cwd(), "src/app/api/auth/guest/route.ts"),
    "utf8",
  );
  expect(guestRoute).not.toContain("accessToken:");
  expect(guestRoute).toContain("httpOnly: true");
});
