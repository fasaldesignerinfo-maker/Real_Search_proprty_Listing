BEGIN;
DO $$
DECLARE lid uuid:=gen_random_uuid(); sid uuid; rec record; n integer; expected_role text; v_stage text;
BEGIN
 FOR rec IN SELECT user_id,role FROM public.portal_roles LOOP
 INSERT INTO public.push_subscriptions(user_id,endpoint,keys) VALUES(rec.user_id,'https://fcm.googleapis.com/test-'||gen_random_uuid(),jsonb_build_object('p256dh',repeat('a',87),'auth',repeat('b',22)));
 END LOOP;
 INSERT INTO public.listings(id,listing_date,listing_month,listing_year,advisor,property_name,location,listing_type,property_type,price,photos,documents)
 VALUES(lid,current_date,extract(month from current_date),extract(year from current_date),'PUSH TRANSACTION QA','PUSH TRANSACTION QA','QA','Rent','Studio',1,'[{},{},{},{}]','[]');
 IF NOT EXISTS(SELECT 1 FROM public.push_deliveries d JOIN public.push_subscriptions s ON s.id=d.subscription_id JOIN public.portal_roles r ON r.user_id=s.user_id WHERE d.payload->>'tag'=lid::text||'-pending' AND r.role='head') THEN RAISE EXCEPTION 'Head not notified';END IF;
 FOREACH v_stage IN ARRAY ARRAY['approved','design_review','changes_requested','design_approved'] LOOP
 UPDATE public.listing_progress SET stage=v_stage WHERE id=lid;
 expected_role:=case when v_stage='design_review' then 'marketing' else 'admin' end;
 IF NOT EXISTS(SELECT 1 FROM public.push_deliveries d JOIN public.push_subscriptions s ON s.id=d.subscription_id JOIN public.portal_roles r ON r.user_id=s.user_id WHERE d.payload->>'tag'=lid::text||'-'||v_stage AND r.role=expected_role) THEN RAISE EXCEPTION 'Missing delivery for %',v_stage;END IF;
 IF EXISTS(SELECT 1 FROM public.push_deliveries d JOIN public.push_subscriptions s ON s.id=d.subscription_id JOIN public.portal_roles r ON r.user_id=s.user_id WHERE d.payload->>'tag'=lid::text||'-'||v_stage AND r.role<>expected_role) THEN RAISE EXCEPTION 'Wrong recipient for %',v_stage;END IF;
 END LOOP;
 SELECT count(*) INTO n FROM public.push_deliveries WHERE payload->>'tag' LIKE lid::text||'%';
 UPDATE public.listing_progress SET stage='design_approved' WHERE id=lid;
 IF (SELECT count(*) FROM public.push_deliveries WHERE payload->>'tag' LIKE lid::text||'%')<>n THEN RAISE EXCEPTION 'Duplicate stage notification';END IF;
 IF has_function_privilege('authenticated','public.push_server_config(jsonb)','EXECUTE') OR has_function_privilege('anon','public.claim_push_deliveries()','EXECUTE') THEN RAISE EXCEPTION 'Private push RPC exposed';END IF;
 IF has_table_privilege('anon','public.push_subscriptions','SELECT') OR has_table_privilege('authenticated','public.push_deliveries','SELECT') THEN RAISE EXCEPTION 'Push data exposed';END IF;
END $$;
ROLLBACK;

SELECT 'PASS: recipient routing, stage deduplication and private server permissions; fixtures and queued HTTP requests rolled back' as result;
