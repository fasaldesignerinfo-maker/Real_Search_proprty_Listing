import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const origin=Deno.env.get('SITE_ORIGIN')||'https://real-search-property-portal.realsearchbh.chatgpt.site';
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const hash=async(code:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b=>b.toString(16).padStart(2,'0')).join('');
const safeFile=(name:string)=>name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,90);

Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{headers});
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const {action,id,code,changes,file,reason}=await request.json();
  if(!uuid(id))return reply({error:'Invalid listing'},400);
  const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin=createClient(url,service);
  if(action==='issue'){
   const jwt=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!jwt)return reply({error:'Sign in required'},401);
   const caller=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${jwt}`}}});const {data:{user},error:authError}=await caller.auth.getUser(jwt);
   if(authError||!user)return reply({error:'Invalid session'},401);
   const {data:role}=await admin.from('portal_roles').select('role').eq('user_id',user.id).maybeSingle();if(!['admin','head'].includes(role?.role))return reply({error:'Reviewer access required'},403);
   const {data:listing}=await admin.from('listings').select('id,status,advisor').eq('id',id).maybeSingle();if(listing?.status!=='rejected')return reply({error:'The listing is not rejected'},409);
   if(typeof reason!=='string'||!reason.trim()||reason.length>2000)return reply({error:'Enter the reason for rejection'},400);
   const secret=token();const {error}=await admin.from('advisor_edit_grants').upsert({listing_id:id,code_hash:await hash(secret),rejection_reason:reason.trim(),created_at:new Date().toISOString(),expires_at:new Date(Date.now()+90*864e5).toISOString(),failed_attempts:0,blocked_until:null});
   if(error)throw error;return reply({ok:true,code:secret,advisor:listing.advisor});
  }
  if(!['unlock','upload','resubmit'].includes(action)||typeof code!=='string'||!/^[0-9a-f]{48}$/i.test(code))return reply({error:'Property Advisor Gate Card code required'},401);
  const {data:grant}=await admin.from('advisor_edit_grants').select('*').eq('listing_id',id).maybeSingle();
  if(!grant||new Date(grant.expires_at).getTime()<Date.now()||grant.blocked_until&&new Date(grant.blocked_until).getTime()>Date.now())return reply({error:'Code unavailable or temporarily locked. Ask Zain for a new Gate Card.'},401);
  if(grant.code_hash!==await hash(code)){
   const attempts=(grant.failed_attempts||0)+1;await admin.from('advisor_edit_grants').update({failed_attempts:attempts,blocked_until:attempts>=5?new Date(Date.now()+15*60*1000).toISOString():null}).eq('listing_id',id);
   return reply({error:'Invalid Property Advisor Gate Card code'},401);
  }
  if(grant.failed_attempts)await admin.from('advisor_edit_grants').update({failed_attempts:0,blocked_until:null}).eq('listing_id',id);
  const {data:listing,error:listingError}=await admin.from('listings').select('*').eq('id',id).maybeSingle();
  if(listingError||listing?.status!=='rejected')return reply({error:'This listing is no longer rejected'},409);
  if(action==='unlock'){
   const photos=[];for(const photo of listing.photos||[]){const {data}=await admin.storage.from('listing-files').createSignedUrl(photo.path,900);photos.push({...photo,url:data?.signedUrl||null})}
   return reply({ok:true,listing:{...listing,photos},rejection_reason:grant.rejection_reason});
  }
  if(action==='upload'){
   if(!file||typeof file.name!=='string'||!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type))return reply({error:'Use an image or PDF file'},400);
   const path=`${id}/gate-${crypto.randomUUID()}-${safeFile(file.name)}`;
   const {data,error}=await admin.storage.from('listing-files').createSignedUploadUrl(path);if(error)throw error;
   return reply({path,token:data.token});
  }
  if(action==='resubmit'){
   if(!changes||typeof changes!=='object'||Array.isArray(changes))return reply({error:'Invalid listing details'},400);
   const photos=changes.photos;if(!Array.isArray(photos)||photos.length!==4||photos.filter((p:{role?:string})=>p?.role==='master').length!==1)return reply({error:'One master and three other photos are required'},400);
   const documents=Array.isArray(changes.documents)?changes.documents:[];if(documents.length>3)return reply({error:'Maximum three documents'},400);
   for(const item of [...photos,...documents]){
    if(typeof item?.path!=='string'||!item.path.startsWith(id+'/')||typeof item.name!=='string'||!['image/png','image/jpeg','image/webp','application/pdf'].includes(item.type))return reply({error:'Invalid file reference'},400);
    const original=[...(listing.photos||[]),...(listing.documents||[])].some((f:{path:string})=>f.path===item.path);
    if(!original){const {data}=await admin.storage.from('listing-files').info(item.path);if(!data)return reply({error:'Upload each replacement file before resubmitting'},400)}
   }
   if(typeof changes.property_name!=='string'||!changes.property_name.trim()||typeof changes.location!=='string'||!changes.location.trim()||!Number.isFinite(Number(changes.price))||Number(changes.price)<0)return reply({error:'Complete the required listing details'},400);
   const fields=['listing_date','listing_month','listing_year','advisor','property_name','location','listing_type','property_type','price','bedrooms','bathrooms','area_sqm','features','notes','pa_phone','kitchen','inclusive','other_areas','views'];
   const update=Object.fromEntries(fields.filter(k=>Object.hasOwn(changes,k)).map(k=>[k,changes[k]]));
   const {data,error}=await admin.from('listings').update({...update,photos,documents,status:'pending',verified_by:null,verified_at:null,notification_sent_at:null}).eq('id',id).eq('status','rejected').select('id').maybeSingle();
   if(error)throw error;if(!data)return reply({error:'Listing changed. Refresh and try again.'},409);
   await admin.from('advisor_edit_grants').delete().eq('listing_id',id);
   return reply({ok:true,id});
  }
  return reply({error:'Invalid action'},400);
 }catch(error){return reply({error:String(error)},500)}
});
