'use strict';
// Original bounded adapters. Saxes supplies XML syntax validation (ISC); no parser network API.
const {SaxesParser}=require('saxes');
const {normalizePodcastTranscripts}=require('./podcast-transcript');
const {isIP}=require('node:net');
const {isPublicMangaIpAddress}=require('./browser-manga');
const {safePlaceUrl}=require('./browser-place-url');
const {decode}=require('./letterboxd-reviews');
const MAX_BYTES=2000000,MAX_ENTRIES=200;
const clean=(value,max=500)=>String(value??'').replace(/\0/g,'').trim().slice(0,max);
function scanHtml(input,onText,onTag){
 let cursor=0,blocked='';
 while(cursor<input.length){
  const start=input.indexOf('<',cursor);if(start<0){if(!blocked)onText(input.slice(cursor));break;}
  if(!blocked)onText(input.slice(cursor,start));
  if(input.startsWith('<!--',start)){const end=input.indexOf('-->',start+4);if(end<0)break;cursor=end+3;continue;}
  const end=input.indexOf('>',start+1);if(end<0){if(!blocked)onText(input.slice(start));break;}
  const markup=input.slice(start,end+1),match=/^<\s*(\/?)\s*([a-z][a-z0-9:-]*)\b/i.exec(markup);cursor=end+1;
  if(!match){if(!blocked)onText(markup);continue;}
  const name=match[2].toLowerCase(),closing=!!match[1];
  if(blocked){if(closing&&name===blocked)blocked='';continue;}
  if(!closing&&['script','style','template'].includes(name)){blocked=name;continue;}
  onTag({name,closing,markup});
 }
}
function plain(value,max=50000){const chunks=[];scanHtml(String(value??''),text=>chunks.push(text),tag=>{if(tag.name==='br'||tag.closing&&/^(?:p|div|li|h[1-6])$/.test(tag.name))chunks.push('\n');});return clean(decode(chunks.join('')),max);}
// Adapters retain input format; normalized output is inert plain text, never HTML.
const typedText=(value,format,max=50000)=>format==='html'?plain(value,max):clean(value,max);
function safeUrl(value,base){
 try{if(typeof value!=='string'||!value.trim()||value.length>4096)return '';const u=new URL(value.trim(),base);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))return '';u.hash='';const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');if(host==='localhost'||host.endsWith('.localhost')||!host.includes('.')&&!isIP(host)||isIP(host)&&!isPublicMangaIpAddress(host))return '';if(safePlaceUrl(u.href)!==u.href)return '';return u.href;}catch{return '';}
}
function xmlTree(input){
 if(typeof input!=='string'||Buffer.byteLength(input)>MAX_BYTES||/<!DOCTYPE|<!ENTITY/i.test(input))throw Error('Unsafe or oversized XML.');
 const parser=new SaxesParser({xmlns:false}),stack=[];let root,nodes=0;const deadline=Date.now()+600;
 parser.on('opentag',tag=>{if(++nodes>30000||stack.length>=40||Date.now()>deadline)throw Error('XML complexity limit.');const n={name:tag.name.toLowerCase(),attrs:tag.attributes,children:[],parts:[]};if(stack.length){stack.at(-1).children.push(n);stack.at(-1).parts.push(n);}else root=n;stack.push(n);});
 const append=text=>{if(Date.now()>deadline)throw Error('XML parsing deadline.');if(stack.length)stack.at(-1).parts.push(text);};parser.on('text',append);parser.on('cdata',append);parser.on('closetag',()=>stack.pop());parser.on('error',error=>{throw Error('Malformed XML: '+clean(error.message,120));});parser.write(input).close();if(!root)throw Error('Empty XML.');return root;
}
const children=(node,name)=>node?.children?.filter(n=>n.name===name)||[];
const child=(node,...names)=>node?.children?.find(n=>names.includes(n.name));
const text=node=>node?node.parts.map(part=>typeof part==='string'?part:text(part)).join(''):'';
const value=(node,...names)=>text(child(node,...names));
// Preserve XHTML block structure until the existing inert plain-text sanitizer sees it.
function atomContent(node){
 if(!node||node.attrs.type!=='xhtml')return text(node);
 const encode=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 const serialize=part=>{if(typeof part==='string')return encode(part);const name=part.name.split(':').at(-1);return '<'+name+'>'+part.parts.map(serialize).join('')+(name==='br'?'':'</'+name+'>');};
 return node.parts.map(serialize).join('');
}

