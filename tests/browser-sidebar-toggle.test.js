'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const code=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8'),start=code.indexOf('function sidebarIsVisible()'),end=code.indexOf("if ($('playerBookmark'))",start);
function fixture(narrow=false,rail=true,collapsed=false){
 const dom=new JSDOM(`<div id="playerLayer" class="workspace-browser ${collapsed?'sidebar-collapsed':''}"><aside id="playerSide" class="${rail?'side-rail':''}"></aside></div><button id="browserSidebarToggle"></button><button id="playerSidebarToggle"></button><button id="browserPanelMain"></button><div id="aiChat"></div><div id="playerLibraryPanel"></div>`),{window}=dom,{document}=window;
 const player={workspaceMode:'browser',viewMode:'reading',lastSideMode:'reading',narrowViewport:narrow,narrowPanelTakeover:false};let pref=rail?'rail':'panel';
 window.matchMedia=()=>({matches:narrow});
 const layer=document.getElementById('playerLayer'),side=document.getElementById('playerSide');
 const context=vm.createContext({window,document,player,globalThis:{CinemaMotion:{mode:'off'}},matchMedia:window.matchMedia,$:id=>document.getElementById(id),$$:selector=>[...document.querySelectorAll(selector)],aiChatCtxLabel(){},refreshWatchLibrary(){},
  setTimeout:()=>{},highlightCueRow(){},snapGridColumns(){},scheduleBrowserBounds(){},setSettingsDrawer(){},drawerIsOpen:()=>false,
  responsivePanelTakeoverActive:()=>player.narrowPanelTakeover&&!side.classList.contains('side-rail')&&!layer.classList.contains('sidebar-collapsed'),
  updateBrowserSideRail(){side.classList.toggle('side-rail',pref==='rail');},setBrowserSideRailPref(value){pref=value;side.classList.toggle('side-rail',pref==='rail');},
  setViewMode(value){player.viewMode=value;},syncResponsivePlayerLayout(){layer.classList.toggle('narrow-panel-takeover',player.narrowPanelTakeover&&!side.classList.contains('side-rail')&&!layer.classList.contains('sidebar-collapsed'));}});
 const tabStart=code.indexOf('function setSideTab('),tabEnd=code.indexOf('// ---- bağlamlı AI',tabStart);vm.runInContext(code.slice(start,end)+code.slice(tabStart,tabEnd),context);
 return {dom,player,layer,side,click:id=>document.getElementById(id).click(),tab:()=>context.setSideTab('subs'),expanded:()=>document.getElementById('browserSidebarToggle').getAttribute('aria-expanded')};
}
for(const narrow of [false,true]){
 const h=fixture(narrow);try{h.click('browserSidebarToggle');assert.equal(h.layer.classList.contains('sidebar-collapsed'),false,'first click opens the panel instead of closing the rail');assert.equal(h.side.classList.contains('side-rail'),false,'stored rail preference must become panel');if(narrow)assert.equal(h.player.narrowPanelTakeover,true);assert.equal(h.expanded(),'true');h.click('browserSidebarToggle');assert.equal(h.expanded(),'false');h.click('browserSidebarToggle');assert.equal(h.side.classList.contains('side-rail'),false);assert.equal(h.expanded(),'true');}finally{h.dom.window.close();}
}
const h=fixture(false,true,true);try{h.player.viewMode='cinema';h.click('browserSidebarToggle');assert.equal(h.player.viewMode,'reading');assert.equal(h.side.classList.contains('side-rail'),false);assert.equal(h.layer.classList.contains('sidebar-collapsed'),false);}finally{h.dom.window.close();}
for(const narrow of [false,true]){const tab=fixture(narrow,true,true);try{tab.tab();assert.equal(tab.layer.classList.contains('sidebar-collapsed'),false,'explicit browser tab must reveal a collapsed panel');assert.equal(tab.side.classList.contains('side-rail'),false);if(narrow)assert.equal(tab.player.narrowPanelTakeover,true);}finally{tab.dom.window.close();}}
console.log('browser-sidebar-toggle: first-click rail recovery, repeated wide/narrow toggles and cinema/collapsed recovery OK');
