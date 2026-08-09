alter table public.rooms drop constraint rooms_code_check;

alter table public.rooms
  add constraint rooms_code_check check (code ~ '^[A-HJKMNP-Z2-9]{6}$');

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
      and (r.status = 'started' or (r.status = 'lobby' and r.expires_at > now()))
  );
$$;
