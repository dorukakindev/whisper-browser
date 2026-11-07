(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LetterboxdReviews=factory();})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
// Bounded public-page text extraction only. No script, resource or embedded URL is executed.
function decode(value){const names={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',hellip:'…',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',ndash:'–',mdash:'—'};return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(entity,key)=>{if(key[0]!=='#')return names[key.toLowerCase()]??entity;const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return Number.isInteger(n)&&n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'�';});}
// Inline markup does not introduce whitespace in the displayed quotation.
// Block boundaries do: keep paragraphs readable without changing word/punctuation adjacency.
const plain=value=>decode(String(value).replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<br\b[^>]*>|<\/?(?:p|div|li|blockquote|section|article|h[1-6]|ul|ol)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'')).replace(/\0/g,'').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
function attr(tag,name){const found=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')','i').exec(tag);return found?decode(found[1]??found[2]):'';}
function fullTextUrl(value){try{const u=new URL(value,'https://letterboxd.com');return u.protocol==='https:'&&u.hostname==='letterboxd.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/s\/full-text\/viewing:[1-9]\d{0,14}\/$/.test(u.pathname)?u.href:null;}catch{return null;}}
function collapsed(body){return /class=["'][^"']*\bcollapsed-text\b|data-js-trigger=["']collapsible\.expand["']/i.test(body);}
function stripMore(body){return body.replace(/<a\b[^>]*data-js-trigger=["']collapsible\.expand["'][^>]*>[\s\S]*?<\/a>/gi,'');}
// Fetch only the site's exact, public full-text endpoint. Never execute fragments.
// Incomplete rows are explicitly excluded instead of analysing the visible teaser.
async function expandReviewHtml(input,{load,signal}={}){
 let html=String(input||'');if(html.length>3000000)throw Error('Review page too large.');
 html=html.replace(/<!--[^]*?-->/g,'').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 const pattern=/<(div|section)\b[^>]*class=["'][^"']*\bjs-review-body\b[^"']*["'][^>]*>/gi,changes=[],tasks=[];let found,expanded=0,failed=0,blocked=0;
 while((found=pattern.exec(html))&&tasks.length<50){
  const start=found.index,open=found[0],tag=found[1],begin=pattern.lastIndex,tokens=new RegExp('<\\/?'+tag+'\\b[^>]*>','gi');tokens.lastIndex=begin;let depth=1,end=begin,next;
  while(depth&&(next=tokens.exec(html))){depth+=next[0][1]==='/'?-1:1;if(!depth)end=next.index;}if(depth)break;pattern.lastIndex=tokens.lastIndex;
  const body=html.slice(begin,end);if(!collapsed(body))continue;
  tasks.push(async()=>{signal?.throwIfAborted();const url=fullTextUrl(attr(open,'data-full-text-url'));let replacement;
  try{
   if(!url||typeof load!=='function')throw Error('Full review endpoint is unavailable.');
   const fragment=await load(url);signal?.throwIfAborted();
   if(typeof fragment!=='string'||fragment.length>200000||/<(?:title|form|html)\b/i.test(fragment)||collapsed(fragment))throw Error('Full review text is unavailable.');
   const text=plain(fragment),prefix=plain(stripMore(body)).replace(/(?:…|\.{3})\s*$/u,'').trim().slice(0,100);
   if(text.length<8||text.length>20000||prefix&&!text.startsWith(prefix))throw Error('Full review does not match its visible text.');
   // Keep no returned markup: safe text is re-encoded into this exact source card.
   replacement=open.replace(/\sdata-full-text-url\s*=\s*(?:"[^"]*"|'[^']*')/i,'')+'<p>'+text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')+'</p>';expanded++;
  }catch(error){signal?.throwIfAborted();if(error.status===403||/\bHTTP 403\b/.test(error.message))blocked++;replacement=open.replace(/>$/,' data-review-incomplete="true">');failed++;}
  changes.push({start,end,replacement});});
 }
 for(let i=0;i<tasks.length;i+=2)await Promise.all(tasks.slice(i,i+2).map(run=>run()));
 for(const change of changes.sort((a,b)=>b.start-a.start))html=html.slice(0,change.start)+change.replacement+html.slice(change.end);
 return {html,expanded,failed,blocked};
}
function fullTextFetchScript(value){const url=fullTextUrl(value);if(!url)throw Error('Unsupported full review address.');return `(async()=>{if(location.origin!=='https://letterboxd.com')throw Error('Review origin changed');const r=await fetch(${JSON.stringify(url)},{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'text/html'}});if(!r.ok)throw Error('Full review HTTP '+r.status);const reader=r.body.getReader();const parts=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>200000)throw Error('Full review too large');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return new TextDecoder().decode(bytes);})()`;}
function filmImdbId(html){
 // Film external links are marked by the site. A review's own links are not film metadata.
 const stack=[],ids=new Set();
 for(const match of html.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)){
  const tag=match[1].toLowerCase(),markup=match[0];
  if(['article','li','div','section'].includes(tag)){
   if(markup[1]==='/'){const index=stack.findLastIndex(row=>row.tag===tag);if(index>=0)stack.splice(index);}
   else stack.push({tag,review:tag==='article'||tag==='li'||attr(markup,'class').split(/\s+/).includes('js-review-body')});
  }
  if(tag!=='a'||markup[1]==='/'||attr(markup,'data-track-action').toLowerCase()!=='imdb'||stack.some(row=>row.review))continue;
  try{const u=new URL(attr(markup,'href'));const id=/^\/title\/(tt\d{7,12})(?:\/(?:maindetails\/?)?)?$/.exec(u.pathname)?.[1];if(u.protocol==='https:'&&['imdb.com','www.imdb.com'].includes(u.hostname)&&!u.port&&!u.username&&!u.password&&id)ids.add(id);}catch{}
 }
 return ids.size===1?[...ids][0]:'';
}
function filmTmdbIdentity(html){
 // Provider IDs belong to the film metadata, never to a comment's linked recommendations.
 const stack=[],explicit=new Set(),links=new Set();
 for(const match of html.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)){
  const tag=match[1].toLowerCase(),markup=match[0];
  if(['article','li','div','section'].includes(tag)){
   if(markup[1]==='/'){const index=stack.findLastIndex(row=>row.tag===tag);if(index>=0)stack.splice(index);}
   else stack.push({tag,review:tag==='article'||tag==='li'||attr(markup,'class').split(/\s+/).includes('js-review-body')});
  }
  if(markup[1]==='/'||stack.some(row=>row.review))continue;
  const id=attr(markup,'data-tmdb-id')||attr(markup,'data-film-tmdb-id');if(/^[1-9]\d{0,11}$/.test(id))explicit.add(id);
  if(tag!=='a')continue;
  try{const u=new URL(attr(markup,'href'));const id=/^\/movie\/([1-9]\d{0,11})(?:-[^/]*)?\/?$/.exec(u.pathname)?.[1];if(u.protocol==='https:'&&['themoviedb.org','www.themoviedb.org'].includes(u.hostname)&&!u.port&&!u.username&&!u.password&&id)links.add(id);}catch{}
 }
 const ids=explicit.size?explicit:links;return {tmdbId:ids.size===1?'movie:'+ [...ids][0]:'',...(ids.size>1?{tmdbAmbiguous:true}:{})};
}
function reviewPermalink(value){try{const u=new URL(value,'https://letterboxd.com');return u.protocol==='https:'&&u.hostname==='letterboxd.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/[a-z0-9_-]+\/film\/[a-z0-9-]+\/(?:[1-9]\d*\/)?$/i.test(u.pathname)?u.href:null;}catch{return null;}}
function cardMetadata(card){
 const links=[...card.matchAll(/<a\b[^>]*>/gi)].map(m=>m[0]);
 const permalink=links.map(tag=>reviewPermalink(attr(tag,'href'))).find(Boolean);
 const time=/<time\b[^>]*>/i.exec(card)?.[0],rawDate=time&&attr(time,'datetime');
 const date=rawDate&&Number(rawDate.slice(0,4))<=new Date().getFullYear()+1&&/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(rawDate)&&Number.isFinite(Date.parse(rawDate))&&new Date(rawDate.slice(0,10)).toISOString().slice(0,10)===rawDate.slice(0,10)?rawDate.slice(0,10):'';
 const ratingTag=/<(?:span|i)\b[^>]*class=["'][^"']*\brating\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|i)>/i.exec(card);
 const rated=ratingTag&&/\brated-(10|[1-9])\b/.exec(attr(ratingTag[0].split('>')[0],'class'));
 const stars=ratingTag?plain(ratingTag[1]).replace(/\s/g,''):'';
 const rating=rated?Number(rated[1])/2:/^★{0,5}½?$/.test(stars)&&stars?([...stars].filter(c=>c==='★').length+(stars.endsWith('½')?0.5:0)):null;
 return {...(permalink?{permalink}:{}),...(date?{date}:{}),...(rating>0&&rating<=5?{rating}:{})};
}
function parseLetterboxdReviews(input,{url}={}){
 const source=reviewPageSource(url);
 let html=String(input||'');if(html.length>3000000)throw Error('Review page too large.');
 html=html.replace(/<!--[^]*?-->/g,'').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 if(/<title[^>]*>\s*(?:Just a moment|Access denied|Security check)/i.test(html))throw Error('Letterboxd access verification is required. Open the page normally, or paste/import reviews.');
 // Match each review's own container; the preceding review must not mark its neighbour as a spoiler.
 let limited=false;const excluded={duplicate:0,unreadable:0};const rows=[],seen=new Set();const pattern=/<(?:div|section)\b[^>]*class=["'][^"']*\bjs-review-body\b[^"']*["'][^>]*>/gi;let found;
 while((found=pattern.exec(html))&&rows.length<50){
  const open=found[0],tag=/^<(\w+)/.exec(open)[1],tokens=tag==='div'?/<\/?div\b[^>]*>/gi:/<\/?section\b[^>]*>/gi;tokens.lastIndex=pattern.lastIndex;let depth=1,end=pattern.lastIndex,next;
  while(depth&&(next=tokens.exec(html))){depth+=next[0][1]==='/'?-1:1;if(!depth)end=next.index;}
  if(depth)break;
  const body=html.slice(pattern.lastIndex,end);pattern.lastIndex=tokens.lastIndex;
  if(attr(open,'data-review-incomplete')==='true'||collapsed(body)){excluded.incomplete=(excluded.incomplete||0)+1;limited=true;continue;}
  const fullText=plain(body);if(fullText.length>20000){excluded.incomplete=(excluded.incomplete||0)+1;limited=true;continue;}const text=fullText;if(text.length<8){excluded.unreadable++;continue;}
  // Find only the current card's attributes/author, never a global spoiler substring.
  const stack=[];for(const m of html.slice(0,found.index).matchAll(/<\/?(li|article|div)\b[^>]*>/gi)){if(m[0][1]==='/'){const i=stack.findLastIndex(row=>row.tag===m[1].toLowerCase());if(i>=0)stack.splice(i);}else stack.push({tag:m[1].toLowerCase(),index:m.index,open:m[0]});}const ancestorSpoiler=stack.some(row=>/class=["'][^"']*\b(?:contains-spoilers|has-spoilers)\b/i.test(row.open)||/data-(?:contains-)?spoilers?=["']true["']/i.test(row.open));const container=stack.findLast(row=>['li','article'].includes(row.tag))||stack.findLast(row=>/review|film-detail/i.test(row.open))||stack.at(-1);const card=container?html.slice(container.index,found.index):'';
  const authorTag=/<a\b[^>]*class=["'][^"']*\b(?:name|displayname)\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(card);
  const author=authorTag?plain(authorTag[1]).slice(0,120):'';
  const spoiler=ancestorSpoiler||/\b(?:contains-spoilers|has-spoilers)\b/i.test(open+' '+card.match(/^<[^>]+>/)?.[0])||/class=["'][^"']*\b(?:spoiler-warning|spoiler-message|has-spoilers)\b/i.test(card+open+body)||/data-(?:contains-)?spoilers?=["']true["']/i.test(card+open);
  // Dates/ratings can follow the body. Stop at this card's closing tag, never its neighbour.
  let completeCard=card+open+body;if(container){const token=new RegExp('<\\/?'+container.tag+'\\b[^>]*>','gi');token.lastIndex=container.index;let level=0,m;while((m=token.exec(html))){level+=m[0][1]==='/'?-1:1;if(!level){completeCard=html.slice(container.index,token.lastIndex);break;}}}
  const metadataCard=container?completeCard.slice(0,found.index-container.index)+completeCard.slice(tokens.lastIndex-container.index):'';
  const metadata=cardMetadata(metadataCard),profile=authorTag&&/^https:\/\/letterboxd\.com\/([a-z0-9_-]+)\/$/i.exec((()=>{try{return new URL(attr(authorTag[0].split('>')[0],'href'),'https://letterboxd.com').href;}catch{return '';}})()),review=metadata.permalink&&/^https:\/\/letterboxd\.com\/([a-z0-9_-]+)\/film\/([a-z0-9-]+)\//i.exec(metadata.permalink);
  if(source&&review&&new URL(source.url).pathname.split('/')[2].toLowerCase()!==review[2].toLowerCase()){excluded.identity=(excluded.identity||0)+1;continue;}
  const authorId=review&&(!profile||profile[1].toLowerCase()===review[1].toLowerCase())?review[1].toLowerCase():!review&&profile?profile[1].toLowerCase():'';
  if(review&&profile&&profile[1].toLowerCase()!==review[1].toLowerCase())delete metadata.permalink;
  // A spoiler-marked copy must not suppress an eligible clean card later on the page.
  const duplicateKey=JSON.stringify([text,spoiler]);if(seen.has(duplicateKey)){excluded.duplicate++;continue;}seen.add(duplicateKey);
  const row={id:String(rows.length+1),text,author,spoiler,...metadata,...(authorId?{authorId}:{}),...(source?{source:{...source}}:{})};if(JSON.stringify([...rows,row]).length>110000){limited=true;break;}rows.push(row);
 }
 if(rows.length>=50&&found)limited=true;
 const meta=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]);const title=meta.find(tag=>attr(tag,'property')==='og:title');
 const pageTitle=plain(title?attr(title,'content'):(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]||'')).slice(0,300);
 const yearText=meta.find(tag=>/^(?:og:release_date|video:release_date)$/.test(attr(tag,'property')));
 const headline=/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]||'';
 const heading=plain(headline), labelled=pageTitle.replace(/^(?:Reviews of|Review of)\s+/i,'').replace(/\s*[•|]\s*Letterboxd.*$/i,'').trim();
 const years=/\((18\d{2}|19\d{2}|20\d{2})\)/.exec(labelled),year=Number((yearText&&attr(yearText,'content').slice(0,4))||years?.[1])||null;
 const name=(labelled.replace(/\s*\((?:18|19|20)\d{2}\).*$/,'').trim()||heading).slice(0,300);
 const tmdb=filmTmdbIdentity(html);
 const imdbId=filmImdbId(html);
 return {reviews:rows,limited,excluded,pageTitle,identity:{title:name,year,...tmdb,...(imdbId?{imdbId}:{})}};
}
function matchFilm(item,identity={}){
 const fold=v=>String(v||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('tr').replace(/ı/g,'i').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const known=String(item.tmdbId||''),remote=String(identity.tmdbId||'');
 const knownImdb=String(item.imdbId||''),remoteImdb=String(identity.imdbId||'');
 if(item.kind==='series')return {state:'mismatch',reason:'film-vs-series'};
 if(known&&remote&&known!==remote)return {state:'mismatch',reason:'tmdb-id'};
 if(knownImdb&&remoteImdb&&knownImdb!==remoteImdb)return {state:'mismatch',reason:'imdb-id'};
 if(item.year&&identity.year&&Number(item.year)!==Number(identity.year))return {state:'mismatch',reason:'year'};
 if(identity.tmdbAmbiguous)return {state:'unverified',reason:'ambiguous-tmdb-metadata'};
 if(known&&remote&&known===remote)return {state:'matched',reason:'tmdb-id'};
 if(knownImdb&&remoteImdb&&knownImdb===remoteImdb)return {state:'matched',reason:'imdb-id'};
 const names=[item.title,item.originalTitle].filter(Boolean).map(fold),name=fold(identity.title);
 if(name&&names.includes(name)&&item.year&&identity.year)return {state:'matched',reason:'title-year'};
 if(name&&identity.year&&names.length&&!names.includes(name))return {state:'mismatch',reason:'title'};
 return {state:'unverified',reason:'missing-identity'};
}
function publicFilmUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='letterboxd.com'&&!u.port&&!u.username&&!u.password&&!u.hash&&[...u.searchParams.keys()].every(k=>k==='page')&&u.searchParams.getAll('page').length<=1&&(!u.search||/^[1-9]\d{0,3}$/.test(u.searchParams.get('page')))&&/^\/film\/[a-z0-9-]+\/(?:reviews\/(?:by\/(?:activity|added|entry-rating|entry-rating-lowest|rating|rating-lowest|rating-highest|popular|review-popular)\/)?(?:page\/[1-9]\d{0,3}\/)?)?$/.test(u.pathname)?u.href:null;}catch{return null;}}
function reviewPageSource(value){
 const url=publicFilmUrl(value);if(!url)return null;
 const u=new URL(url),pathPage=/\/page\/([1-9]\d{0,3})\/$/.exec(u.pathname),queryPage=u.searchParams.get('page');
 if(pathPage&&queryPage&&pathPage[1]!==queryPage)return null;
 const sort=/\/reviews\/(?:page\/\d+\/)?$/.test(u.pathname)?'new':({'activity':'popular','entry-rating':'high','entry-rating-lowest':'low'}[/\/reviews\/by\/([^/]+)\//.exec(u.pathname)?.[1]]||'unknown');
 return {url,sort,page:Number(pathPage?.[1]||queryPage||1)};
}
// Only review cards and public film metadata are copied, never forms, cookies or scripts.
function reviewPageScript(){return `(()=>{
 if(document.querySelector('#challenge-running,#challenge-stage,#challenge-form')||/just a moment|access denied|security check/i.test(document.title))return {blocked:true};
 const host=document.createElement('section');
 for(const n of document.querySelectorAll('meta[property="og:title"],meta[property="og:release_date"],meta[property="video:release_date"],h1'))host.append(n.cloneNode(true));
 for(const tmdb of document.querySelectorAll('[data-tmdb-id],[data-film-tmdb-id]')){if(tmdb.closest('article,li,.js-review-body'))continue;const n=document.createElement('div');n.setAttribute('data-tmdb-id',tmdb.getAttribute('data-tmdb-id')||tmdb.getAttribute('data-film-tmdb-id'));host.append(n);}
 for(const link of document.querySelectorAll('a[href*="themoviedb.org/movie/"]')){if(link.closest('article,li,.js-review-body'))continue;const n=document.createElement('a');n.setAttribute('href',link.getAttribute('href'));host.append(n);}
 for(const link of document.querySelectorAll('a[data-track-action]')){if(link.getAttribute('data-track-action').toLowerCase()!=='imdb'||link.closest('article,li,.js-review-body'))continue;const n=document.createElement('a');n.setAttribute('data-track-action','IMDb');n.setAttribute('href',link.getAttribute('href'));host.append(n);}
 const seen=new Set();for(const body of [...document.querySelectorAll('.js-review-body')].slice(0,50)){const card=body.closest('article,li')||body;if(seen.has(card))continue;seen.add(card);const copy=card.cloneNode(true);if(body.closest('.contains-spoilers,.has-spoilers,[data-spoilers="true"],[data-contains-spoilers="true"]'))copy.setAttribute('data-spoilers','true');for(const text of copy.querySelectorAll('.js-review-body')){const expanded=text.querySelector('.expanded-text');if(expanded)text.replaceChildren(...expanded.childNodes);}for(const n of copy.querySelectorAll('script,style,template,input,textarea,select,form,iframe,button,img'))n.remove();host.append(copy);if(host.outerHTML.length>3000000)return {tooLarge:true};}
 return {url:location.href,title:document.title,html:host.outerHTML};})()`;}
async function readBrowserReviews({getTab,execute,signal}){
 const combined=signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000);
 const run=script=>{combined.throwIfAborted();let abort;const stopped=new Promise((_,reject)=>{abort=()=>reject(combined.reason);combined.addEventListener('abort',abort,{once:true});});return Promise.race([Promise.resolve().then(()=>{combined.throwIfAborted();return execute(tab.view,script);}),stopped]).finally(()=>combined.removeEventListener('abort',abort));};
 const tab=getTab();if(!tab?.view||tab.view.webContents.isDestroyed())throw Error('Open a Letterboxd film reviews page in Browser first.');
 const url=publicFilmUrl(tab.view.webContents.getURL());if(!url)throw Error('The active Browser tab must be a public Letterboxd film reviews page.');
 const generation=tab.generation;const [data]=await run(reviewPageScript());
 if(getTab()!==tab||tab.generation!==generation||tab.view.webContents.isDestroyed()||tab.view.webContents.getURL()!==url)throw Error('The source changed while reading reviews. Try again on the intended page.');
 if(data?.blocked)throw Error('Finish the site verification in Browser first.');if(data?.tooLarge)throw Error('The open review page is too large.');
 if(!data||data.url!==url||typeof data.html!=='string')throw Error('The open review page could not be read.');
 const expanded=await expandReviewHtml(data.html,{signal:combined,load:async address=>{if(getTab()!==tab||tab.generation!==generation||tab.view.webContents.isDestroyed()||tab.view.webContents.getURL()!==url)throw Error('Review source changed.');const [text]=await run(fullTextFetchScript(address));return text;}});
 if(getTab()!==tab||tab.generation!==generation||tab.view.webContents.isDestroyed()||tab.view.webContents.getURL()!==url)throw Error('The source changed while reading reviews. Try again on the intended page.');
 const result=parseLetterboxdReviews(expanded.html,{url});if(!result.reviews.length)throw Error('No complete public reviews found. Full review loading may have failed; retry or paste/import the complete text.');
 return {...result,url,origin:'browser',partial:!!result.excluded?.incomplete,warning:result.excluded?.incomplete?'Some full review continuations could not be loaded; incomplete excerpts were excluded.':''};
}
// A loaded page (Browser tab or fetched URL) already has the provider's own order. The requested pool,
// count and spoiler choice are applied here with the same rules as the automatic reader. A requested order
// that differs from the page order is reported, never presented as applied.
function pageSample(item,result,{count,spoilers=false,sort='popular',url}={}){
 const want=Number.isInteger(count)&&count>=1&&count<=48?count:40,wanted=['popular','new','high','low','balanced'].includes(sort)?sort:'popular';
 const provider=reviewPageSource(url||result?.url)?.sort||'unknown',match=matchFilm(item,result?.identity||{});
 const rows=Array.isArray(result?.reviews)?result.reviews:[],excluded={...(result?.excluded||{})},bump=key=>{excluded[key]=(excluded[key]||0)+1;};
 const reviews=[],seenText=new Set(),seenLinks=new Set(),authors=new Set();
 const base={requested:want,scope:'single-page',mode:provider,requestedMode:wanted,orderApplied:wanted===provider,representative:false};
 if(match.state==='mismatch'){
  // Another title or year never reaches a sample, analysis or assistant context.
  excluded.identity=(excluded.identity||0)+rows.length;
  return {...result,reviews:[],excluded,match,partial:false,warning:'',withheld:'mismatch',sampling:{...base,returned:0,independentAuthors:0,unknownAuthors:0,coverage:{}}};
 }
 for(const row of rows){
  if(!spoilers&&row.spoiler){bump('spoiler');continue;}
  const key=String(row.text).normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  if(seenText.has(key)||row.permalink&&seenLinks.has(row.permalink)){bump('duplicate');continue;}
  if(row.authorId&&authors.has(row.authorId)){bump('author');continue;}
  if(reviews.length>=want){bump('requested');continue;}
  seenText.add(key);if(row.permalink)seenLinks.add(row.permalink);if(row.authorId)authors.add(row.authorId);
  reviews.push({...row,id:String(reviews.length+1)});
 }
 const sampling={...base,returned:reviews.length,independentAuthors:new Set(reviews.map(row=>row.authorId).filter(Boolean)).size,unknownAuthors:reviews.filter(row=>!row.authorId).length,coverage:{[provider]:reviews.length}};
 return {...result,reviews,excluded,match,sampling};
}
return {parseLetterboxdReviews,decode,matchFilm,pageSample,publicFilmUrl,reviewPermalink,reviewPageSource,reviewPageScript,readBrowserReviews,fullTextUrl,expandReviewHtml,fullTextFetchScript};
});
