'use strict';
// Original integration: identifier resolution, bounded sample and strict redirects.
const {publicFilmUrl,parseLetterboxdReviews,matchFilm,reviewPageSource}=require('./letterboxd-reviews');
const {readLimitedBytes}=require('./catalog-discovery');
function lookupUrl(item){
  if(item?.kind!=='film')throw Error('Automatic Letterboxd lookup requires a film, not a series.');
  const tmdb=/^movie:([1-9]\d{0,11})$/.exec(item.tmdbId||'');
  if(tmdb)return 'https://letterboxd.com/tmdb/'+tmdb[1]+'/';
  if(/^tt\d{7,12}$/.test(item.imdbId||''))return 'https://letterboxd.com/imdb/'+item.imdbId+'/';
  throw Error('Match this film with TMDB or IMDb first, or enter its Letterboxd reviews URL.');
}
function trusted(value){
  try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='letterboxd.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash
    &&(/^\/(?:tmdb\/[1-9]\d{0,11}|imdb\/tt\d{7,12})\/$/.test(u.pathname)||!!publicFilmUrl(u.href))?u.href:null;}catch{return null;}
}
const sortPaths=Object.freeze({popular:'by/activity/',new:'',high:'by/entry-rating/',low:'by/entry-rating-lowest/'});
async function fetchReviews(item,{count=24,sort='popular',spoilers=false,signal,fetchImpl=fetch,readPage}={}){
  if(sort!=='balanced'&&!Object.hasOwn(sortPaths,sort))throw Error('Choose a supported review order.');
  if(![12,24,40,48].includes(count))throw Error('Choose 12, 24, 40 or 48 reviews.');
  if(readPage!==undefined&&typeof readPage!=='function')throw Error('Unsupported Letterboxd page reader.');
  const lookup=lookupUrl(item),combined=signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000);
  async function page(address,expectedBase){
    let url=trusted(address);if(!url)throw Error('Unsupported Letterboxd address.');
    if(readPage){
      combined.throwIfAborted();
      // A normal browser can supply loaded HTML, but cannot relax the source bounds.
      // Race abort too: a reader that ignores its signal must not hold this request open.
      let onAbort;
      const aborted=new Promise((_,reject)=>{onAbort=()=>reject(combined.reason);combined.addEventListener('abort',onAbort,{once:true});});
      let loaded;
      try{loaded=await Promise.race([Promise.resolve().then(()=>{combined.throwIfAborted();return readPage(url,{signal:combined,expectedBase});}),aborted]);}
      finally{combined.removeEventListener('abort',onAbort);}
      combined.throwIfAborted();
      const final=trusted(loaded?.url);
      if(!final)throw Error('The review page belongs to a different film or unsupported Letterboxd address.');
      if(expectedBase){
        if(!final.startsWith(expectedBase))throw Error('The review page belongs to a different film.');
        const before=reviewPageSource(address),after=reviewPageSource(final);
        if(!after||after.sort!==before?.sort||after.page!==before?.page)throw Error('The requested review order changed.');
      }
      if(typeof loaded.html!=='string')throw Error('The Letterboxd page reader returned no HTML.');
      if(Buffer.byteLength(loaded.html,'utf8')>3000000)throw Error('Letterboxd response exceeds the 3000000 byte limit.');
      return {url:final,html:loaded.html};
    }
    for(let hop=0;hop<5;hop++){
      combined.throwIfAborted();
      const r=await fetchImpl(url,{redirect:'manual',credentials:'omit',signal:combined,headers:{Accept:'text/html'}});
      if([301,302,303,307,308].includes(r.status)){
        const location=r.headers.get('location');await r.body?.cancel();
        const next=location&&trusted(new URL(location,url).href);if(!next)throw Error('Letterboxd redirected outside the supported film pages.');
        if(expectedBase){if(!next.startsWith(expectedBase))throw Error('The review page belongs to a different film.');const before=reviewPageSource(address),after=reviewPageSource(next);if(!after||after.sort!==before?.sort||after.page!==before?.page)throw Error('The requested review order changed.');}
        url=next;continue;
      }
      if(!r.ok){await r.body?.cancel();throw Error('Letterboxd HTTP '+r.status+'. Open the film page in Browser and use its loaded reviews, or paste/import a sample.');}
      const html=(await readLimitedBytes(r,3000000,'Letterboxd')).toString('utf8');combined.throwIfAborted();return {url,html};
    }
    throw Error('Too many Letterboxd redirects.');
  }
  const resolved=await page(lookup),match=/^https:\/\/letterboxd\.com\/film\/([a-z0-9-]+)\//.exec(resolved.url);
  if(!match)throw Error('No Letterboxd film matched this identifier. Use a verified film reviews URL.');
  const base='https://letterboxd.com/film/'+match[1]+'/',reviews=[],seenText=new Set(),seenPermalinks=new Set(),authors=new Set(),sources=[],pools=[];
  let identity=null,pageTitle='',pages=0,partial=false,warning='',limited=false;const excluded={spoiler:0,duplicate:0,unreadable:0,size:0,requested:0};
  const textKey=row=>row.text.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  function accept(row){
    if(!spoilers&&row.spoiler){excluded.spoiler++;return false;}
    const key=textKey(row);if(seenText.has(key)||row.permalink&&seenPermalinks.has(row.permalink)){excluded.duplicate++;return false;}
    seenText.add(key);if(row.permalink)seenPermalinks.add(row.permalink);
    if(row.authorId&&authors.has(row.authorId)){excluded.author=(excluded.author||0)+1;return false;}
    if(row.authorId)authors.add(row.authorId);
    if(reviews.length===count){excluded.requested++;return false;}
    reviews.push({...row,id:String(reviews.length+1)});return true;
  }
  // Each explicit pool gets a turn before another page can dominate the sample.
  // These are selected perspectives, not a representative audience survey.
  const plan=sort==='balanced'?Object.keys(sortPaths).map(order=>({sort:order,page:1})):Array.from({length:4},(_,i)=>({sort,page:i+1}));
  for(const requested of plan){
    if(sort!=='balanced'&&reviews.length>=count)break;
    const url=base+'reviews/'+sortPaths[requested.sort]+(requested.page>1?'page/'+requested.page+'/':'');let parsed,source;
    try{
      const got=await page(url,base),final=trusted(got.url);if(!final||!final.startsWith(base))throw Error('The review page belongs to a different film.');
      const observed=reviewPageSource(got.url);if(!observed||observed.sort!==requested.sort||observed.page!==requested.page)throw Error('The requested review order changed. Review text was not accepted as that sample.');
      parsed=parseLetterboxdReviews(got.html,{url:got.url});
      const assessment=matchFilm(item,parsed.identity);
      if(assessment.state==='mismatch')throw Error('Film identity mismatch. Review text was not accepted for this film.');
      if(identity&&matchFilm({...item,tmdbId:identity.tmdbId||item.tmdbId,imdbId:identity.imdbId||item.imdbId,title:identity.title,year:identity.year},parsed.identity).state==='mismatch')throw Error('Film identity changed between review pages.');
      source={...observed,requestedUrl:url,loaded:parsed.reviews.length+(parsed.excluded?.duplicate||0)+(parsed.excluded?.unreadable||0)+(parsed.excluded?.identity||0),accepted:0};
    }catch(error){
      if(combined.aborted)throw error;
      if(!reviews.length&&!pools.some(pool=>pool.rows.length)||/identity|different film|order changed/.test(error.message))throw error;
      partial=true;warning=error.message;break;
    }
    pages++;sources.push(source);identity=parsed.identity;pageTitle=parsed.pageTitle;limited=limited||parsed.limited;
    excluded.duplicate+=parsed.excluded?.duplicate||0;excluded.unreadable+=parsed.excluded?.unreadable||0;if(parsed.excluded?.identity)excluded.identity=(excluded.identity||0)+parsed.excluded.identity;
    if(sort==='balanced')pools.push({rows:[...parsed.reviews]});
    // A page containing only repeats or excluded spoilers is not the end of the list.
    // Continue within the same four-page budget so later eligible authors can still be found.
    else{for(const row of parsed.reviews)accept(row);if(!source.loaded)break;}
  }
  if(sort==='balanced'){
    while(pools.some(pool=>pool.rows.length))for(const pool of pools){while(pool.rows.length){if(accept(pool.rows.shift()))break;}}
  }
  if(!reviews.length)throw Error('No readable non-spoiler reviews found. Try the Browser or import a sample.');
  // The existing editor has a 120k JSON bound; preserve complete rows within it.
  while(JSON.stringify(reviews).length>120000){reviews.pop();excluded.size++;limited=true;}
  const coverage=Object.fromEntries((sort==='balanced'?Object.keys(sortPaths):[sort]).map(order=>[order,reviews.filter(row=>row.source?.sort===order).length]));
  for(const source of sources)source.accepted=reviews.filter(row=>row.source?.url===source.url).length;
  const sampling={mode:sort,requested:count,returned:reviews.length,independentAuthors:new Set(reviews.map(row=>row.authorId).filter(Boolean)).size,unknownAuthors:reviews.filter(row=>!row.authorId).length,coverage,representative:false};
  combined.throwIfAborted();
  return {reviews,url:base+'reviews/'+(sort==='balanced'?'':sortPaths[sort]),identity,pageTitle,pages,requested:count,
    partial,warning,excluded,sources,sampling,limited:limited||reviews.length<count,match:matchFilm(item,identity),resolvedBy:'provider-identifier'};
}
module.exports={lookupUrl,trusted,fetchReviews};
