-- The Edge Function alone reads this table with the service role.
create table if not exists public.advisor_edit_grants (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  code_hash text not null,
  rejection_reason text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  failed_attempts integer not null default 0,
  blocked_until timestamptz
);
alter table public.advisor_edit_grants enable row level security;
alter table public.advisor_edit_grants add column if not exists rejection_reason text not null default '';
revoke all on public.advisor_edit_grants from anon, authenticated;
grant select, insert, update, delete on public.advisor_edit_grants to service_role;
