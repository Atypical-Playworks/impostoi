import type { PrivateGameView } from "./game-state";

export type LiveMatchEvent =
  | { type: "snapshot"; view: PrivateGameView }
  | { type: "state"; view: PrivateGameView };

export function readLiveMatchView(value: unknown): PrivateGameView | null {
  if (!isRecord(value)) return null;
  const event = value as Partial<LiveMatchEvent>;
  if (event.type !== "snapshot" && event.type !== "state") return null;
  if (!isPrivateGameView(event.view)) return null;
  return event.view;
}

export function liveAction(
  action: string,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type: "action", action, ...payload };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPrivateGameView(value: unknown): value is PrivateGameView {
  if (!isRecord(value)) return false;
  return (
    typeof value.matchId === "string" &&
    typeof value.roundNumber === "number" &&
    typeof value.phase === "string" &&
    Array.isArray(value.participants) &&
    typeof value.category === "string" &&
    Array.isArray(value.clues) &&
    typeof value.discussion === "string" &&
    (value.role === "civilian" || value.role === "impostor") &&
    isRecord(value.ownVotes)
  );
}
