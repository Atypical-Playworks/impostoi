import type { MatchPhase, VotingStage } from "./game-state";

export function phaseTitle(phase: MatchPhase): string {
  switch (phase) {
    case "lobby":
      return "Sala de espera";
    case "clue_phase":
      return "Turno de pistas";
    case "voting":
      return "Votacion privada";
    case "reveal":
      return "La verdad sale a la luz";
    case "results":
      return "Resultados";
    case "match_over":
      return "Partida finalizada";
  }
}

export function votingTitle(stage: VotingStage): string {
  return stage === "ai_detection" ? "Quien es la IA?" : "Quien es el impostor?";
}

export function formatTimer(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(
    safeSeconds % 60,
  ).padStart(2, "0")}`;
}

export function canSubmitClue(clue: string, submitted: boolean): boolean {
  const trimmed = clue.trim();
  return !submitted && trimmed.length > 0 && !/\s/.test(trimmed);
}
