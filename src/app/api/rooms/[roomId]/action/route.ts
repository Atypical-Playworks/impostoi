import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAgentAdapter } from "@/lib/agent-adapter";
import {
  advanceTimedOutPhase,
  createGame,
  endMatch,
  publicViewFor,
  showResults,
  startCluePhase,
  startNextRound,
  submitClue,
  submitVote,
  viewFor,
} from "@/lib/game-state";
import {
  deserializeGameState,
  serializeGameState,
} from "@/lib/live-game-state";
import type { LiveActionName } from "@/lib/live-match";
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

const DEFAULT_CATEGORIES = [
  { category: "Animales", word: "zorro" },
  { category: "Colores", word: "turquesa" },
  { category: "Deportes", word: "baloncesto" },
  { category: "Frutas", word: "sandia" },
  { category: "Paises", word: "brasil" },
];

function randomCategory() {
  return DEFAULT_CATEGORIES[
    Math.floor(Math.random() * DEFAULT_CATEGORIES.length)
  ];
}

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
      const pick = randomCategory();
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
        category: pick.category,
        secretWord: pick.word,
        agentId: "agent",
      });
    }

    switch (action as LiveActionName) {
      case "start_clue_phase":
        state = startCluePhase(state, user.id);
        break;
      case "submit_clue":
        state = submitClue(state, user.id, body.text ?? "");
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
      case "start_next_round": {
        const pick = randomCategory();
        state = startNextRound(state, user.id, pick.category, pick.word);
        break;
      }
      case "end_match":
        state = endMatch(state, user.id);
        break;
      default:
        return NextResponse.json(roomError("room-unavailable"), {
          status: 400,
        });
    }

    if (!state)
      return NextResponse.json(roomError("room-unavailable"), { status: 409 });

    state = advanceTimedOutPhase(state);

    const config = readServerRuntimeConfig();
    if (!state) {
      return NextResponse.json(roomError("room-unavailable"), { status: 409 });
    }
    const adapter = createAgentAdapter({
      apiKey: config.opencodeZenApiKey,
      baseUrl: config.opencodeZenBaseUrl,
    });

    if (
      state &&
      state.phase === "clue_phase" &&
      state.activeTurnId === "agent"
    ) {
      const publicClues = [...state.round.clues.entries()].map(
        ([id, text]) => ({
          alias: state.participants.find((p) => p.id === id)?.alias ?? id,
          text,
        }),
      );
      const isImpostor = state.round.impostorId === "agent";

      const result = await adapter.act({
        action: "clue",
        model: { id: config.opencodeModel, provider: "opencode", version: "1" },
        strategy: "cautious-imitator",
        role: isImpostor ? "impostor" : "civilian",
        category: state.round.category,
        secretWord: isImpostor ? undefined : state.round.secretWord,
        clues: publicClues,
        discussion: "",
      });

      if (result.action === "clue" && "text" in result.output) {
        state = submitClue(state, "agent", result.output.text);
      } else {
        state = submitClue(state, "agent", "naturaleza");
      }
    } else if (state && state.phase === "voting") {
      const currentVotes =
        state.round.votes[state.votingStage ?? "ai_detection"];
      if (!currentVotes.has("agent")) {
        const publicClues = [...state.round.clues.entries()].map(
          ([id, text]) => ({
            alias: state.participants.find((p) => p.id === id)?.alias ?? id,
            text,
          }),
        );
        const isImpostor = state.round.impostorId === "agent";
        const result = await adapter.act({
          action: "vote",
          model: {
            id: config.opencodeModel,
            provider: "opencode",
            version: "1",
          },
          strategy: "cautious-imitator",
          role: isImpostor ? "impostor" : "civilian",
          category: state.round.category,
          secretWord: isImpostor ? undefined : state.round.secretWord,
          clues: publicClues,
          discussion: "",
        });

        if (result.action === "vote" && "alias" in result.output) {
          const targetAlias = result.output.alias;
          const target = state.participants.find(
            (p) => p.alias === targetAlias,
          );
          if (target && target.id !== "agent") {
            state = submitVote(state, "agent", target.id);
          } else {
            const fallback = state.participants.find(
              (p) => p.kind === "player",
            );
            if (fallback) state = submitVote(state, "agent", fallback.id);
          }
        } else {
          const fallback = state.participants.find((p) => p.kind === "player");
          if (fallback) state = submitVote(state, "agent", fallback.id);
        }
      }
    }
  } catch (_err) {
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
