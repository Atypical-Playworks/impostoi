import { describe, expect, test } from "bun:test";

import {
  advanceTimedOutPhase,
  createGame,
  publicViewFor,
  showResults,
  startCluePhase,
  submitClue,
  submitVote,
  viewFor,
} from "./game-state";

const participants = [
  { id: "p1", alias: "Luna", avatar: "a", kind: "player" as const },
  { id: "p2", alias: "Sol", avatar: "b", kind: "player" as const },
  { id: "p3", alias: "Rio", avatar: "c", kind: "player" as const },
  { id: "p4", alias: "Mar", avatar: "d", kind: "player" as const },
  { id: "agent", alias: "IA", avatar: "e", kind: "agent" as const },
];

function readyGame() {
  return startCluePhase(
    createGame({
      matchId: "match-1",
      hostId: "p1",
      participants,
      category: "Animales",
      secretWord: "zorro",
      agentId: "agent",
      random: () => 0.2,
    }),
    "p1",
  );
}

function allClues(state: ReturnType<typeof readyGame>) {
  let current = state;
  for (const p of participants) {
    current = submitClue(current, p.id, `Pista${p.id}`);
  }
  return current;
}

describe("server-authoritative game state", () => {
  test("assigns exactly one independent Impostor and scopes secret information", () => {
    const state = createGame({
      matchId: "match-1",
      hostId: "p1",
      participants,
      category: "Animales",
      secretWord: "zorro",
      agentId: "agent",
      random: () => 0.7,
    });
    const agent = viewFor(state, "agent");
    const impostor = viewFor(state, "p4");
    expect(agent.role).toBe("civilian");
    expect(agent.secretWord).toBe("zorro");
    expect(impostor.role).toBe("impostor");
    expect(impostor.secretWord).toBeUndefined();
    expect(publicViewFor(state)).not.toHaveProperty("secretWord");
    expect(publicViewFor(state).participants[4]).not.toHaveProperty("kind");

    const agentImpostor = createGame({
      matchId: "match-2",
      hostId: "p1",
      participants,
      category: "Animales",
      secretWord: "zorro",
      agentId: "agent",
      random: () => 0.99,
    });
    expect(viewFor(agentImpostor, "agent").role).toBe("impostor");
    expect(viewFor(agentImpostor, "agent").secretWord).toBeUndefined();
  });

  test("enforces phase transitions, authorization, and immutable single-word clues", () => {
    const state = readyGame();
    expect(state.activeTurnId).toBe("p1");
    expect(() => submitClue(state, "p2", "x")).toThrow("not-your-turn");
    expect(() => submitClue(state, "p1", "dos palabras")).toThrow(
      "invalid-clue",
    );

    const withClue = submitClue(state, "p1", "bosque");
    expect(viewFor(withClue, "p1").clues).toEqual([
      { alias: "Luna", text: "bosque" },
    ]);
    expect(withClue.activeTurnId).toBe("p2");
    expect(() => startCluePhase(withClue, "p2")).toThrow("forbidden");
  });

  test("requires all clues and keeps votes private until reveal", () => {
    let state = allClues(readyGame());
    expect(state.phase).toBe("voting");
    expect(state.votingStage).toBe("ai_detection");

    for (const participant of participants.slice(0, -1))
      state = submitVote(state, participant.id, "p1");
    expect(publicViewFor(state)).not.toHaveProperty("voteTally");
    expect(viewFor(state, "p1").ownVotes.ai_detection).toBe("p1");
    state = submitVote(state, "agent", "p2");
    expect(state.votingStage).toBe("impostor");
    state = submitVote(state, "p1", "p1");
    expect(() => submitVote(state, "p1", "p2")).toThrow("duplicate-vote");
    for (const participant of participants.slice(1))
      state = submitVote(state, participant.id, "p1");
    expect(state.phase).toBe("reveal");
    expect(publicViewFor(state).voteTally).toEqual({ p1: 4, p2: 1 });
    expect(publicViewFor(state).impostorVoteTally).toEqual({ p1: 5 });
    expect(showResults(state, "p1").phase).toBe("results");
  });

  test("rejects invalid participant counts", () => {
    expect(() =>
      createGame({
        matchId: "match-1",
        hostId: "p1",
        participants: participants.slice(0, 4),
        category: "Animales",
        secretWord: "zorro",
        agentId: "agent",
      }),
    ).toThrow("invalid-agent");
  });

  test("advances timed-out phases sequentially", () => {
    let state = readyGame();
    expect(state.activeTurnId).toBe("p1");

    // Timeout 4 players sequentially
    for (let i = 0; i < 4; i++) {
      state = advanceTimedOutPhase(state, state.phaseDeadlineAt as number);
    }
    expect(state.round.clues.get("p1")).toBe("vacío");
    expect(state.phase).toBe("clue_phase");
    expect(state.activeTurnId).toBe("agent"); // Last participant

    // Timeout last player goes to voting
    state = advanceTimedOutPhase(state, state.phaseDeadlineAt as number);
    expect(state.phase).toBe("voting");
    expect(state.votingStage).toBe("ai_detection");

    const impostorVoting = advanceTimedOutPhase(
      state,
      state.phaseDeadlineAt as number,
    );
    expect(impostorVoting.phase).toBe("voting");
    expect(impostorVoting.votingStage).toBe("impostor");

    const reveal = advanceTimedOutPhase(
      impostorVoting,
      impostorVoting.phaseDeadlineAt as number,
    );
    expect(reveal.phase).toBe("reveal");
    expect(reveal.phaseDeadlineAt).toBeUndefined();
  });

  test("allows the server Agent to answer after its turn deadline", () => {
    let state = readyGame();
    for (let i = 0; i < 4; i++) {
      state = advanceTimedOutPhase(state, state.phaseDeadlineAt as number);
    }

    const answered = submitClue(
      state,
      "agent",
      "naturaleza",
      (state.phaseDeadlineAt as number) + 1,
    );

    expect(answered.phase).toBe("voting");
    expect(answered.round.clues.get("agent")).toBe("naturaleza");
  });
});
