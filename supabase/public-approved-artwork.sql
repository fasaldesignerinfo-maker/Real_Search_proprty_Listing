-- Publish only the artifacts attached to a final approved design.
ALTER TABLE public.listing_progress
  ADD COLUMN IF NOT EXISTS final_artifacts jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION portal_private.sync_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid;
BEGIN
 IF TG_TABLE_NAME='listings' THEN target=NEW.id; ELSE target=NEW.listing_id; END IF;
 INSERT INTO public.listing_progress(id,created_at,listing_date,advisor,property_name,stage,approver,approved_at,final_artifacts)
 SELECT l.id,l.created_at,l.listing_date,l.advisor,l.property_name,
 CASE WHEN l.status='pending' THEN 'pending' WHEN l.status='rejected' THEN 'rejected' ELSE coalesce(w.stage,'approved') END,
 w.approver,w.approved_at,
 CASE WHEN l.status='verified' AND w.stage='design_approved' THEN w.artifacts ELSE '[]'::jsonb END
 FROM public.listings l LEFT JOIN public.design_workflows w ON w.listing_id=l.id WHERE l.id=target
 ON CONFLICT(id) DO UPDATE SET listing_date=excluded.listing_date,advisor=excluded.advisor,
 property_name=excluded.property_name,stage=excluded.stage,approver=excluded.approver,
 approved_at=excluded.approved_at,final_artifacts=excluded.final_artifacts;
 RETURN NEW;
END $$;

UPDATE public.listing_progress p SET final_artifacts=w.artifacts
FROM public.design_workflows w WHERE w.listing_id=p.id AND p.stage='design_approved' AND w.stage='design_approved';

CREATE POLICY "anyone may view only approved artwork" ON storage.objects
FOR SELECT TO anon,authenticated USING (
 bucket_id='design-files' AND EXISTS (
  SELECT 1 FROM public.listing_progress p
  WHERE p.stage='design_approved'
   AND p.id::text=split_part(name,'/',1)
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.final_artifacts) a WHERE a->>'path'=name)
 )
);
