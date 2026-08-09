alter table public.room_participants
  add column if not exists last_seen_at timestamptz not null default now();

create or replace function public.cleanup_stale_room_participants(requested_code text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.room_participants p
  using public.rooms r
  where p.room_code = upper(requested_code)
    and r.code = p.room_code
    and r.status = 'lobby'
    and p.is_host = false
    and p.last_seen_at < now() - interval '30 seconds';
$$;

create or replace function public.touch_room_participant(
  requested_code text,
  requested_player_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.room_participants
  set last_seen_at = now()
  where room_code = upper(requested_code)
    and player_id = requested_player_id;
$$;

revoke all on function public.cleanup_stale_room_participants(text) from public;
revoke all on function public.touch_room_participant(text, uuid) from public;
grant execute on function public.cleanup_stale_room_participants(text) to service_role;
grant execute on function public.touch_room_participant(text, uuid) to service_role;
