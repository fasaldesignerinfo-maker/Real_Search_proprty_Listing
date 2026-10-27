// Admin-only designer: uses the authenticated Supabase session and verified listings.
// Assets/drafts persist in this browser; no AI or automatic template recognition.
let designListing=null, designImages=[], designAssetUrls={}, designDraft={}, automaticDesign=false;
const designerEl=document.getElementById('designEditor');
const designEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function designKey(id){return 'rs-design-v2-'+id}
function loadDraft(id){try{return JSON.parse(localStorage.getItem(designKey(id))||'{}')}catch{return {}}}
function saveDraft(){if(!designListing)return;const data={};designerEl.querySelectorAll('[data-design]').forEach(el=>data[el.dataset.design]=el.value);try{localStorage.setItem(designKey(designListing.id),JSON.stringify(data))}catch{document.getElementById('designMessage').textContent='Browser storage unavailable. Export your design to keep it.';return}document.getElementById('designMessage').textContent='Draft saved in this browser. Export your finished image separately.'}
function designField(label,key,value,type='text'){return `<label>${label}<input data-design="${key}" type="${type}" value="${designEsc(value)}"></label>`}
const designAssets=window.DESIGN_ASSETS||{facilities:[],logos:[]};
function assetOptions(items,selected=''){return '<option value="">None</option>'+items.map(a=>`<option value="${designEsc(a.path)}" ${a.path===selected?'selected':''}>${designEsc(a.label)} (${designEsc(a.filename)})</option>`).join('')}
function facilityControls(draft){return Array.from({length:5},(_,i)=>`<label>Facility ${i+1}<select data-design="facility${i}">${assetOptions(designAssets.facilities,draft['facility'+i])}</select></label>`).join('')}
window.openListingDesigner=async function(l,{automatic=false}={}){
 const {data:{user}}=await db.auth.getUser();if(!user||currentRole!=='admin'||l.status!=='verified')return alert('Designer access denied.');
 const {data:authz}=await db.from('portal_roles').select('role').eq('user_id',user.id).maybeSingle();if(authz?.role!=='admin')return alert('Admin authorization required.');
 designListing=l;automaticDesign=automatic;designDraft=automatic?{}:loadDraft(l.id);designImages=[];designAssetUrls={};
 if(automatic){
  const project=String(l.property_name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const logo=designAssets.logos.find(a=>a.label.toLowerCase().replace(/[^a-z0-9]/g,'')===project);
  if(logo)designDraft.projectLogoSelect=logo.path;
  const labels=[Number.isInteger(l.bedrooms)&&l.bedrooms>0?`${l.bedrooms} Bedroom${l.bedrooms===1?'':'s'}`:l.property_type,l.bathrooms?`${l.bathrooms} Bathroom${l.bathrooms===1?'':'s'}`:'',l.kitchen,...(l.other_areas||[]),...(l.views||[])].filter(Boolean);
  const matches=[];for(const label of labels){const key=String(label).toLowerCase().replace(/[^a-z0-9]/g,'');const match=designAssets.facilities.find(a=>a.label.toLowerCase().replace(/[^a-z0-9]/g,'')===key);if(match&&!matches.includes(match.path))matches.push(match.path)}
  matches.slice(0,5).forEach((path,i)=>designDraft['facility'+i]=path)
 }
 designerEl.hidden=false;designerEl.innerHTML=`<div class="dashTop"><div><p class="eyebrow">ADMIN ONLY · DESIGN STUDIO</p><h2>${designEsc(l.property_name)}</h2><p>Verified listing · ${designEsc(l.advisor)}</p></div><button id="closeDesigner" class="outline">Close</button></div>
 <p class="muted">Listing details and original photos are loaded automatically. Review the Feed and Story previews, then save both for design review.</p>
 <div class="designerGrid"><div class="designerControls">
 <h3>1. Style & Branding</h3><label>Sample style reference (PNG/JPG)<input id="styleRef" type="file" accept="image/*"></label><img id="styleThumb" class="referenceThumb" hidden alt="Style reference">
 <label>Project logo<select id="projectLogoSelect" data-design="projectLogoSelect">${assetOptions(designAssets.logos,designDraft.projectLogoSelect)}</select></label><label>Or upload custom project logo (PNG)<input id="projectLogo" type="file" accept="image/png"></label><h3>Facilities</h3><p class="muted">Choose up to five. The preview keeps them in one centered row.</p>${facilityControls(designDraft)}
 <h3>2. Listing information</h3>${designField('Project name','project',designDraft.project??l.property_name)}${designField('Location','location',designDraft.location??l.location)}${designField('Headline','headline',designDraft.headline??l.property_type+' FOR '+(l.listing_type||'RENT').toUpperCase())}${designField('Price (BHD)','price',designDraft.price??l.price)}${designField('Property type / Bedrooms','bedrooms',designDraft.bedrooms??(l.bedrooms===0?'Studio':l.bedrooms?l.bedrooms+' Bedrooms':l.property_type))}${designField('Bathrooms','bathrooms',designDraft.bathrooms??(l.bathrooms?l.bathrooms+' Bathrooms':''))}${designField('Features (separate with ·)','features',designDraft.features??[...(l.other_areas||[]),...(l.views||[]),l.kitchen].filter(Boolean).join(' · '))}${designField('Inclusive','inclusive',designDraft.inclusive??l.inclusive)}${designField('Property advisor','advisor',designDraft.advisor??l.advisor)}${designField('Advisor phone','phone',designDraft.phone??l.pa_phone)}
 <h3>3. Property photos</h3><p class="muted">Original advisor photos are preserved. Upload enhanced photos individually, or all four together. Uploaded enhanced images remain separate in this editing session.</p><div id="photoSelectors"></div><label>Replace all four with enhanced photos<input id="allEnhanced" type="file" accept="image/*" multiple></label>
 <h3>4. Export</h3><label>Output size<select id="designSize"><option value="1080x1350">Instagram Feed · 1080 × 1350</option><option value="1080x1920">Instagram Story · 1080 × 1920</option></select></label><div class="actions"><button id="designPreview" class="primary">Generate Preview</button><button id="designSave">Save Draft</button><button id="designDownload" class="primary">Download PNG</button><button id="designBoth">Download Both</button><button id="designWorkflowSave" class="primary" type="button">Save Feed & Story to Workflow</button></div><p id="designMessage" role="status"></p>
 </div><div class="designerCanvas"><canvas id="designCanvas" width="1080" height="1350"></canvas></div></div>`;
 document.getElementById('closeDesigner').onclick=()=>{designerEl.hidden=true;designerEl.replaceChildren()};
 const photos=document.getElementById('photoSelectors');for(let i=0;i<4;i++){const div=document.createElement('div');div.innerHTML=`<label>Photo ${i+1}${i===0?' · Master':''}<select id="photoMode${i}"><option value="original">Original photo</option><option value="enhanced">Enhanced photo</option></select><input id="enhanced${i}" type="file" accept="image/*"></label>`;photos.append(div)}
 for(let i=0;i<4;i++){const file=(l.photos||[])[i];if(file){const {data,error}=await db.storage.from('listing-files').createSignedUrl(file.path,3600);designImages[i]={original:!error?data.signedUrl:null,enhanced:null}}}
 for(let i=0;i<4;i++)document.getElementById('enhanced'+i).onchange=e=>{if(e.target.files[0]){designImages[i].enhanced=URL.createObjectURL(e.target.files[0]);document.getElementById('photoMode'+i).value='enhanced';drawDesign()}};
 document.getElementById('allEnhanced').onchange=e=>{const files=[...e.target.files];if(files.length!==4)return alert('Select exactly four photos.');files.forEach((file,i)=>{designImages[i].enhanced=URL.createObjectURL(file);document.getElementById('photoMode'+i).value='enhanced'});drawDesign()};
 for(const id of ['styleRef','projectLogo'])document.getElementById(id).onchange=e=>{const file=e.target.files[0];if(!file)return;designAssetUrls[id]=URL.createObjectURL(file);if(id==='styleRef'){const img=document.getElementById('styleThumb');img.src=designAssetUrls[id];img.hidden=false}else drawDesign()};
 document.getElementById('designSize').onchange=drawDesign;designerEl.querySelectorAll('[data-design]').forEach(e=>{e.oninput=drawDesign;e.onchange=drawDesign});
 for(let i=0;i<4;i++)document.getElementById('photoMode'+i).onchange=drawDesign;
 document.getElementById('designPreview').onclick=drawDesign;document.getElementById('designSave').onclick=saveDraft;document.getElementById('designWorkflowSave').hidden=!automatic;document.getElementById('designWorkflowSave').onclick=saveAutomaticArtwork;
 document.getElementById('designDownload').onclick=()=>downloadDesign();document.getElementById('designBoth').onclick=async()=>{for(const size of ['1080x1350','1080x1920']){document.getElementById('designSize').value=size;await downloadDesign()}};
 await drawDesign();designerEl.scrollIntoView({behavior:'smooth'});
};
const loadImage=src=>new Promise((resolve,reject)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>resolve(i);i.onerror=reject;i.src=src});
function cover(ctx,img,x,y,w,h){const scale=Math.max(w/img.width,h/img.height),sw=w/scale,sh=h/scale;ctx.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,x,y,w,h)}
function textFit(ctx,str,x,y,maxWidth,size,min=28){ctx.font=`700 ${size}px Arial`;while(size>min&&ctx.measureText(str).width>maxWidth){size--;ctx.font=`700 ${size}px Arial`}if(ctx.measureText(str).width>maxWidth)throw Error('Shorten this text: '+str);ctx.fillText(str,x,y)}
let renderVersion=0;
async function drawDesign(){const version=++renderVersion;if(!designListing)return;const canvas=document.getElementById('designCanvas');if(!canvas)return;const [w,h]=document.getElementById('designSize').value.split('x').map(Number);canvas.width=w;canvas.height=h;const renderCanvas=document.createElement('canvas');renderCanvas.width=w;renderCanvas.height=h;const c=renderCanvas.getContext('2d');c.fillStyle='#122536';c.fillRect(0,0,w,h);const msg=document.getElementById('designMessage');msg.textContent='Rendering preview…';try{
 const images=[];for(let i=0;i<4;i++){const entry=designImages[i];const src=document.getElementById('photoMode'+i).value==='enhanced'?entry?.enhanced:entry?.original;if(src)images.push(await loadImage(src));else images.push(null)}
 const heroH=Math.round(h*.59);if(images[0])cover(c,images[0],0,0,w,heroH);c.fillStyle='rgba(0,0,0,.25)';c.fillRect(0,0,w,heroH);
 const gradient=c.createLinearGradient(0,heroH-400,0,heroH);gradient.addColorStop(0,'transparent');gradient.addColorStop(1,'#122536');c.fillStyle=gradient;c.fillRect(0,heroH-400,w,400);
 const fields={};designerEl.querySelectorAll('[data-design]').forEach(e=>fields[e.dataset.design]=e.value);
 const brand=await loadImage('assets/real-search-logo.png');const brandScale=Math.min(250/brand.width,110/brand.height);c.fillStyle='rgba(255,255,255,.95)';if(automaticDesign){c.fillRect((w-280)/2,25,280,130);c.drawImage(brand,(w-brand.width*brandScale)/2,35,brand.width*brandScale,brand.height*brandScale)}else{c.fillRect(42,25,280,130);c.drawImage(brand,57,35,brand.width*brandScale,brand.height*brandScale)};const selectedLogo=designAssetUrls.projectLogo||fields.projectLogoSelect;if(selectedLogo){const logo=await loadImage(selectedLogo);const scale=Math.min(230/logo.width,110/logo.height);c.drawImage(logo,w-58-logo.width*scale,36,logo.width*scale,logo.height*scale)}
 c.fillStyle='#fff';c.textAlign=automaticDesign?'center':'left';textFit(c,fields.headline.toUpperCase(),automaticDesign?w/2:58,heroH-155,w-116,54);c.font='400 32px Arial';c.fillText(fields.location,automaticDesign?w/2:58,heroH-96);c.fillStyle='#d4ad70';c.font='700 49px Arial';c.fillText('BHD '+fields.price,automaticDesign?w/2:58,heroH-25);c.textAlign='left';
 const stripY=heroH+22,stripH=Math.round((h-heroH)*.34),gap=12,tw=(w-116-gap*2)/3;for(let i=1;i<4;i++){if(images[i])cover(c,images[i],58+(i-1)*(tw+gap),stripY,tw,stripH)}
 c.fillStyle='#fff';c.textAlign=automaticDesign?'center':'left';c.font='700 32px Arial';c.fillText(fields.project,automaticDesign?w/2:58,stripY+stripH+58);c.font='400 26px Arial';const features=[fields.bedrooms,fields.bathrooms,fields.features,fields.inclusive].filter(Boolean).join('  ·  ');const words=features.split(' ');let line='',yy=stripY+stripH+102;
 if(automaticDesign){let lines=[],size=26;const available=h-145-yy;for(;size>=18;size-=2){c.font=`400 ${size}px Arial`;lines=[];let current='';for(const word of words){const next=current?current+' '+word:word;if(current&&c.measureText(next).width>w-116){lines.push(current);current=word}else current=next}if(current)lines.push(current);if(lines.length*(size+7)<=available)break}if(size<18)throw Error('Features exceed available space. Shorten the text.');for(const value of lines){c.fillText(value,w/2,yy);yy+=size+7}}
 else{for(const word of words){if(c.measureText(line+' '+word).width>w-116){c.fillText(line,58,yy);yy+=38;line=word}else line+=(line?' ':'')+word}if(line)c.fillText(line,58,yy)}c.textAlign='left';const selected=[0,1,2,3,4].map(i=>designAssets.facilities.find(a=>a.path===fields['facility'+i])).filter(Boolean);if(selected.length){const rowY=h-116,slot=Math.min(180,(w-116)/selected.length),start=(w-slot*selected.length)/2;for(let i=0;i<selected.length;i++){const icon=await loadImage(selected[i].path);const iw=Math.min(42,icon.width*42/icon.height);c.drawImage(icon,start+i*slot+(slot-iw)/2,rowY,iw,42);c.font='400 17px Arial';c.textAlign='center';c.fillText(selected[i].label,start+(i+.5)*slot,h-58,slot-6)}c.textAlign='left'}if(yy>h-(selected.length?145:115))throw Error('Features exceed available space. Shorten the text.');c.fillStyle='#d4ad70';textFit(c,fields.advisor+'  |  '+(fields.phone||''),58,h-42,w-116,28,22);if(version!==renderVersion)return;canvas.getContext('2d').drawImage(renderCanvas,0,0);msg.textContent='Preview ready · Photos are cropped to fit; no AI expansion is applied.'
 }catch(err){if(version===renderVersion)msg.textContent='Preview warning: '+(err?.message||'An image could not be loaded. Reopen the listing and try again.')}}
