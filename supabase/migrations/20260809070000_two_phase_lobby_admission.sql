alter table public.room_participants
  add column if not exists seat_status text not null default 'confirmed'
    check (seat_status in ('pending', 'confirmed')),
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists confirmed_at timestamptz;

update public.room_participants
set seat_status = 'confirmed',
    confirmed_at = coalesce(confirmed_at, joined_at),
    reservation_expires_at = null
where seat_status = 'confirmed';

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
    and (
      (p.seat_status = 'pending' and p.reservation_expires_at < now())
      or (p.seat_status = 'confirmed' and not p.is_host
        and p.last_seen_at < now() - interval '2 minutes')
    );

  update public.rooms r
  set status = 'expired'
  where r.code = upper(requested_code)
    and r.status = 'lobby'
    and not exists (
      select 1 from public.room_participants p where p.room_code = r.code
    );
$$;

create or replace function public.create_room(
  requested_code text,
  requested_capacity smallint,
  requested_host_id uuid,
  requested_alias text,
  requested_avatar text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  insert into public.rooms (code, host_player_id, capacity)
  values (upper(requested_code), requested_host_id, requested_capacity);
  insert into public.room_participants (
    room_code, player_id, alias, avatar, is_host, seat_status, reservation_expires_at
  )
  values (
    upper(requested_code), requested_host_id, requested_alias, requested_avatar,
    true, 'pending', now() + interval '60 seconds'
  );
  select jsonb_build_object(
    'code', r.code, 'capacity', r.capacity, 'humanCount', 1,
    'confirmedCount', 0, 'pendingCount', 1,
    'status', r.status, 'agentReady', r.agent_ready
  ) into result from public.rooms r where r.code = upper(requested_code);
  return result;
end;
$$;

create or replace function public.join_room(
  requested_code text,
  requested_player_id uuid,
  requested_alias text,
  requested_avatar text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare room_row public.rooms%rowtype;
declare result jsonb;
begin
  select * into room_row from public.rooms where code = upper(requested_code) for update;
  if not found then raise exception 'room-unavailable'; end if;
  if room_row.expires_at <= now() then raise exception 'room-expired'; end if;
  if room_row.status <> 'lobby' then
    raise exception using message = 'room-' || room_row.status;
  end if;
  if exists (
    select 1 from public.room_participants
    where room_code = room_row.code and is_host and seat_status = 'pending'
  ) and not exists (
    select 1 from public.room_participants
    where room_code = room_row.code and player_id = requested_player_id
  ) then
    raise exception 'room-host-pending';
  end if;

  insert into public.room_participants (
    room_code, player_id, alias, avatar, seat_status, reservation_expires_at
  )
  values (
    room_row.code, requested_player_id, requested_alias, requested_avatar,
    'pending', now() + interval '60 seconds'
  )
  on conflict (room_code, player_id) do update
    set alias = excluded.alias,
        avatar = excluded.avatar,
        reservation_expires_at = case
          when room_participants.seat_status = 'confirmed'
            then room_participants.reservation_expires_at
          else excluded.reservation_expires_at
        end;

  if (
    select count(*) from public.room_participants
    where room_code = room_row.code
  ) > room_row.capacity then
    raise exception 'room-full';
  end if;
  select jsonb_build_object(
    'code', room_row.code, 'capacity', room_row.capacity,
    'humanCount', count(p.player_id),
    'confirmedCount', count(*) filter (where p.seat_status = 'confirmed'),
    'pendingCount', count(*) filter (where p.seat_status = 'pending'),
    'status', room_row.status, 'agentReady', room_row.agent_ready
  ) into result from public.room_participants p where p.room_code = room_row.code;
  return result;
end;
$$;

create or replace function public.confirm_room_participant(
  requested_code text,
  requested_player_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.room_participants
  set seat_status = 'confirmed',
      confirmed_at = now(),
      reservation_expires_at = null,
      last_seen_at = now()
  where room_code = upper(requested_code)
    and player_id = requested_player_id
    and seat_status = 'pending'
    and reservation_expires_at >= now()
  returning true;
$$;

create or replace function public.is_room_member(
  requested_code text,
  requested_player_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_participants p
    join public.rooms r on r.code = p.room_code
    where p.room_code = upper(requested_code)
      and p.player_id = requested_player_id
      and (
        r.status = 'started'
        or (r.status = 'lobby' and p.seat_status in ('pending', 'confirmed')
          and (p.seat_status = 'confirmed' or p.reservation_expires_at >= now())
          and r.expires_at > now())
      )
  );
$$;

revoke all on function public.confirm_room_participant(text, uuid) from public;
grant execute on function public.confirm_room_participant(text, uuid) to service_role;
