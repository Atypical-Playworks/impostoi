import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  advanceTimedOutPhase,
  createGame,
  publicViewFor,
  showResults,
  startCluePhase,
  startDiscussion,
  startVoting,
  submitClue,
  submitVote,
  viewFor,
} from "@/lib/game-state";
import {
  deserializeGameState,
  serializeGameState,
} from "@/lib/live-game-state";
import { publishPrivateViews } from "@/lib/portal-server";
import {
  normalizeRoomCode,
  roomError,
  validateAlias,
  validateAvatar,
  validateRoomCode,
} from "@/lib/room-lifecycle";
import { readServerRuntimeConfig } from "@/lib/server-env-config";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

type ActionBody = {
  action?: string;
  alias?: string;
  avatar?: string;
  text?: string;
  discussion?: string;
  stage?: "ai_detection" | "impostor";
  targetId?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const code = normalizeRoomCode((await params).roomId);
  if (!validateRoomCode(code))
    return NextResponse.json(roomError("invalid-room"), { status: 400 });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(roomError("session-expired"), { status: 401 });

  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return NextResponse.json(roomError("room-unavailable"), { status: 400 });
  }

  const admin = createSupabaseAdminClient(
    readServerRuntimeConfig().supabaseSecretKey,
  );
  let { data: participants, error: participantError } = await admin
    .from("room_participants")
    .select("player_id, alias, avatar, is_host")
    .eq("room_code", code);
  if (!participants?.some((item) => item.player_id === user.id)) {
    const { data: room } = await admin
      .from("rooms")
      .select("host_player_id, status")
      .eq("code", code)
      .maybeSingle();
    if (
      room?.host_player_id === user.id &&
      room.status === "lobby" &&
      validateAlias(body.alias) &&
      validateAvatar(body.avatar)
    ) {
      await admin.from("room_participants").upsert({
        room_code: code,
        player_id: user.id,
        alias: body.alias.trim(),
        avatar: body.avatar.trim(),
        is_host: true,
      });
      const refreshed = await admin
        .from("room_participants")
        .select("player_id, alias, avatar, is_host")
        .eq("room_code", code);
      participants = refreshed.data;
      participantError = refreshed.error;
    }
  }
  if (
    participantError ||
    !participants?.some((item) => item.player_id === user.id)
  )
    return NextResponse.json(roomError("room-unavailable"), { status: 403 });

  const participant = participants.find((item) => item.player_id === user.id);
  const action = body.action;
  const existing = await admin
    .from("live_match_states")
    .select("match_id, state")
    .eq("room_code", code)
    .maybeSingle();

  let state = existing.data?.state
    ? deserializeGameState(existing.data.state)
    : null;
  try {
    if (!state) {
      if (action !== "start_clue_phase" || participant?.is_host !== true)
        return NextResponse.json(roomError("room-unavailable"), {
          status: 409,
        });
      if (participants.length < 4)
        return NextResponse.json(roomError("room-full"), { status: 409 });
      state = createGame({
        matchId: randomUUID(),
        hostId: user.id,
        participants: [
          ...participants.map((item) => ({
            id: item.player_id,
            alias: item.alias,
            avatar: item.avatar,
            kind: "player" as const,
          })),
          { id: "agent", alias: "Nube", avatar: "#7C3AED", kind: "agent" },
        ],
        category: "Animales",
        secretWord: "zorro",
        agentId: "agent",
      });
    }

    switch (action) {
      case "start_clue_phase":
        state = startCluePhase(state, user.id);
        break;
      case "submit_clue":
        state = submitClue(state, user.id, body.text ?? "");
        break;
      case "start_discussion":
        if (!state.round.clues.has("agent")) {
          state = submitClue(state, "agent", "naturaleza");
        }
        state = startDiscussion(state, user.id);
        break;
      case "start_voting":
        state = startVoting(state, user.id, body.discussion ?? "");
        break;
      case "submit_vote":
        state = submitVote(state, user.id, body.targetId ?? "");
        if (
          !state.round.votes[state.votingStage ?? "ai_detection"].has("agent")
        ) {
          const target = state.participants.find(
            ({ kind }) => kind === "player",
          );
          if (target) state = submitVote(state, "agent", target.id);
        }
        break;
      case "show_results":
        state = showResults(state, user.id);
        break;
      default:
        return NextResponse.json(roomError("room-unavailable"), {
          status: 400,
        });
    }
    state = advanceTimedOutPhase(state);
  } catch {
    return NextResponse.json(roomError("room-unavailable"), { status: 409 });
  }

  const serialized = serializeGameState(state);
  if (!existing.data) {
    const { error: roomUpdateError } = await admin
      .from("rooms")
      .update({ status: "started" })
      .eq("code", code)
      .eq("status", "lobby");
    if (roomUpdateError)
      return NextResponse.json(roomError("room-unavailable"), {
        status: 503,
      });
  }
  const { error: saveError } = await admin.from("live_match_states").upsert({
    room_code: code,
    match_id: state.matchId,
    state: serialized,
    updated_at: new Date().toISOString(),
  });
  if (saveError)
    return NextResponse.json(roomError("room-unavailable"), { status: 503 });

  await publishPrivateViews(
    code,
    participants.map((item) => ({
      userId: item.player_id,
      content: { type: "state", view: viewFor(state, item.player_id) },
    })),
  );
  return NextResponse.json({ ok: true, view: publicViewFor(state) });
}
