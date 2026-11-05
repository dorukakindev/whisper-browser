"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
function mount(t,{untimed=false}={}){
 const dom=new JSDOM('<div id="host"></div>',{url:'https://test.invalid',pretendToBeVisual:true,runScripts:'outside-only'}),w=dom.window;
 w.UiLocale={get:()=> 'tr'};w.matchMedia=()=>({matches:true});w.Element.prototype.scrollTo=function(value){this.scrollTop=value.top;};
 let time=2;const commands=[];const rows=untimed?[{id:'text',start:0,end:0,timed:false,src:'Yayıncı metni',trs:[],unc:[],words:null}]:[{id:'a',start:0,end:10,timed:true,src:'A source sentence',trs:['Birinci çeviri','İkinci çeviri'],unc:[],words:null},{id:'b',start:10,end:20,timed:true,src:'The next sentence',trs:[],unc:[],words:null}];
 const adapter={caps:{loop:true},identity:()=> 'same-source',info:()=>({title:'Bölüm',langs:{src:'en',tr:'tr'}}),state:()=>({time,duration:30,paused:true,rate:1,rows,rev:'r1',untimed,canSeek:true}),cmd:(...args)=>{commands.push(args);return Promise.resolve({ok:args[0]!=='loop',code:'busy'});},panel:()=>({sections:[],job:{state:'idle'}})};
 w.eval(fs.readFileSync(require.resolve('../src/renderer/sahne.js'),'utf8'));
 const sh=new w.Sahne(w.document.getElementById('host'),adapter,{mode:'podcast',intro:false});
 t.after(()=>{sh.destroy();w.close();});return {w,sh,commands,setTime:value=>time=value};
}
test('manual transcript browsing remains stopped; return follows without seeking',t=>{
 const f=mount(t),scroll=f.sh.q('[data-r=scroll]');scroll.dispatchEvent(new f.w.WheelEvent('wheel',{deltaY:-100}));assert.equal(f.sh.s.follow,false);
 f.setTime(12);f.sh.tick();assert.equal(f.sh.s.follow,false);assert.equal(f.sh.cur,1);
 f.sh.q('[data-a=follow]').click();assert.equal(f.sh.s.follow,true);assert.equal(f.commands.length,0);
 assert.equal(f.sh.rows[0].trs.length,2);
});
test('untimed content is readable without a timestamp, active line, or seek command',t=>{
 const f=mount(t,{untimed:true}),row=f.sh.q('[data-i="0"]');assert(row.textContent.includes('Yayıncı metni'));assert.equal(row.hasAttribute('tabindex'),false);assert.equal(row.querySelector('.at'),null);assert.equal(f.sh.cur,-1);row.click();assert.equal(f.commands.length,0);
});
test('rejected loop never appears enabled; task drawer marks native occlusion immediately',async t=>{
 const f=mount(t);f.sh.toggleLoop();await Promise.resolve();await Promise.resolve();assert.equal(f.sh.s.loop,false);
 f.sh.q('[data-a=panel]').click();assert.equal(f.sh.root.getAttribute('data-pw-occludes-native'),'true');f.sh.q('[data-pclose]').click();assert.equal(f.sh.root.hasAttribute('data-pw-occludes-native'),false);
});