async function downloadDesign(){await drawDesign();const msg=document.getElementById('designMessage');if(msg.textContent.startsWith('Preview warning'))return;const canvas=document.getElementById('designCanvas');const link=document.createElement('a');link.download=`RealSearch-${designListing.property_name.replace(/[^\w-]/g,'_')}-${canvas.width}x${canvas.height}.png`;link.href=canvas.toDataURL('image/png');link.click()}

async function saveAutomaticArtwork(){
 const button=document.getElementById('designWorkflowSave'),msg=document.getElementById('designMessage'),l=designListing;
 if(!l||!automaticDesign)return;button.disabled=true;
 try{
  const workflow=workflows.get(l.id);if(workflow?.stage!=='designing')throw Error('Start Designing before saving artwork.');
  if(designImages.filter(x=>x?.original||x?.enhanced).length!==4)throw Error('Four listing photos are required.');
  const refs=[];for(const [kind,size] of [['feed','1080x1350'],['story','1080x1920']]){
   document.getElementById('designSize').value=size;await drawDesign();
   if(msg.textContent.startsWith('Preview warning'))throw Error(msg.textContent);
   const canvas=document.getElementById('designCanvas');const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!blob)throw Error('Could not export '+kind+' artwork.');
   const path=l.id+'/'+crypto.randomUUID()+'-'+kind+'.png';msg.textContent='Saving '+kind+' artwork…';
   const {error}=await db.storage.from('design-files').upload(path,blob,{contentType:'image/png',upsert:false});if(error)throw error;
   refs.push({path,name:kind+'.png',type:'image/png',kind})
  }
  const {error}=await db.rpc('advance_design',{p_listing:l.id,p_action:'complete',p_revision:workflow.revision,p_artifacts:refs,p_approver:null,p_comment:null});
  if(error)throw error;msg.textContent='Feed and Story saved. Send the completed designs for review.';
  designerEl.hidden=true;designerEl.replaceChildren();await refresh();await openWorkflow(listings.find(x=>x.id===l.id)||l)
 }catch(e){msg.textContent=e.message;button.disabled=false}
}
