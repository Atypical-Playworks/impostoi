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

type RoomParticipantRow = {
  player_id: string;
  alias: string;
  avatar: string;
  is_host: boolean;
  seat_status: "pending" | "confirmed";
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
  let { data: participantData, error: participantError } = await admin.rpc(
    "get_room_participants",
    { requested_code: code },
  );
  let participants = Array.isArray(participantData)
    ? (participantData as RoomParticipantRow[])
    : [];
  if (!participants?.some((item) => item.player_id === user.id)) {
    const { data: hostId } = await admin.rpc("get_room_host", {
      requested_code: code,
    });
    if (
      hostId === user.id &&
      validateAlias(body.alias) &&
      validateAvatar(body.avatar)
    ) {
      await admin.rpc("restore_lobby_host", {
        requested_code: code,
        requested_player_id: user.id,
        requested_alias: body.alias.trim(),
        requested_avatar: body.avatar.trim(),
      });
      const refreshed = await admin.rpc("get_room_participants", {
        requested_code: code,
      });
      participantData = refreshed.data;
      participants = Array.isArray(participantData)
        ? (participantData as RoomParticipantRow[])
        : [];
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
  const existing = await admin.rpc("read_live_match_state", {
    requested_code: code,
  });
  if (existing.error)
    return NextResponse.json(roomError("room-unavailable"), { status: 503 });

  let state = existing.data?.state
    ? deserializeGameState(existing.data.state)
    : null;
  try {
    if (!state) {
      if (action !== "start_clue_phase" || participant?.is_host !== true)
        return NextResponse.json(roomError("room-unavailable"), {
          status: 409,
        });
      const confirmedParticipants = participants.filter(
        (item) => item.seat_status === "confirmed",
      );
      if (
        confirmedParticipants.length < 4 ||
        participant?.seat_status !== "confirmed"
      )
        return NextResponse.json(roomError("room-full"), { status: 409 });
      state = createGame({
        matchId: randomUUID(),
        hostId: user.id,
        participants: [
          ...confirmedParticipants.map((item) => ({
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
    const { error: roomUpdateError } = await admin.rpc("mark_room_started", {
      requested_code: code,
    });
    if (roomUpdateError)
      return NextResponse.json(roomError("room-unavailable"), {
        status: 503,
      });
  }
  const { error: saveError } = await admin.rpc("write_live_match_state", {
    requested_code: code,
    requested_match_id: state.matchId,
    requested_state: serialized,
  });
  if (saveError)
    return NextResponse.json(roomError("room-unavailable"), { status: 503 });

  await publishPrivateViews(
    code,
    participants
      .filter((item) => item.seat_status === "confirmed")
      .map((item) => ({
        userId: item.player_id,
        content: { type: "state", view: viewFor(state, item.player_id) },
      })),
  );
  return NextResponse.json({ ok: true, view: publicViewFor(state) });
}
