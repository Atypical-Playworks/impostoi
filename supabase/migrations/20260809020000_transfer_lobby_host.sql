create or replace function public.transfer_lobby_host(
  requested_code text,
  requested_next_host_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare room_row public.rooms%rowtype;
begin
  select * into room_row
  from public.rooms
  where code = upper(requested_code)
  for update;

  if not found or room_row.status <> 'lobby' then
    raise exception 'room-unavailable';
  end if;
  if not exists (
    select 1 from public.room_participants
    where room_code = room_row.code and player_id = requested_next_host_id
  ) then
    raise exception 'not-member';
  end if;

  update public.rooms
  set host_player_id = requested_next_host_id
  where code = room_row.code;
  update public.room_participants
  set is_host = player_id = requested_next_host_id
  where room_code = room_row.code;

  return jsonb_build_object('code', room_row.code, 'hostPlayerId', requested_next_host_id);
end;
$$;

revoke all on function public.transfer_lobby_host(text, uuid) from public;
grant execute on function public.transfer_lobby_host to service_role;
