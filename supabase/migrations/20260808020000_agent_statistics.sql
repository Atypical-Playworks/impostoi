alter table public.player_progress
  add column ai_detection_attempts integer not null default 0 check (ai_detection_attempts >= 0),
  add column ai_detection_successes integer not null default 0 check (ai_detection_successes >= 0),
  add column impostor_attempts integer not null default 0 check (impostor_attempts >= 0),
  add column impostor_successes integer not null default 0 check (impostor_successes >= 0);

create or replace function public.migrate_guest_progress(
  source_guest_id uuid,
  destination_player_id uuid
)
returns table (migrated_matches integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  moved integer;
begin
  if not exists (
    select 1 from auth.users
    where id = destination_player_id and is_anonymous = false
  ) then
    raise exception 'A persistent account is required';
  end if;

  if not exists (
    select 1 from auth.users
    where id = source_guest_id and is_anonymous = true
  ) then
    raise exception 'The source must be a Guest session';
  end if;

  if source_guest_id = destination_player_id then
    raise exception 'A Guest session cannot migrate to itself';
  end if;

  insert into public.guest_progress_migrations (guest_player_id, persistent_player_id)
  values (source_guest_id, destination_player_id);

  delete from public.player_match_history source_history
  where source_history.player_id = source_guest_id
    and exists (
      select 1 from public.player_match_history destination_history
      where destination_history.player_id = destination_player_id
        and destination_history.match_id = source_history.match_id
    );

  update public.player_match_history
  set player_id = destination_player_id
  where player_id = source_guest_id;
  get diagnostics moved = row_count;

  insert into public.player_progress (
    player_id, rounds_played, ai_detections, impostor_detections,
    ai_detection_attempts, ai_detection_successes, impostor_attempts,
    impostor_successes
  )
  select destination_player_id, rounds_played, ai_detections, impostor_detections,
    ai_detection_attempts, ai_detection_successes, impostor_attempts,
    impostor_successes
  from public.player_progress
  where player_id = source_guest_id
  on conflict (player_id) do update set
    rounds_played = player_progress.rounds_played + excluded.rounds_played,
    ai_detections = player_progress.ai_detections + excluded.ai_detections,
    impostor_detections = player_progress.impostor_detections + excluded.impostor_detections,
    ai_detection_attempts = player_progress.ai_detection_attempts + excluded.ai_detection_attempts,
    ai_detection_successes = player_progress.ai_detection_successes + excluded.ai_detection_successes,
    impostor_attempts = player_progress.impostor_attempts + excluded.impostor_attempts,
    impostor_successes = player_progress.impostor_successes + excluded.impostor_successes,
    updated_at = now();

  delete from public.player_progress where player_id = source_guest_id;
  return query select moved;
end;
$$;

create table public.agent_match_statistics (
  match_id uuid not null references public.matches(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 3),
  agent_model text not null,
  agent_provider text not null,
  agent_strategy text not null,
  agent_version text not null,
  agent_was_impostor boolean not null,
  ai_detection text not null check (ai_detection in ('detected', 'escaped', 'inconclusive')),
  impostor_win text not null check (impostor_win in ('won', 'lost', 'inconclusive')),
  ai_votes integer not null check (ai_votes >= 0),
  response_time_ms integer not null check (response_time_ms >= 0),
  primary key (match_id, round_number)
);

alter table public.agent_match_statistics enable row level security;

create or replace view public.agent_rankings as
select
  agent_model,
  agent_provider,
  agent_strategy,
  agent_version,
  count(distinct match_id)::integer as games_counted,
  count(*)::integer as rounds_counted,
  count(*) filter (where ai_detection = 'detected')::integer as camouflage_detected,
  count(*) filter (where ai_detection = 'escaped')::integer as camouflage_escaped,
  count(*) filter (where ai_detection = 'inconclusive')::integer as camouflage_inconclusive,
  count(*) filter (where agent_was_impostor)::integer as impostor_rounds,
  count(*) filter (where agent_was_impostor and impostor_win = 'won')::integer as impostor_wins,
  count(*) filter (where agent_was_impostor and impostor_win = 'lost')::integer as impostor_losses,
  count(*) filter (where agent_was_impostor and impostor_win = 'inconclusive')::integer as impostor_inconclusive,
  sum(ai_votes)::integer as ai_votes,
  sum(response_time_ms)::integer as response_time_ms,
  round((count(*) filter (where ai_detection = 'escaped'))::numeric /
    nullif(count(*) filter (where ai_detection in ('detected', 'escaped')), 0), 4) as camouflage_rate,
  round((count(*) filter (where agent_was_impostor and impostor_win = 'won'))::numeric /
    nullif(count(*) filter (where agent_was_impostor and impostor_win in ('won', 'lost')), 0), 4) as impostor_win_rate,
  round(avg(ai_votes)::numeric, 2) as average_ai_votes,
  round(avg(response_time_ms)::numeric, 2) as average_response_time_ms
from public.agent_match_statistics
group by agent_model, agent_provider, agent_strategy, agent_version;

grant select on public.agent_rankings to anon, authenticated;

create or replace function public.record_agent_statistics(statistics_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  row jsonb;
  match_row jsonb := statistics_payload -> 'match';
begin
  if coalesce((match_row ->> 'fallback_match')::boolean, false) then
    return;
  end if;

  for row in select * from jsonb_array_elements(statistics_payload -> 'rounds') loop
    if not (row ? 'statistics') then
      continue;
    end if;
    insert into public.agent_match_statistics (
      match_id, round_number, agent_model, agent_provider, agent_strategy, agent_version,
      agent_was_impostor, ai_detection, impostor_win, ai_votes, response_time_ms
    )
    values (
      (match_row ->> 'id')::uuid, (row -> 'round' ->> 'round_number')::integer,
      match_row ->> 'agent_model', match_row ->> 'agent_provider',
      match_row ->> 'agent_strategy', match_row ->> 'agent_version',
      (row -> 'statistics' ->> 'agent_was_impostor')::boolean,
      row -> 'statistics' ->> 'ai_detection', row -> 'statistics' ->> 'impostor_win',
      (row -> 'statistics' ->> 'ai_votes')::integer,
      (row -> 'statistics' ->> 'response_time_ms')::integer
    )
    on conflict (match_id, round_number) do nothing;
  end loop;
end;
$$;

revoke all on function public.record_agent_statistics(jsonb) from public, anon, authenticated;
grant execute on function public.record_agent_statistics(jsonb) to service_role;
