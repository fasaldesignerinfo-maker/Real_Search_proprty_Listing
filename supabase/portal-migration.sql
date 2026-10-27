-- Apply after inspecting the current schema. Additive: preserves existing listings and users.
BEGIN;
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

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS pa_phone text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS kitchen text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS inclusive text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS other_areas jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS views jsonb DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS public.portal_roles (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('admin','head'))
);
ALTER TABLE public.portal_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_roles FROM anon, authenticated;
GRANT SELECT ON public.portal_roles TO authenticated;
REVOKE ALL ON public.listings FROM anon, authenticated;
GRANT INSERT ON public.listings TO anon, authenticated;
GRANT SELECT ON public.listings TO authenticated;
DROP POLICY IF EXISTS "portal users read own role" ON public.portal_roles;
CREATE POLICY "portal users read own role" ON public.portal_roles FOR SELECT TO authenticated USING(user_id=(select auth.uid()));
DROP POLICY IF EXISTS "authorized head may view listings" ON public.listings;
DROP POLICY IF EXISTS "portal roles may view listings" ON public.listings;
CREATE POLICY "portal roles may view listings" ON public.listings FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.portal_roles WHERE user_id=(select auth.uid())));
DROP POLICY IF EXISTS "anyone may submit pending listing" ON public.listings;
CREATE POLICY "anyone may submit pending listing" ON public.listings FOR INSERT TO anon,authenticated WITH CHECK(status='pending' AND verified_by IS NULL AND verified_at IS NULL AND notification_sent_at IS NULL);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('listing-files','listing-files',false,8388608,ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=8388608,allowed_mime_types=excluded.allowed_mime_types;
DROP POLICY IF EXISTS "anonymous listing file upload" ON storage.objects;
CREATE POLICY "anonymous listing file upload" ON storage.objects FOR INSERT TO anon,authenticated WITH CHECK(bucket_id='listing-files' AND name ~ '^[0-9a-f-]{36}/(photo|document)-[0-9]+-[a-zA-Z0-9._-]+$');
DROP POLICY IF EXISTS "authorized head may download listing files" ON storage.objects;
DROP POLICY IF EXISTS "portal roles may download listing files" ON storage.objects;
CREATE POLICY "portal roles may download listing files" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='listing-files' AND EXISTS(SELECT 1 FROM public.portal_roles WHERE user_id=(select auth.uid())));
INSERT INTO public.portal_roles(user_id,role)
SELECT id, CASE WHEN email='admin@portal.invalid' THEN 'admin' ELSE 'head' END
FROM auth.users WHERE email IN ('admin@portal.invalid','zain@portal.invalid')
ON CONFLICT(user_id) DO UPDATE SET role=excluded.role;
CREATE SCHEMA IF NOT EXISTS portal_private;
REVOKE ALL ON SCHEMA portal_private FROM PUBLIC;
GRANT USAGE ON SCHEMA portal_private TO authenticated;
CREATE OR REPLACE FUNCTION portal_private.review_listing(listing_id uuid, decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE reviewer text; changed uuid;
BEGIN
 SELECT role INTO reviewer FROM public.portal_roles WHERE user_id=(select auth.uid());
 IF reviewer IS NULL OR reviewer NOT IN ('admin','head') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF decision IS NULL OR decision NOT IN ('verified','rejected') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 UPDATE public.listings SET status=decision,
 verified_by=CASE WHEN reviewer='admin' THEN 'Administrator' ELSE 'Zain Shamsi' END,
 verified_at=now()
 WHERE id=listing_id AND status='pending' RETURNING id INTO changed;
 IF changed IS NULL THEN RAISE EXCEPTION 'Listing already reviewed or not found'; END IF;
 RETURN jsonb_build_object('ok',true,'status',decision);
END $$;
REVOKE ALL ON FUNCTION portal_private.review_listing(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION portal_private.review_listing(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.review_listing(listing_id uuid, decision text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
SELECT portal_private.review_listing(listing_id,decision);
$$;
REVOKE ALL ON FUNCTION public.review_listing(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_listing(uuid,text) TO authenticated;
CREATE INDEX IF NOT EXISTS listings_created_id_idx ON public.listings(created_at DESC,id);
COMMIT;

-- Security scan follow-up applied separately as restrict_event_trigger_execution.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
