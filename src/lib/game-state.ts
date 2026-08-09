export const MATCH_ROUNDS = 3;
export const CLUE_PHASE_TIMEOUT_MS = 10_000;
export const VOTING_TIMEOUT_MS = 20_000;

export type MatchPhase =
  | "lobby"
  | "clue_phase"
  | "voting"
  | "reveal"
  | "results"
  | "match_over";

export type VotingStage = "ai_detection" | "impostor";
export type ParticipantKind = "player" | "agent";
export type HiddenRole = "civilian" | "impostor";

export type Participant = {
  readonly id: string;
  readonly alias: string;
  readonly avatar: string;
  readonly kind: ParticipantKind;
};

export type PublicParticipant = Omit<Participant, "kind">;

type PrivateRound = {
  readonly category: string;
  readonly secretWord: string;
  readonly agentId: string;
  readonly impostorId: string;
  readonly clues: ReadonlyMap<string, string>;
  readonly votes: {
    readonly ai_detection: ReadonlyMap<string, string>;
    readonly impostor: ReadonlyMap<string, string>;
  };
};

export type GameState = {
  readonly matchId: string;
  readonly hostId: string;
  readonly roundNumber: number;
  readonly phase: MatchPhase;
  readonly phaseDeadlineAt?: number;
  readonly votingStage?: VotingStage;
  readonly activeTurnId?: string;
  readonly participants: readonly Participant[];
  readonly round: PrivateRound;
};

export type PublicGameView = {
  matchId: string;
  roundNumber: number;
  phase: MatchPhase;
  phaseDeadlineAt?: number;
  votingStage?: VotingStage;
  activeTurnId?: string;
  participants: readonly PublicParticipant[];
  category: string;
  clues: readonly { alias: string; text: string }[];
  voteTally?: Readonly<Record<string, number>>;
  impostorVoteTally?: Readonly<Record<string, number>>;
  agentId?: string;
  impostorId?: string;
};

export type PrivateGameView = PublicGameView & {
  role: HiddenRole;
  secretWord?: string;
  ownVotes: Partial<Record<VotingStage, string>>;
};

export type CreateGameInput = {
  matchId: string;
  hostId: string;
  participants: readonly Participant[];
  category: string;
  secretWord: string;
  agentId: string;
  random?: () => number;
};

export class GameStateError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "GameStateError";
  }
}

function requireParticipant(state: GameState, actorId: string): Participant {
  const participant = state.participants.find(({ id }) => id === actorId);
  if (!participant) throw new GameStateError("unauthorized");
  return participant;
}

function requireHost(state: GameState, actorId: string): void {
  requireParticipant(state, actorId);
  if (state.hostId !== actorId) throw new GameStateError("forbidden");
}

function requirePhase(state: GameState, phase: MatchPhase): void {
  if (state.phase !== phase) throw new GameStateError("invalid-phase");
}

function requirePhaseOpen(state: GameState, now: number): void {
  if (state.phaseDeadlineAt !== undefined && now >= state.phaseDeadlineAt) {
    throw new GameStateError("phase-timeout");
  }
}

function copyState(state: GameState, changes: Partial<GameState>): GameState {
  return { ...state, ...changes };
}

function deadlineAfter(now: number, durationMs: number): number {
  return now + durationMs;
}

