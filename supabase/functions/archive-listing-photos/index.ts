import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async request => {
  const origin = Deno.env.get('SITE_ORIGIN') || 'https://real-search-property-portal.realsearchbh.chatgpt.site';
  const headers = {'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
  const reply = (body: unknown,status=200) => new Response(JSON.stringify(body),{status,headers});
  if(request.method==='OPTIONS')return new Response(null,{headers});
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  try{
    const token=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
    if(!token)return reply({error:'Administrator sign-in required'},401);
    const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const caller=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}});
    const {data:{user},error:authError}=await caller.auth.getUser(token);
    if(authError||!user)return reply({error:'Invalid session'},401);
    const admin=createClient(url,service);
    const {data:role,error:roleError}=await admin.from('portal_roles').select('role').eq('user_id',user.id).maybeSingle();
    if(roleError||role?.role!=='admin')return reply({error:'Administrator access required'},403);
    const {id}=await request.json();if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))return reply({error:'Invalid listing ID'},400);
    const {data:listing,error:listingError}=await admin.from('listings').select('id,status,photos,source_photos_archived_at').eq('id',id).maybeSingle();
    if(listingError||!listing)return reply({error:'Listing unavailable'},404);
    const {data:workflow,error:workflowError}=await admin.from('design_workflows').select('stage,artifacts').eq('listing_id',id).maybeSingle();
    if(workflowError||listing.status!=='verified'||workflow?.stage!=='design_approved'||!Array.isArray(workflow.artifacts)||workflow.artifacts.length<2)return reply({error:'Only listings with approved final artwork can be cleaned up'},409);
    if(listing.source_photos_archived_at)return reply({ok:true,removed:0,already_done:true});
    const files=Array.isArray(listing.photos)?listing.photos:[];
    const paths=files.map((file:{path?:unknown})=>file?.path).filter((path:unknown):path is string=>typeof path==='string'&&path.startsWith(id+'/'));
    if(paths.length!==files.length)return reply({error:'Photo paths need review before removal'},409);
    if(paths.length){const {error:removeError}=await admin.storage.from('listing-files').remove(paths);if(removeError)return reply({error:removeError.message},500)}
    const {error:updateError}=await admin.from('listings').update({photos:[],source_photos_archived_at:new Date().toISOString()}).eq('id',id).eq('status','verified');
    if(updateError)return reply({error:'Photos removed, but listing record update failed. Contact Administrator: '+updateError.message},500);
    return reply({ok:true,removed:paths.length});
  }catch(error){return reply({error:String(error)},500)}
});
