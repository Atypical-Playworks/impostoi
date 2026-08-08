import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260808010000_match_persistence.sql",
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
  expect(migration).toContain("auth.uid() = mp.player_id");
  expect(migration).toContain(
    "grant execute on function public.load_match(uuid)",
  );
  expect(migration).toContain(
    "grant execute on function public.migrate_guest_progress(uuid, uuid)",
  );
});
