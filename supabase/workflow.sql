BEGIN;
ALTER TABLE public.portal_roles DROP CONSTRAINT portal_roles_role_check;
ALTER TABLE public.portal_roles ADD CONSTRAINT portal_roles_role_check CHECK(role IN ('admin','head','marketing'));
CREATE TABLE public.design_workflows(
 listing_id uuid PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
 stage text NOT NULL DEFAULT 'approved' CHECK(stage IN ('approved','designing','design_completed','design_review','changes_requested','design_approved')),
 artifacts jsonb NOT NULL DEFAULT '[]', revision integer NOT NULL DEFAULT 0,
 approver text, approved_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.design_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, listing_id uuid REFERENCES public.listings(id), actor uuid REFERENCES auth.users(id), stage text NOT NULL, approver text, comment text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.listing_progress(id uuid PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE, created_at timestamptz, listing_date date, advisor text, property_name text, stage text, approver text, approved_at timestamptz);
ALTER TABLE public.design_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.design_workflows,public.design_events,public.listing_progress FROM anon,authenticated;
GRANT SELECT ON public.listing_progress TO anon,authenticated;
GRANT SELECT ON public.design_workflows,public.design_events TO authenticated;
CREATE POLICY "public progress only" ON public.listing_progress FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY "staff workflow read" ON public.design_workflows FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.portal_roles WHERE user_id=(select auth.uid())));
CREATE POLICY "staff event read" ON public.design_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.portal_roles WHERE user_id=(select auth.uid())));
CREATE FUNCTION portal_private.sync_progress() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid;
BEGIN
 IF TG_TABLE_NAME='listings' THEN target=NEW.id; ELSE target=NEW.listing_id; END IF;
 INSERT INTO public.listing_progress(id,created_at,listing_date,advisor,property_name,stage,approver,approved_at)
 SELECT l.id,l.created_at,l.listing_date,l.advisor,l.property_name,
 CASE WHEN l.status='pending' THEN 'pending' WHEN l.status='rejected' THEN 'rejected' ELSE coalesce(w.stage,'approved') END,w.approver,w.approved_at
 FROM public.listings l LEFT JOIN public.design_workflows w ON w.listing_id=l.id WHERE l.id=target
 ON CONFLICT(id) DO UPDATE SET listing_date=excluded.listing_date,advisor=excluded.advisor,property_name=excluded.property_name,stage=excluded.stage,approver=excluded.approver,approved_at=excluded.approved_at;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION portal_private.sync_progress() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER listing_progress_sync AFTER INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION portal_private.sync_progress();
CREATE TRIGGER design_progress_sync AFTER INSERT OR UPDATE ON public.design_workflows FOR EACH ROW EXECUTE FUNCTION portal_private.sync_progress();
INSERT INTO public.listing_progress SELECT id,created_at,listing_date,advisor,property_name,CASE status WHEN 'verified' THEN 'approved' ELSE status END,NULL,NULL FROM public.listings;
CREATE OR REPLACE FUNCTION portal_private.advance_design(p_listing uuid,p_action text,p_revision integer,p_artifacts jsonb,p_approver text,p_comment text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; w public.design_workflows; target text; item jsonb;
BEGIN
 SELECT role INTO r FROM public.portal_roles WHERE user_id=auth.uid();
 IF auth.uid() IS NULL OR r IS NULL OR r NOT IN ('admin','marketing') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.listings WHERE id=p_listing AND status='verified' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Listing must be approved first'; END IF;
 INSERT INTO public.design_workflows(listing_id) VALUES(p_listing) ON CONFLICT DO NOTHING;
 SELECT * INTO w FROM public.design_workflows WHERE listing_id=p_listing FOR UPDATE;
 IF w.revision<>p_revision THEN RAISE EXCEPTION 'This listing changed. Refresh and try again.'; END IF;
 IF p_action='start' AND r='admin' AND w.stage IN ('approved','changes_requested') THEN target='designing';
 ELSIF p_action='complete' AND r='admin' AND w.stage='designing' THEN
   IF jsonb_typeof(p_artifacts)<>'array' OR jsonb_array_length(p_artifacts) <> 2 THEN RAISE EXCEPTION 'Both feed and story artwork are required'; END IF;
   IF (SELECT count(*) FROM jsonb_array_elements(p_artifacts) a WHERE a->>'kind'='feed')<>1 OR (SELECT count(*) FROM jsonb_array_elements(p_artifacts) a WHERE a->>'kind'='story')<>1 THEN RAISE EXCEPTION 'One feed and one story are required'; END IF;
   FOR item IN SELECT * FROM jsonb_array_elements(p_artifacts) LOOP
     IF item->>'path' NOT LIKE p_listing::text||'/%' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='design-files' AND name=item->>'path') THEN RAISE EXCEPTION 'Invalid artwork file'; END IF;
   END LOOP;
   target='design_completed';
 ELSIF p_action='submit_review' AND r='admin' AND w.stage='design_completed' THEN target='design_review';
 ELSIF p_action IN ('approve','request_changes') AND r IN ('admin','marketing') AND w.stage='design_review' THEN
   IF p_approver IS NULL OR p_approver NOT IN ('Dalal — Marketing Head','Shahad — Coordinator') THEN RAISE EXCEPTION 'Select the approver'; END IF;
   IF p_action='request_changes' AND length(trim(coalesce(p_comment,'')))=0 THEN RAISE EXCEPTION 'Explain the requested changes'; END IF;
   target=CASE p_action WHEN 'approve' THEN 'design_approved' ELSE 'changes_requested' END;
 ELSE RAISE EXCEPTION 'Action not allowed for this role or stage'; END IF;
 UPDATE public.design_workflows SET stage=target,revision=revision+1,updated_at=now(),artifacts=CASE WHEN p_action='complete' THEN p_artifacts ELSE artifacts END,approver=CASE WHEN target='design_approved' THEN p_approver ELSE NULL END,approved_at=CASE WHEN target='design_approved' THEN now() ELSE NULL END WHERE listing_id=p_listing;
 INSERT INTO public.design_events(listing_id,actor,stage,approver,comment) VALUES(p_listing,auth.uid(),target,CASE WHEN p_action IN ('approve','request_changes') THEN p_approver END,left(p_comment,4000));
 RETURN jsonb_build_object('ok',true,'stage',target);
END $$;
REVOKE ALL ON FUNCTION portal_private.advance_design(uuid,text,integer,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION portal_private.advance_design(uuid,text,integer,jsonb,text,text) TO authenticated;
CREATE FUNCTION public.advance_design(p_listing uuid,p_action text,p_revision integer,p_artifacts jsonb DEFAULT '[]',p_approver text DEFAULT NULL,p_comment text DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT portal_private.advance_design(p_listing,p_action,p_revision,p_artifacts,p_approver,p_comment); $$;
REVOKE ALL ON FUNCTION public.advance_design(uuid,text,integer,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.advance_design(uuid,text,integer,jsonb,text,text) TO authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('design-files','design-files',false,15728640,ARRAY['image/png','image/jpeg','application/pdf']);
CREATE POLICY "admin artwork upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='design-files' AND EXISTS(SELECT 1 FROM public.portal_roles WHERE user_id=auth.uid() AND role='admin') AND EXISTS(SELECT 1 FROM public.listings WHERE id::text=split_part(name,'/',1) AND status='verified'));
CREATE POLICY "staff artwork read" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='design-files' AND EXISTS(SELECT 1 FROM public.portal_roles WHERE user_id=auth.uid()));
COMMIT;
