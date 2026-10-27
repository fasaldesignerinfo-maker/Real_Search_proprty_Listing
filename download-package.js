// Creates a standard ZIP archive locally from the listing's original files.
function zipBytes(entries){
 const encoder=new TextEncoder(),chunks=[],directory=[];let offset=0;
 const u16=n=>[n&255,(n>>>8)&255],u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
 const crc32=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0};
 for(const [name,bytes] of entries){const path=encoder.encode(name),crc=crc32(bytes);const local=new Uint8Array([80,75,3,4,20,0,0,8,0,0,0,0,0,0,...u32(crc),...u32(bytes.length),...u32(bytes.length),...u16(path.length),0,0]);chunks.push(local,path,bytes);directory.push(new Uint8Array([80,75,1,2,20,0,20,0,0,8,0,0,0,0,0,0,...u32(crc),...u32(bytes.length),...u32(bytes.length),...u16(path.length),0,0,0,0,0,0,0,0,0,0,0,0,...u32(offset)]),path);offset+=local.length+path.length+bytes.length}
 const centralSize=directory.reduce((n,c)=>n+c.length,0);chunks.push(...directory,new Uint8Array([80,75,5,6,0,0,0,0,...u16(entries.length),...u16(entries.length),...u32(centralSize),...u32(offset),0,0]));return new Blob(chunks,{type:'application/zip'});
}
function packageName(s){return String(s||'unknown').normalize('NFKD').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/\s+/g,' ').trim().slice(0,80)||'unknown'}
async function downloadListingPackage(l,message){
 const entries=[],encoder=new TextEncoder();let i=0;
 for(const f of l.photos||[]){message.textContent=`Downloading photo ${++i} of ${l.photos.length}…`;const {data,error}=await db.storage.from('listing-files').createSignedUrl(f.path,3600);if(error)throw error;const response=await fetch(data.signedUrl);if(!response.ok)throw Error('A listing image could not be downloaded.');entries.push([`Photos/${String(i).padStart(2,'0')}-${packageName(f.name)}`,new Uint8Array(await response.arrayBuffer())])}
 for(const [index,f] of (l.documents||[]).entries()){message.textContent=`Downloading document ${index+1} of ${l.documents.length}…`;const {data,error}=await db.storage.from('listing-files').createSignedUrl(f.path,3600);if(error)throw error;const response=await fetch(data.signedUrl);if(!response.ok)throw Error('A listing document could not be downloaded.');entries.push([`Documents/${String(index+1).padStart(2,'0')}-${packageName(f.name)}`,new Uint8Array(await response.arrayBuffer())])}
 const fields=[['Listing date',l.listing_date],['Advisor',l.advisor],['Phone',l.pa_phone],['Property',l.property_name],['Location',l.location],['Type',l.property_type],['Listing type',l.listing_type],['Bedrooms',l.bedrooms],['Bathrooms',l.bathrooms],['Kitchen',l.kitchen],['Other areas',(l.other_areas||[]).join(', ')],['Views',(l.views||[]).join(', ')],['Inclusive',l.inclusive],['Price (BHD)',l.price],['Features',l.features],['Notes',l.notes]];
 entries.push(['Listing details.txt',encoder.encode(fields.map(([k,v])=>`${k}: ${v??''}`).join('\r\n'))]);
 const blob=zipBytes(entries),link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=`${packageName(l.advisor)} - ${packageName(l.property_name)}.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);message.textContent=`Package ready: ${l.photos.length} photos, ${(l.documents||[]).length} documents and listing text.`;
}
