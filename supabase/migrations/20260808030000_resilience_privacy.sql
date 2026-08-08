alter table public.agent_events
  add column fallback boolean not null default false;

alter table public.agent_events
  add constraint agent_events_fallback_event_check
  check (not fallback or event_type = 'agent_action');

create or replace function public.sync_agent_event_fallback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type = 'agent_action' and new.payload ? 'fallback' then
    new.fallback := coalesce((new.payload ->> 'fallback')::boolean, false);
  end if;
  return new;
end;
$$;

create trigger sync_agent_event_fallback
before insert on public.agent_events
for each row execute function public.sync_agent_event_fallback();
