'use strict';
const { createHash } = require('node:crypto');
const ASPECTS = ['story','characters','pace','visuals','sound','emotion'];
const fold = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('tr').replace(/ı/g,'i');
const key = row => fold(row.title).trim()+'|'+(row.year || '');
function reviewId(row) { return createHash('sha256').update(key(row)+'|'+(row.watchedDate || '')+'|'+(row.review || '')).digest('hex').slice(0,20); }
function preferences(raw = {}) {
  return { weights:Object.fromEntries(ASPECTS.map(name=>[name,Math.max(0,Math.min(5,Number(raw.weights?.[name]) || 0))])),
    avoid:Array.isArray(raw.avoid)?[...new Set(raw.avoid.filter(name=>ASPECTS.includes(name)))]:[],
    note:String(raw.note || '').slice(0,2000) };
}
function profile(diary, catalog, saved = {}, reviewEntries = []) {
  const items = new Map(),ambiguous=new Set();for(const item of catalog.filter(row=>row.kind!=='series'))for(const name of new Set([item.title,item.originalTitle].filter(Boolean))){const id=key({...item,title:name});if(items.has(id)&&items.get(id)!==item){items.delete(id);ambiguous.add(id);}else if(!ambiguous.has(id))items.set(id,item);}
  const effective=row=>{const score=items.get(key(row))?.ratings?.personal;return score!==null&&score!==undefined&&score!==''&&Number.isFinite(Number(score))&&Number(score)>=0&&Number(score)<=10?{...row,rating:Number(score)/2}:row;};
  const filmKey=row=>items.get(key(row))||key(row),distinct=new Map(),latestRated=new Map();
  for(const row of diary){
    const id=filmKey(row);distinct.set(id,row);const rated=effective(row);if(!Number.isFinite(rated.rating)||rated.rating<0||rated.rating>5)continue;
    const previous=latestRated.get(id);
    // Personal catalog score is current; otherwise latest dated rating wins, with export order breaking ties.
    if(!previous||String(rated.watchedDate||'')>=String(previous.watchedDate||''))latestRated.set(id,rated);
  }
  const rated = [...latestRated.values()];
  const average = rated.length ? rated.reduce((sum,row)=>sum+row.rating,0)/rated.length : null;
  const distribution=Array.from({length:11},(_,i)=>({rating:i/2,count:rated.filter(row=>row.rating===i/2).length}));
  function ranking(field) {
    const groups=new Map();
    for(const row of rated) for(const value of items.get(key(row))?.[field] || []) {
      const group=groups.get(value)||{name:value,count:0,sum:0,titles:[]};
      group.count++;group.sum+=row.rating; if(group.titles.length<8)group.titles.push(row.title);groups.set(value,group);
    }
    return [...groups.values()].map(row=>({...row,average:row.sum/row.count,confidence:row.count>=5?'supported':row.count>=2?'emerging':'single'})).sort((a,b)=>b.average-a.average||b.count-a.count).slice(0,30);
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
    preferencesConfigured:supplied,preferences:preferences(supplied?saved:{weights:Object.fromEntries(ASPECTS.map(name=>[name,3]))}),analysis:saved.analysis || null };
  const quiz=require('./taste-quiz');result.quiz=quiz.restore(saved.quiz);result.quizPicks=result.quiz?quiz.recommend(result.quiz,catalog,result):[];return result;
}
function validateAnalysis(raw, diary) {
  const reviews=new Map(diary.filter(row=>row.review).map(row=>[reviewId(row),String(row.review)]));
  if(!raw || raw.version!==1 || !Array.isArray(raw.insights) || raw.insights.length>12)throw Error('Invalid review analysis.');
  const insights=raw.insights.map(row=>{
    if(!ASPECTS.includes(row.aspect)||!['likes','dislikes','mixed'].includes(row.direction)||!Array.isArray(row.evidence)||!row.evidence.length)throw Error('Every insight needs a supported aspect and review evidence.');
    const evidence=row.evidence.slice(0,8).map(e=>{const quote=String(e.quote || '').trim(),source=reviews.get(e.id);if(!source||quote.length<8||quote.length>800||!source.includes(quote))throw Error('A quoted review could not be verified.');return {id:e.id,quote};});
    return {aspect:row.aspect,direction:row.direction,reason:String(row.reason||'').slice(0,1200),evidence};
  });
  return {version:1,summary:String(raw.summary||'').slice(0,4000),insights,createdAt:new Date().toISOString()};
}
module.exports={ASPECTS,profile,preferences,validateAnalysis,reviewId};
