import { expect, test } from "bun:test";

import { aggregateAgentStatistics } from "./agent-statistics";

test("keeps camouflage and Impostor metrics separate", () => {
  const stats = aggregateAgentStatistics([
    {
      matchId: "match-1",
      fallback: false,
      agentWasImpostor: false,
      aiDetection: "escaped",
      impostorWin: "inconclusive",
      aiVotes: 1,
      responseTimeMs: 100,
    },
    {
      matchId: "match-1",
      fallback: false,
      agentWasImpostor: true,
      aiDetection: "detected",
      impostorWin: "won",
      aiVotes: 4,
      responseTimeMs: 300,
    },
    {
      matchId: "match-1",
      fallback: false,
      agentWasImpostor: false,
      aiDetection: "inconclusive",
      impostorWin: "inconclusive",
      aiVotes: 0,
      responseTimeMs: 200,
    },
  ]);

  expect(stats).toMatchObject({
    roundsCounted: 3,
    camouflageDetected: 1,
    camouflageEscaped: 1,
    camouflageInconclusive: 1,
    impostorRounds: 1,
    impostorWins: 1,
    impostorLosses: 0,
    impostorWinRate: 1,
    camouflageRate: 0.5,
    aiVotes: 5,
    responseTimeMs: 600,
    averageResponseTimeMs: 200,
  });
});

test("excludes every fallback round from competitive aggregates", () => {
  const stats = aggregateAgentStatistics([
    {
      matchId: "match-2",
      fallback: true,
      agentWasImpostor: true,
      aiDetection: "escaped",
      impostorWin: "won",
      aiVotes: 5,
      responseTimeMs: 1,
    },
  ]);

  expect(stats).toMatchObject({
    gamesCounted: 0,
    roundsCounted: 0,
    impostorRounds: 0,
    camouflageRate: null,
    impostorWinRate: null,
  });
});

test("counts each eligible match once even when it has multiple rounds", () => {
  const stats = aggregateAgentStatistics([
    {
      matchId: "match-1",
      fallback: false,
      agentWasImpostor: false,
      aiDetection: "escaped",
      impostorWin: "inconclusive",
      aiVotes: 1,
      responseTimeMs: 10,
    },
    {
      matchId: "match-1",
      fallback: false,
      agentWasImpostor: false,
      aiDetection: "escaped",
      impostorWin: "inconclusive",
      aiVotes: 1,
      responseTimeMs: 10,
    },
    {
      matchId: "match-2",
      fallback: false,
      agentWasImpostor: false,
      aiDetection: "detected",
      impostorWin: "inconclusive",
      aiVotes: 2,
      responseTimeMs: 20,
    },
  ]);

  expect(stats.gamesCounted).toBe(2);
});
