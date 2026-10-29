'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8').replace(/\r\n/g,'\n');
const fn=source.match(/function updatePdfReaderProgress\(\) \{[\s\S]*?\n\}/)[0];
function measure(pages,total=2){const states={};const node={textContent:'',classList:{toggle:(name,on)=>{states[name]=on;}}};const context={$:()=>node,player:{pdfReader:{pdf:{numPages:total},state:{pages}}}};vm.runInNewContext(fn+';updatePdfReaderProgress()',context);return {text:node.textContent,complete:states['is-complete']};}
test('PDF progress cannot mark failed or partially translated pages complete',()=>{
 assert.deepEqual(measure({'1':[{status:'failed'}],'2':[{status:'translated',translation:'Ready'}]}),{text:'1/2 sayfa',complete:false});
 assert.deepEqual(measure({'1':[{status:'translated'},{status:'failed'}],'2':[{status:'pending'}]}),{text:'0/2 sayfa',complete:false});
});
test('PDF progress counts completed, skipped and edited pages only inside document bounds',()=>{
 assert.deepEqual(measure({'1':[{status:'skipped'}],'2':[{status:'failed',userText:'Reviewed text'}],'3':[{status:'translated'}]}),{text:'2/2 sayfa',complete:true});
 assert.deepEqual(measure({'8':[{status:'translated'}],'bad':[]}),{text:'0/2 sayfa',complete:false});
});
