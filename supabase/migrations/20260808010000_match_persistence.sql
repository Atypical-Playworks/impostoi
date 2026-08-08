create table public.matches (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'completed' check (status = 'completed'),
  agent_model text not null,
  agent_provider text not null,
  agent_strategy text not null,
  agent_version text not null,
  fallback_match boolean not null default false,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.match_participants (
  match_id uuid not null references public.matches(id) on delete cascade,
  participant_id uuid not null,
  player_id uuid references auth.users(id) on delete set null,
  alias text not null,
  avatar text not null,
  kind text not null check (kind in ('player', 'agent')),
  primary key (match_id, participant_id)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 3),
  category text not null,
  secret_word text not null,
  agent_participant_id uuid not null,
  impostor_participant_id uuid not null,
  outcome jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null,
  unique (match_id, round_number),
  foreign key (match_id, agent_participant_id)
    references public.match_participants(match_id, participant_id),
  foreign key (match_id, impostor_participant_id)
    references public.match_participants(match_id, participant_id)
);

create table public.clues (
  round_id uuid not null references public.rounds(id) on delete cascade,
  participant_id uuid not null,
  text text not null,
  submitted_at timestamptz not null,
  primary key (round_id, participant_id)
);

create table public.votes (
  round_id uuid not null references public.rounds(id) on delete cascade,
  voter_participant_id uuid not null,
  stage text not null check (stage in ('ai_detection', 'impostor')),
  target_participant_id uuid not null,
  submitted_at timestamptz not null,
  primary key (round_id, voter_participant_id, stage)
);

create table public.agent_events (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now()
);

