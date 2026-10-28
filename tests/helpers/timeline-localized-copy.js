"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),{JSDOM}=require("jsdom");
const norm=value=>String(value||"").replace(/\s+/g," ").trim();
// The timeline owns this explicitly marked panel instead of the global dictionary.
// Count its strings only after executing the real localization function both ways.
module.exports=function timelineLocalizedCopy(html){
 const source=fs.readFileSync(require.resolve("../../src/renderer/renderer.js"),"utf8");
 const start=source.indexOf("function localizeIntegrationControls(){"),end=source.indexOf("\ndocument.addEventListener('ui-locale-change',localizeIntegrationControls)",start);
 assert(start>=0&&end>start,"Production timeline locale function must exist");
 const dom=new JSDOM(html,{runScripts:"outside-only"}),w=dom.window;
 try{
  const panel=w.document.querySelector(".timeline-analysis-panel");assert(panel);
  const leaves=[...panel.querySelectorAll("*")].filter(n=>!n.children.length),before=leaves.map(n=>norm(n.textContent));
  let locale="en";
  Object.assign(w,{$:id=>w.document.getElementById(id),interfaceChoice:(tr,en)=>locale==="en"?en:tr,renderTimelineIssues(){}});
  w.eval(source.slice(start,end)+";localizeIntegrationControls();");
  for(const n of panel.querySelectorAll("[data-en]"))assert.equal(norm(n.textContent),norm(n.dataset.en),"Explicit English timeline copy must really render");
  assert.deepEqual([...w.document.getElementById("timelineQcProfile").options].map(n=>n.textContent),["Custom","TR · Dialogue · 17 CPS","TR · Children · 13 CPS","TR · SDH · 20 CPS"]);
  assert.equal(w.document.getElementById("timelineAnalyze").textContent,"Analyze waveform & cuts");
  assert.equal(w.document.getElementById("timelineAnalyzeCancel").textContent,"Cancel");
  const translations=new Map(leaves.map((n,i)=>[before[i],norm(n.textContent)]).filter(([a,b])=>a&&a!==b));
  assert.equal(w.document.querySelector(".timeline-analysis").getAttribute("aria-label"),"Subtitle checks and media analysis");
  locale="tr";w.localizeIntegrationControls();
  assert.equal(w.document.querySelector(".timeline-analysis").getAttribute("aria-label"),"Altyazı ve medya denetimleri");
  for(const n of panel.querySelectorAll("[data-tr]"))assert.equal(norm(n.textContent),norm(n.dataset.tr),"Explicit Turkish timeline copy must really render");
  assert.equal(w.document.getElementById("timelineQcProfile").options[0].textContent,"Özel");
  assert.equal(w.document.getElementById("timelineAnalyze").textContent,"Dalga biçimi ve kesimleri incele");
  return translations;
 }finally{dom.window.close();}
};
