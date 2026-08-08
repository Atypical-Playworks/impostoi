create table public.player_progress (
  player_id uuid primary key references auth.users(id) on delete cascade,
  rounds_played integer not null default 0 check (rounds_played >= 0),
  ai_detections integer not null default 0 check (ai_detections >= 0),
  impostor_detections integer not null default 0 check (impostor_detections >= 0),
  updated_at timestamptz not null default now()
);

create table public.player_match_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null,
  eligible boolean not null default true,
  created_at timestamptz not null default now(),
  unique (player_id, match_id)
);

create table public.guest_progress_migrations (
  guest_player_id uuid primary key references auth.users(id) on delete cascade,
  persistent_player_id uuid not null references auth.users(id) on delete cascade,
  migrated_at timestamptz not null default now(),
  unique (persistent_player_id, guest_player_id)
);

alter table public.player_progress enable row level security;
alter table public.player_match_history enable row level security;
alter table public.guest_progress_migrations enable row level security;

create policy "Players can read their progress"
  on public.player_progress for select using (auth.uid() = player_id);
create policy "Players can read their history"
  on public.player_match_history for select using (auth.uid() = player_id);

drop function if exists public.migrate_guest_progress(uuid);

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
    select 1
    from auth.users
    where id = destination_player_id and is_anonymous = false
  ) then
    raise exception 'A persistent account is required';
  end if;

  if not exists (
    select 1 from auth.users where id = source_guest_id and is_anonymous = true
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
      select 1
      from public.player_match_history destination_history
      where destination_history.player_id = destination_player_id
        and destination_history.match_id = source_history.match_id
    );

  update public.player_match_history
  set player_id = destination_player_id
  where player_id = source_guest_id;
  get diagnostics moved = row_count;

  insert into public.player_progress (player_id, rounds_played, ai_detections, impostor_detections)
  select destination_player_id, rounds_played, ai_detections, impostor_detections
  from public.player_progress
  where player_id = source_guest_id
  on conflict (player_id) do update set
    rounds_played = player_progress.rounds_played + excluded.rounds_played,
    ai_detections = player_progress.ai_detections + excluded.ai_detections,
    impostor_detections = player_progress.impostor_detections + excluded.impostor_detections,
    updated_at = now();

  delete from public.player_progress where player_id = source_guest_id;
  return query select moved;
end;
$$;

revoke all on function public.migrate_guest_progress(uuid, uuid) from public, anon, authenticated;
grant execute on function public.migrate_guest_progress(uuid, uuid) to service_role;
