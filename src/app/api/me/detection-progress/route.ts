import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json(
      { error: "Authentication is required" },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("player_progress")
    .select(
      "rounds_played, ai_detections, impostor_detections, ai_detection_attempts, ai_detection_successes, impostor_attempts, impostor_successes, updated_at",
    )
    .eq("player_id", authData.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Unable to load detection progress" },
      { status: 502 },
    );
  }

  return NextResponse.json({ progress: data });
}
