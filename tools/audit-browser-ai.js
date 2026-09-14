'use strict';
// Controlled scene acceptance rules; this is not a semantic model judge.
const fold=text=>String(text||'').normalize('NFKC').toLocaleLowerCase('tr-TR');
function evaluateScene(scene,answer){
 const text=String(answer||''),normalized=fold(text),failures=[];
 const evidence=scene.evidence||[],ids=new Set(evidence.map(row=>row.id));
 const cited=[...text.matchAll(/\[(T\d+)\]/g)].map(match=>match[1]);
 if(!text.trim())failures.push('Boş yanıt');
 for(const id of cited)if(!ids.has(id))failures.push('Bağlam dışı kaynak: '+id);
 if(scene.requireCitation&&!cited.some(id=>ids.has(id)))failures.push('Kaynak gösterilmedi');
 for(const term of scene.required||[])if(!normalized.includes(fold(term)))failures.push('Beklenen ifade eksik: '+term);
 for(const term of scene.forbidden||[])if(normalized.includes(fold(term)))failures.push('Desteksiz veya tutarsız ifade: '+term);
 for(const time of text.match(/\b(?:\d{1,2}:)?[0-5]?\d:[0-5]\d\b/g)||[]){
  if(!evidence.some(row=>row.time===time))failures.push('Bağlam dışı zaman: '+time);
 }
 return {id:scene.id,passed:failures.length===0,failures};
}
function evaluate(scenes,answers){
 const rows=scenes.map(scene=>evaluateScene(scene,answers[scene.id]));
 return {scope:'Kontrollü sahne kuralları; semantik doğruluk garantisi değildir.',total:rows.length,passed:rows.filter(row=>row.passed).length,rows};
}
module.exports={evaluate,evaluateScene};
if(require.main===module){
 const fs=require('node:fs');
 const [scenesPath,answersPath]=process.argv.slice(2);
 if(!scenesPath||!answersPath){console.error('Kullanım: node tools/audit-browser-ai.js sahneler.json yanıtlar.json');process.exit(2);}
 const report=evaluate(JSON.parse(fs.readFileSync(scenesPath,'utf8')),JSON.parse(fs.readFileSync(answersPath,'utf8')));
 console.log(JSON.stringify(report,null,2));process.exitCode=report.passed===report.total?0:1;
}
