import "server-only";

import type { RuntimeEnv } from "./public-env";

export type ServerRuntimeConfig = {
  supabaseSecretKey: string;
  portalSecret: string;
  portalApiUrl: string;
  agentApiKey: string;
  agentBaseUrl: string;
  agentModel: string;
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
  const agentApiKey = env.OPENAI_API_KEY ?? env.OPENCODE_ZEN_API_KEY;
  if (!agentApiKey) {
    throw new Error(
      "Missing required server environment variable: OPENAI_API_KEY or OPENCODE_ZEN_API_KEY",
    );
  }
  const usesOpenAi = Boolean(env.OPENAI_API_KEY);
  return {
    supabaseSecretKey: required(env, "SUPABASE_SECRET_KEY"),
    portalSecret: required(env, "PORTAL_SECRET"),
    portalApiUrl: env.PORTAL_API_URL ?? "https://api.useportal.co",
    agentApiKey,
    agentBaseUrl: usesOpenAi
      ? (env.OPENAI_BASE_URL ?? "https://api.openai.com/v1")
      : (env.OPENCODE_ZEN_BASE_URL ?? "https://opencode.ai/zen/v1"),
    agentModel: usesOpenAi
      ? (env.OPENAI_MODEL ?? "gpt-4o-mini")
      : (env.OPENCODE_MODEL ?? "mimo-v2.5-free"),
    opencodeZenApiKey: env.OPENCODE_ZEN_API_KEY ?? agentApiKey,
    opencodeZenBaseUrl:
      env.OPENCODE_ZEN_BASE_URL ?? "https://opencode.ai/zen/v1",
    opencodeModel: env.OPENCODE_MODEL ?? "mimo-v2.5-free",
  };
}
