const assert=require('node:assert/strict');
const {reconcile,issues}=require('../src/browser-subtitle-review');
const base={start:1,end:3,text:'Kaynak'},edited={start:1.2,end:3.2,text:'Düzeltme'};
const record={cueId:'one',base,edited};
assert.equal(reconcile([{...base,cueId:'one'}],[record]).cues[0].text,'Düzeltme');
const changed=reconcile([{...base,text:'Yeni kaynak',cueId:'one'}],[record]);
assert.equal(changed.conflicts.length,1);assert.equal(changed.conflicts[0].incoming.text,'Yeni kaynak');
assert.equal(changed.cues[0].start,1.2);
assert.equal(reconcile([edited],[record]).conflicts.length,0);
assert.equal(reconcile([{start:9,end:11,text:'Başka satır'}],[record]).conflicts[0].index,-1);
assert.equal(reconcile([base,base],[record]).cues[0].text,'Kaynak');
assert.equal(reconcile([base],{bad:true}).cues[0].text,'Kaynak');
assert.equal(reconcile([base],[{base,edited:{...edited,start:NaN}}]).cues[0].text,'Kaynak');
const warnings=issues([{channel:'primary',role:'source',cues:[
 {start:0,end:2,text:'x'.repeat(60)},{start:1,end:3,text:'İç içe'},{start:5,end:6,text:'Eksik'}]},
 {channel:'secondary',role:'translation',cues:[{start:0,end:3,text:'Çeviri'}]}]);
assert(warnings[0].reasons.some(x=>x.includes('Hızlı')));
assert(warnings[1].reasons.some(x=>x.includes('çakışıyor')));
assert.deepEqual(warnings[2].reasons,['Çeviri eksik']);
assert.equal(issues([{channel:'primary',role:'source',cues:[base]}]).length,0);
const many=Array.from({length:20000},(_,i)=>({start:i*2,end:i*2+1,text:'Kısa'}));
assert.equal(issues([{channel:'primary',role:'source',cues:many},{channel:'secondary',role:'translation',cues:many}]).length,0);
const manyEdits=many.slice(0,1000).map(base=>({base,edited:{...base,text:'Düzeltilmiş'}}));
assert.equal(reconcile(many,manyEdits).cues.filter(cue=>cue.text==='Düzeltilmiş').length,1000);
assert.equal(reconcile([base],[record,record]).conflicts.length,1);
console.log('Kaynak yenileme, çakışma, belirsiz eşleme, bozuk kayıt ve 20.000 satır kalite denetimi geçti.');
