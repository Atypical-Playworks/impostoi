create table public.live_agent_turn_claims (
  room_code text not null references public.rooms(code) on delete cascade,
  match_id uuid not null,
  turn_key text not null,
  claimed_at timestamptz not null default now(),
  primary key (room_code, match_id, turn_key)
);

create or replace function public.claim_agent_turn(
  requested_code text,
  requested_match_id uuid,
  requested_turn_key text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  insert into public.live_agent_turn_claims (room_code, match_id, turn_key)
  values (upper(requested_code), requested_match_id, requested_turn_key)
  on conflict (room_code, match_id, turn_key) do nothing
  returning true;
$$;

revoke all on public.live_agent_turn_claims from public;
revoke all on function public.claim_agent_turn(text, uuid, text) from public;
grant execute on function public.claim_agent_turn(text, uuid, text) to service_role;
