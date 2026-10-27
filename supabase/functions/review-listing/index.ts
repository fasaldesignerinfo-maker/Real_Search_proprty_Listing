import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async(req)=>{
 const origin=Deno.env.get('SITE_ORIGIN')||'';
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return reply({error:'Sign in required'},401);
  const userClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}});
  const {data:{user},error:userError}=await userClient.auth.getUser(token);if(userError||!user)return reply({error:'Invalid session'},401);
  const admin=createClient(url,service);const {data:head}=await admin.from('portal_roles').select('role').eq('user_id',user.id).maybeSingle();if(!head||!['admin','head'].includes(head.role))return reply({error:'Not authorized'},403);
  const {id,action}=await req.json();if(!/^[0-9a-f-]{36}$/i.test(id)||!['verified','rejected'].includes(action))return reply({error:'Invalid request'},400);
  const {data:listing,error:updateError}=await admin.from('listings').update({status:action,verified_by:action==='verified'?(head.role==='admin'?'Administrator':'Zain Shamsi'):null,verified_at:action==='verified'?new Date().toISOString():null}).eq('id',id).eq('status','pending').select('*').maybeSingle();if(updateError)return reply({error:updateError.message},500);if(!listing)return reply({error:'Listing already reviewed'},409);
  if(action==='rejected')return reply({ok:true,status:'rejected'});
  return reply({ok:true,status:'verified'});
 }catch(e){return reply({error:String(e)},500)}
});
