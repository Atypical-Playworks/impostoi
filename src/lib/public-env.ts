export type RuntimeEnv = Record<string, string | undefined>;

export type PublicRuntimeConfig = {
  appUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  portalKey: string;
};

export function readPublicRuntimeConfig(
  env: RuntimeEnv = process.env,
): PublicRuntimeConfig {
  return {
    appUrl: env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabasePublishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    portalKey: env.NEXT_PUBLIC_PORTAL_KEY ?? "",
  };
}

export const publicRuntimeConfig = readPublicRuntimeConfig();
