import { describe, expect, test } from "bun:test";

import { createGame } from "./game-state";
import { deserializeGameState, serializeGameState } from "./live-game-state";

const state = createGame({
  matchId: "match-1",
  hostId: "p1",
  participants: [
    { id: "p1", alias: "Ana", avatar: "sun", kind: "player" },
    { id: "p2", alias: "Luis", avatar: "moon", kind: "player" },
    { id: "p3", alias: "Sol", avatar: "star", kind: "player" },
    { id: "p4", alias: "Rio", avatar: "rain", kind: "player" },
    { id: "agent", alias: "IA", avatar: "cloud", kind: "agent" },
  ],
  category: "Animales",
  secretWord: "zorro",
  agentId: "agent",
  random: () => 0,
});

describe("live game state persistence", () => {
  test("round maps survive JSON serialization", () => {
    const restored = deserializeGameState(
      JSON.parse(JSON.stringify(serializeGameState(state))),
    );
    expect(restored.participants).toEqual(state.participants);
    expect(restored.round.clues).toBeInstanceOf(Map);
    expect(restored.round.votes.ai_detection).toBeInstanceOf(Map);
    expect(restored.round.secretWord).toBe("zorro");
  });
});
