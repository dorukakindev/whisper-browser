'use strict';
// Original integration: identifier resolution, bounded sample and strict redirects.
const {publicFilmUrl,parseLetterboxdReviews,matchFilm}=require('./letterboxd-reviews');
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
async function fetchReviews(item,{count=24,spoilers=false,signal,fetchImpl=fetch}={}){
  if(![12,24,48].includes(count))throw Error('Choose 12, 24 or 48 reviews.');
  const lookup=lookupUrl(item),combined=signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000);
  async function page(address){
    let url=trusted(address);if(!url)throw Error('Unsupported Letterboxd address.');
    for(let hop=0;hop<5;hop++){
      combined.throwIfAborted();
      const r=await fetchImpl(url,{redirect:'manual',credentials:'omit',signal:combined,headers:{Accept:'text/html'}});
      if([301,302,303,307,308].includes(r.status)){
        const location=r.headers.get('location');await r.body?.cancel();
        const next=location&&trusted(new URL(location,url).href);if(!next)throw Error('Letterboxd redirected outside the supported film pages.');url=next;continue;
      }
      if(!r.ok){await r.body?.cancel();throw Error('Letterboxd HTTP '+r.status+'. Open the film page in Browser and use its loaded reviews, or paste/import a sample.');}
      const html=(await readLimitedBytes(r,3000000,'Letterboxd')).toString('utf8');combined.throwIfAborted();return {url,html};
    }
    throw Error('Too many Letterboxd redirects.');
  }
  const resolved=await page(lookup),match=/^https:\/\/letterboxd\.com\/film\/([a-z0-9-]+)\//.exec(resolved.url);
  if(!match)throw Error('No Letterboxd film matched this identifier. Use a verified film reviews URL.');
  const base='https://letterboxd.com/film/'+match[1]+'/',reviews=[],seen=new Set();
  let identity=null,pageTitle='',pages=0,partial=false,warning='',limited=false;const excluded={spoiler:0,duplicate:0,unreadable:0,size:0,requested:0};
  // At most four pages, including extra room for excluded spoilers/duplicates.
  for(let index=1;index<=4&&reviews.length<count;index++){
    const url=base+'reviews/by/activity/'+(index>1?'page/'+index+'/':'');
    let parsed;
    try{
      const got=await page(url);parsed=parseLetterboxdReviews(got.html);
      const final=trusted(got.url);if(!final||!final.startsWith(base))throw Error('The review page belongs to a different film.');
      const assessment=matchFilm(item,parsed.identity);
      if(assessment.state==='mismatch')throw Error('Film identity mismatch. Review text was not accepted for this film.');
      if(identity&&matchFilm({...item,tmdbId:identity.tmdbId||item.tmdbId,title:identity.title,year:identity.year},parsed.identity).state==='mismatch')throw Error('Film identity changed between review pages.');
    }catch(error){
      if(combined.aborted)throw error;
      if(!reviews.length||/identity|different film/.test(error.message))throw error;
      partial=true;warning=error.message;break;
    }
    pages++;identity=parsed.identity;pageTitle=parsed.pageTitle;limited=limited||parsed.limited;
    excluded.duplicate+=parsed.excluded?.duplicate||0;excluded.unreadable+=parsed.excluded?.unreadable||0;let added=0;
    for(const row of parsed.reviews){
      if(!spoilers&&row.spoiler){excluded.spoiler++;continue;}
      const key=row.text.normalize('NFKC').replace(/\s+/g,' ').trim();if(seen.has(key)){excluded.duplicate++;continue;}seen.add(key);
      if(reviews.length===count){excluded.requested++;continue;}
      reviews.push({...row,id:String(reviews.length+1)});added++;
    }
    if(!parsed.reviews.length||(!added&&index>1))break;
  }
  if(!reviews.length)throw Error('No readable non-spoiler reviews found. Try the Browser or import a sample.');
  // The existing editor has a 120k JSON bound; preserve complete rows within it.
  while(JSON.stringify(reviews).length>120000){reviews.pop();excluded.size++;limited=true;}
  combined.throwIfAborted();
  return {reviews,url:base+'reviews/by/activity/',identity,pageTitle,pages,requested:count,
    partial,warning,excluded,limited:limited||reviews.length<count,match:matchFilm(item,identity),resolvedBy:'provider-identifier'};
}
module.exports={lookupUrl,trusted,fetchReviews};
