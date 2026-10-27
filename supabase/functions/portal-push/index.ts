import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import webpush from 'npm:web-push@3.6.7';
const origin='https://real-search-property-portal.realsearchbh.chatgpt.site';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Content-Type':'application/json'};
const allowed=(endpoint:string)=>{try{const u=new URL(endpoint);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(/^(fcm\.googleapis\.com|(?:[a-z0-9-]+\.)?push\.services\.mozilla\.com|web\.push\.apple\.com)$/).test(u.hostname)}catch{return false}};
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method!=='POST')return respond({error:'Method not allowed'},405);
 try{
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
 const {data:config,error:ce}=await db.rpc('push_server_config'); if(ce)throw ce;
 const body=await req.json();
 if(body.action==='dispatch'){
 if(!token||token!==config.secret)return respond({error:'Unauthorized'},401);
 }else{
 const {data:{user},error}=await db.auth.getUser(token);if(error||!user)return respond({error:'Sign in first'},401);
 const {data:roles,error:re}=await db.from('portal_roles').select('role').eq('user_id',user.id).single();
 if(re||!roles)return respond({error:'Staff access required'},403);
 if(body.action!=='config')return respond({error:'Unknown action'},400);
 }
 let vapid=config.vapid;
 if(!vapid){const {data,error}=await db.rpc('push_server_config',{p_vapid:webpush.generateVAPIDKeys()});if(error)throw error;vapid=data.vapid;}
 if(body.action==='config')return respond({publicKey:vapid.publicKey});
 const {data:jobs,error:je}=await db.rpc('claim_push_deliveries');if(je)throw je;
 let accepted=0;
 for(const job of jobs){
 const {data:s}=await db.from('push_subscriptions').select('endpoint,keys').eq('id',job.subscription_id).single();
 if(!s)continue;
 let status=0;try{
 if(!allowed(s.endpoint)){status=400;throw Error('Invalid push endpoint')}
 // Generate encrypted Web Push request, then fetch with redirects disabled (SSRF protection).
 const details=webpush.generateRequestDetails(s,JSON.stringify(job.payload),{TTL:86400,urgency:'normal',vapidDetails:{subject:origin,...vapid}});
 const response=await fetch(details.endpoint,{method:'POST',headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(10000)});
 status=response.status;await response.body?.cancel();
 if(response.ok)accepted++;
 }catch{/* Never log subscription credentials or payloads. */}
 if(status===404||status===410){await db.from('push_subscriptions').delete().eq('id',job.subscription_id);continue;}
 const done=(status>=200&&status<300)||(status>=400&&status<500&&status!==429);
 await db.from('push_deliveries').update({done,last_status:status}).eq('id',job.id);
 }
 return respond({processed:jobs.length,accepted});
 }catch{return respond({error:'Notification service temporarily unavailable'},503)}
});
