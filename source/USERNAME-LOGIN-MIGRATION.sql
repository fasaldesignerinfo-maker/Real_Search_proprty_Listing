-- Run AFTER creating two confirmed synthetic-email Supabase Auth users.
-- This is additive and keeps existing listing data intact.
create table if not exists public.portal_roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('admin','head'))
);
alter table public.portal_roles enable row level security;
drop policy if exists "portal users read own role" on public.portal_roles;
create policy "portal users read own role" on public.portal_roles
 for select to authenticated using(user_id=auth.uid());
-- Replace the synthetic email names below only if you changed them in app.js.
insert into public.portal_roles(user_id,role)
select id,case when email='admin@portal.invalid' then 'admin' else 'head' end
from auth.users where email in ('admin@portal.invalid','zain@portal.invalid')
on conflict(user_id) do update set role=excluded.role;
-- Read-only role authorization for listings and file downloads.
drop policy if exists "portal roles may view listings" on public.listings;
create policy "portal roles may view listings" on public.listings
for select to authenticated using(exists(select 1 from public.portal_roles where user_id=auth.uid()));
drop policy if exists "portal roles may download listing files" on storage.objects;
create policy "portal roles may download listing files" on storage.objects
for select to authenticated using(bucket_id='listing-files' and exists(select 1 from public.portal_roles where user_id=auth.uid()));
-- NOTE: existing head_authorizations policies remain for backward compatibility.
