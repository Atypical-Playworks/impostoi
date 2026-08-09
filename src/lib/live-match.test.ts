import { describe, expect, test } from "bun:test";

import { canStartLobby, liveAction, readLiveMatchView } from "./live-match";

const view = {
  matchId: "match-1",
  roundNumber: 1,
  phase: "clue_phase" as const,
  participants: [{ id: "p1", alias: "Ana", avatar: "sun" }],
  category: "Animales",
  clues: [],
  discussion: "",
  role: "civilian" as const,
  secretWord: "zorro",
  ownVotes: {},
};

describe("live match Portal events", () => {
  test("only enables lobby start when all start requirements are met", () => {
    expect(
      canStartLobby({ participantCount: 2, agentReady: true, isHost: true }),
    ).toBe(false);
    expect(
      canStartLobby({ participantCount: 4, agentReady: false, isHost: true }),
    ).toBe(false);
    expect(
      canStartLobby({ participantCount: 4, agentReady: true, isHost: false }),
    ).toBe(false);
    expect(
      canStartLobby({ participantCount: 4, agentReady: true, isHost: true }),
    ).toBe(true);
  });

  test("accepts only a private game snapshot or state event", () => {
    expect(readLiveMatchView({ type: "snapshot", view })).toEqual(view);
    expect(readLiveMatchView({ type: "chat", view })).toBeNull();
    expect(
      readLiveMatchView({
        type: "state",
        view: { ...view, participants: [{ id: "p1" }] },
      }),
    ).toBeNull();
    expect(
      readLiveMatchView({ type: "state", view: { ...view, role: "secret" } }),
    ).toBeNull();
  });

  test("builds server-authorized action messages without local outcomes", () => {
    expect(liveAction("submit_clue", { text: "bosque" })).toEqual({
      type: "action",
      action: "submit_clue",
      text: "bosque",
    });
    expect(
      liveAction("submit_clue", { type: "spoof", action: "spoof" }),
    ).toEqual({
      type: "action",
      action: "submit_clue",
    });
  });
});
