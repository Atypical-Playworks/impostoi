alter table public.rooms drop constraint if exists rooms_capacity_check;

alter table public.rooms
  add constraint rooms_capacity_check check (capacity in (3, 4, 5));
