alter table public.rooms drop constraint rooms_code_check;

alter table public.rooms
  add constraint rooms_code_check check (code ~ '^[A-HJKMNP-Z2-9]{6}$');
