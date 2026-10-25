(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TasteQuiz=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const questions=[
    {id:'story',title:['Which story draws you in?','Hangi hikâye seni içine çeker?'],choices:[['mystery','A mystery to piece together','Parçalarını birleştireceğim bir gizem',['Mystery','Thriller','Gizem','Gerilim']],['human','An intimate human story','İçten bir insan hikâyesi',['Drama','Dram']]]},
    {id:'pace',title:['What pace feels right tonight?','Bu akşam nasıl bir tempo istersin?'],choices:[['energy','Momentum and adventure','Hareket ve macera',['Action','Adventure','Aksiyon','Macera']],['quiet','Room to observe and reflect','Gözlemlemeye ve düşünmeye alan',['Drama','Documentary','Dram','Belgesel']]]},
    {id:'world',title:['Where would you like to go?','Hangi dünyaya gitmek istersin?'],choices:[['imagined','An imagined world','Hayal edilmiş bir dünya',['Science Fiction','Fantasy','Bilim-Kurgu','Fantastik']],['real','A story rooted in real life','Gerçek hayata dayanan bir hikâye',['Documentary','History','Belgesel','Tarih']]]},
    {id:'feeling',title:['Which feeling are you looking for?','Nasıl hissetmek istersin?'],choices:[['light','Warmth and laughter','Sıcaklık ve kahkaha',['Comedy','Family','Komedi','Aile']],['edge','Tension and unease','Gerilim ve tekinsizlik',['Thriller','Horror','Gerilim','Korku']]]},
    {id:'connection',title:['Which connection interests you?','Hangi ilişki ilgini çeker?'],choices:[['love','Love and relationships','Aşk ve ilişkiler',['Romance','Drama','Romantik','Dram']],['conflict','Loyalties under pressure','Baskı altındaki bağlılıklar',['Crime','War','Suç','Savaş']]]},
    {id:'expression',title:['Which kind of expression appeals?','Hangi anlatım sana yakın?'],choices:[['music','Stories carried by music','Müziğin taşıdığı hikâyeler',['Music','Müzik']],['animation','The freedom of animation','Animasyonun özgür dünyası',['Animation','Animasyon']]]}
  ];
  const fold=v=>String(v||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('tr').replace(/ı/g,'i').trim();
  function validate(raw){if(!raw||raw.version!==1||!Array.isArray(raw.answers)||raw.answers.length!==questions.length)throw Error('Invalid taste quiz / Geçersiz zevk testi');const answers=raw.answers.map((value,i)=>{if(value===null)return null;if(!questions[i].choices.some(c=>c[0]===value))throw Error('Invalid quiz answer / Geçersiz test yanıtı');return value;});if(!answers.some(Boolean))throw Error('Choose at least one answer / En az bir yanıt seç');return {version:1,answers};}
  function restore(raw){try{return validate(raw);}catch{return null;}}
  function recommend(raw,items,profile={}){
    const quiz=validate(raw),votes=new Map();quiz.answers.forEach((answer,i)=>{const c=questions[i].choices.find(c=>c[0]===answer);for(const genre of c?.[3]||[])votes.set(fold(genre),(votes.get(fold(genre))||0)+1);});
    const history=new Map((profile.genres||[]).filter(g=>g.count>=2&&g.average>=3.5).map(g=>[fold(g.name),g]));
    return items.filter(item=>['film','series'].includes(item.kind)&&!['watched','completed'].includes(item.watchStatus)).map(item=>{
      const genres=[...new Set((item.genres||[]).filter(g=>votes.has(fold(g))))];
      const supported=genres.filter(g=>history.has(fold(g)));const score=genres.reduce((n,g)=>n+votes.get(fold(g)),0)+supported.length*.25;
      return {id:item.id,title:item.title,year:item.year,genres,supported,score};
    }).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)).slice(0,6);
  }
  return Object.freeze({questions,validate,restore,recommend});
});
