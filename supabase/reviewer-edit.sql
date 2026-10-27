-- Reviewers may correct a pending listing without changing its review status.
create table if not exists public.listing_reviewer_edits (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings(id) on delete cascade,
  reviewer_id uuid not null,
  edited_at timestamptz not null default now(),
  previous_record jsonb not null
);
alter table public.listing_reviewer_edits enable row level security;
revoke all on public.listing_reviewer_edits from public, anon, authenticated;

create or replace function public.save_review_corrections(listing_id uuid, changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  reviewer text;
  original public.listings%rowtype;
  allowed text[] := array['id','listing_date','listing_month','listing_year','advisor','property_name','location','listing_type','property_type','price','bedrooms','bathrooms','area_sqm','features','notes','pa_phone','kitchen','inclusive','other_areas','views','photos','documents'];
  entry jsonb;
begin
  select role into reviewer from public.portal_roles where user_id = auth.uid();
  if reviewer is null or reviewer not in ('admin','head') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if changes is null or jsonb_typeof(changes) <> 'object' or changes->>'id' is distinct from listing_id::text
     or exists (select 1 from jsonb_object_keys(changes) k where k <> all(allowed)) then
    raise exception 'Invalid listing changes';
  end if;
  select * into original from public.listings where id=listing_id and status='pending' for update;
  if not found then raise exception 'Listing is no longer pending'; end if;
  if jsonb_typeof(changes->'photos') <> 'array' or jsonb_array_length(changes->'photos') <> 4
     or (select count(*) from jsonb_array_elements(changes->'photos') p where p->>'role'='master') <> 1 then
    raise exception 'Four photos, including one master, are required';
  end if;
  for entry in select value from jsonb_array_elements(changes->'photos') loop
    if entry->>'path' not like listing_id::text || '/photo-%' then
      raise exception 'Invalid photo reference';
    end if;
  end loop;
  if jsonb_typeof(changes->'documents') <> 'array' then
    raise exception 'Invalid document references';
  end if;
  for entry in select value from jsonb_array_elements(changes->'documents') loop
    if entry->>'path' not like listing_id::text || '/document-%' then
      raise exception 'Invalid document reference';
    end if;
  end loop;
  insert into public.listing_reviewer_edits(listing_id,reviewer_id,previous_record)
    values(listing_id,auth.uid(),to_jsonb(original));
  update public.listings set
    listing_date=(changes->>'listing_date')::date,
    listing_month=(changes->>'listing_month')::integer,
    listing_year=(changes->>'listing_year')::integer,
    advisor=changes->>'advisor', property_name=changes->>'property_name', location=changes->>'location',
    listing_type=changes->>'listing_type', property_type=changes->>'property_type',
    price=(changes->>'price')::numeric, bedrooms=(changes->>'bedrooms')::integer,
    bathrooms=(changes->>'bathrooms')::integer, area_sqm=(changes->>'area_sqm')::numeric,
    features=changes->>'features', notes=changes->>'notes', pa_phone=changes->>'pa_phone',
    kitchen=changes->>'kitchen', inclusive=changes->>'inclusive',
    other_areas=changes->'other_areas', views=changes->'views',
    photos=changes->'photos', documents=changes->'documents'
  where id=listing_id and status='pending';
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.save_review_corrections(uuid,jsonb) from public,anon;
grant execute on function public.save_review_corrections(uuid,jsonb) to authenticated;
