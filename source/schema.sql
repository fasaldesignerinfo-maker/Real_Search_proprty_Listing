-- Run once in Supabase SQL Editor. Advisor submissions are anonymous; ONLY an
-- authenticated user listed in head_authorizations may review or change status.
create extension if not exists pgcrypto;
create table if not exists public.head_authorizations(user_id uuid primary key references auth.users(id) on delete cascade, display_name text not null default 'Zain Shamsi');
create table if not exists public.listings(
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 listing_date date not null, listing_month int not null check(listing_month between 1 and 12),
 listing_year int not null check(listing_year between 2020 and 2100),
 advisor text not null check(length(advisor) between 2 and 120),
 property_name text not null check(length(property_name) between 1 and 120),
 location text not null check(length(location) between 1 and 120),
 listing_type text not null check(listing_type in ('Rent','Sale')),
 property_type text not null, price numeric not null check(price>=0),
 bedrooms int, bathrooms int, area_sqm numeric, features text, notes text,
 pa_phone text, kitchen text, inclusive text, other_areas jsonb default '[]'::jsonb, views jsonb default '[]'::jsonb,
 photos jsonb not null check(jsonb_typeof(photos)='array' and jsonb_array_length(photos) between 4 and 15),
 documents jsonb not null default '[]'::jsonb,
 status text not null default 'pending' check(status in ('pending','verified','rejected')),
 verified_by text, verified_at timestamptz, notification_sent_at timestamptz
);
alter table public.listings enable row level security;
alter table public.head_authorizations enable row level security;
create policy "head may see own authorization" on public.head_authorizations for select to authenticated using(user_id=auth.uid());
create policy "anyone may submit pending listing" on public.listings for insert to anon,authenticated with check(status='pending' and verified_by is null and verified_at is null and notification_sent_at is null);
create policy "authorized head may view listings" on public.listings for select to authenticated using(exists(select 1 from public.head_authorizations where user_id=auth.uid()));
-- No client UPDATE/DELETE policy: only the trusted Edge Function may review.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('listing-files','listing-files',false,8388608,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do update set public=false,file_size_limit=8388608,allowed_mime_types=excluded.allowed_mime_types;
create policy "anonymous listing file upload" on storage.objects for insert to anon,authenticated with check(bucket_id='listing-files');
create policy "authorized head may download listing files" on storage.objects for select to authenticated using(bucket_id='listing-files' and exists(select 1 from public.head_authorizations where user_id=auth.uid()));
-- After creating Zain's Supabase Auth account, authorize ONLY that exact user UUID:
-- insert into public.head_authorizations(user_id,display_name) values('PASTE_ZAIN_AUTH_USER_UUID','Zain Shamsi');
