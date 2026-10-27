async function advisorGate(action,id,code,extra={}){
 await requireDatabase();
 const {data,error}=await db.functions.invoke('advisor-gate',{body:{action,id,code,...extra}});
 if(error){let detail;try{detail=await error.context?.json()}catch{}throw Error(detail?.error||data?.error||error.message||'Gate Card request failed')}
 if(data?.error)throw Error(data.error);
 return data;
}
function showAdvisorGate(id){
 const box=$('publicArtwork');box.hidden=false;box.innerHTML='<h2>Property Advisor Gate Card</h2><p>Enter the private code provided by Zain or the Administrator to edit this rejected listing.</p><form id="gateForm"><label>Property Advisor Gate Card code<input id="gateCode" type="password" autocomplete="off" spellcheck="false" required></label><div class="actions"><button class="primary">Open listing for editing</button><button id="closeGate" type="button" class="outline">Cancel</button></div><p id="gateMessage" role="status"></p></form>';
 $('closeGate').onclick=()=>{box.hidden=true;box.replaceChildren()};
 $('gateForm').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('.primary'),status=$('gateMessage'),code=$('gateCode').value.trim();button.disabled=true;status.textContent='Checking code…';try{const data=await advisorGate('unlock',id,code);const listing={...data.listing,gateCode:code,rejection_reason:data.rejection_reason};editRejected(listing);box.hidden=true;box.replaceChildren();$('gateReason')?.remove();const notice=document.createElement('p');notice.id='gateReason';notice.className='panel note';notice.textContent=data.rejection_reason?'Rejection reason: '+data.rejection_reason:'Edit the listing and resubmit for verification.';$('listingForm').prepend(notice);notice.scrollIntoView({behavior:'smooth'})}catch(error){box.hidden=false;status.textContent=error.message;button.disabled=false}};
 box.scrollIntoView({behavior:'smooth'});
}
async function issueAdvisorGate(listing,container,reason){
 const status=document.createElement('p');status.setAttribute('role','status');container.append(status);
 try{status.textContent='Generating Gate Card…';const data=await advisorGate('issue',listing.id,null,{reason});status.textContent=`Gate Card for ${data.advisor}: ${data.code} · Valid for 90 days. Share it privately with the advisor.`;
 const copy=document.createElement('button');copy.type='button';copy.className='outline';copy.textContent='Copy code';copy.onclick=async()=>{try{await navigator.clipboard.writeText(data.code);copy.textContent='Copied'}catch{status.textContent+=' Select and copy the code shown above.'}};container.append(copy)
 }catch(error){status.textContent=error.message;container.querySelector('button.primary').disabled=false}
}
async function rejectListingWithGate(listing,reason){
 const {data,error}=await db.rpc('review_listing',{listing_id:listing.id,decision:'rejected'});
 if(error)throw error;if(data?.error)throw Error(data.error);
 await showRejectionGateCard(listing,reason);
}
async function showRejectionGateCard(listing,reason){
 document.getElementById('rejectionGateDialog')?.remove();
 const previous=document.activeElement;
 const dialog=document.createElement('dialog');dialog.id='rejectionGateDialog';dialog.setAttribute('aria-labelledby','rejectionGateTitle');
 dialog.innerHTML='<div class="gateSuccessIcon" aria-hidden="true">✓</div><h2 id="rejectionGateTitle">Listing rejected successfully</h2><p class="gateProperty"></p><p class="gateInstruction"></p><label for="issuedGateCode">Property Advisor Gate Card code</label><textarea id="issuedGateCode" rows="3" readonly aria-label="Generated gate code">Generating…</textarea><p class="gateExpiry"></p><p class="gateStatus" role="status" aria-live="polite"></p><div class="actions"><button type="button" class="primary gateCopy" disabled>Copy code</button><button type="button" class="outline gateRetry" hidden>Retry code generation</button><button type="button" class="outline gateClose">Done</button></div>';
 dialog.querySelector('.gateProperty').textContent=listing.property_name;
 dialog.querySelector('.gateInstruction').textContent='Please copy this code and share it privately with '+listing.advisor+' to edit and resubmit this listing.';
 const input=dialog.querySelector('#issuedGateCode'),status=dialog.querySelector('.gateStatus'),copy=dialog.querySelector('.gateCopy'),retry=dialog.querySelector('.gateRetry');
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(input.value);copy.textContent='Copied';status.textContent='Code copied. Share it with '+listing.advisor+'.'}catch{input.focus();input.select();status.textContent='Select the code above and copy it manually.'}};
 dialog.querySelector('.gateClose').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{dialog.remove();if(previous?.isConnected)previous.focus()},{once:true});
 document.body.append(dialog);dialog.showModal();
 async function generate(){retry.hidden=true;copy.disabled=true;status.textContent='Generating the advisor gate code…';try{const issued=await advisorGate('issue',listing.id,null,{reason});if(!dialog.isConnected)return;if(!issued?.code)throw Error('The service did not return a code.');input.value=issued.code;dialog.querySelector('.gateExpiry').textContent='Valid for 90 days. Expires after resubmission.';copy.disabled=false;status.textContent='Ready to copy.';copy.focus()}catch(error){if(!dialog.isConnected)return;input.value='';status.textContent='The listing is rejected, but code generation failed. '+error.message;retry.hidden=false}}
 retry.onclick=generate;await generate();
}
const showDetailBeforeGate=showDetail;
showDetail=async function(listing){await showDetailBeforeGate(listing);if(listing.status!=='rejected'||!['admin','head'].includes(currentRole))return;const box=$('detail'),actions=document.createElement('div');actions.className='actions';const label=document.createElement('label');label.textContent='Reason for rejection (shown to the advisor)';const reason=document.createElement('textarea');reason.required=true;reason.maxLength=2000;label.append(reason);box.append(label);const button=document.createElement('button');button.type='button';button.className='primary';button.textContent='Generate Property Advisor Gate Card';button.onclick=()=>{if(!reason.value.trim()){reason.focus();return}button.disabled=true;issueAdvisorGate(listing,actions,reason.value)};actions.append(button);box.append(actions)};
