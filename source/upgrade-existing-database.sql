-- Run this only if the previous schema has already been created.
alter table public.listings add column if not exists pa_phone text;
alter table public.listings add column if not exists kitchen text;
alter table public.listings add column if not exists inclusive text;
alter table public.listings add column if not exists other_areas jsonb default '[]'::jsonb;
alter table public.listings add column if not exists views jsonb default '[]'::jsonb;
