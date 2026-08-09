create table public.rooms (
  code text primary key check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  host_player_id uuid not null references auth.users(id),
  capacity smallint not null check (capacity in (4, 5)),
  status text not null default 'lobby' check (status in ('lobby', 'started', 'expired', 'cancelled')),
  agent_ready boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

create table public.room_participants (
  room_code text not null references public.rooms(code) on delete cascade,
  player_id uuid not null references auth.users(id),
  alias text not null check (char_length(alias) between 1 and 24),
  avatar text not null check (char_length(avatar) between 1 and 64),
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_code, player_id),
  unique (room_code, alias)
);

create index room_participants_room_code_idx on public.room_participants(room_code);

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
  insert into public.room_participants (room_code, player_id, alias, avatar, is_host)
  values (upper(requested_code), requested_host_id, requested_alias, requested_avatar, true);
  select jsonb_build_object('code', r.code, 'capacity', r.capacity, 'humanCount', 1,
    'status', r.status, 'agentReady', r.agent_ready)
    into result from public.rooms r where r.code = upper(requested_code);
  return result;
end;
$$;

create or replace function public.get_public_room(requested_code text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('code', r.code, 'capacity', r.capacity,
    'humanCount', count(p.player_id), 'status', r.status,
    'agentReady', r.agent_ready)
  from public.rooms r left join public.room_participants p on p.room_code = r.code
  where r.code = upper(requested_code) and r.expires_at > now()
  group by r.code, r.capacity, r.status, r.agent_ready;
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
  insert into public.room_participants (room_code, player_id, alias, avatar)
  values (room_row.code, requested_player_id, requested_alias, requested_avatar)
  on conflict (room_code, player_id) do nothing;
  if (select count(*) from public.room_participants where room_code = room_row.code) > room_row.capacity then
    raise exception 'room-full';
  end if;
  select jsonb_build_object('code', room_row.code, 'capacity', room_row.capacity,
    'humanCount', count(p.player_id), 'status', room_row.status,
    'agentReady', room_row.agent_ready)
    into result from public.room_participants p where p.room_code = room_row.code;
  return result;
end;
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
    from public.room_participants
    where room_code = upper(requested_code)
      and player_id = requested_player_id
  );
$$;

revoke all on public.rooms from anon, authenticated;
revoke all on public.room_participants from anon, authenticated;
revoke all on function public.create_room from public;
revoke all on function public.get_public_room from public;
revoke all on function public.join_room from public;
revoke all on function public.is_room_member from public;
grant execute on function public.create_room to service_role;
grant execute on function public.get_public_room to service_role;
grant execute on function public.join_room to service_role;
grant execute on function public.is_room_member to service_role;
