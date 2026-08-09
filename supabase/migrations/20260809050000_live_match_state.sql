create table public.live_match_states (
  room_code text primary key references public.rooms(code) on delete cascade,
  match_id uuid not null,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.live_match_states enable row level security;
revoke all on public.live_match_states from anon, authenticated;
