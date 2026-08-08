import { createBrowserClient } from "@supabase/ssr";

import { publicRuntimeConfig } from "@/lib/public-env";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    publicRuntimeConfig.supabaseUrl,
    publicRuntimeConfig.supabasePublishableKey,
  );
}
