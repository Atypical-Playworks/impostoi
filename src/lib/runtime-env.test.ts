import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

import { type RuntimeEnv, readPublicRuntimeConfig } from "@/lib/public-env";

const { readServerRuntimeConfig } = await import("@/lib/server-env-config");

describe("runtime environment boundaries", () => {
  test("the public config only exposes public runtime values", () => {
    const config = readPublicRuntimeConfig({
      NEXT_PUBLIC_APP_URL: "https://impostoi.example",
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      NEXT_PUBLIC_PORTAL_KEY: "portal-key",
      SUPABASE_SECRET_KEY: "must-not-leak",
      PORTAL_SECRET: "must-not-leak",
    });

    expect(config).toEqual({
      appUrl: "https://impostoi.example",
      supabaseUrl: "https://supabase.example",
      supabasePublishableKey: "publishable-key",
      portalKey: "portal-key",
    });
    expect(config).not.toHaveProperty("supabaseSecretKey");
    expect(config).not.toHaveProperty("portalSecret");
  });

  test("server config requires all server-only credentials", () => {
    const env: RuntimeEnv = {
      SUPABASE_SECRET_KEY: "supabase-secret",
      PORTAL_SECRET: "portal-secret",
      OPENCODE_ZEN_API_KEY: "zen-key",
    };

    expect(readServerRuntimeConfig(env)).toMatchObject({
      supabaseSecretKey: "supabase-secret",
      portalSecret: "portal-secret",
      opencodeZenApiKey: "zen-key",
      opencodeModel: "mimo-v2.5-free",
    });

    expect(() =>
      readServerRuntimeConfig({
        SUPABASE_SECRET_KEY: "supabase-secret",
        PORTAL_SECRET: "portal-secret",
      }),
    ).toThrow("OPENAI_API_KEY or OPENCODE_ZEN_API_KEY");

    expect(
      readServerRuntimeConfig({
        SUPABASE_SECRET_KEY: "supabase-secret",
        PORTAL_SECRET: "portal-secret",
        OPENAI_API_KEY: "openai-key",
      }),
    ).toMatchObject({
      agentApiKey: "openai-key",
      agentBaseUrl: "https://api.openai.com/v1",
      agentModel: "gpt-4o-mini",
    });
  });
});
