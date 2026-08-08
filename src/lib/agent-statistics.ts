export type AgentRoundResult = {
  readonly matchId: string;
  readonly fallback: boolean;
  readonly agentWasImpostor: boolean;
  readonly aiDetection: "detected" | "escaped" | "inconclusive";
  readonly impostorWin: "won" | "lost" | "inconclusive";
  readonly aiVotes: number;
  readonly responseTimeMs: number;
};

export type AgentStatistics = {
  readonly gamesCounted: number;
  readonly roundsCounted: number;
  readonly camouflageDetected: number;
  readonly camouflageEscaped: number;
  readonly camouflageInconclusive: number;
  readonly impostorRounds: number;
  readonly impostorWins: number;
  readonly impostorLosses: number;
  readonly impostorInconclusive: number;
  readonly aiVotes: number;
  readonly responseTimeMs: number;
  readonly camouflageRate: number | null;
  readonly impostorWinRate: number | null;
  readonly averageAiVotes: number | null;
  readonly averageResponseTimeMs: number | null;
};

const emptyCounts = () => ({
  gamesCounted: 0,
  roundsCounted: 0,
  camouflageDetected: 0,
  camouflageEscaped: 0,
  camouflageInconclusive: 0,
  impostorRounds: 0,
  impostorWins: 0,
  impostorLosses: 0,
  impostorInconclusive: 0,
  aiVotes: 0,
  responseTimeMs: 0,
});

export function aggregateAgentStatistics(
  rounds: readonly AgentRoundResult[],
): AgentStatistics {
  const counts = emptyCounts();
  const countedGames = new Set<string>();

  for (const round of rounds) {
    if (round.fallback) continue;

    counts.roundsCounted += 1;
    counts.aiVotes += round.aiVotes;
    counts.responseTimeMs += round.responseTimeMs;

    if (round.aiDetection === "detected") counts.camouflageDetected += 1;
    if (round.aiDetection === "escaped") counts.camouflageEscaped += 1;
    if (round.aiDetection === "inconclusive")
      counts.camouflageInconclusive += 1;
    countedGames.add(round.matchId);

    if (!round.agentWasImpostor) continue;
    counts.impostorRounds += 1;
    if (round.impostorWin === "won") counts.impostorWins += 1;
    if (round.impostorWin === "lost") counts.impostorLosses += 1;
    if (round.impostorWin === "inconclusive") counts.impostorInconclusive += 1;
  }

  const camouflageDecisions =
    counts.camouflageDetected + counts.camouflageEscaped;
  const impostorDecisions = counts.impostorWins + counts.impostorLosses;

  return {
    ...counts,
    gamesCounted: countedGames.size,
    camouflageRate:
      camouflageDecisions === 0
        ? null
        : counts.camouflageEscaped / camouflageDecisions,
    impostorWinRate:
      impostorDecisions === 0 ? null : counts.impostorWins / impostorDecisions,
    averageAiVotes:
      counts.roundsCounted === 0 ? null : counts.aiVotes / counts.roundsCounted,
    averageResponseTimeMs:
      counts.roundsCounted === 0
        ? null
        : counts.responseTimeMs / counts.roundsCounted,
  };
}
