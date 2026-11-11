'use strict';
// Explicit one-permalink read. Neither a missing sample row nor an access failure proves deletion.
async function refresh({item,entries,permalink,authorId,oldText,spoilers=false,fetchImpl=fetch,signal,now=()=>new Date().toISOString()}){
 const reviews=require('./letterboxd-reviews'),model=require('./renderer/media-tools-model'),url=reviews.reviewPermalink(permalink);
 if(!url||!authorId||new URL(url).pathname.split('/')[1].toLowerCase()!==authorId)throw Error('Choose a saved canonical review permalink and author. / Kayıtlı kanonik yorum bağlantısını ve yazarını seçin.');
 const before=entries.filter(e=>model.decisionIdentityMatch(item,e.identity||{})==='matched').flatMap(e=>e.reviews||[]).find(r=>r.permalink===url&&r.authorId===authorId&&r.text===oldText);
 if(!before)throw Error('This exact source snapshot is not in a saved analysis for this film. / Bu kesin kaynak görüntüsü bu yapımın kayıtlı analizinde yok.');
 if(before.spoiler&&!spoilers)throw Error('Reveal this spoiler source explicitly before refreshing it. / Yenilemeden önce spoiler kaynağını açıkça gösterin.');
 signal?.throwIfAborted();const response=await fetchImpl(url,{signal,redirect:'error',credentials:'omit'}),fetchedAt=now();signal?.throwIfAborted();
 if([404,410].includes(response.status)){await response.body?.cancel();return {before,after:null,fetchedAt,permalink:url,status:'permalink-unavailable',httpStatus:response.status,scope:'The exact public URL returned not found/gone; no claim about why it was removed.'};}
 if(!response.ok){await response.body?.cancel();return {before,after:null,fetchedAt,permalink:url,status:'access-unverified',httpStatus:response.status};}
 const html=(await require('./catalog-discovery').readLimitedBytes(response,2000000,'Review source')).toString('utf8'),parsed=reviews.parseLetterboxdReviews(html,{url});
 signal?.throwIfAborted();
 const after=parsed.reviews.find(r=>r.permalink===url&&r.authorId===authorId);
 if(reviews.matchFilm(item,parsed.identity).state!=='matched'||!after||after.spoiler&&!spoilers)return {before,after:null,fetchedAt,permalink:url,status:'identity-unverified',scope:'The response did not establish the same film, canonical author and complete source review.'};
 return {before,after,fetchedAt,permalink:url,status:before.text===after.text?'unchanged':'changed',scope:'One explicitly requested canonical source only. The saved analysis and its original snapshot were not modified.'};
}
module.exports={refresh};
