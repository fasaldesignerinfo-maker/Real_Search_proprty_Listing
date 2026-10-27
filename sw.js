// No page or private data caching. The worker handles notifications only.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'Real Search update',{body:data.body||'Open the portal to review your updates.',icon:new URL('assets/push-icon-192.png',self.registration.scope).href,tag:data.tag||'rs-update',data:{url:data.url||new URL('./#home',self.registration.scope).href}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();let url=new URL(event.notification.data?.url||'./#home',self.registration.scope);if(url.origin!==self.location.origin)url=new URL('./#home',self.registration.scope);
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{for(const c of clients){if(new URL(c.url).origin===url.origin){await c.navigate(url.href);return c.focus()}}return self.clients.openWindow(url.href)}));
});
