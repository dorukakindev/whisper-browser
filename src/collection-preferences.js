'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{atomicWriteFileSync}=require('./fsync-utils');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const QUESTIONS=[
 {id:'focus',title:['What draws you in?','Seni ne içine çeker?'],choices:[['characters','Characters & relationships','Karakterler ve ilişkiler',['genre:drama','genre:romance']],['adventure','Adventure & discovery','Macera ve keşif',['genre:adventure']],['mystery','Mystery & investigation','Gizem ve araştırma',['genre:mystery']]]},
 {id:'world',title:['Which world appeals to you?','Hangi dünya ilgini çeker?'],choices:[['fantasy','Fantasy','Fantastik',['genre:fantasy']],['science','Science fiction','Bilim kurgu',['genre:sci-fi']],['everyday','Everyday life','Gündelik yaşam',['genre:slice of life']]]},
 {id:'tone',title:['Which tone do you prefer?','Hangi tonu tercih edersin?'],choices:[['warm','Warmth & humour','Sıcaklık ve mizah',['genre:comedy']],['tension','Tension & psychology','Gerilim ve psikoloji',['genre:psychological','genre:thriller']],['action','Action','Aksiyon',['genre:action']]]},
 {id:'avoid',title:['Anything you prefer to avoid?','Kaçınmayı tercih ettiğin bir tür var mı?'],choices:[['horror','Horror','Korku',['genre:horror']],['romance','Romance','Romantizm',['genre:romance']],['none','No specific avoidance','Özel bir kaçınma yok',[]]]}
];
function create({root,rows}){
 const file=()=>path.join(typeof root==='function'?root():root,'collection-preferences.json');
 function read(){if(!fs.existsSync(file()))return {version:1,reasons:{},quizzes:{}};if(fs.statSync(file()).size>2000000)throw Error('Preference file limit exceeded. / Tercih dosyası sınırı aşıldı.');const d=JSON.parse(fs.readFileSync(file(),'utf8'));if(d.version!==1||!d.reasons||!d.quizzes)throw Error('Invalid preferences. / Geçersiz tercihler.');return d;}
 const target=id=>{const r=rows().find(r=>r.id===id);if(!r||!['anime','manga'].includes(r.domain))throw Error('Choose an anime/manga title. / Anime/manga yapımı seç.');return r;};
 const fields=r=>Object.keys(require('./personal-recommendations').features(r)).filter(k=>/^(genre|theme):/.test(k));
 function snapshot({id,domain}={}){const d=read(),r=id?target(id):null;domain=r?.domain||domain;if(!['anime','manga'].includes(domain))throw Error('Choose a media pool. / Medya havuzu seç.');const old=r?d.reasons[id]:null,reason=old&&old.domain===r.domain&&old.providerId===r.providerId?old:null;return {revision:hash(d),recordRevision:r?require('./personal-collection').hash(r):null,domain,reason,quiz:d.quizzes[domain]||null,questions:QUESTIONS,features:r?fields(r):[],labels:r?Object.fromEntries([...(r.metadata?.genres||[]).map(name=>['genre:'+String(name).normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en').trim(),name]),...(r.metadata?.themes||[]).filter(t=>t?.name).map(t=>['theme:'+t.name.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en').trim(),t.name])]):{}};}
 function save(input){const d=read();if(input.revision!==hash(d))throw Error('Preferences changed; reload. / Tercihler değişti; yeniden yükle.');
  if(input.action==='reason'){
   const r=target(input.id);if(require('./personal-collection').hash(r)!==input.recordRevision)throw Error('Title changed; reload. / Yapım değişti; yeniden yükle.');
   if(input.value===null)delete d.reasons[r.id];else{const v=input.value;if(!v||typeof v!=='object'||Object.keys(v).some(k=>!['liked','disliked','features'].includes(k))||!Array.isArray(v.features)||v.features.length>30)throw Error('Invalid reasons. / Geçersiz nedenler.');
    const allowed=new Set(fields(r)),seen=new Set();for(const f of v.features){if(!f||!allowed.has(f.key)||!['like','dislike'].includes(f.direction)||seen.has(f.key))throw Error('Choose each known feature once. / Her mevcut özelliği bir kez seç.');seen.add(f.key);}
    for(const key of ['liked','disliked'])if(typeof v[key]!=='string'||v[key].length>1000)throw Error('Use at most 1000 characters. / En fazla1000karakter kullan.');
    d.reasons[r.id]={id:r.id,providerId:r.providerId,domain:r.domain,title:r.title,liked:v.liked.trim(),disliked:v.disliked.trim(),features:v.features.map(f=>({key:f.key,direction:f.direction})),at:Date.now()};}
  }else if(input.action==='quiz'){
   if(!['anime','manga'].includes(input.domain))throw Error('Choose a media pool. / Medya havuzu seç.');
   if(input.value===null)delete d.quizzes[input.domain];else{const v=input.value;if(!v||v.version!==1||!Array.isArray(v.answers)||v.answers.length!==QUESTIONS.length||!v.answers.some(Boolean)||v.answers.some((a,i)=>a!==null&&!QUESTIONS[i].choices.some(c=>c[0]===a)))throw Error('Invalid quiz choices. / Geçersiz zevk yanıtları.');d.quizzes[input.domain]={version:1,answers:[...v.answers],at:Date.now()};}
  }else throw Error('Unsupported preference action.');
  if(Object.keys(d.reasons).length>2000)throw Error('Preference limit reached.');atomicWriteFileSync(file(),JSON.stringify(d));return snapshot(input);
 }
 function signals(domain,excludeId){const d=read(),vector={},evidence=[],add=(key,value,origin)=>{vector[key]=(vector[key]||0)+value;evidence.push({...origin,key,direction:value>0?'like':'dislike'});};
  const quiz=d.quizzes[domain];if(quiz)quiz.answers.forEach((a,i)=>{const c=QUESTIONS[i]?.choices.find(c=>c[0]===a);for(const key of c?.[3]||[])add(key,i===3?-1:1,{source:'quiz',title:c[1],titleTr:c[2]});});
  const current=new Map(rows().map(r=>[r.id,r]));for(const r of Object.values(d.reasons)){const live=current.get(r.id);if(r.id===excludeId||r.domain!==domain||live?.domain!==domain||live.providerId!==r.providerId)continue;for(const f of r.features||[])add(f.key,f.direction==='like'?1:-1,{source:'reason',id:r.id,title:live.title});}
  return {vector,evidence:evidence.slice(0,50),revision:hash(d),quiz:quiz||null};
 }
 return {snapshot,save,signals};
}
module.exports={create,QUESTIONS};