function tally(
  votes: ReadonlyMap<string, string>,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    [...votes.values()].reduce((counts, target) => {
      counts.set(target, (counts.get(target) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  );
}

function allSubmitted(
  state: GameState,
  votes: ReadonlyMap<string, string>,
): boolean {
  return votes.size === state.participants.length;
}

export function createGame(input: CreateGameInput): GameState {
  if (!input.matchId.trim()) {
    throw new GameStateError("invalid-match");
  }
  const players = input.participants.filter(({ kind }) => kind === "player");
  const agents = input.participants.filter(({ kind }) => kind === "agent");
  if (players.length < 3 || players.length > 5) {
    throw new GameStateError("invalid-player-count");
  }
  if (
    input.participants.length !== players.length + 1 ||
    agents.length !== 1 ||
    agents[0]?.id !== input.agentId
  ) {
    throw new GameStateError("invalid-agent");
  }
  if (
    new Set(input.participants.map(({ id }) => id)).size !==
    input.participants.length
  ) {
    throw new GameStateError("duplicate-participant");
  }
  if (!input.participants.some(({ id }) => id === input.hostId)) {
    throw new GameStateError("invalid-host");
  }
  if (
    input.participants.some(
      ({ id, alias, avatar }) => !id.trim() || !alias.trim() || !avatar.trim(),
    )
  ) {
    throw new GameStateError("invalid-participant");
  }
  if (
    new Set(input.participants.map(({ alias }) => alias)).size !==
    input.participants.length
  ) {
    throw new GameStateError("duplicate-alias");
  }
  if (!input.category.trim() || !input.secretWord.trim()) {
    throw new GameStateError("invalid-round-data");
  }

  const random = input.random ?? Math.random;
  const randomValue = random();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new GameStateError("invalid-random");
  }
  const impostor =
    input.participants[Math.floor(randomValue * input.participants.length)];
  if (!impostor) throw new GameStateError("invalid-random");

  return {
    matchId: input.matchId,
    hostId: input.hostId,
    roundNumber: 1,
    phase: "lobby",
    participants: input.participants,
    round: {
      category: input.category,
      secretWord: input.secretWord,
      agentId: input.agentId,
      impostorId: impostor.id,
      clues: new Map(),
      votes: { ai_detection: new Map(), impostor: new Map() },
    },
  };
}

export function startCluePhase(
  state: GameState,
  actorId: string,
  now = Date.now(),
): GameState {
  requireHost(state, actorId);
  requirePhase(state, "lobby");
  return copyState(state, {
    phase: "clue_phase",
    activeTurnId: state.participants[0]?.id,
    phaseDeadlineAt: deadlineAfter(now, CLUE_PHASE_TIMEOUT_MS),
  });
}

function advanceTurn(state: GameState, now: number): GameState {
  const currentIndex = state.participants.findIndex(
    (p) => p.id === state.activeTurnId,
  );
  if (currentIndex === -1 || currentIndex === state.participants.length - 1) {
    return copyState(state, {
      phase: "voting",
      votingStage: "ai_detection",
      activeTurnId: undefined,
      phaseDeadlineAt: deadlineAfter(now, VOTING_TIMEOUT_MS),
    });
  }
  return copyState(state, {
    activeTurnId: state.participants[currentIndex + 1].id,
    phaseDeadlineAt: deadlineAfter(now, CLUE_PHASE_TIMEOUT_MS),
  });
}

export function submitClue(
  state: GameState,
  actorId: string,
  text: string,
  now = Date.now(),
): GameState {
  requireParticipant(state, actorId);
  requirePhase(state, "clue_phase");
  requirePhaseOpen(state, now);
  if (actorId !== state.activeTurnId) throw new GameStateError("not-your-turn");

  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) throw new GameStateError("invalid-clue");

  if (state.round.clues.has(actorId))
    throw new GameStateError("duplicate-clue");
  const clues = new Map(state.round.clues);
  clues.set(actorId, trimmed);

  return advanceTurn(
    copyState(state, { round: { ...state.round, clues } }),
    now,
  );
}

export function submitVote(
  state: GameState,
  actorId: string,
  targetId: string,
  now = Date.now(),
): GameState {
  requireParticipant(state, actorId);
  requirePhase(state, "voting");
  requirePhaseOpen(state, now);
  requireParticipant(state, targetId);
  const stage = state.votingStage ?? "ai_detection";
  const votes = new Map(state.round.votes[stage]);
  if (votes.has(actorId)) throw new GameStateError("duplicate-vote");
  votes.set(actorId, targetId);
  const round = {
    ...state.round,
    votes: { ...state.round.votes, [stage]: votes },
  };
  if (!allSubmitted(state, votes)) return copyState(state, { round });
  if (stage === "ai_detection") {
    return copyState(state, {
      round,
      votingStage: "impostor",
      phaseDeadlineAt: deadlineAfter(now, VOTING_TIMEOUT_MS),
    });
  }
  return copyState(state, {
    round,
    phase: "reveal",
    votingStage: undefined,
    phaseDeadlineAt: undefined,
  });
}

export function advanceTimedOutPhase(
  state: GameState,
  now = Date.now(),
): GameState {
  if (state.phaseDeadlineAt === undefined || now < state.phaseDeadlineAt) {
    return state;
  }

  switch (state.phase) {
    case "clue_phase":
      return advanceTurn(state, now);
    case "voting":
      if (state.votingStage === "ai_detection") {
        return copyState(state, {
          votingStage: "impostor",
          phaseDeadlineAt: deadlineAfter(now, VOTING_TIMEOUT_MS),
        });
      }
      return copyState(state, {
        phase: "reveal",
        votingStage: undefined,
        phaseDeadlineAt: undefined,
      });
    case "lobby":
    case "reveal":
    case "results":
    case "match_over":
      return state;
  }
}

export function showResults(state: GameState, actorId: string): GameState {
  requireHost(state, actorId);
  requirePhase(state, "reveal");
  return copyState(state, { phase: "results", phaseDeadlineAt: undefined });
}

export function startNextRound(
  state: GameState,
  actorId: string,
  category: string,
  secretWord: string,
  now = Date.now(),
  random = Math.random,
): GameState {
  requireHost(state, actorId);
  requirePhase(state, "results");
  if (state.roundNumber >= MATCH_ROUNDS) {
    throw new GameStateError("invalid-phase");
  }

  const randomValue = random();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new GameStateError("invalid-random");
  }
  const impostor =
    state.participants[Math.floor(randomValue * state.participants.length)];
  if (!impostor) throw new GameStateError("invalid-random");

  return copyState(state, {
    roundNumber: state.roundNumber + 1,
    phase: "clue_phase",
    activeTurnId: state.participants[0]?.id,
    phaseDeadlineAt: deadlineAfter(now, CLUE_PHASE_TIMEOUT_MS),
    round: {
      category,
      secretWord,
      agentId: state.round.agentId,
      impostorId: impostor.id,
      clues: new Map(),
      votes: { ai_detection: new Map(), impostor: new Map() },
    },
  });
}

