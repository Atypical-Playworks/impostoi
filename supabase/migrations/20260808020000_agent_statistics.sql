alter table public.player_progress
  add column ai_detection_attempts integer not null default 0 check (ai_detection_attempts >= 0),
  add column ai_detection_successes integer not null default 0 check (ai_detection_successes >= 0),
  add column impostor_attempts integer not null default 0 check (impostor_attempts >= 0),
  add column impostor_successes integer not null default 0 check (impostor_successes >= 0);

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

create policy "Anyone can read competitive Agent statistics"
  on public.agent_match_statistics for select using (true);

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
