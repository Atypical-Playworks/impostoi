import { NextResponse } from "next/server";

import { readPublicRuntimeConfig } from "@/lib/public-env";

export const dynamic = "force-dynamic";

export function GET() {
  const config = readPublicRuntimeConfig();
  return NextResponse.json({
    supabaseUrl: config.supabaseUrl,
    supabasePublishableKey: config.supabasePublishableKey,
    portalKey: config.portalKey,
  });
}
