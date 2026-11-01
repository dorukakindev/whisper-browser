'use strict';
const {safeSource}=require('./assistant-web-research');
function createResearch({openPage}){
 return async function research(query,{signal,onPartial=()=>{}}={}){
  const q=String(query||'').trim();if(!q||q.length>1200)throw Error('Enter a short research question.');
  const page=await openPage();if(!page?.load||!page?.read||!page?.close)throw Error('Research browser unavailable.');
  const stop=()=>page.close();signal?.addEventListener('abort',stop,{once:true});
  try{
   const urls=[];
   const engines=['https://www.google.com/search?q=','https://html.duckduckgo.com/html/?q=','https://www.bing.com/search?q='];
   for(const engine of engines){
    signal?.throwIfAborted();let found;
    try{await page.load(engine+encodeURIComponent(q),signal);found=await page.read('results');}catch{signal?.throwIfAborted();continue;}
    for(const row of found.links||[]){let raw=row.url;try{const u=new URL(raw);if(u.hostname==='www.google.com'&&u.pathname==='/url')raw=u.searchParams.get('q')||u.searchParams.get('url');if(u.hostname.endsWith('duckduckgo.com')&&u.searchParams.has('uddg'))raw=u.searchParams.get('uddg');if(u.hostname.endsWith('bing.com')&&u.pathname==='/ck/a'&&u.searchParams.get('u')?.startsWith('a1'))raw=Buffer.from(u.searchParams.get('u').slice(2),'base64').toString('utf8');}catch{continue;}
     const url=safeSource(raw);if(!url)continue;const h=new URL(url).hostname;if(/(^|\.)(google|gstatic|googleusercontent|duckduckgo|bing|microsoft)\./i.test(h))continue;
     if(!urls.some(x=>x.url===url))urls.push({url,title:String(row.title||url).slice(0,180)});if(urls.length===4)break;
    }
    if(urls.length)break;
   }
   if(!urls.length)throw Error('Research search page returned no readable source links; it may require verification / Arama sayfası okunabilir kaynak döndürmedi; doğrulama istiyor olabilir.');
   const passages=[],sources=[],blocked=[];
   let checked=0;const total=Math.min(3,urls.length);
   for(const row of urls.slice(0,3)){
    signal?.throwIfAborted();try{await page.load(row.url,signal);const value=await page.read('article');signal?.throwIfAborted();const url=safeSource(value.url);if(!url||!value.text||value.challenge)throw Error('Page unavailable or requires verification.');sources.push({url,title:String(value.title||row.title).slice(0,180)});passages.push({id:'W'+sources.length,title:sources.at(-1).title,url,text:String(value.text).slice(0,6000),truncated:!!value.truncated});}catch(error){signal?.throwIfAborted();blocked.push({url:row.url,error:'Page could not be read.'});}
    checked++;try{onPartial({checked,total,read:passages.length,blocked:blocked.length,previews:passages.map(p=>({title:p.title,text:p.text.slice(0,300)}))});}catch{/* A progress consumer cannot turn a valid page into failed evidence. */}
   }
   if(!passages.length)throw Error('Research sources could not be read / Araştırma kaynakları okunamadı.');
   return {status:'completed',method:'browser',sources,passages,blocked,text:passages.map(p=>'['+p.id+'] '+p.title+'\n'+p.url+'\n'+p.text).join('\n\n'),scope:'Public page excerpts, not a complete web search. Cite W IDs and URLs; failed pages are not evidence of absence.'};
  }finally{signal?.removeEventListener('abort',stop);await page.close();}
 };
}
module.exports={createResearch};
