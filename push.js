/* Opt-in, per-device Web Push; no phone numbers or paid messaging provider. */
(()=>{
 const panel=document.createElement('details');panel.className='panel';panel.id='pushPanel';panel.innerHTML='<summary>Phone notifications · Free web push</summary><p>Zain: new listings. Designer/Admin: approved listings, design approvals and changes. Marketing/Shahad: designs ready for approval.</p><p>On iPhone: open in Safari → Share → Add to Home Screen, then open that icon and sign in. Requires iOS 16.4 or later. On Android: use a supported browser such as Chrome.</p><p>Alerts stay enabled on this device after signing out. Disable them before sharing this device. No messaging fee; hosting free-tier limits apply.</p><div class="actions"><button type="button" class="primary" id="pushEnable">Enable notifications on this device</button><button type="button" class="outline" id="pushDisable">Disable on this device</button><button type="button" class="outline" id="pushTest">Show a device test</button></div><p id="pushStatus" role="status"></p>';
 $('dashboard').querySelector('.dashTop').after(panel);
 const status=$('pushStatus');let registration;
 const supported=()=>('serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window);
 const register=async()=>{if(!supported())throw Error('Web push is unavailable here. On iPhone, first add this portal to your Home Screen and open it there.');registration=await navigator.serviceWorker.register(new URL('sw.js',document.baseURI).href,{scope:new URL('./',document.baseURI).pathname});return navigator.serviceWorker.ready};
 const run=fn=>async()=>{panel.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn()}catch(e){status.textContent=e.message||'Could not update notifications. Please try again.'}finally{panel.querySelectorAll('button').forEach(b=>b.disabled=false)}};
 $('pushEnable').onclick=run(async()=>{
 if(!supported())throw Error('Add this portal to your Home Screen on iPhone, then open it and enable notifications.');
 // Ask within the tap gesture, before network requests (required on iOS).
 const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notifications were not allowed. Enable them in your browser or phone settings, then try again.');
 await requireDatabase();const {data:{user}}=await db.auth.getUser();if(!user)throw Error('Sign in before enabling notifications.');
 const reg=await register();const {data,error}=await db.functions.invoke('portal-push',{body:{action:'config'}});if(error)throw Error('Could not connect to notification service. Please try again.');
 let sub=await reg.pushManager.getSubscription();
 const previous=localStorage.getItem('rs-push-owner');
 if(sub&&previous&&previous!==user.id){await sub.unsubscribe();sub=null;}
 if(!sub){const b64=data.publicKey.replace(/-/g,'+').replace(/_/g,'/');const key=Uint8Array.from(atob(b64+'='.repeat((4-b64.length%4)%4)),c=>c.charCodeAt(0));sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});}
 const value=sub.toJSON();const {data:existing,error:readError}=await db.from('push_subscriptions').select('id').eq('endpoint',value.endpoint);if(readError)throw readError;
 if(!existing.length){const {error:saveError}=await db.from('push_subscriptions').insert({user_id:user.id,endpoint:value.endpoint,keys:value.keys});if(saveError){await sub.unsubscribe();throw Error('Could not save device. Please enable notifications again.');}}
 localStorage.setItem('rs-push-owner',user.id);status.textContent='Enabled on this device. New workflow updates for your account will appear as phone notifications.';
 });
 $('pushDisable').onclick=run(async()=>{const reg=await register();const sub=await reg.pushManager.getSubscription();if(sub){await requireDatabase();const {error}=await db.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);await sub.unsubscribe();if(error){status.textContent='Disabled on this device. Server cleanup will happen when the expired subscription is detected.';return}}localStorage.removeItem('rs-push-owner');status.textContent='Notifications disabled on this device.';});
 $('pushTest').onclick=run(async()=>{if(!supported()||Notification.permission!=='granted')throw Error('Enable notifications first.');const reg=await register();await reg.showNotification('Real Search · Device test',{body:'Your phone can display portal notifications. This tests the device display only.',icon:new URL('assets/push-icon-192.png',document.baseURI).href,tag:'rs-device-test',data:{url:new URL('./#admin',document.baseURI).href}});status.textContent='Device test shown. Automatic workflow delivery is separate.';});
 if(!supported())status.textContent='On iPhone, add the portal to your Home Screen and open it there to enable notifications.';
 else register().then(async reg=>{status.textContent=(await reg.pushManager.getSubscription())?'This browser has a notification subscription. Tap Enable to confirm it belongs to your signed-in account.':'Notifications are not enabled on this device yet.'}).catch(()=>{});
})();
