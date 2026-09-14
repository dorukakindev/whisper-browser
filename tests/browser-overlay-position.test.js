'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const profiles=require('../src/browser-site-profiles');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/renderer/renderer.js'),'utf8');
const start=source.indexOf("} else if (event.type === 'overlay-style') {");
const end=source.indexOf("} else if (event.type === 'live-asr-state')",start);
const branch=source.slice(start+'} else '.length,end)+'}';
function run(scope,offset){
 const origin='https://video.test',tab={siteOverrideOrigin:origin,siteOverrides:scope==='tab'?{overlayBottom:12,overlayGap:24}:{}};
 const controls={browserOverlayBottom:{value:'7'},browserOverlayBottomVal:{},browserWatchTools:{open:true}};
 const context={event:{type:'overlay-style',style:{bottomOffset:offset}},
  $:id=>controls[id],browserTabState:()=>tab,
  effectiveBrowserProfile:()=>({origin,sources:{overlayBottom:scope}}),
  window:{BrowserSiteProfiles:profiles},scheduleSave(){},saveActiveBrowserTabWorkspace(){},
  renderBrowserWatchStyle(){},scheduleBrowserOverlaySync(){}};
 vm.runInNewContext(branch,context);return {tab,controls};
}
const overridden=run('tab',31);
assert.equal(overridden.tab.siteOverrides.overlayBottom,31,'sürüklenen konum sekme özelleştirmesine yazılmalı');
assert.equal(overridden.tab.siteOverrides.overlayGap,24,'diğer görünüm tercihleri korunmalı');
assert.equal(overridden.controls.browserOverlayBottom.value,'7','sekme özelleştirmesi genel ayarı değiştirmemeli');
assert.equal(run('site',22).tab.siteOverrides.overlayBottom,22,'site tercihi sürüklemeyi geri çevirmemeli');
assert.equal(run('path',22).tab.siteOverrides.overlayBottom,22);
assert.equal(run('general',31).controls.browserOverlayBottom.value,'31');
assert.equal(run('tab',0).tab.siteOverrides.overlayBottom,0);
assert.equal(run('tab',999).tab.siteOverrides.overlayBottom,75);
assert.equal(run('tab',NaN).tab.siteOverrides.overlayBottom,12);
console.log('browser-overlay-position: sekme/site/yol, genel ayar, sıfır ve aralık kontrolleri geçti');