create table public.replays (
  match_id uuid primary key references public.matches(id) on delete cascade,
  payload jsonb not null,
  retention_expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.public_match_summaries (
  match_id uuid primary key references public.matches(id) on delete cascade,
  rounds_played integer not null check (rounds_played between 0 and 3),
  fallback_match boolean not null,
  summary jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.player_match_history
  add constraint player_match_history_match_id_fkey
  foreign key (match_id) references public.matches(id) on delete cascade
  not valid;

create or replace function public.sync_match_participant_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.match_participants
  set player_id = new.player_id
  where match_id = new.match_id and player_id = old.player_id;
  return new;
end;
$$;

create trigger sync_match_participant_player
after update of player_id on public.player_match_history
for each row execute function public.sync_match_participant_player();

alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.rounds enable row level security;
alter table public.clues enable row level security;
alter table public.votes enable row level security;
alter table public.agent_events enable row level security;
alter table public.replays enable row level security;
alter table public.public_match_summaries enable row level security;

create policy "Participants can read their matches"
  on public.matches for select using (
    exists (
      select 1 from public.match_participants mp
      where mp.match_id = matches.id and auth.uid() = mp.player_id
    )
  );

create policy "Participants can read their identities"
  on public.match_participants for select using (player_id = auth.uid());

create policy "Participants can read their replays"
  on public.replays for select using (
    retention_expires_at > now() and exists (
      select 1 from public.match_participants mp
      where mp.match_id = replays.match_id and auth.uid() = mp.player_id
    )
  );

create policy "Anyone can read anonymized summaries"
  on public.public_match_summaries for select using (true);

create or replace function public.load_match(requested_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from public.match_participants mp
    where mp.match_id = requested_match_id and auth.uid() = mp.player_id
  ) then
    raise exception 'Match access denied';
  end if;

  return (
    select jsonb_build_object(
      'match', to_jsonb(m),
      'participants', coalesce((select jsonb_agg(to_jsonb(mp)) from public.match_participants mp
        where mp.match_id = m.id), '[]'::jsonb),
      'rounds', coalesce((select jsonb_agg(jsonb_build_object(
        'round', to_jsonb(r),
        'clues', coalesce((select jsonb_agg(to_jsonb(c)) from public.clues c where c.round_id = r.id), '[]'::jsonb),
        'votes', coalesce((select jsonb_agg(to_jsonb(v)) from public.votes v where v.round_id = r.id), '[]'::jsonb),
        'agent_events', coalesce((select jsonb_agg(to_jsonb(a)) from public.agent_events a where a.round_id = r.id), '[]'::jsonb)
      ) order by r.round_number) from public.rounds r where r.match_id = m.id), '[]'::jsonb),
      'replay', (select to_jsonb(replay) from public.replays replay where replay.match_id = m.id and replay.retention_expires_at > now())
    )
    from public.matches m where m.id = requested_match_id
  );
end;
$$;

create or replace function public.persist_completed_match(match_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_match_id uuid;
  saved_round_id uuid;
  match_row jsonb := match_payload -> 'match';
  participant_row jsonb;
  round_row jsonb;
  clue_row jsonb;
  vote_row jsonb;
  event_row jsonb;
begin
  insert into public.matches (
    id, status, agent_model, agent_provider, agent_strategy, agent_version,
    fallback_match, started_at, completed_at
  )
  select id, status, agent_model, agent_provider, agent_strategy, agent_version,
    fallback_match, started_at, completed_at
  from jsonb_to_record(match_row) as x(
    id uuid, status text, agent_model text, agent_provider text,
    agent_strategy text, agent_version text, fallback_match boolean,
    started_at timestamptz, completed_at timestamptz
  ) returning id into saved_match_id;

  for participant_row in select * from jsonb_array_elements(match_payload -> 'participants') loop
    insert into public.match_participants
    select saved_match_id, participant_id, player_id, alias, avatar, kind
    from jsonb_to_record(participant_row) as x(
      participant_id uuid, player_id uuid, alias text, avatar text, kind text
    );
  end loop;

  for round_row in select * from jsonb_array_elements(match_payload -> 'rounds') loop
    insert into public.rounds (
      match_id, round_number, category, secret_word, agent_participant_id,
      impostor_participant_id, outcome, completed_at
    )
    select saved_match_id, round_number, category, secret_word,
      agent_participant_id, impostor_participant_id, outcome, completed_at
    from jsonb_to_record(round_row -> 'round') as x(
      round_number integer, category text, secret_word text,
      agent_participant_id uuid, impostor_participant_id uuid,
      outcome jsonb, completed_at timestamptz
    ) returning id into saved_round_id;

    for clue_row in select * from jsonb_array_elements(round_row -> 'clues') loop
      insert into public.clues
      select saved_round_id, participant_id, text, submitted_at
      from jsonb_to_record(clue_row) as x(
        participant_id uuid, text text, submitted_at timestamptz
      );
    end loop;

    for vote_row in select * from jsonb_array_elements(round_row -> 'votes') loop
      insert into public.votes
      select saved_round_id, voter_participant_id, stage, target_participant_id, submitted_at
      from jsonb_to_record(vote_row) as x(
        voter_participant_id uuid, stage text, target_participant_id uuid,
        submitted_at timestamptz
      );
    end loop;

    for event_row in select * from jsonb_array_elements(round_row -> 'agent_events') loop
      insert into public.agent_events
      select gen_random_uuid(), saved_round_id, event_type, payload, duration_ms, coalesce(created_at, now())
      from jsonb_to_record(event_row) as x(
        event_type text, payload jsonb, duration_ms integer, created_at timestamptz
      );
    end loop;
  end loop;

  insert into public.replays (match_id, payload, retention_expires_at)
  select saved_match_id, payload, retention_expires_at
  from jsonb_to_record(match_payload -> 'replay') as x(
    payload jsonb, retention_expires_at timestamptz
  );

  insert into public.public_match_summaries (match_id, rounds_played, fallback_match, summary)
  select saved_match_id, rounds_played, fallback_match, summary
    from jsonb_to_record(match_payload -> 'public_summary') as x(
      rounds_played integer, fallback_match boolean, summary jsonb
    );

  perform public.record_agent_statistics(match_payload);

  return saved_match_id;
end;
$$;

create or replace function public.purge_expired_replays()
returns integer
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.replays where retention_expires_at <= now() returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke all on function public.load_match(uuid) from public, anon, authenticated;
grant execute on function public.load_match(uuid) to authenticated, service_role;
revoke all on function public.persist_completed_match(jsonb) from public, anon, authenticated;
grant execute on function public.persist_completed_match(jsonb) to service_role;
revoke all on function public.purge_expired_replays() from public, anon, authenticated;
grant execute on function public.purge_expired_replays() to service_role;
revoke all on function public.migrate_guest_progress(uuid, uuid) from public, anon, authenticated;
grant execute on function public.migrate_guest_progress(uuid, uuid) to service_role;
