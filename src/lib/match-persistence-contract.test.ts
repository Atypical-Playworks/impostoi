import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

mock.module("server-only", () => ({}));

const { createMatchPersistence } = await import("./match-persistence");

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260808010000_match_persistence.sql",
  ),
  "utf8",
);
const statisticsMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260808020000_agent_statistics.sql",
  ),
  "utf8",
);

test("match persistence migration stores complete match history", () => {
  for (const table of [
    "matches",
    "match_participants",
    "rounds",
    "clues",
    "votes",
    "agent_events",
    "replays",
    "public_match_summaries",
  ]) {
    expect(migration).toContain(`create table public.${table}`);
  }

  expect(migration).toContain("fallback_match boolean not null default false");
  expect(migration).toContain("retention_expires_at timestamptz");
  expect(migration).toContain("secret_word text not null");
  expect(migration).toContain(
    "create or replace function public.persist_completed_match(match_payload jsonb)",
  );
  expect(migration).toContain(
    "create or replace function public.purge_expired_replays()",
  );
  expect(migration).toContain("revoke all on function public.load_match");
  expect(migration).toContain("record_agent_statistics(match_payload)");
});

test("match persistence protects private history with participant-scoped RLS", () => {
  expect(migration).toContain(
    "alter table public.rounds enable row level security",
  );
  expect(migration).toContain(
    "alter table public.votes enable row level security",
  );
  expect(migration).toContain(
    "alter table public.replays enable row level security",
  );
  for (const table of ["rounds", "clues", "votes", "agent_events"]) {
    expect(migration).toContain(
      `create policy "Participants can read ${table}"`,
    );
  }
  expect(migration).toContain("auth.uid() = mp.player_id");
  expect(migration).toContain(
    "grant execute on function public.load_match(uuid)",
  );
  expect(migration).toContain(
    "grant execute on function public.migrate_guest_progress(uuid, uuid)",
  );
});

test("Agent statistics expose direct competitive metrics and progress counters", () => {
  expect(statisticsMigration).toContain(
    "create table public.agent_match_statistics",
  );
  expect(statisticsMigration).toContain(
    "create or replace view public.agent_rankings",
  );
  expect(statisticsMigration).toContain("camouflage_inconclusive");
  expect(statisticsMigration).toContain("impostor_inconclusive");
  expect(statisticsMigration).toContain("fallback_match");
  expect(statisticsMigration).toContain(
    "grant select on public.agent_rankings",
  );
  expect(statisticsMigration).toContain("player_progress");
  expect(statisticsMigration).not.toContain(
    'create policy "Anyone can read competitive Agent statistics"',
  );
  expect(statisticsMigration).toContain(
    "ai_detection_attempts = player_progress.ai_detection_attempts + excluded.ai_detection_attempts",
  );
  expect(statisticsMigration).toContain(
    "impostor_successes = player_progress.impostor_successes + excluded.impostor_successes",
  );
});

test("match persistence validates RPC results and forwards payloads", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "persist_completed_match")
      return { data: "match-1", error: null };
    return { data: { match: { id: "match-1" } }, error: null };
  };
  const persistence = createMatchPersistence({ rpc });
  const payload = { match: { id: "match-1" } } as Parameters<
    typeof persistence.persistCompletedMatch
  >[0];

  await expect(persistence.persistCompletedMatch(payload)).resolves.toBe(
    "match-1",
  );
  await expect(persistence.loadMatch("match-1")).resolves.toEqual({
    match: { id: "match-1" },
  });
  expect(calls).toEqual([
    { name: "persist_completed_match", args: { match_payload: payload } },
    { name: "load_match", args: { requested_match_id: "match-1" } },
  ]);
});

test("match persistence rejects RPC errors and malformed results", async () => {
  const rpc = async (name: string) => {
    if (name === "persist_completed_match") {
      return { data: null, error: { message: "database unavailable" } };
    }
    return { data: [], error: null };
  };
  const persistence = createMatchPersistence({ rpc });

  await expect(
    persistence.persistCompletedMatch(
      {} as Parameters<typeof persistence.persistCompletedMatch>[0],
    ),
  ).rejects.toThrow("database unavailable");
  await expect(persistence.loadMatch("match-1")).rejects.toThrow(
    "invalid match",
  );
});
