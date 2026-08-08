import type { PrivateGameView } from "./game-state";

export type LiveMatchEvent =
  | { type: "snapshot"; view: PrivateGameView }
  | { type: "state"; view: PrivateGameView };

export type LiveActionName =
  | "submit_clue"
  | "start_clue_phase"
  | "start_discussion"
  | "start_voting"
  | "submit_vote"
  | "show_results";

export function readLiveMatchView(value: unknown): PrivateGameView | null {
  if (!isRecord(value)) return null;
  if (value.type !== "snapshot" && value.type !== "state") return null;
  return isPrivateGameView(value.view) ? value.view : null;
}

export function liveAction(
  action: LiveActionName,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...payload, type: "action", action };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPrivateGameView(value: unknown): value is PrivateGameView {
  if (!isRecord(value)) return false;
  return (
    typeof value.matchId === "string" &&
    Number.isInteger(value.roundNumber) &&
    isMatchPhase(value.phase) &&
    Array.isArray(value.participants) &&
    value.participants.every(isParticipant) &&
    typeof value.category === "string" &&
    Array.isArray(value.clues) &&
    value.clues.every(isClue) &&
    typeof value.discussion === "string" &&
    (value.role === "civilian" || value.role === "impostor") &&
    (value.secretWord === undefined || typeof value.secretWord === "string") &&
    isOwnVotes(value.ownVotes)
  );
}

function isMatchPhase(value: unknown): value is PrivateGameView["phase"] {
  return (
    value === "lobby" ||
    value === "clue_phase" ||
    value === "discussion" ||
    value === "voting" ||
    value === "reveal" ||
    value === "results"
  );
}

function isParticipant(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.alias === "string" &&
    typeof value.avatar === "string"
  );
}

function isClue(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.alias === "string" && typeof value.text === "string";
}

function isOwnVotes(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([stage, target]) =>
      (stage === "ai_detection" || stage === "impostor") &&
      typeof target === "string",
  );
}
