'use strict';
const fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8').replace(/\r\n/g,'\n'),helpers=fs.readFileSync(path.join(root,'src/renderer/renderer-helpers.js'),'utf8').replace(/\r\n/g,'\n');
function fn(text,name){const start=text.indexOf(`function ${name}(`);if(start<0)throw Error(name);const end=text.indexOf('\n}',start);return text.slice(start,end+2);}
const index=new JSDOM(fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'));const html='<!doctype html><html lang="tr"><head><title>Browser accessibility fixture</title><style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.hidden,[hidden]{display:none!important}svg{width:16px;height:16px}button,input,summary{font-size:16px}body{color:#111;background:white}</style></head><body><main>'+index.window.document.querySelector('.browser-tabbar').outerHTML+index.window.document.getElementById('browserMoreMenu').outerHTML+'</main></body></html>';index.window.close();
const funcs=['browserTabAvatar','browserCloseIcon','browserTabDisplayRows','buildBrowserTabItem','syncBrowserTabItem','renderBrowserTabs','updateBrowserPinMenu','syncBrowserAdblockMenu'].map(name=>fn(source,name));
const clickStart=source.indexOf("if ($('browserTabStrip')) $('browserTabStrip').addEventListener('click',");const click=source.slice(clickStart,source.indexOf('\n});',clickStart)+4);
const keyStart=source.indexOf("if ($('browserTabStrip')) $('browserTabStrip').addEventListener('keydown',");const keyboard=source.slice(keyStart,source.indexOf('\n});',keyStart)+4);
const searchStart=source.indexOf("const moreSearch = $('browserMoreSearch');");const search=source.slice(searchStart,source.indexOf('\n}',searchStart)+2);
const script=`const $=id=>document.getElementById(id);window.__calls=[];window.__settingsActive=false;
const player={browserTabs:[{id:'one',title:'One',url:'https://one.invalid',loading:true,audible:true},{id:'two',title:'Two',url:'https://two.invalid',audible:true,group:{name:'Work',color:'blue'}},{id:'three',title:'Three',url:'https://three.invalid',audible:true,group:{name:'Work',color:'blue'}}],browserSplit:{secondaryTabId:''},browserActiveTabId:'one',browserClosingTabs:new Set(),browserCollapsedGroups:new Set(),browserSettingsOpen:true};
window.BrowserTabLayout={normalizeTabGroup:g=>g||null};window.api={muteBrowserTab:async id=>{window.__calls.push(['mute',id]);return {ok:true,tabMuted:true};}};
const browserAvatarDomainKey=host=>host;const interfaceChoice=(tr,en)=>tr;const safeRemoteImageUrl=value=>value;const uiText=x=>x;
const browserSettingsSurfaceVisible=()=>window.__settingsActive;const updateBrowserNewTabAvailability=()=>{};
const browserTabState=id=>player.browserTabs.find(t=>t.id===(id||player.browserActiveTabId));
const browserAdblockRuntimeState=()=>({enabled:true}),browserAdblockSiteState=()=>({effective:true});
const openBrowserSettings=()=>{window.__calls.push(['settings']);window.__settingsActive=true;renderBrowserTabs();};const closeBrowserSettings=()=>{window.__calls.push(['settings-close']);player.browserSettingsOpen=false;window.__settingsActive=false;renderBrowserTabs();};
const closeBrowserTab=id=>window.__calls.push(['close',id]);const activateBrowserTabAndFocus=id=>{window.__calls.push(['activate',id]);player.browserActiveTabId=id;window.__settingsActive=false;renderBrowserTabs();document.querySelector('[data-browser-tab-activate="'+id+'"]').focus();};
const updateBrowserTabPresentation=tab=>syncBrowserTabItem(document.querySelector('[data-browser-tab-id="'+tab.id+'"]'),tab,tab.id===player.browserActiveTabId,browserTabActivity(tab));const setBrowserSignal=()=>{};
const syncBrowserMenuProxies=()=>{};
const foldQuery=value=>value.toLowerCase().replace(/\\s+/g,''),foldIndex=value=>({dense:foldQuery(value)});
${['browserTabLabel','browserTabAudioIcon','syncBrowserTabAudioButton','browserTabActivity'].map(name=>fn(helpers,name)).join('\n')}
${funcs.join('\n')}
${click}\n${keyboard}\n${search}
Element.prototype.scrollIntoView=()=>{};document.getElementById('browserMoreMenu').open=true;for(const d of document.querySelectorAll('.browser-more-sub'))d.open=true;renderBrowserTabs();syncBrowserAdblockMenu();window.__render=renderBrowserTabs;window.__player=player;`;
module.exports={html,script};
