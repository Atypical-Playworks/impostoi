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
    and p.last_seen_at < now() - interval '2 minutes';

  update public.rooms r
  set status = 'expired'
  where code = upper(requested_code)
    and status = 'lobby'
    and not exists (
      select 1 from public.room_participants p where p.room_code = r.code
    );
$$;

revoke all on function public.cleanup_stale_room_participants(text) from public;
grant execute on function public.cleanup_stale_room_participants(text) to service_role;
