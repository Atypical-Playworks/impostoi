import "server-only";

import type { RuntimeEnv } from "./public-env";

export type ServerRuntimeConfig = {
  supabaseSecretKey: string;
  portalSecret: string;
  opencodeZenApiKey: string;
  opencodeZenBaseUrl: string;
  opencodeModel: string;
};

function required(env: RuntimeEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

export function readServerRuntimeConfig(
  env: RuntimeEnv = process.env,
): ServerRuntimeConfig {
  return {
    supabaseSecretKey: required(env, "SUPABASE_SECRET_KEY"),
    portalSecret: required(env, "PORTAL_SECRET"),
    opencodeZenApiKey: required(env, "OPENCODE_ZEN_API_KEY"),
    opencodeZenBaseUrl:
      env.OPENCODE_ZEN_BASE_URL ?? "https://opencode.ai/zen/v1",
    opencodeModel: env.OPENCODE_MODEL ?? "mimo-v2.5-free",
  };
}
