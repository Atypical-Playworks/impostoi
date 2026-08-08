import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_rankings")
    .select(
      "agent_model, agent_provider, agent_strategy, agent_version, games_counted, rounds_counted, camouflage_detected, camouflage_escaped, camouflage_inconclusive, impostor_rounds, impostor_wins, impostor_losses, impostor_inconclusive, ai_votes, response_time_ms, camouflage_rate, impostor_win_rate, average_ai_votes, average_response_time_ms",
    )
    .order("camouflage_rate", { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json(
      { error: "Unable to load Agent rankings" },
      { status: 502 },
    );
  }

  return NextResponse.json({ rankings: data ?? [] });
}
