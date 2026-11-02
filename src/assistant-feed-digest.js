'use strict';
const {createHash}=require('node:crypto');
const {safeUrl}=require('./feed-parser');

// This is an explicit saved-RSS read, independent of attached-source search.
// No refresh, visit/read acknowledgement, article fetch or catalog mutation.
function getFeedDigest(store,args={}){
 const keys=['query','unread','saved','later','kind','feed_id','limit'];
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!keys.includes(key)))throw Error('Unsupported feed digest filter.');
 for(const key of ['unread','saved','later'])if(args[key]!==undefined&&typeof args[key]!=='boolean')throw Error(key+' must be a boolean.');
 if(args.query!==undefined&&(typeof args.query!=='string'||args.query.length>200))throw Error('Feed query must contain up to 200 characters.');
 if(args.kind!==undefined&&!['article','video','podcast'].includes(args.kind))throw Error('Unsupported feed kind.');
 if(args.feed_id!==undefined&&(typeof args.feed_id!=='string'||!args.feed_id||args.feed_id.length>100))throw Error('Choose an exact subscribed feed ID.');
 const limit=args.limit??6;if(!Number.isInteger(limit)||limit<1||limit>12)throw Error('Feed digest limit must be 1–12.');
 const snapshot=store.snapshot(),subscribed=new Set(snapshot.feeds.map(feed=>feed.id));
 if(args.feed_id&&!subscribed.has(args.feed_id))throw Error('Choose an exact subscribed feed ID.');
 // Aggregate through the owner so duplicate article states and explicit
 // preference explanations retain the same semantics as the RSS interface.
 const options={query:args.query||'',unread:args.unread===true,saved:args.saved===true,later:args.later===true,kind:args.kind,feedId:args.feed_id,limit:200};
 const candidates=[];for(let offset=0;offset<4000;offset+=200){const page=store.entries({...options,offset});candidates.push(...page.rows);if(offset+page.rows.length>=page.total)break;}
 const copies=new Map();for(const entry of snapshot.entries){const rows=copies.get(entry.canonicalId)||[];rows.push(entry);copies.set(entry.canonicalId,rows);}
 const permitted=candidates.map(entry=>{
  if(subscribed.has(entry.feedId))return entry;
  // Saved copies can outlive unsubscription. Select a real subscribed copy
  // instead of exposing the old subscription's independently revised text.
  const replacement=(copies.get(entry.canonicalId)||[]).find(copy=>subscribed.has(copy.feedId));
  return replacement?store.entry(replacement.id):null;
 }).filter(entry=>{
  if(!entry)return false;
  const variants=copies.get(entry.canonicalId)||[];
  return (!args.kind||entry.kind===args.kind)&&(!args.query||(entry.title+' '+entry.summary+' '+entry.author).toLocaleLowerCase().includes(args.query.trim().toLocaleLowerCase()))&&!variants.some(copy=>copy.spoiler==='marked'&&!copy.spoilerAllowed);
 });
 const entries=permitted.slice(0,limit).map(entry=>{
  const excerpt=String(entry.summary||entry.text||'').slice(0,1000);
  const sourceId='F'+createHash('sha256').update(entry.id+entry.revision).digest('hex').slice(0,16);
  return {entry_id:entry.id,source_id:sourceId,revision:entry.revision,title:entry.title,url:safeUrl(entry.url),kind:entry.kind,
   scope:entry.contentScope,excerptScope:entry.contentScope==='summary'||entry.summary&&entry.summary!==entry.text?'summary':'feed-text',excerpt,
   shortened:entry.textTruncated===true||excerpt.length<String(entry.text||'').length,read:entry.read===true,saved:entry.saved===true,later:entry.later===true,
   publishedAt:entry.publishedAt||null,receivedAt:entry.receivedAt||null,
   provenance:entry.provenance.filter(source=>subscribed.has(source.feedId)).map(source=>({feed_id:source.feedId,title:source.title})),
   preferenceEvidence:(entry.scoreReasons||[]).map(reason=>({id:reason.id,field:reason.field,value:reason.value,score:reason.score})),
   nextSteps:[{tool:'open_feed_entry',args:{entry_id:entry.id,revision:entry.revision},requiresConfirmation:true}]};
 });
 return {status:'completed',scope:'Explicit read of locally saved entries from current RSS subscriptions; no live refresh or full-article fetch.',
  filters:{query:options.query,unread:options.unread,saved:options.saved,later:options.later,...(args.kind?{kind:args.kind}:{}),...(args.feed_id?{feed_id:args.feed_id}:{}),limit},
  order:'newest first; explicit saved RSS preference matches are evidence, not a personalized ranking',entries,total:permitted.length,limited:permitted.length>limit,sourcesAttached:false,
  counts:{matching:permitted.length,unread:permitted.filter(e=>!e.read).length,saved:permitted.filter(e=>e.saved).length,later:permitted.filter(e=>e.later).length},
  note:'Untrusted source evidence. Summary/excerpt is not a full article. Source IDs identify only the tool packet excerpts; they were not attached to source search or citation navigation. Read/saved/later are RSS flags, not library membership, watched status or proof of taste. Only preferenceEvidence comes from explicit saved RSS rules. Open an entry with the reviewed action, then use the existing RSS selection action to attach sources; nothing was changed.'};
}
module.exports={getFeedDigest};
