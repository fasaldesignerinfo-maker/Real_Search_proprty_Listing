CREATE OR REPLACE FUNCTION portal_private.advance_design(p_listing uuid,p_action text,p_revision integer,p_artifacts jsonb,p_approver text,p_comment text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; w public.design_workflows; target text; item jsonb;
BEGIN
 SELECT role INTO r FROM public.portal_roles WHERE user_id=auth.uid();
 IF auth.uid() IS NULL OR r IS NULL OR r NOT IN ('admin','marketing') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.listings WHERE id=p_listing AND status='verified' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Listing must be approved first'; END IF;
 INSERT INTO public.design_workflows(listing_id) VALUES(p_listing) ON CONFLICT DO NOTHING;
 SELECT * INTO w FROM public.design_workflows WHERE listing_id=p_listing FOR UPDATE;
 IF p_revision IS NULL OR w.revision<>p_revision THEN RAISE EXCEPTION 'This listing changed. Refresh and try again.'; END IF;
 IF p_action='revise' AND r='admin' AND w.stage IN ('design_completed','design_review') THEN target='designing';
 ELSIF p_action='start' AND r='admin' AND w.stage IN ('approved','changes_requested') THEN target='designing';
 ELSIF p_action='complete' AND r='admin' AND w.stage='designing' THEN
   IF p_artifacts IS NULL OR jsonb_typeof(p_artifacts)<>'array' OR jsonb_array_length(p_artifacts) <> 2 THEN RAISE EXCEPTION 'Both feed and story artwork are required'; END IF;
   IF (SELECT count(*) FROM jsonb_array_elements(p_artifacts) a WHERE a->>'kind'='feed')<>1 OR (SELECT count(*) FROM jsonb_array_elements(p_artifacts) a WHERE a->>'kind'='story')<>1 THEN RAISE EXCEPTION 'One feed and one story are required'; END IF;
   IF (SELECT count(DISTINCT a->>'path') FROM jsonb_array_elements(p_artifacts) a)<>2 THEN RAISE EXCEPTION 'Feed and Story must be separate artwork files'; END IF;
   FOR item IN SELECT * FROM jsonb_array_elements(p_artifacts) LOOP
     IF item->>'path' IS NULL OR item->>'type' IS NULL OR item->>'type' NOT IN ('image/png','image/jpeg') OR item->>'path' NOT LIKE p_listing::text||'/%' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='design-files' AND name=item->>'path') THEN RAISE EXCEPTION 'Invalid artwork file'; END IF;
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

UPDATE storage.buckets SET allowed_mime_types=ARRAY['image/png','image/jpeg'] WHERE id='design-files';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='listing_progress') THEN
 ALTER PUBLICATION supabase_realtime ADD TABLE public.listing_progress;
 END IF;
END $$;
