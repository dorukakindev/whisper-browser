(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LetterboxdReviews=factory();})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
// Bounded public-page text extraction only. No script, resource or embedded URL is executed.
function decode(value){const names={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',hellip:'…',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',ndash:'–',mdash:'—'};return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(entity,key)=>{if(key[0]!=='#')return names[key.toLowerCase()]??entity;const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return Number.isInteger(n)&&n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'�';});}
const plain=value=>decode(String(value).replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<br\b[^>]*>|<\/(?:p|div|li)\s*>/gi,'\n').replace(/<[^>]*>/g,' ')).replace(/\0/g,'').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
function attr(tag,name){const found=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')','i').exec(tag);return found?decode(found[1]??found[2]):'';}
function parseLetterboxdReviews(input){
 let html=String(input||'');if(html.length>3000000)throw Error('Review page too large.');
 html=html.replace(/<!--[^]*?-->/g,'').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 if(/<title[^>]*>\s*(?:Just a moment|Access denied|Security check)/i.test(html))throw Error('Letterboxd access verification is required. Open the page normally, or paste/import reviews.');
 // Match each review's own container; the preceding review must not mark its neighbour as a spoiler.
 let limited=false;const rows=[],seen=new Set();const pattern=/<(?:div|section)\b[^>]*class=["'][^"']*\bjs-review-body\b[^"']*["'][^>]*>/gi;let found;
 while((found=pattern.exec(html))&&rows.length<50){
  const open=found[0],tag=/^<(\w+)/.exec(open)[1],tokens=tag==='div'?/<\/?div\b[^>]*>/gi:/<\/?section\b[^>]*>/gi;tokens.lastIndex=pattern.lastIndex;let depth=1,end=pattern.lastIndex,next;
  while(depth&&(next=tokens.exec(html))){depth+=next[0][1]==='/'?-1:1;if(!depth)end=next.index;}
  if(depth)break;
  const body=html.slice(pattern.lastIndex,end);pattern.lastIndex=tokens.lastIndex;
  const fullText=plain(body);if(fullText.length>4000)limited=true;const text=fullText.slice(0,4000);if(text.length<8||seen.has(text))continue;seen.add(text);
  // Find only the current card's attributes/author, never a global spoiler substring.
  const prefix=html.slice(Math.max(0,found.index-16000),found.index);const starts=[...prefix.matchAll(/<(?:li|article)\b[^>]*>/gi)];const card=starts.length?prefix.slice(starts.at(-1).index):'';
  const authorTag=/<a\b[^>]*class=["'][^"']*\b(?:name|displayname)\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(card);
  const author=authorTag?plain(authorTag[1]).slice(0,120):'';
  const spoiler=/\b(?:contains-spoilers|has-spoilers)\b/i.test(open+' '+card.match(/^<[^>]+>/)?.[0])||/class=["'][^"']*\b(?:spoiler-warning|spoiler-message|has-spoilers)\b/i.test(card+open+body)||/data-(?:contains-)?spoilers?=["']true["']/i.test(card+open);
  const row={id:String(rows.length+1),text,author,spoiler};if(JSON.stringify([...rows,row]).length>110000){limited=true;break;}rows.push(row);
 }
 const meta=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]);const title=meta.find(tag=>attr(tag,'property')==='og:title');
 const pageTitle=plain(title?attr(title,'content'):(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]||'')).slice(0,300);
 const yearText=meta.find(tag=>/^(?:og:release_date|video:release_date)$/.test(attr(tag,'property')));
 const headline=/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]||'';
 const heading=plain(headline), labelled=pageTitle.replace(/^(?:Reviews of|Review of)\s+/i,'').replace(/\s*[•|]\s*Letterboxd.*$/i,'').trim();
 const years=/\((18\d{2}|19\d{2}|20\d{2})\)/.exec(labelled),year=Number((yearText&&attr(yearText,'content').slice(0,4))||years?.[1])||null;
 const name=(labelled.replace(/\s*\((?:18|19|20)\d{2}\).*$/,'').trim()||heading).slice(0,300);
 const tmdb=/(?:data-tmdb-id|data-film-tmdb-id)=["'](\d+)["']/i.exec(html)?.[1]||/themoviedb\.org\/movie\/(\d+)/i.exec(html)?.[1]||'';
 return {reviews:rows,limited,pageTitle,identity:{title:name,year,tmdbId:tmdb?'movie:'+tmdb:''}};
}
function matchFilm(item,identity={}){
 const fold=v=>String(v||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('tr').replace(/ı/g,'i').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const known=String(item.tmdbId||''),remote=String(identity.tmdbId||'');
 if(item.kind==='series')return {state:'mismatch',reason:'film-vs-series'};
 if(known&&remote&&known!==remote)return {state:'mismatch',reason:'tmdb-id'};
 if(item.year&&identity.year&&Number(item.year)!==Number(identity.year))return {state:'mismatch',reason:'year'};
 if(known&&remote&&known===remote)return {state:'matched',reason:'tmdb-id'};
 const names=[item.title,item.originalTitle].filter(Boolean).map(fold),name=fold(identity.title);
 if(name&&names.includes(name)&&item.year&&identity.year)return {state:'matched',reason:'title-year'};
 if(name&&identity.year&&names.length&&!names.includes(name))return {state:'mismatch',reason:'title'};
 return {state:'unverified',reason:'missing-identity'};
}
function publicFilmUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='letterboxd.com'&&!u.port&&!u.username&&!u.password&&!u.hash&&[...u.searchParams.keys()].every(k=>k==='page')&&u.searchParams.getAll('page').length<=1&&(!u.search||/^[1-9]\d{0,3}$/.test(u.searchParams.get('page')))&&/^\/film\/[a-z0-9-]+\/(?:reviews\/(?:by\/(?:activity|added|rating|rating-lowest|rating-highest|popular|review-popular)\/)?(?:page\/[1-9]\d{0,3}\/)?)?$/.test(u.pathname)?u.href:null;}catch{return null;}}
// Only review cards and public film metadata are copied, never forms, cookies or scripts.
function reviewPageScript(){return `(()=>{
 if(document.querySelector('#challenge-running,#challenge-stage,#challenge-form')||/just a moment|access denied|security check/i.test(document.title))return {blocked:true};
 const host=document.createElement('section');
 for(const n of document.querySelectorAll('meta[property="og:title"],meta[property="og:release_date"],meta[property="video:release_date"],h1'))host.append(n.cloneNode(true));
 const tmdb=document.querySelector('[data-tmdb-id],[data-film-tmdb-id]');if(tmdb){const n=document.createElement('div');n.setAttribute('data-tmdb-id',tmdb.getAttribute('data-tmdb-id')||tmdb.getAttribute('data-film-tmdb-id'));host.append(n);}
 for(const link of document.querySelectorAll('a[href*="themoviedb.org/movie/"]')){const n=document.createElement('a');n.setAttribute('href',link.getAttribute('href'));host.append(n);}
 const seen=new Set();for(const body of [...document.querySelectorAll('.js-review-body')].slice(0,50)){const card=body.closest('article,li')||body;if(seen.has(card))continue;seen.add(card);const copy=card.cloneNode(true);for(const n of copy.querySelectorAll('script,style,template,input,textarea,select,form,iframe,button,img'))n.remove();host.append(copy);if(host.outerHTML.length>3000000)return {tooLarge:true};}
 return {url:location.href,title:document.title,html:host.outerHTML};})()`;}
async function readBrowserReviews({getTab,execute}){
 const tab=getTab();if(!tab?.view||tab.view.webContents.isDestroyed())throw Error('Open a Letterboxd film reviews page in Browser first.');
 const url=publicFilmUrl(tab.view.webContents.getURL());if(!url)throw Error('The active Browser tab must be a public Letterboxd film reviews page.');
 const generation=tab.generation;const [data]=await execute(tab.view,reviewPageScript());
 if(getTab()!==tab||tab.generation!==generation||tab.view.webContents.isDestroyed()||tab.view.webContents.getURL()!==url)throw Error('The source changed while reading reviews. Try again on the intended page.');
 if(data?.blocked)throw Error('Finish the site verification in Browser first.');if(data?.tooLarge)throw Error('The open review page is too large.');
 if(!data||data.url!==url||typeof data.html!=='string')throw Error('The open review page could not be read.');
 const result=parseLetterboxdReviews(data.html);if(!result.reviews.length)throw Error('No loaded public reviews found. Load the reviews normally, or paste/import them.');
 return {...result,url,origin:'browser'};
}
return {parseLetterboxdReviews,decode,matchFilm,publicFilmUrl,reviewPageScript,readBrowserReviews};
});