export function endMatch(state: GameState, actorId: string): GameState {
  requireHost(state, actorId);
  requirePhase(state, "results");
  if (state.roundNumber < MATCH_ROUNDS) {
    throw new GameStateError("invalid-phase");
  }
  return copyState(state, { phase: "match_over", phaseDeadlineAt: undefined });
}

export function viewFor(state: GameState, viewerId: string): PrivateGameView {
  requireParticipant(state, viewerId);
  const role: HiddenRole =
    viewerId === state.round.impostorId ? "impostor" : "civilian";
  const publicView = publicViewFor(state);
  return {
    ...publicView,
    role,
    ...(role === "civilian" ? { secretWord: state.round.secretWord } : {}),
    ownVotes: {
      ...(state.round.votes.ai_detection.has(viewerId)
        ? { ai_detection: state.round.votes.ai_detection.get(viewerId) }
        : {}),
      ...(state.round.votes.impostor.has(viewerId)
        ? { impostor: state.round.votes.impostor.get(viewerId) }
        : {}),
    },
  };
}

export function publicViewFor(state: GameState): PublicGameView {
  const participants = state.participants.map(({ id, alias, avatar }) => ({
    id,
    alias,
    avatar,
  }));
  const clues = [...state.round.clues].map(([id, text]) => ({
    alias:
      state.participants.find((participant) => participant.id === id)?.alias ??
      "",
    text,
  }));
  const reveal =
    state.phase === "reveal" ||
    state.phase === "results" ||
    state.phase === "match_over";
  return {
    matchId: state.matchId,
    roundNumber: state.roundNumber,
    phase: state.phase,
    ...(state.phaseDeadlineAt !== undefined
      ? { phaseDeadlineAt: state.phaseDeadlineAt }
      : {}),
    ...(state.votingStage ? { votingStage: state.votingStage } : {}),
    ...(state.activeTurnId ? { activeTurnId: state.activeTurnId } : {}),
    participants,
    category: state.round.category,
    clues,
    ...(reveal
      ? {
          voteTally: tally(state.round.votes.ai_detection),
          impostorVoteTally: tally(state.round.votes.impostor),
          agentId: state.round.agentId,
          impostorId: state.round.impostorId,
        }
      : {}),
  };
}
