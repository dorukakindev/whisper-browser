"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
test("actual review edit callback selects the second repeated passage and refuses changed drafts",()=>{
 const source=fs.readFileSync(require.resolve("../src/renderer/media-workflows-ui.js"),"utf8");
 const start=source.indexOf('button(t("Edit this passage", "Bu metni düzenle"), () => {');
 const end=source.indexOf('\n          }),',start);assert(start>0&&end>start);
 const callback=source.slice(start,end).slice(source.slice(start,end).indexOf('() => {'))+'\n}';
 const text="Hayır. Uzun açıklama. Hayır.",c={text,groups:[{text:"Hayır."},{text:"Uzun açıklama."},{text:"Hayır."}]};
 let selection=null,warning="";const textarea={value:text,focus(){},setSelectionRange(start,end){selection={start,end};},scrollIntoView(){}};
 const edit=vm.runInNewContext('('+callback+')',{textarea,c,g:c.groups[2],window:{BookTextSearch:require("../src/book-text-search")},t:(en,tr)=>tr,status:s=>warning=s});
 edit();assert.equal(selection.start,text.lastIndexOf("Hayır."));assert.equal(text.slice(selection.start,selection.end),"Hayır.");
 textarea.value="Önce değiştirildi. "+text;selection=null;edit();assert.equal(selection,null);assert.match(warning,/Kaynak metin değişti/);
});