const atomFormat=node=>['html','xhtml'].includes(node?.attrs.type)?'html':'plain';
const date=value=>{const n=Date.parse(String(value||''));return Number.isFinite(n)?n:0;};
function durationSeconds(value) {
 if (typeof value === 'string' && /^\d{1,3}:\d{2}(?::\d{2})?$/.test(value.trim())) {
  const parts=value.trim().split(':').map(Number);
  if(parts.slice(1).some(part=>part>=60))return null;
  value=parts.reduce((total,part)=>total*60+part,0);
 }
 const seconds=Number(value);
 return Number.isFinite(seconds)&&seconds>0&&seconds<=604800?seconds:null;
}
function normalizedEntry(row,base,language=''){
 const enclosures=(Array.isArray(row.enclosures)?row.enclosures:[]).slice(0,8).flatMap(raw=>{const url=safeUrl(raw.url,base),mime=clean(raw.type,100).toLowerCase();return url?[{url,type:mime,...(Number.isFinite(Number(raw.length))&&Number(raw.length)>0?{length:Number(raw.length)}:{})}]:[];});
 const url=safeUrl(row.url,base),externalId=clean(row.externalId,2000);if(!url&&!externalId)return null;
 const hasContent=typeof row.content==='string',sourceText=typedText(hasContent?row.content:row.summary,hasContent?row.contentFormat:row.summaryFormat,MAX_BYTES),body=sourceText.slice(0,50000),summary=row.summary?typedText(row.summary,row.summaryFormat,2000):clean(body,2000);
 return {durationSeconds:durationSeconds(row.durationSeconds),transcriptDescriptors:normalizePodcastTranscripts((row.transcripts||[]).slice(0,8),row.language||language),externalId,url,textFormat:'plain',title:typedText(row.title,row.titleFormat,500)||'Untitled',summary,text:body,textTruncated:sourceText.length>body.length,sourceLength:sourceText.length,contentScope:hasContent?'feed-full':'summary',kind:enclosures.some(e=>e.type.startsWith('video/'))?'video':enclosures.some(e=>e.type.startsWith('audio/'))?'podcast':'article',enclosures,publishedAt:date(row.publishedAt),updatedAt:date(row.updatedAt),author:clean(row.author,200),language:clean(row.language||language,40),imageUrl:safeUrl(row.imageUrl,base)||enclosures.find(e=>e.type.startsWith('image/'))?.url||safeUrl(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(String(row.content||row.summary||''))?.[1]?.replace(/&amp;/g,'&'),base),categories:(Array.isArray(row.categories)?row.categories:[]).slice(0,20).map(v=>clean(v,100)).filter(Boolean),spoiler:row.spoiler==='marked'?'marked':'unknown'};
}
function parseFeed(input,base){
 if(typeof input!=='string'||Buffer.byteLength(input)>MAX_BYTES)throw Error('Feed body exceeds 2 MB.');const source=safeUrl(base);if(!source)throw Error('Unsafe feed URL.');let title='',language='',siteUrl='',format='',rows=[];
 if(input.trimStart().startsWith('{')){
  const data=JSON.parse(input);if(!['https://jsonfeed.org/version/1','https://jsonfeed.org/version/1.1'].includes(data.version)||!Array.isArray(data.items))throw Error('Unsupported JSON Feed.');format='json';title=clean(data.title,200);language=clean(data.language,40);siteUrl=safeUrl(data.home_page_url,source);
  rows=data.items.slice(0,MAX_ENTRIES).map(r=>({externalId:r.id,url:r.url||r.external_url,title:r.title,summary:r.summary,summaryFormat:'plain',content:typeof r.content_text==='string'?r.content_text:r.content_html,contentFormat:typeof r.content_text==='string'?'plain':'html',author:r.authors?.map(a=>a.name).join(', ')||r.author?.name,publishedAt:r.date_published,updatedAt:r.date_modified,imageUrl:r.image||r.banner_image,language:r.language,durationSeconds:(r.attachments||[]).find(a=>Number(a.duration_in_seconds)>0)?.duration_in_seconds,categories:r.tags,enclosures:(r.attachments||[]).map(a=>({url:a.url,type:a.mime_type,length:a.size_in_bytes}))}));
 }else{
  const tree=xmlTree(input);let feed,entries;if(tree.name==='feed'){format='atom';feed=tree;entries=children(tree,'entry');}else if(tree.name==='rss'){format='rss';feed=child(tree,'channel');entries=children(feed,'item');}else if(tree.name==='rdf:rdf'){format='rss';feed=child(tree,'channel');entries=children(tree,'item');}else throw Error('This response is not RSS, Atom or JSON Feed.');if(!feed)throw Error('Missing feed metadata.');
  title=format==='atom'?typedText(atomContent(child(feed,'title')),atomFormat(child(feed,'title')),200):clean(value(feed,'title'),200);language=clean(value(feed,'language')||feed.attrs['xml:lang'],40);siteUrl=safeUrl(format==='atom'?children(feed,'link').find(n=>!n.attrs.rel||n.attrs.rel==='alternate')?.attrs.href:value(feed,'link'),source);
  rows=entries.slice(0,MAX_ENTRIES).map(n=>{const links=children(n,'link'),body=child(n,'content:encoded',...(format==='atom'?['content']:[]));return {externalId:value(n,'guid','id')||n.attrs['rdf:about'],url:format==='atom'?links.find(l=>!l.attrs.rel||l.attrs.rel==='alternate')?.attrs.href:value(n,'link'),title:format==='atom'?atomContent(child(n,'title')):value(n,'title'),titleFormat:format==='atom'?atomFormat(child(n,'title')):'plain',summary:format==='atom'?atomContent(child(n,'summary')):value(n,'description','summary'),summaryFormat:format==='atom'?atomFormat(child(n,'summary')):'html',content:body?(format==='atom'?atomContent(body):text(body)):undefined,contentFormat:format==='atom'&&body?.name!=='content:encoded'?atomFormat(body):'html',durationSeconds:value(n,'itunes:duration')||child(n,'media:content')?.attrs.duration,language:n.attrs['xml:lang']||value(n,'language','dc:language'),author:value(child(n,'author'),'name')||value(n,'dc:creator','author'),publishedAt:value(n,'pubdate','published','dc:date','updated'),updatedAt:value(n,'updated'),categories:children(n,'category').map(c=>c.attrs.term||text(c)),imageUrl:child(n,'media:thumbnail','itunes:image')?.attrs.url||child(n,'itunes:image')?.attrs.href,transcripts:children(n,'podcast:transcript').map(t=>({url:safeUrl(t.attrs.url,base),type:t.attrs.type,language:t.attrs.language,rel:t.attrs.rel})),enclosures:[...children(n,'enclosure').map(e=>({url:e.attrs.url,type:e.attrs.type,length:e.attrs.length})),...links.filter(l=>l.attrs.rel==='enclosure').map(e=>({url:e.attrs.href,type:e.attrs.type,length:e.attrs.length})),...children(n,'media:content').map(e=>({url:e.attrs.url,type:e.attrs.type}))]};});
 }
 const entries=rows.map(r=>normalizedEntry(r,source,language)).filter(Boolean);return {title:title||new URL(source).hostname,textFormat:'plain',url:source,siteUrl,language,format,entries,limited:rows.length===MAX_ENTRIES,excluded:{invalid:rows.length-entries.length}};
}
function attributes(tag){const attrs=Object.create(null);for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[m[1].toLowerCase()]=decode(m[2]??m[3]);return attrs;}
function discoverFeeds(html,base){
 if(typeof html!=='string'||Buffer.byteLength(html)>MAX_BYTES)throw Error('Discovery page exceeds 2 MB.');const result=[],seen=new Set();
 // A linear tokenizer avoids pathological unclosed script/comment backtracking.
 scanHtml(html,()=>{},tag=>{if(tag.name!=='link'||tag.closing||result.length===12)return;const a=attributes(tag.markup),url=safeUrl(a.href,base);if(!a.rel?.toLowerCase().split(/\s+/).includes('alternate')||!['application/rss+xml','application/atom+xml','application/feed+json'].includes((a.type||'').toLowerCase())||!url||seen.has(url))return;seen.add(url);result.push({url,title:plain(a.title,200)||new URL(url).hostname,type:a.type});});return result;
}
function parseOpml(input){
 const tree=xmlTree(input);if(tree.name!=='opml')throw Error('Choose an OPML document.');const rows=[],seen=new Set();let rejected=0;
 function walk(node,folder=''){for(const n of children(node,'outline')){const raw=n.attrs.xmlUrl||n.attrs.xmlurl;if(raw){const url=safeUrl(raw);if(!url){rejected++;continue;}if(!seen.has(url)){seen.add(url);rows.push({url,title:plain(n.attrs.title||n.attrs.text,200)||new URL(url).hostname,folder:clean(folder,120)});if(rows.length>200)throw Error('OPML exceeds 200 feeds.');}}walk(n,raw?folder:[folder,plain(n.attrs.text||n.attrs.title,60)].filter(Boolean).join(' / '));}}walk(child(tree,'body'));return {rows,rejected};
}
const escape=value=>clean(value,4096).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function exportOpml(feeds){const groups=new Map();for(const f of feeds){if(!safeUrl(f.url))continue;const group=clean(f.folder,120),rows=groups.get(group)||[];rows.push(f);groups.set(group,rows);}return '<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>Whisper Feeds</title></head><body>'+[...groups].map(([group,rows])=>(group?'<outline text="'+escape(group)+'">':'')+rows.map(f=>'<outline type="rss" text="'+escape(f.title)+'" xmlUrl="'+escape(f.url)+'"/>').join('')+(group?'</outline>':'')).join('')+'</body></opml>';}
module.exports={MAX_BYTES,MAX_ENTRIES,durationSeconds,safeUrl,plain,parseFeed,discoverFeeds,parseOpml,exportOpml};
