'use strict';
const { createHash } = require('node:crypto');
const ASPECTS = ['story','characters','pace','visuals','sound','emotion'];
const fold = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('tr').replace(/ı/g,'i');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const active = row => !row.recordState || row.recordState === 'active';
const values = (row, field) => Array.isArray(row?.[field]) ? [...new Set(row[field].filter(value=>typeof value==='string'&&value.trim()))].sort() : [];
const validRating = value => (typeof value==='number'||typeof value==='string'&&value.trim()!=='') && Number.isFinite(Number(value)) && Number(value)>=0 && Number(value)<=10;
const key = row => fold(row.title).trim()+'|'+(row.year || '');
function reviewId(row) { return createHash('sha256').update(key(row)+'|'+(row.watchedDate || '')+'|'+(row.review || '')).digest('hex').slice(0,20); }
function preferences(raw = {}) {
  return { weights:Object.fromEntries(ASPECTS.map(name=>[name,Math.max(0,Math.min(5,Number(raw.weights?.[name]) || 0))])),
    avoid:Array.isArray(raw.avoid)?[...new Set(raw.avoid.filter(name=>ASPECTS.includes(name)))]:[],
    note:String(raw.note || '').slice(0,2000) };
}
function effectivePreferences(raw={}){return preferences(Object.keys(raw.weights||{}).length?raw:{...raw,weights:Object.fromEntries(ASPECTS.map(name=>[name,3]))});}
function preferencesRevision(saved = {}) {
  const normalized=effectivePreferences(saved);
  return hash({...normalized,avoid:[...normalized.avoid].sort(),prioritiesConfigured:Object.keys(saved.weights||{}).length>0});
}
function reviewCorpus(rows) {
  return [...new Map(rows.filter(active).filter(row=>String(row.review||'').trim()).map(row=>[reviewId(row),String(row.review)])).entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}
function corpusRevision(rows) { return hash(reviewCorpus(rows)); }
function profile(diary = [], catalog = [], saved = {}, reviewEntries = []) {
  diary=diary.filter(active);reviewEntries=reviewEntries.filter(active);catalog=catalog.filter(active);
  const items = new Map(),ambiguous=new Set();for(const item of catalog.filter(row=>row.kind!=='series'))for(const name of new Set([item.title,item.originalTitle].filter(Boolean))){const id=key({...item,title:name});if(items.has(id)&&items.get(id)!==item){items.delete(id);ambiguous.add(id);}else if(!ambiguous.has(id))items.set(id,item);}
  const effective=row=>{const score=items.get(key(row))?.ratings?.personal;return validRating(score)?{...row,rating:Number(score)/2}:row;};
  const filmKey=row=>items.get(key(row))||key(row),distinct=new Map(),latestRated=new Map();
  for(const row of diary){
    const id=filmKey(row);distinct.set(id,row);const rated=effective(row);if(!Number.isFinite(rated.rating)||rated.rating<0||rated.rating>5)continue;
    const previous=latestRated.get(id);
    // Personal catalog score is current; otherwise latest dated rating wins, with export order breaking ties.
    if(!previous||String(rated.watchedDate||'')>=String(previous.watchedDate||''))latestRated.set(id,rated);
  }
  const diaryRatedTitles=latestRated.size;
  let catalogOnlyRatedTitles=0;
  const ratingMetadata=new Map();
  // Current explicit personal scores are evidence even without a diary import. Identity
  // must be unambiguous; a second watch or title alias never creates another vote.
  for(const item of catalog) {
    // A series has no film-diary counterpart: only its explicit catalog ID
    // establishes identity, even when title/year are shared with a film.
    const identity=item.kind==='series'&&item.id?`series|${item.id}`:item;
    if(item.kind==='series'?!item.id:items.get(key(item))!==item)continue;
    if(!validRating(item.ratings?.personal)||latestRated.has(identity))continue;
    const row={title:item.title,year:item.year,rating:Number(item.ratings.personal)/2};
    latestRated.set(identity,row);ratingMetadata.set(row,item);catalogOnlyRatedTitles++;
  }
  const rated = [...latestRated.values()];
  const metadataFor=row=>ratingMetadata.get(row)||items.get(key(row));
  const average = rated.length ? rated.reduce((sum,row)=>sum+row.rating,0)/rated.length : null;
  const distribution=Array.from({length:11},(_,i)=>({rating:i/2,count:rated.filter(row=>row.rating===i/2).length}));
  function ranking(field) {
    const groups=new Map();
    for(const row of rated) for(const value of values(metadataFor(row),field)) {
      const group=groups.get(value)||{name:value,count:0,sum:0,titles:[]};
      group.count++;group.sum+=row.rating; if(group.titles.length<8)group.titles.push(row.title);groups.set(value,group);
    }
    return [...groups.values()].map(row=>({...row,average:row.sum/row.count,confidence:row.count>=5?'supported':row.count>=2?'emerging':'single'})).sort((a,b)=>b.average-a.average||b.count-a.count||a.name.localeCompare(b.name)).slice(0,30);
  }
  function signals(field) {
    return ranking(field).map(group=>{
      const evidence=rated.filter(row=>values(metadataFor(row),field).includes(group.name)).map(row=>{
        const item=metadataFor(row),ratingSource=validRating(item?.ratings?.personal)?'catalog':'diary';return {title:row.title,year:row.year,rating:row.rating,ratingSource,...(ratingSource==='diary'&&row.watchedDate?{ratingDate:row.watchedDate}:{}),...(item?.id?{itemId:item.id}:{})};
      }).sort((a,b)=>String(a.title).localeCompare(String(b.title))||String(a.year).localeCompare(String(b.year))||String(a.itemId||'').localeCompare(String(b.itemId||'')));
      const delta=group.average-average;
      // Absolute high/low ratings remain visible, but contrary votes prevent a
      // unanimous preference claim even when the group average is positive.
      const positive=evidence.some(row=>row.rating>=3.5),negative=evidence.some(row=>row.rating<=2.5);
      const direction=positive&&negative?'mixed':group.average>=3.5&&delta>=-0.25?'likes':group.average<=2.5&&delta<=0.25?'dislikes':'mixed';
      return {name:group.name,direction,count:group.count,confidence:group.confidence,average:group.average,baseline:average,delta,evidence:evidence.slice(0,8)};
    });
  }
  const years=new Map(), months=new Map();
  for(const row of diary) {
    if(/^\d{4}$/.test(String(row.year))) {const decade=Math.floor(Number(row.year)/10)*10;years.set(decade,(years.get(decade)||0)+1);}
    if(/^\d{4}-\d{2}-\d{2}$/.test(row.watchedDate || '')) {const month=row.watchedDate.slice(0,7);months.set(month,(months.get(month)||0)+1);}
  }
  const uniqueReviews=new Map([...diary,...reviewEntries].filter(row=>String(row.review || '').trim()).map(row=>[reviewId(row),row]));
  const reviews=[...uniqueReviews.values()].map(row=>({id:reviewId(row),title:row.title,year:row.year,rating:effective(row).rating,date:row.watchedDate,text:String(row.review).slice(0,12000),tags:row.tags || []}));
  const lexicon={story:/\b(story|plot|script|senaryo|hikaye|oyku)\b/g,characters:/\b(character|characters|acting|actor|karakter|oyunculuk|oyuncu)\b/g,
    pace:/\b(pace|pacing|slow|tempo|ritim|yavas|sikici)\b/g,visuals:/\b(visual|cinematography|camera|gorsel|goruntu|sinematografi|kamera)\b/g,
    sound:/\b(sound|music|score|ses|muzik)\b/g,emotion:/\b(emotion|emotional|moving|duygu|duygusal|etkileyici)\b/g};
  const mentions=ASPECTS.map(aspect=>({aspect,count:reviews.filter(row=>fold(row.text).match(lexicon[aspect])).length,
    evidence:reviews.filter(row=>fold(row.text).match(lexicon[aspect])).slice(0,6).map(row=>({id:row.id,title:row.title,text:row.text.slice(0,600)}))}));
  const supplied=Object.keys(saved.weights || {}).length>0;
  const result={titles:distinct.size,watchEvents:diary.length,ratingPolicy:'current-personal-otherwise-latest-dated',rated:rated.length,average,distribution,genres:ranking('genres'),directors:ranking('directors'),
    decades:[...years].sort((a,b)=>b[1]-a[1]),months:[...months].sort((a,b)=>a[0].localeCompare(b[0])).slice(-24),
    favorites:[...rated].sort((a,b)=>b.rating-a.rating).slice(0,12).map(row=>({title:row.title,year:row.year,rating:row.rating})),
    metadataMatched:[...distinct.values()].filter(row=>{const item=items.get(key(row));return item&&((item.genres||[]).length||(item.directors||[]).length);}).length,reviews:reviews.slice(-10000).reverse(),reviewCount:reviews.length,mentions,
    preferencesConfigured:supplied,preferences:effectivePreferences(saved),analysis:saved.analysis || null };
  const metadataMatched=rated.filter(row=>values(metadataFor(row),'genres').length||values(metadataFor(row),'directors').length).length;
  result.preferencesRevision=preferencesRevision(saved);
  result.evidenceRevision=hash({rated:rated.map(row=>({title:row.title,year:row.year,rating:row.rating,itemId:metadataFor(row)?.id,genres:values(metadataFor(row),'genres'),directors:values(metadataFor(row),'directors')})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),reviews:reviewCorpus([...diary,...reviewEntries])});
  const genresMatched=rated.filter(row=>values(metadataFor(row),'genres').length).length,directorsMatched=rated.filter(row=>values(metadataFor(row),'directors').length).length;
  result.coverage={genresMatched,directorsMatched,missingGenres:rated.length-genresMatched,missingDirectors:rated.length-directorsMatched,ratedTitles:rated.length,diaryRatedTitles,catalogOnlyRatedTitles,metadataMatched,missingMetadata:rated.length-metadataMatched,
    ambiguousTitles:new Set([...distinct.values(),...catalog].filter(row=>ambiguous.has(key(row))).map(key)).size,reviewCount:reviews.length,sampleSize:rated.length,
    limitations:[...(rated.length<5?['small-rating-sample']:[]),...(rated.length>metadataMatched?['missing-or-ambiguous-metadata']:[]),'ratings-are-not-predictions','review-mentions-are-not-sentiment']};
  result.signals={genres:signals('genres'),directors:signals('directors')};
  result.analysisState='none';
  if(saved.analysis){result.analysisState='stale';try{validateAnalysis(saved.analysis,[...diary,...reviewEntries]);if(saved.analysis.corpusRevision===corpusRevision([...diary,...reviewEntries]))result.analysisState='current';}catch{ /* Keep historical analysis visible, but never label invalid quotes current. */ }}
  result.observedTitles=[...distinct.values()].map(row=>({title:row.title,year:row.year,...(items.get(key(row))?.id?{itemId:items.get(key(row)).id}:{})}));
  result.recommendations=recommend(catalog,result);
  const quiz=require('./taste-quiz');result.quiz=quiz.restore(saved.quiz);result.quizPicks=result.quiz?quiz.recommend(result.quiz,catalog,result):[];return result;
}
function validateAnalysis(raw, diary) {
  const reviews=new Map(reviewCorpus(diary));
  if(!raw || raw.version!==1 || !Array.isArray(raw.insights) || raw.insights.length>12)throw Error('Invalid review analysis.');
  const insights=raw.insights.map(row=>{
    if(!ASPECTS.includes(row.aspect)||!['likes','dislikes','mixed'].includes(row.direction)||!Array.isArray(row.evidence)||!row.evidence.length)throw Error('Every insight needs a supported aspect and review evidence.');
    const evidence=row.evidence.slice(0,8).map(e=>{const quote=String(e.quote || '').trim(),source=reviews.get(e.id);if(!source||quote.length<8||quote.length>800||!source.includes(quote))throw Error('A quoted review could not be verified.');return {id:e.id,quote};});
    return {aspect:row.aspect,direction:row.direction,reason:String(row.reason||'').slice(0,1200),evidence};
  });
  return {version:1,summary:String(raw.summary||'').slice(0,4000),insights,createdAt:new Date().toISOString(),corpusRevision:corpusRevision(diary)};
}
// These are metadata matches, not predicted ratings. Unknown runtime cannot
// satisfy a requested duration limit. Exploration admits neutral matches only.
function recommend(catalog, taste, options = {}) {
  const limit=Math.max(0,Math.min(6,Number.isFinite(Number(options.limit))?Math.floor(Number(options.limit)):6));
  const maxDuration=Number(options.maxDuration),hasDuration=Number.isFinite(maxDuration)&&maxDuration>0;
  const seenIds=new Set((taste.observedTitles||[]).map(row=>row.itemId).filter(Boolean));
  const seenKeys=new Set((taste.observedTitles||[]).map(key));
  const candidates=new Map();
  for(const item of catalog) {
    if(!item.id||!['film','series'].includes(item.kind)||options.kind&&item.kind!==options.kind||!active(item))continue;
    if(validRating(item.ratings?.personal)||['watched','completed','watching'].includes(item.watchStatus)||item.progress?.completed||Number(item.progress?.position)>0||seenIds.has(item.id)||item.kind!=='series'&&(seenKeys.has(key(item))||item.originalTitle&&seenKeys.has(key({...item,title:item.originalTitle}))))continue;
    const personal=item.personalMedia||{},resume=personal.effectiveResume||item.effectiveResume;
    if(personal.reaction==='dislike'||['watched','completed','watching'].includes(personal.watchStatus)||resume?.completed||Number(resume?.positionSeconds)>0)continue;
    if(Array.isArray(item.episodes)&&item.episodes.some(episode=>['watched','completed','watching'].includes(episode.watchStatus)||episode.progress?.completed||Number(episode.progress?.position)>0))continue;
    if(hasDuration&&(!(Number(item.runtime)>0)||Number(item.runtime)>maxDuration))continue;
    const matched=['genres','directors'].flatMap(field=>(taste.signals?.[field]||[]).filter(signal=>values(item,field).includes(signal.name)).map(signal=>({...signal,field})));
    const positive=matched.filter(signal=>signal.direction==='likes');
    const neutral=matched.filter(signal=>signal.direction==='mixed');
    const basis=positive.length?positive:options.exploration===true?neutral:[];
    if(!basis.length)continue;
    const negative=matched.filter(signal=>signal.direction==='dislikes');
    const strength=signal=>signal.confidence==='supported'?3:signal.confidence==='emerging'?2:1;
    const score=basis.reduce((sum,signal)=>sum+strength(signal),0)-negative.reduce((sum,signal)=>sum+strength(signal),0);
    const confidence=basis.some(signal=>signal.confidence==='supported')?'supported':basis.some(signal=>signal.confidence==='emerging')?'emerging':'single';
    const evidence=[...new Map(basis.flatMap(signal=>signal.evidence).map(row=>[row.itemId||key(row),row])).values()].slice(0,8);
    const result={itemId:item.id,title:item.title,year:item.year,kind:item.kind,runtime:Number(item.runtime)>0?Number(item.runtime):null,reasonDetails:basis.map(signal=>({kind:signal.field==='genres'?'genre':'director',name:signal.name,count:signal.count,average:signal.average,delta:signal.delta,direction:signal.direction,confidence:signal.confidence})),reasons:basis.map(signal=>`${signal.field}:${signal.name}:${signal.direction}`),evidence,confidence,
      limitations:['metadata-match-not-predicted-enjoyment',...(taste.preferencesConfigured||(taste.preferences?.avoid||[]).length?['aspect-priorities-not-scored']:[]),...(confidence!=='supported'?['limited-rating-evidence']:[]),...(!values(item,'genres').length||!values(item,'directors').length?['incomplete-candidate-metadata']:[]),...negative.map(signal=>`contrary-${signal.field}:${signal.name}`),...(!positive.length?['exploratory-mixed-evidence']:[])]};
    candidates.set(item.id,{score,result});
  }
  return [...candidates.values()].sort((a,b)=>b.score-a.score||String(a.result.title).localeCompare(String(b.result.title))||String(a.result.year).localeCompare(String(b.result.year))||String(a.result.itemId).localeCompare(String(b.result.itemId))).slice(0,limit).map(row=>row.result);
}
module.exports={effectivePreferences,ASPECTS,profile,preferences,preferencesRevision,recommend,validateAnalysis,reviewId};
