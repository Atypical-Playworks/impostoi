import type { GameState } from "@/lib/game-state";

type SerializedMap = [string, string][];

type SerializedState = Omit<GameState, "round"> & {
  round: Omit<GameState["round"], "clues" | "votes"> & {
    clues: SerializedMap;
    votes: {
      ai_detection: SerializedMap;
      impostor: SerializedMap;
    };
  };
};

export function serializeGameState(state: GameState): SerializedState {
  return {
    ...state,
    round: {
      ...state.round,
      clues: [...state.round.clues],
      votes: {
        ai_detection: [...state.round.votes.ai_detection],
        impostor: [...state.round.votes.impostor],
      },
    },
  };
}

export function deserializeGameState(value: unknown): GameState {
  if (!isRecord(value) || !isRecord(value.round)) {
    throw new Error("invalid-live-state");
  }
  const round = value.round;
  if (!Array.isArray(round.clues) || !isRecord(round.votes)) {
    throw new Error("invalid-live-state");
  }
  const votes = round.votes;
  if (!Array.isArray(votes.ai_detection) || !Array.isArray(votes.impostor)) {
    throw new Error("invalid-live-state");
  }
  return {
    ...value,
    round: {
      ...round,
      clues: new Map(readMap(round.clues)),
      votes: {
        ai_detection: new Map(readMap(votes.ai_detection)),
        impostor: new Map(readMap(votes.impostor)),
      },
    },
  } as unknown as GameState;
}

function readMap(value: unknown[]): SerializedMap {
  return value.filter(
    (entry): entry is [string, string] =>
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === "string" &&
      typeof entry[1] === "string",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
