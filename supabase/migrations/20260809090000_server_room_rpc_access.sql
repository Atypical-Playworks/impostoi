create or replace function public.get_room_participants(requested_code text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'player_id', p.player_id,
        'alias', p.alias,
        'avatar', p.avatar,
        'is_host', p.is_host,
        'seat_status', p.seat_status
      ) order by p.joined_at
    ),
    '[]'::jsonb
  )
  from public.room_participants p
  where p.room_code = upper(requested_code);
$$;

create or replace function public.get_room_host(requested_code text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select host_player_id from public.rooms where code = upper(requested_code);
$$;

create or replace function public.read_live_match_state(requested_code text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('match_id', match_id, 'state', state)
  from public.live_match_states
  where room_code = upper(requested_code);
$$;

create or replace function public.write_live_match_state(
  requested_code text,
  requested_match_id uuid,
  requested_state jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.live_match_states (room_code, match_id, state, updated_at)
  values (upper(requested_code), requested_match_id, requested_state, now())
  on conflict (room_code) do update
    set match_id = excluded.match_id,
        state = excluded.state,
        updated_at = excluded.updated_at;
$$;

create or replace function public.mark_room_started(requested_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.rooms set status = 'started'
  where code = upper(requested_code) and status = 'lobby'
  returning true;
$$;

create or replace function public.restore_lobby_host(
  requested_code text,
  requested_player_id uuid,
  requested_alias text,
  requested_avatar text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  insert into public.room_participants (
    room_code, player_id, alias, avatar, is_host, seat_status, confirmed_at
  )
  select upper(requested_code), requested_player_id, requested_alias,
    requested_avatar, true, 'confirmed', now()
  from public.rooms
  where code = upper(requested_code)
    and host_player_id = requested_player_id
    and status = 'lobby'
  on conflict (room_code, player_id) do nothing
  returning true;
$$;

revoke all on function public.get_room_participants(text) from public;
revoke all on function public.get_room_host(text) from public;
revoke all on function public.read_live_match_state(text) from public;
revoke all on function public.write_live_match_state(text, uuid, jsonb) from public;
revoke all on function public.mark_room_started(text) from public;
revoke all on function public.restore_lobby_host(text, uuid, text, text) from public;
grant execute on function public.get_room_participants(text) to service_role;
grant execute on function public.get_room_host(text) to service_role;
grant execute on function public.read_live_match_state(text) to service_role;
grant execute on function public.write_live_match_state(text, uuid, jsonb) to service_role;
grant execute on function public.mark_room_started(text) to service_role;
grant execute on function public.restore_lobby_host(text, uuid, text, text) to service_role;
