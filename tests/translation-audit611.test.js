'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const L=require('../src/subtitle-sentence-layout'),{BrowserTranslationScheduler,assembleCueSentences}=require('../src/browser-translation-scheduler');
const corpus=JSON.parse(fs.readFileSync(path.join(__dirname,'../backend/testdata/translation_gate_shared611.json'),'utf8').replace(/^\uFEFF/,''));
test('browser gate shares explicit polarity, modality, numeric and markup acceptance cases',()=>{for(const row of corpus)assert.equal(L.translationBlockingIssues(row.source,row.target).length===0,row.accept,JSON.stringify(row));});
test('number compatibility breaker never accepts polarity or stripped markup',async()=>{
 const texts=['I have 1 apples.','I have 2 apples.','I have 3 apples.','I have 4 apples.',"I don't like it.",'<i>Come here.</i>'];
 const scheduler=new BrowserTranslationScheduler({maxConcurrent:1,retryBaseMs:1,retryMaxMs:2,context:{targetLanguage:'tr',sourceLanguage:'en'},translate:async sentence=>({text:sentence.text.includes('apples')?'Elmalarım var.':sentence.text.includes('like')?'Bunu severim.':'Buraya gel.'})});
 try{scheduler.setSentences(assembleCueSentences(texts.map((text,i)=>({id:'c'+i,start:i*10,end:i*10+2,text})),{sourceComplete:true}));scheduler.completeAll();await scheduler.whenIdle();assert.equal(scheduler.qualityAutoLenient,true);assert.equal(scheduler.results.size,4);assert.equal(scheduler.failures.size,2);for(const result of scheduler.results.values())assert.equal(result.text,'Elmalarım var.');}finally{scheduler.cancelAll();}
});
