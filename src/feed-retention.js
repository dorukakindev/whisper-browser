'use strict';
const LIMIT=4000,BYTES=16000000;
function reasons(e,pins=new Set()){
 return [e.saved?'saved':'',e.later?'later':'',e.links?.length?'library-link':'',e.editorial?'editorial':'',e.podcastWorkspace?'podcast-work':'',Number.isFinite(e.lastListenedAt)&&e.lastListenedAt>0?'listening-observation':'',pins.has(e.id)?'reading-or-source-pin':''].filter(Boolean);
}
function overview(data,externalIds=[]){
 const pins=new Set([...(data.sourcePins||[]),...externalIds]),personal=data.entries.filter(e=>reasons(e,pins).length),bytes=Buffer.byteLength(JSON.stringify(data));
 return {total:data.entries.length,protected:personal.length,evictable:data.entries.length-personal.length,limit:LIMIT,bytes,byteLimit:BYTES,warning:data.entries.length>=LIMIT*.9||bytes>=BYTES*.9,policy:'personal-work-protected',rows:personal.slice(0,100).map(e=>({id:e.id,title:e.title,kind:e.kind,reasons:reasons(e,pins),hasPrevious:!!e.podcastWorkspace?.previous})),partial:personal.length>100,transcripts:personal.filter(e=>e.podcastWorkspace?.transcript||e.podcastWorkspace?.previous?.transcript).length,translations:personal.filter(e=>e.podcastWorkspace?.translation||e.podcastWorkspace?.previous?.translation).length,positions:personal.filter(e=>(e.podcastWorkspace?.position||e.podcastWorkspace?.previous?.position||0)>0).length};
}
function trim(data,externalIds=[]){
 const pins=new Set([...(data.sourcePins||[]),...externalIds]),protectedRows=data.entries.filter(e=>reasons(e,pins).length);
 if(protectedRows.length>=LIMIT&&data.entries.length>LIMIT)throw Error('Personal feed capacity reached. Export a workspace backup and review saved sources; nothing was removed. / Kişisel RSS kapasitesi doldu. Çalışma alanı yedeği alıp kayıtlı kaynakları inceleyin; hiçbir kayıt silinmedi.');
 if(data.entries.length<=LIMIT)return;
 const ordinary=data.entries.filter(e=>!reasons(e,pins).length).sort((a,b)=>b.receivedAt-a.receivedAt).slice(0,LIMIT-protectedRows.length),keep=new Set([...protectedRows,...ordinary].map(e=>e.id));
 data.entries=data.entries.filter(e=>keep.has(e.id));
}
module.exports={reasons,overview,trim};
