import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readRoute(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Guest creation uses Supabase anonymous auth and keeps tokens in cookies", () => {
  const route = readRoute("src/app/api/auth/guest/route.ts");

  expect(route).toContain("signInAnonymously()");
  expect(route).toContain("status: 201");
  expect(route).toContain("httpOnly: true");
  expect(route).not.toContain("accessToken:");
});

test("persistent login exchanges an OTP callback for a server session", () => {
  const signInRoute = readRoute("src/app/api/auth/sign-in/route.ts");
  const callbackRoute = readRoute("src/app/auth/callback/route.ts");

  expect(signInRoute).toContain("signInWithOtp");
  expect(signInRoute).toContain("emailRedirectTo:");
  expect(callbackRoute).toContain("exchangeCodeForSession(code)");
});

test("migration verifies both identities before invoking the privileged RPC", () => {
  const route = readRoute("src/app/api/auth/migrate/route.ts");

  expect(route).toContain("guestUserId: z.uuid()");
  expect(route).toContain("status: 401");
  expect(route).toContain('"impostoi_guest_access_token"');
  expect(route).toContain("isGuestUser(source.data.user)");
  expect(route).toContain('admin.rpc("migrate_guest_progress"');
  expect(route).toContain("response.cookies.delete");
});

test("middleware refreshes the server-only Guest token with Supabase sessions", () => {
  const middleware = readRoute("src/middleware.ts");

  expect(middleware).toContain("isGuestUser(data.user)");
  expect(middleware).toContain("sessionData.session?.access_token");
  expect(middleware).toContain(
    'response.cookies.set("impostoi_guest_access_token"',
  );
  expect(middleware).toContain("httpOnly: true");
});
