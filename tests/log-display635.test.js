const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
test('GUI log strips terminal styling, shows control characters and keeps text inert without changing raw input',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
 const code=source.slice(source.indexOf('function logDisplayText('),source.indexOf("window.addEventListener('unhandledrejection'"));
 const escape=source.slice(source.indexOf('function escapeHtml('),source.indexOf('let _pendingPreviewSegments'));
 const dom=new JSDOM('<div id="log"></div>');try{
 const ctx={document:dom.window.document,$:id=>dom.window.document.getElementById(id),isNearBottom:()=>true,trimLogLines:()=>{}};vm.createContext(ctx);vm.runInContext(code+escape,ctx);
 const raw='\x1b[31mTürkçe arıza\x1b[0m\r\n<img src=x onerror=1>\u202eTEST\b';
 const original=raw;const line=ctx.logLine(raw,'error');assert.equal(raw,original);assert.equal(line.querySelector('img'),null);
 assert(line.textContent.includes('Türkçe arıza\n<img src=x onerror=1>\\u202eTEST\\u0008'));assert(!line.textContent.includes('[31m'));
 assert.equal(ctx.logDisplayText('\x1b]8;;https://example.test\x07link\x1b]8;;\x07'),'link');
 assert.equal(ctx.logDisplayText('مرحبا 中文 Türkçe\t12'),'مرحبا 中文 Türkçe\t12');
 }finally{dom.window.close();}
});
