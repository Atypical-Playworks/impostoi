import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicRuntimeConfig } from "@/lib/public-env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicRuntimeConfig.supabaseUrl,
    publicRuntimeConfig.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot always write cookies. Middleware refreshes them.
          }
        },
      },
    },
  );
}
