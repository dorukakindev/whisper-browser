'use strict';
const path = require('node:path');
const { createHash } = require('node:crypto');
const { run } = require('./browser-media-tools');
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 40);
async function scanFolder(folder, pythonPath) {
  const parsed = JSON.parse(await run(pythonPath, [path.join(__dirname, '../backend/catalog_scan.py')], JSON.stringify({ folder }), null, 300000));
  const grouped = new Map();
  for (const row of parsed.rows) {
    const key = row.kind === 'series' ? `${row.title.toLocaleLowerCase('tr')}|${row.year || ''}` : row.path.toLowerCase();
    let item = grouped.get(key);
    if (!item) { item = { title: row.title, kind: row.kind, year: row.year || null, importRef: 'folder:' + hash(key), episodes: [] }; grouped.set(key, item); }
    const source = { type: 'local', value: row.path };
    if (row.kind === 'film') item.source = source;
    else for (const number of row.episodes) {
      if (item.episodes.some(ep => ep.season === row.season && ep.number === number)) { parsed.warnings.push(`${row.title} S${row.season} B${number}: birden fazla dosya; ilk kaynak kullanıldı.`); continue; }
      item.episodes.push({ id: `s${row.season}e${number}`, season: row.season, number, title: '', source });
    }
  }
  return { items: [...grouped.values()], warnings: parsed.warnings };
}
// Gövdeyi akış okuyarak byte sınırında keser; response.text()/arrayBuffer()
// tamamını belleğe alır ve content-length beyanı yalan olabilir.
async function readLimitedBytes(response, maxBytes, label = 'Yanıt') {
  const declared = Number(response?.headers?.get?.('content-length') || 0);
  if (declared > maxBytes) throw new Error(`${label} çok büyük.`);
  if (!response?.body?.getReader) {
    const bytes = typeof response.arrayBuffer === 'function'
      ? Buffer.from(await response.arrayBuffer())
      : Buffer.from(String(await response.text()), 'utf8');
    if (bytes.length > maxBytes) throw new Error(`${label} çok büyük.`);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value ? value.byteLength : 0;
      if (total > maxBytes) { await reader.cancel().catch(() => {}); throw new Error(`${label} çok büyük.`); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock?.(); }
  return Buffer.concat(chunks, total);
}

async function readTextLimited(response, maxBytes) {
  // UTF-8 BOM bayt olarak geçer; JSON.parse'a giden metinden düşür.
  return (await readLimitedBytes(response, maxBytes, 'TMDB yanıtı')).toString('utf8').replace(/^\uFEFF/, '');
}

function createMetadataClient(fetchImpl = fetch,{language=()=> 'tr-TR'}={}) {
  async function request(route, token, params = {}, signal) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096 || /[\r\n]/.test(token)) throw new Error('TMDB API okuma erişim belirtecini girin. Ayarlar → Film bilgileri ve afişler bölümünden kaydedebilirsiniz.');
    const url = new URL('https://api.themoviedb.org/3/' + route);
    const locale=language();url.search = new URLSearchParams({ language:/^[a-z]{2}-[A-Z]{2}$/.test(locale)?locale:'tr-TR', ...params, ...(/^[a-f0-9]{32}$/i.test(token)?{api_key:token}:{}) }).toString();
    let response;
    try { response = await fetchImpl(url, { headers: /^[a-f0-9]{32}$/i.test(token)?{}:{ Authorization: `Bearer ${token}` }, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) }); }
    catch { throw new Error('TMDB bağlantısı kurulamadı; yeniden deneyin.'); }
    if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'TMDB erişim belirteci geçersiz.' : response.status === 429 ? 'TMDB istek sınırına ulaşıldı; daha sonra deneyin.' : 'TMDB bilgileri alınamadı.'), {status:response.status});
    const text = await readTextLimited(response, 4e6);
    return JSON.parse(text);
  }
  const extraCache=new Map();
  const identity=item=>{const kind=item.kind==='series'?'tv':'movie',match=new RegExp('^'+kind+':(\\d+)$').exec(item.tmdbId||'');if(!match||!Number.isSafeInteger(Number(match[1]))||Number(match[1])<1)throw new Error('Önce yapımı TMDB ile eşleştirin.');return {kind,id:Number(match[1])};};
  async function cached(route,token,params={},signal){
    const key=hash(JSON.stringify([route,token,language(),params]));const old=extraCache.get(key);if(old&&Date.now()-old.time<600000)return structuredClone(old.value);
    const value=await request(route,token,params,signal);if(extraCache.size>=100)extraCache.delete(extraCache.keys().next().value);extraCache.set(key,{time:Date.now(),value});return structuredClone(value);
  }
  return {
    async filmExtras(item,token,signal){
      let selected=item;if(!item.tmdbId){const id=await this.resolve(item,token,{signal});selected={...item,tmdbId:(item.kind==='series'?'tv':'movie')+':'+id};}
      const {kind,id}=identity(selected),data=await cached(`${kind}/${id}`,token,{append_to_response:'credits,videos,recommendations,external_ids,images'},signal);
      if(data.id!==id)throw Error('Film identity mismatch.');
      const imdb=data.imdb_id||data.external_ids?.imdb_id;if(item.imdbId&&imdb!==item.imdbId)throw Error('Film identity mismatch.');
      const photo=value=>/^\/[a-zA-Z0-9._-]+$/.test(value||'')?'https://image.tmdb.org/t/p/w185'+value:'';
      const people=[],seen=new Set();for(const row of [...(data.credits?.crew||[]).filter(p=>p.job==='Director'),...(data.credits?.cast||[]).slice(0,20)]){if(!Number.isSafeInteger(row.id)||row.id<1||!row.name||seen.has(row.id))continue;seen.add(row.id);people.push({id:row.id,name:String(row.name).slice(0,180),role:String(row.job||row.character||'').slice(0,180),director:row.job==='Director',photo:photo(row.profile_path)});}
      const genres=new Map((data.genres||[]).map(g=>[g.id,String(g.name).slice(0,80)]));
      const normalize=rows=>{const seenTitles=new Set();return (Array.isArray(rows)?rows:[]).filter(r=>r.adult!==true&&Number.isSafeInteger(r.id)&&r.id>0).filter(r=>{const key=(r.media_type||kind)+':'+r.id;if(seenTitles.has(key))return false;seenTitles.add(key);return true;}).slice(0,20).map(r=>({id:r.id,kind:r.media_type==='tv'?'series':r.media_type==='movie'?'film':item.kind,tmdbId:(r.media_type==='tv'?'tv':r.media_type==='movie'?'movie':kind)+':'+r.id,title:String(r.title||r.name||'').slice(0,300),year:Number(String(r.release_date||r.first_air_date||'').slice(0,4))||null,poster:photo(r.poster_path),sharedGenres:(r.genre_ids||[]).filter(g=>genres.has(g)).map(g=>genres.get(g))})).filter(r=>r.title&&r.tmdbId!==selected.tmdbId);};
      const videos=(data.videos?.results||[]).filter(v=>v.site==='YouTube'&&/^[A-Za-z0-9_-]{11}$/.test(v.key||'')&&['Trailer','Teaser'].includes(v.type)).sort((a,b)=>Number(b.official===true)-Number(a.official===true)).slice(0,6).map(v=>({name:String(v.name||v.type).slice(0,180),type:v.type,official:v.official===true,url:'https://www.youtube.com/watch?v='+v.key}));
      let sameDirector=[],directorWarning='';const director=people.find(p=>p.director);if(director){try{const credits=await cached('person/'+director.id+'/combined_credits',token,{},signal);sameDirector=normalize((credits.crew||[]).filter(r=>r.job==='Director'));}catch{signal?.throwIfAborted();directorWarning='Director filmography unavailable.';}}
      const images=[...(data.images?.backdrops||[]),...(data.images?.posters||[])].filter(r=>/^\/[a-zA-Z0-9._-]+$/.test(r.file_path||'')).slice(0,20).map(r=>({url:'https://image.tmdb.org/t/p/w1280'+r.file_path,thumbnail:'https://image.tmdb.org/t/p/w185'+r.file_path}));
      return {images,identity:{tmdbId:selected.tmdbId,imdbId:imdb||'',title:String(data.title||data.name||'').slice(0,300)},people,videos,recommendations:normalize(data.recommendations?.results),sameDirector,director:director?.name||'',directorWarning};
    },
    async person(personId,token,signal){
      if(!Number.isSafeInteger(personId)||personId<1)throw Error('Invalid person ID.');
      const data=await cached('person/'+personId,token,{append_to_response:'combined_credits'},signal),seen=new Set();
      if(data.id!==personId)throw Error('Person identity mismatch.');
      const films=[...(data.combined_credits?.cast||[]),...(data.combined_credits?.crew||[]).filter(r=>r.job==='Director')].filter(r=>r.adult!==true&&['movie','tv'].includes(r.media_type)&&Number.isSafeInteger(r.id)&&r.id>0&&!seen.has(r.media_type+':'+r.id)&&seen.add(r.media_type+':'+r.id)).sort((a,b)=>(Number(b.vote_count)||0)-(Number(a.vote_count)||0)).slice(0,40).map(r=>({id:r.id,tmdbId:(r.media_type==='tv'?'tv':'movie')+':'+r.id,kind:r.media_type==='tv'?'series':'film',title:String(r.title||r.name||'').slice(0,300),year:Number(String(r.release_date||r.first_air_date||'').slice(0,4))||null,role:String(r.character||r.job||'').slice(0,160)}));
      return {id:personId,name:String(data.name||'').slice(0,180),biography:String(data.biography||'').slice(0,16000),department:String(data.known_for_department||'').slice(0,100),birthday:String(data.birthday||'').slice(0,20),place:String(data.place_of_birth||'').slice(0,200),photo:/^\/[a-zA-Z0-9._-]+$/.test(data.profile_path||'')?'https://image.tmdb.org/t/p/w185'+data.profile_path:'',films};
    },
    async images(item,token,signal){
      const {kind,id}=identity(item),data=await cached(`${kind}/${id}/images`,token,{include_image_language:'null,en,tr'},signal),seen=new Set(),rows=[];
      for(const [type,source]of [['backdrop',data.backdrops],['poster',data.posters]])for(const image of (Array.isArray(source)?source:[]).slice(0,type==='backdrop'?80:20)){
        if(!/^\/[a-zA-Z0-9._-]+$/.test(image.file_path||'')||seen.has(image.file_path))continue;
        seen.add(image.file_path);rows.push({type,url:'https://image.tmdb.org/t/p/w1280'+image.file_path,thumbnail:'https://image.tmdb.org/t/p/w185'+image.file_path});
      }
      return {rows,attribution:'TMDB'};
    },
    async watchProviders(item,token,region='TR',signal){
      if(!/^[A-Z]{2}$/.test(region))throw new Error('İzleme ülkesi geçersiz.');
      const {kind,id}=identity(item),data=await cached(`${kind}/${id}/watch/providers`,token,{},signal),country=data.results?.[region];
      const groups={};for(const mode of ['flatrate','free','ads','rent','buy']){
        const seen=new Set();groups[mode]=(Array.isArray(country?.[mode])?country[mode]:[]).filter(p=>Number.isSafeInteger(p.provider_id)&&p.provider_id>0&&typeof p.provider_name==='string'&&p.provider_name.trim()&&!seen.has(p.provider_id)&&seen.add(p.provider_id)).slice(0,40).map(p=>({id:p.provider_id,name:p.provider_name.trim().slice(0,100)}));
      }
      return {region,groups,url:`https://www.themoviedb.org/${kind}/${id}/watch?locale=${region}`,attribution:'JustWatch via TMDB'};
    },
    async recommendations(item,token,page=1,signal){
      if(!Number.isInteger(page)||page<1||page>10)throw new Error('Öneri sayfası geçersiz.');
      const {kind,id}=identity(item),data=await cached(`${kind}/${id}/recommendations`,token,{page:String(page)},signal),seen=new Set();
      const rows=(Array.isArray(data.results)?data.results:[]).filter(r=>r.adult!==true&&Number.isSafeInteger(r.id)&&r.id>0&&r.id!==id&&!seen.has(r.id)&&seen.add(r.id)).map(r=>({id:r.id,tmdbId:kind+':'+r.id,kind:item.kind==='series'?'series':'film',title:String(r.title||r.name||'').slice(0,300),year:Number(String(r.release_date||r.first_air_date||'').slice(0,4))||null,synopsis:String(r.overview||'').slice(0,3000)})).filter(r=>r.title.trim()).slice(0,20);
      return {rows,nextPage:page<Math.min(10,Number(data.total_pages)||1)?page+1:null};
    },
    async resolve(item, token, {automatic = false, signal} = {}) {
      const kind = item.kind === 'series' ? 'tv' : 'movie';
      const known = new RegExp('^' + kind + ':(\\d+)$').exec(item.tmdbId || '');
      if (known && Number.isSafeInteger(Number(known[1]))) return Number(known[1]);
      if (/^tt\d{5,12}$/.test(item.imdbId || '')) {
        const data = await request('find/' + item.imdbId, token, {external_source:'imdb_id'}, signal);
        const rows = data[kind === 'tv' ? 'tv_results' : 'movie_results'] || [];
        if (rows.length === 1 && Number.isSafeInteger(rows[0].id) && rows[0].id > 0) return rows[0].id;
        throw Object.assign(new Error('Kimlik tek bir yapımla eşleşmedi; elle eşleştirin.'), {code:'ambiguous'});
      }
      if (!automatic) throw new Error('Önce yapımı TMDB veya IMDb kimliğiyle eşleştirin.');
      // A supplied year must match exactly; without a year the complete search
      // must still contain exactly one exact title, never the first popular hit.
      const hasYear=Number.isInteger(item.year)&&item.year>=1880;
      const fold = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/ı/g,'i').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
      const names = [...new Set([item.title, item.originalTitle].filter(Boolean))];
      const matches = new Set();
      // Imported English aliases disappear from Turkish search result labels.
      // Search both display languages, then hydrate details in the user's locale.
      const locales=[...new Set(['en-US',language()])];
      for (const query of names) for (const locale of locales) {
        const data = await request('search/' + kind, token, {language:locale,query:query.slice(0,200), include_adult:'false', ...(hasYear?{[kind==='tv'?'first_air_date_year':'primary_release_year']:String(item.year)}:{})}, signal);
        if (Number(data.total_pages) > 1) throw Object.assign(new Error('Birden fazla sonuç sayfası var; elle eşleştirin.'), {code:'ambiguous'});
        for (const row of data.results || []) {
          const year = Number(String(row.release_date || row.first_air_date || '').slice(0,4));
          if ((!hasYear || year === item.year) && Number.isSafeInteger(row.id) && row.id > 0 &&
              [row.title,row.name,row.original_title,row.original_name].some(title => title && names.some(name=>fold(name)===fold(title)))) matches.add(row.id);
        }
      }
      if (matches.size !== 1) throw Object.assign(new Error('Başlık ve yıl tek bir yapımla eşleşmedi; elle eşleştirin.'), {code:'ambiguous'});
      return [...matches][0];
    },
    async search(item, token, query) {
      const kind = item.kind === 'series' ? 'tv' : 'movie';
      const data = await request(`search/${kind}`, token, { query: String(query || item.title).slice(0, 200), include_adult: 'false' });
      return (data.results || []).slice(0, 20).map(row => ({ id: row.id, title: row.title || row.name,
        date: row.release_date || row.first_air_date || '', synopsis: row.overview || '' }));
    },
    async detail(item, id, token, signal) {
      if (!Number.isSafeInteger(id) || id < 1) throw new Error('Eser kimliği geçersiz.');
      const kind = item.kind === 'series' ? 'tv' : 'movie';
      const data = await request(`${kind}/${id}`, token, { append_to_response: 'credits,external_ids' }, signal);
      if(!data.overview && language()!=='en-US'){const fallback=await request(`${kind}/${id}`,token,{language:'en-US'},signal);data.overview=fallback.overview||'';}
      const patch = { title: data.title || data.name, originalTitle: data.original_title || data.original_name,
        year: Number(String(data.release_date || data.first_air_date || '').slice(0, 4)) || null,
        synopsis: data.overview || '', tmdbId: `${kind}:${id}`, imdbId: data.imdb_id || data.external_ids?.imdb_id || '',
        genres: (data.genres || []).map(g => g.name), cast: (data.credits?.cast || []).slice(0, 12).map(p => p.name),
        runtime: data.runtime || data.episode_run_time?.[0] || null,
        directors: (data.credits?.crew || []).filter(p=>p.job==='Director').map(p=>p.name).concat((data.created_by||[]).map(p=>p.name)).slice(0,10),
        tagline: data.tagline || '', tmdbRating: Number(data.vote_average)||null, tmdbVotes: Number(data.vote_count)||0,
        backdrop: /^\/[a-zA-Z0-9._-]+$/.test(data.backdrop_path || '') ? data.backdrop_path : '' };
      return { patch, poster: /^\/[a-zA-Z0-9._-]+$/.test(data.poster_path || '') ? data.poster_path : '',
        seasons: (data.seasons || []).map(s => ({ number: s.season_number, count: s.episode_count })) };
    },
    async season(item, number, token) {
      const match = /^tv:(\d+)$/.exec(item.tmdbId || '');
      if (!match || !Number.isSafeInteger(number) || number < 0 || number > 1000) throw new Error('Önce diziyi TMDB ile eşleştirin ve geçerli sezon seçin.');
      const data = await request(`tv/${match[1]}/season/${number}`, token);
      return (data.episodes || []).slice(0, 1000).map(ep => ({ id: `s${number}e${ep.episode_number}`, season: number, number: ep.episode_number,
        title: ep.name || '', airDate: ep.air_date || '', watchStatus: 'planned' }));
    },
  };
}
module.exports = { scanFolder, createMetadataClient, readLimitedBytes };
