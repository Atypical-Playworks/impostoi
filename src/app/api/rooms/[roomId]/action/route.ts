import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAgentAdapter } from "@/lib/agent-adapter";
import {
  advanceTimedOutPhase,
  createGame,
  endMatch,
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
  const activeTurnBeforeAction = state?.activeTurnId;
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
        confirmedParticipants.length < 3 ||
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
          { id: "agent", alias: "IA", avatar: "#7C3AED", kind: "agent" },
        ],
        category: pick.category,
        secretWord: pick.word,
        agentId: "agent",
      });
    } else if (action === "start_clue_phase" && state.phase !== "lobby") {
      // Already started — idempotent: just broadcast current state.
      return NextResponse.json({ ok: true, view: viewFor(state, user.id) });
    }

    switch (action as LiveActionName) {
      case "tick":
        break;
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

    const agentTurnExpired = Boolean(
      state?.phase === "clue_phase" &&
        state.activeTurnId === "agent" &&
        activeTurnBeforeAction === "agent" &&
        state.phaseDeadlineAt !== undefined &&
        Date.now() >= state.phaseDeadlineAt,
    );
    if (!agentTurnExpired) state = advanceTimedOutPhase(state);
    if (!state) {
      return NextResponse.json(roomError("room-unavailable"), { status: 409 });
    }

    const nonNullState = state;
    if (
      nonNullState.phase === "clue_phase" &&
      nonNullState.activeTurnId === "agent" &&
      agentTurnExpired
    ) {
      const { data: claimed, error: claimError } = await admin.rpc(
        "claim_agent_turn",
        {
          requested_code: code,
          requested_match_id: nonNullState.matchId,
          requested_turn_key: `clue:${nonNullState.roundNumber}`,
        },
      );
      if (claimError)
        return NextResponse.json(roomError("room-unavailable"), {
          status: 503,
        });
      if (claimed !== true) {
        state = nonNullState;
      } else {
        const config = readServerRuntimeConfig();
        const adapter = createAgentAdapter({
          apiKey: config.agentApiKey,
          baseUrl: config.agentBaseUrl,
          timeoutMs: 4000,
        });

        const publicClues = [...nonNullState.round.clues.entries()].map(
          ([id, text]) => ({
            alias:
              nonNullState.participants.find((p) => p.id === id)?.alias ?? id,
            text,
          }),
        );
        const isImpostor = nonNullState.round.impostorId === "agent";

        const result = await adapter.act({
          action: "clue",
          model: {
            id: config.agentModel,
            provider: "opencode",
            version: "1",
          },
          strategy: "cautious-imitator",
          role: isImpostor ? "impostor" : "civilian",
          category: nonNullState.round.category,
          secretWord: isImpostor ? undefined : nonNullState.round.secretWord,
          clues: publicClues,
          discussion: "",
        });

        const generatedClue =
          result.action === "clue" && "text" in result.output
            ? result.output.text.trim().split(/\s+/)[0]
            : "naturaleza";
        state = submitClue(state, "agent", generatedClue || "naturaleza");
        console.info("Agent clue completed", {
          roomCode: code,
          round: nonNullState.roundNumber,
          model: config.agentModel,
          baseUrl: config.agentBaseUrl,
          fallback: result.metadata.fallback,
          responseTimeMs: result.metadata.responseTimeMs,
        });
      }
    } else if (nonNullState.phase === "voting") {
      const currentVotes =
        nonNullState.round.votes[nonNullState.votingStage ?? "ai_detection"];
      if (!currentVotes.has("agent")) {
        const { data: claimed, error: claimError } = await admin.rpc(
          "claim_agent_turn",
          {
            requested_code: code,
            requested_match_id: nonNullState.matchId,
            requested_turn_key: `vote:${nonNullState.roundNumber}:${nonNullState.votingStage ?? "ai_detection"}`,
          },
        );
        if (claimError)
          return NextResponse.json(roomError("room-unavailable"), {
            status: 503,
          });
        if (claimed !== true) {
          state = nonNullState;
        } else {
          const config = readServerRuntimeConfig();
          const adapter = createAgentAdapter({
            apiKey: config.agentApiKey,
            baseUrl: config.agentBaseUrl,
            timeoutMs: 4000,
          });

          const publicClues = [...nonNullState.round.clues.entries()].map(
            ([id, text]) => ({
              alias:
                nonNullState.participants.find((p) => p.id === id)?.alias ?? id,
              text,
            }),
          );
          const isImpostor = state.round.impostorId === "agent";
          const result = await adapter.act({
            action: "vote",
            model: {
              id: config.agentModel,
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
            const fallback = state.participants.find(
              (p) => p.kind === "player",
            );
            if (fallback) state = submitVote(state, "agent", fallback.id);
          }
          console.info("Agent vote completed", {
            roomCode: code,
            round: nonNullState.roundNumber,
            stage: nonNullState.votingStage ?? "ai_detection",
            fallback: result.metadata.fallback,
            responseTimeMs: result.metadata.responseTimeMs,
          });
        }
      }
    }
  } catch (err) {
    if (err instanceof Error) {
      console.error("Action Error:", err.message, err.stack);
    } else {
      console.error("Action Error (unknown):", err);
    }
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

  try {
    await publishPrivateViews(
      code,
      participants
        .filter((item) => item.seat_status === "confirmed")
        .map((item) => ({
          userId: item.player_id,
          content: { type: "state", view: viewFor(state, item.player_id) },
        })),
    );
  } catch (err) {
    console.error("Failed private view dispatch:", err);
    return NextResponse.json(roomError("room-unavailable"), { status: 503 });
  }
  return NextResponse.json({ ok: true, view: viewFor(state, user.id) });
}
