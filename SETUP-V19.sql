-- Run once in the connected Supabase project's SQL Editor before using v19.
-- This file creates controls only; it does not delete any existing records.
BEGIN;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS source_photos_archived_at timestamptz;
-- Older portal schemas require at least four photos even after removal.
-- Replace only photo CHECK constraints, keeping every other constraint intact.
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT conname FROM pg_constraint
 WHERE conrelid='public.listings'::regclass AND contype='c'
 AND pg_get_constraintdef(oid) ~ '\mphotos\M'
 LOOP EXECUTE format('ALTER TABLE public.listings DROP CONSTRAINT %I',item.conname); END LOOP;
END $$;
ALTER TABLE public.listings ADD CONSTRAINT listings_photos_v19_check CHECK(
 jsonb_typeof(photos)='array' AND
 (jsonb_array_length(photos) BETWEEN 4 AND 15 OR
 (jsonb_array_length(photos)=0 AND source_photos_archived_at IS NOT NULL))
);
CREATE OR REPLACE FUNCTION portal_private.enforce_listing_date()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.source_photos_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'New listings must include original photos.';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.listing_date IS DISTINCT FROM OLD.listing_date THEN
    IF NEW.listing_date IS NULL OR NEW.listing_date < (now() AT TIME ZONE 'Asia/Bahrain')::date THEN
      RAISE EXCEPTION 'Choose today or a future date. Past dates are not allowed.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS listing_date_today_or_future ON public.listings;
CREATE TRIGGER listing_date_today_or_future BEFORE INSERT OR UPDATE OF listing_date
ON public.listings FOR EACH ROW EXECUTE FUNCTION portal_private.enforce_listing_date();
REVOKE ALL ON FUNCTION portal_private.enforce_listing_date() FROM PUBLIC,anon,authenticated;
-- Expose these service-only RPCs for the authenticated admin Edge Function.
-- SECURITY INVOKER retains the caller's privileges; browsers cannot call them.
CREATE OR REPLACE FUNCTION public.portal_v19_management_ready()
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.portal_v19_management_ready() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_v19_management_ready() TO service_role;
CREATE OR REPLACE FUNCTION public.finalize_listing_removal(p_listing uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.listings WHERE id=p_listing FOR UPDATE;
  -- design_events originally has a non-cascading FK, so remove it explicitly.
  DELETE FROM public.design_events WHERE listing_id=p_listing;
  DELETE FROM public.listings WHERE id=p_listing;
  -- progress, workflow, correction logs and Gate Cards cascade from listings.
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.finalize_listing_removal(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_listing_removal(uuid) TO service_role;
COMMIT;
