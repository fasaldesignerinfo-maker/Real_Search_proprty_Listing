create extension if not exists pg_net;
create extension if not exists pg_cron;
create table portal_private.push_config(id boolean primary key default true check(id), secret text not null default encode(extensions.gen_random_bytes(32),'hex'), vapid jsonb);
alter table portal_private.push_config enable row level security;
insert into portal_private.push_config(id) values(true);
create table public.push_subscriptions(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<2048 and endpoint ~ '^https://(fcm.googleapis.com|updates.push.services.mozilla.com|[a-z0-9-]+.push.services.mozilla.com|web.push.apple.com)/'),
 keys jsonb not null check(length(keys->>'p256dh')=87 and length(keys->>'auth')=22), created_at timestamptz not null default now());
alter table public.push_subscriptions enable row level security;
grant select,insert,delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
create policy own_push_read on public.push_subscriptions for select to authenticated using(user_id=(select auth.uid()));
create policy own_push_delete on public.push_subscriptions for delete to authenticated using(user_id=(select auth.uid()));
create policy own_push_insert on public.push_subscriptions for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.portal_roles where user_id=(select auth.uid())));
create table public.push_deliveries(id bigint generated always as identity primary key, subscription_id uuid not null references public.push_subscriptions(id) on delete cascade, payload jsonb not null, attempts integer not null default 0, available_at timestamptz not null default now(), done boolean not null default false, last_status integer, created_at timestamptz not null default now());
alter table public.push_deliveries enable row level security;
grant all on public.push_deliveries to service_role;
grant usage,select on sequence public.push_deliveries_id_seq to service_role;
create index push_pending on public.push_deliveries(available_at) where not done;
create function portal_private.push_server_config(p_vapid jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c portal_private.push_config; begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Forbidden'; end if;
 if p_vapid is not null then update portal_private.push_config set vapid=p_vapid where id and vapid is null; end if;
 select * into c from portal_private.push_config where id; return jsonb_build_object('secret',c.secret,'vapid',c.vapid); end $$;
revoke all on function portal_private.push_server_config(jsonb) from public,anon,authenticated;
grant usage on schema portal_private to service_role;
grant execute on function portal_private.push_server_config(jsonb) to service_role;
create function public.push_server_config(p_vapid jsonb default null) returns jsonb language sql security invoker set search_path='' as $$ select portal_private.push_server_config(p_vapid) $$;
revoke all on function public.push_server_config(jsonb) from public,anon,authenticated;
grant execute on function public.push_server_config(jsonb) to service_role;
grant select on public.portal_roles to service_role;
create function public.claim_push_deliveries() returns setof public.push_deliveries language sql security invoker set search_path='' as $$
 update public.push_deliveries set attempts=attempts+1,available_at=now()+interval '5 minutes' where id in(select id from public.push_deliveries where not done and attempts<5 and available_at<=now() order by id for update skip locked limit 30) returning *;
$$;
revoke all on function public.claim_push_deliveries() from public,anon,authenticated;
grant execute on function public.claim_push_deliveries() to service_role;
create function portal_private.wake_push() returns void language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from public.push_deliveries where not done and attempts<5 and available_at<=now()) then
 perform net.http_post(url:='https://fbslvedrevflyjuzxgec.supabase.co/functions/v1/portal-push',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select secret from portal_private.push_config where id)),body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=10000);
 end if; end $$;
revoke all on function portal_private.wake_push() from public,anon,authenticated;
create function portal_private.queue_progress_push() returns trigger language plpgsql security definer set search_path='' as $$
declare target text; title text; route text; begin
 if TG_OP='UPDATE' then if new.stage is not distinct from old.stage then return new; end if; end if;
 case new.stage
 when 'pending' then target:='head'; title:='New listing ready for review'; route:='review';
 when 'approved' then target:='admin'; title:='Listing approved — ready for design'; route:='design';
 when 'design_review' then target:='marketing'; title:='Feed and Story ready for approval'; route:='approval';
 when 'changes_requested' then target:='admin'; title:='Design changes requested'; route:='design';
 when 'design_approved' then target:='admin'; title:='Final design approved'; route:='design';
 else return new; end case;
 insert into public.push_deliveries(subscription_id,payload)
 select s.id,jsonb_build_object('title',title,'body',left(new.property_name,120),'url','/#'||route,'tag',new.id::text||'-'||new.stage)
 from public.push_subscriptions s join public.portal_roles r on r.user_id=s.user_id where r.role=target;
 perform portal_private.wake_push(); return new;
 end $$;
revoke all on function portal_private.queue_progress_push() from public,anon,authenticated;
create trigger notify_progress after insert or update on public.listing_progress for each row execute function portal_private.queue_progress_push();
select cron.schedule('portal-push-retries','* * * * *','select portal_private.wake_push()');
-- Explicit service-only policies; clients remain denied.
create policy server_only on portal_private.push_config for all to service_role using(true) with check(true);
create policy server_only on public.push_deliveries for all to service_role using(true) with check(true);
