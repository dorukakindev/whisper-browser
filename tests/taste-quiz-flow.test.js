'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),quiz=require('../src/taste-quiz'),{profile}=require('../src/media-taste');
test('quiz is bounded, rejects forged answers and combines only supported rated genres',()=>{
  const answers={version:1,answers:['human',null,null,null,null,null]};assert.throws(()=>quiz.validate({...answers,answers:[] }));assert.throws(()=>quiz.validate({...answers,answers:['invented',null,null,null,null,null]}));assert.throws(()=>quiz.validate({version:1,answers:Array(6).fill(null)}));
  const items=[{id:'a',kind:'film',title:'Drama',genres:['Dram']},{id:'b',kind:'film',title:'Seen',genres:['Dram'],watchStatus:'completed'},{id:'c',kind:'film',title:'Other',genres:['Horror']}];
  const picks=quiz.recommend(answers,items,{genres:[{name:'Dram',count:1,average:5}]});assert.deepEqual(picks.map(p=>p.id),['a']);assert.deepEqual(picks[0].supported,[]);
  assert.deepEqual(quiz.recommend(answers,items,{genres:[{name:'Dram',count:2,average:4} ]})[0].supported,['Dram']);
  const saved={weights:{story:5},note:'My choice',quiz:answers,analysis:{summary:'Kept'}};const p=profile([],items,saved);assert.equal(p.preferences.weights.story,5);assert.equal(p.preferences.note,'My choice');assert.equal(p.analysis.summary,'Kept');assert.equal(p.quizPicks.length,1);assert.equal(profile([],[],{quiz:{broken:true}}).quiz,null);
});
test('quiz saving preserves unsaved manual controls and cancel sends nothing',async()=>{
  const {JSDOM}=require('jsdom'),fs=require('node:fs'),dom=new JSDOM('<body><main id="root"></main></body>',{runScripts:'outside-only'}),w=dom.window,calls=[];
  try{w.UiLocale={get:()=> 'en'};w.syncBrowserOcclusion=()=>{};w.TasteQuiz=quiz;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};const p=profile([],[],{});w.api={mediaShelf:async input=>{calls.push(input);return {ok:true,taste:{...p,quiz:input.quiz,quizPicks:[]}};}};
    w.eval(fs.readFileSync(require.resolve('../src/renderer/media-taste-ui'),'utf8'));w.MediaTasteUI.mount(w.document.getElementById('root'),p);const note=w.document.querySelector('[name=taste-note]');note.value='Do not lose this draft';
    w.document.querySelector('[data-taste-quiz]').click();await new Promise(r=>setImmediate(r));w.document.querySelector('.mt-quiz header button').click();await new Promise(r=>setImmediate(r));assert.equal(calls.length,0);
    w.document.querySelector('[data-taste-quiz]').click();await new Promise(r=>setImmediate(r));const radio=w.document.querySelector('.mt-quiz input');radio.checked=true;radio.dispatchEvent(new w.Event('change'));
    for(let i=0;i<6;i++){w.document.querySelector('.mt-quiz footer button:last-child').click();await new Promise(r=>setImmediate(r));}
    assert.equal(calls.length,1);assert.equal(calls[0].action,'taste-quiz');assert.equal(calls[0].quiz.answers[0],'mystery');assert.equal(w.document.querySelector('[name=taste-note]'),note);assert.equal(note.value,'Do not lose this draft');assert(!w.document.querySelector('.mt-quiz'));assert(w.document.querySelector('.mt-quiz-summary'));
  }finally{w.close();}
});
test('search retains query, results and scroll under a title detail dialog',async()=>{
  const {JSDOM}=require('jsdom'),fs=require('node:fs'),dom=new JSDOM('<body></body>',{runScripts:'outside-only'}),w=dom.window;
  try{w.UiLocale={get:()=> 'en'};w.syncBrowserOcclusion=()=>{};w.MediaSearchModel=require('../src/renderer/media-search-model');w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};let opened;
    w.api={mediaCatalog:async()=>({ok:true,items:[{id:'film',title:'Keep me'}]}),mediaShelf:async()=>({ok:true,books:[],music:[]}),listWatchLibrary:async()=>[]};w.MediaTitleUI={open:async id=>{opened=id;}};
    w.eval(fs.readFileSync(require.resolve('../src/renderer/media-search-ui'),'utf8'));await w.MediaSearchUI.open('Keep');const d=w.document.querySelector('.mhs-dialog');d.scrollTop=321;d.querySelector('.mhs-row').click();await new Promise(r=>setImmediate(r));assert.equal(opened,'film');assert(d.open);assert.equal(d.scrollTop,321);assert.equal(d.querySelector('input').value,'Keep');
  }finally{w.close();}
});
test('quiz IPC persists across reloads without replacing preferences, ratings or reviews',async()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'quiz-flow-')),handlers=new Map();
  try{const file=path.join(dir,'media-shelf.json'),original={version:1,music:[],books:[],stations:[],podcasts:[],playlists:[],diary:[{title:'Kept',rating:4}],reviews:[{title:'Kept',review:'My own review'}],tasteProfile:{weights:{story:5},note:'My saved note'}};fs.writeFileSync(file,JSON.stringify(original));
    require('../src/media-shelf-service').registerMediaShelf({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},authorized:e=>e.allowed,userData:()=>dir,catalogStore:()=>({list:()=>[]})});const handle=handlers.get('media-shelf:request'),q={version:1,answers:['human',null,null,null,null,null]};
    assert.equal((await handle({allowed:false},{action:'taste-quiz',quiz:q})).ok,false);assert.equal((await handle({allowed:true},{action:'taste-quiz',quiz:{version:1,answers:[]}})).ok,false);assert.deepEqual(JSON.parse(fs.readFileSync(file)),original);
    assert((await handle({allowed:true},{action:'taste-quiz',quiz:q})).ok);assert.deepEqual((await handle({allowed:true},{action:'list'})).taste.quiz,q);const saved=JSON.parse(fs.readFileSync(file));assert.deepEqual(saved.diary,original.diary);assert.deepEqual(saved.reviews,original.reviews);assert.equal(saved.tasteProfile.weights.story,5);assert.equal(saved.tasteProfile.note,'My saved note');
    assert((await handle({allowed:true},{action:'taste-quiz',quiz:null})).ok);assert.equal((await handle({allowed:true},{action:'list'})).taste.quiz,null);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
