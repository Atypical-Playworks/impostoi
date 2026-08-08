import "server-only";

export type CompletedMatchPayload = {
  readonly match: {
    readonly id: string;
    readonly status: "completed";
    readonly agent_model: string;
    readonly agent_provider: string;
    readonly agent_strategy: string;
    readonly agent_version: string;
    readonly fallback_match: boolean;
    readonly started_at: string;
    readonly completed_at: string;
  };
  readonly participants: readonly {
    readonly participant_id: string;
    readonly player_id?: string;
    readonly alias: string;
    readonly avatar: string;
    readonly kind: "player" | "agent";
  }[];
  readonly rounds: readonly {
    readonly round: {
      readonly round_number: number;
      readonly category: string;
      readonly secret_word: string;
      readonly agent_participant_id: string;
      readonly impostor_participant_id: string;
      readonly outcome: Record<string, unknown>;
      readonly completed_at: string;
    };
    readonly statistics?: {
      readonly agent_was_impostor: boolean;
      readonly ai_detection: "detected" | "escaped" | "inconclusive";
      readonly impostor_win: "won" | "lost" | "inconclusive";
      readonly ai_votes: number;
      readonly response_time_ms: number;
    };
    readonly clues: readonly Record<string, unknown>[];
    readonly votes: readonly Record<string, unknown>[];
    readonly agent_events: readonly Record<string, unknown>[];
  }[];
  readonly replay: {
    readonly payload: Record<string, unknown>;
    readonly retention_expires_at: string;
  };
  readonly public_summary: {
    readonly rounds_played: number;
    readonly fallback_match: boolean;
    readonly summary: Record<string, unknown>;
  };
};

export type MatchPersistence = {
  persistCompletedMatch(payload: CompletedMatchPayload): Promise<string>;
  loadMatch(matchId: string): Promise<Record<string, unknown> | null>;
};

type PersistenceClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createMatchPersistence(
  client: PersistenceClient,
): MatchPersistence {
  return {
    async persistCompletedMatch(payload) {
      const { data, error } = await client.rpc("persist_completed_match", {
        match_payload: payload,
      });
      if (error) throw new Error(`Unable to persist match: ${error.message}`);
      if (typeof data !== "string")
        throw new Error("Persistence returned no match ID");
      return data;
    },

    async loadMatch(matchId) {
      const { data, error } = await client.rpc("load_match", {
        requested_match_id: matchId,
      });
      if (error) throw new Error(`Unable to load match: ${error.message}`);
      if (data === null) return null;
      if (!isRecord(data))
        throw new Error("Persistence returned invalid match");
      return data;
    },
  };
}
