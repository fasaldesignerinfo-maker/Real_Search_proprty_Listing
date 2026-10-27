import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

// The service key stays on the server. Every operation verifies the caller's
// current account and portal_roles row before accessing privileged storage.
Deno.serve(async request => {
  const origins = (Deno.env.get('ALLOWED_ORIGINS') || [
    'https://fasaldesignerinfo-maker.github.io',
    'https://real-search-property-portal.realsearchbh.chatgpt.site'
  ].join(',')).split(',').map(s=>s.trim()).filter(Boolean);
  const origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if(origin&&origins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!origins.includes(origin))return reply({error:'This website origin is not enabled for listing management.'},403);
  if(request.method==='OPTIONS')return new Response(null,{headers});
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  try {
    const token=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
    if(!token)return reply({error:'Administrator sign-in required'},401);
    const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!anon||!service)return reply({error:'Server configuration is incomplete'},500);
    const caller=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}});
    const {data:{user},error:authError}=await caller.auth.getUser(token);
    if(authError||!user)return reply({error:'Invalid session'},401);
    const admin=createClient(url,service);
    const {data:role,error:roleError}=await admin.from('portal_roles').select('role').eq('user_id',user.id).maybeSingle();
    if(roleError||role?.role!=='admin')return reply({error:'Administrator access required'},403);
    const {id,action}=await request.json();
    if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!['photos','delete'].includes(action))return reply({error:'Invalid listing or action'},400);
    const {data:listing,error}=await admin.from('listings').select('id,photos').eq('id',id).maybeSingle();
    if(error)return reply({error:error.message},500);
    if(!listing)return action==='delete'?reply({ok:true,already_removed:true}):reply({error:'Listing not found'},404);
    async function removePaths(bucket,paths){
      for(let i=0;i<paths.length;i+=100){const {error}=await admin.storage.from(bucket).remove(paths.slice(i,i+100));if(error)throw Error('File removal failed: '+error.message)}
    }
    if(action==='photos'){
      if(!Array.isArray(listing.photos))return reply({error:'Photo references need review.'},409);
      const paths=listing.photos.map(f=>f?.path);
      if(paths.some(path=>typeof path!=='string'||!path.startsWith(id+'/')||path.split('/').includes('..')))return reply({error:'Photo paths need review.'},409);
      await removePaths('listing-files',paths);
      const {data:updated,error}=await admin.from('listings').update({photos:[],source_photos_archived_at:new Date().toISOString()}).eq('id',id).select('id,photos').maybeSingle();
      if(error||!updated||updated.photos?.length)return reply({error:'Files removed, but record update was not confirmed. Refresh and retry. '+(error?.message||'')},500);
      return reply({ok:true,removed:paths.length});
    }
    // Resolve files by the exact listing UUID folder, including replaced artwork
    // no longer referenced by the current workflow. Never delete another prefix.
    async function collect(bucket,prefix){
      const paths=[];
      for(let offset=0;;offset+=100){
        const {data,error}=await admin.storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});
        if(error)throw Error('Could not list files: '+error.message);
        for(const file of data||[]){
          if(!file.name||file.name.includes('/')||file.name==='.'||file.name==='..')throw Error('Invalid storage filename');
          const path=prefix+'/'+file.name;
          if(file.id)paths.push(path);else paths.push(...await collect(bucket,path));
        }
        if(!data||data.length<100)break;
      }
      return paths;
    }
    // Check backend installation before deleting any files.
    const {error:setupError}=await admin.rpc('portal_v19_management_ready');
    if(setupError)return reply({error:'Run SETUP-V19.sql before deleting listings.'},409);
    for(const bucket of ['listing-files','design-files'])await removePaths(bucket,await collect(bucket,id));
    const {data:removed,error:deleteError}=await admin.rpc('finalize_listing_removal',{p_listing:id});
    if(deleteError||removed?.ok!==true)return reply({error:'Files removed, but listing deletion was not confirmed. Refresh and retry. '+(deleteError?.message||'')},500);
    return reply({ok:true});
  } catch(error) {return reply({error:error?.message||'Listing management failed'},500)}
});
