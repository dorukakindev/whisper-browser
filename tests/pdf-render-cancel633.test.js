'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
test('Closing or zooming cancels pending PDF raster work and a late cancellation never overwrites the new document',async()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),begin=source.indexOf('function cancelPdfReaderRenders('),end=source.indexOf('\nasync function translateVisiblePdfPages(',begin);
 assert(begin>=0&&end>begin);const dom=new JSDOM('<div id="pdfReaderPages"></div>',{runScripts:'outside-only'}),w=dom.window;
 let reject,cancelled=0,extracted=0,errors=[];const task={promise:new Promise((_,fail)=>reject=fail),cancel(){cancelled++;reject(Error('RenderingCancelledException'));}};
 const reader={pages:new Map(),rendered:new Map(),scale:1,pdf:{getPage:async()=>({getViewport:()=>({width:100,height:200}),render:()=>task})}};
 Object.assign(w,{player:{pdfReader:reader},$:id=>w.document.getElementById(id),extractPdfReaderPage:async()=>{extracted++;return [];},pdfReaderSetStatus:message=>errors.push(message)});
 w.eval(source.slice(begin,end));try{const rendering=w.renderPdfReaderPage(1);await new Promise(setImmediate);assert.equal(reader.renderTasks.size,1);reader.renderGeneration=1;w.player.pdfReader={};w.cancelPdfReaderRenders(reader);await rendering;assert.equal(cancelled,1);assert.equal(reader.renderTasks.size,0);assert.equal(extracted,0);assert.deepEqual(errors,[]);assert.equal(w.document.querySelectorAll('article').length,0);}finally{dom.window.close();}
});
