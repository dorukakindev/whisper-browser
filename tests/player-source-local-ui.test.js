// Local source layout keeps the existing actions while using the approved compact file table.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const Catalog=require('../src/player-source-catalog');
function setup(t){const dom=new JSDOM('<!doctype html><body><div id="root"></div>',{pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window;global.window=w;global.document=w.document;global.Node=w.Node;w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.getAnimations=()=>[];for(const [name,state]of [['showPopover','open'],['hidePopover','closed']])w.HTMLElement.prototype[name]=function(){const event=new w.Event('toggle');Object.defineProperty(event,'newState',{value:state});this.dispatchEvent(event);};return {w,root:w.document.getElementById('root'),UI:require('../src/renderer/player-source-catalog-ui')};}
function vm(items,extra={}){const query=Catalog.normalizeQuery({sort:'title'});return {locale:'tr',kind:'local',sources:[{sourceId:'folder:one',kind:'local',title:'media',itemCount:items.length,followed:true}],pinned:[],selectedSourceId:'folder:one',query,result:Catalog.queryPlayerItems({batch:{items,revision:'one'},query}),shown:items.length,drawerOpen:false,filtersOpen:false,metadataFailures:1,...extra};}
const file=(id,extra={})=>({itemId:id,sourceId:'folder:one',kind:'local',title:'A.Real.File.2020.mkv',sourceTitle:'media',durationSeconds:null,subtitleLanguages:null,personal:{},file:{name:'A.Real.File.2020.mkv'},...extra});
test('source hero displays supplied artwork and only a complete known video count',t=>{
 const {root,UI}=setup(t),source={sourceId:'yt:one',kind:'youtube',title:'Real Channel',followed:true,itemCount:40,countComplete:false,avatar:'https://example.org/actual-channel.png'};
 const rows=Array.from({length:40},(_,i)=>file('video'+i,{kind:'youtube',sourceId:source.sourceId})),model=vm(rows,{kind:'youtube',sources:[source],selectedSourceId:source.sourceId});
 model.result=Catalog.queryPlayerItems({batch:{items:rows,revision:'one',remoteNextCursor:'youtube:2'},query:model.query});
 UI.renderCatalog(root,model,{});
 assert.equal(root.querySelector('.pw-hero__cover img').getAttribute('src'),source.avatar);
 assert.equal(root.querySelector('.pw-hero__meta .pw-num'),null,'incomplete remote pages do not advertise a source total');
 assert.equal(root.querySelector('.pw-count').textContent,'40 video','YouTube toolbar describes shown rows without presenting an unknown remote total');
 assert.equal(root.querySelector('.pw-count').textContent.includes('yüklendi'),false);
 assert.equal(model.result.total,null);assert.equal(model.result.remoteNextCursor,'youtube:2');
 assert.equal(root.querySelector('.pw-hero__watermark').textContent,'Real Channel');
 assert.equal(root.querySelector('.pw-hero').style.getPropertyValue('--pw-channel-tint'),'');
 UI.renderCatalog(root,vm([],{kind:'youtube',sources:[{...source,countComplete:true}],selectedSourceId:source.sourceId}),{});
 assert.equal(root.querySelector('.pw-hero__meta .pw-num').textContent,'40 video');
});
function menu(w,root,label,choice){const trigger=[...root.querySelectorAll('.mk-picker-trigger')].find(node=>node.getAttribute('aria-label')===label);assert.ok(trigger,label);trigger.click();const item=[...trigger.parentNode.querySelectorAll('[role=menuitem]')].find(node=>node.textContent===choice);assert.ok(item,choice);item.click();}

test('local uses a compact heading instead of the 220px source hero; folder/file and advanced actions keep their owners',t=>{
 const {w,root,UI}=setup(t),calls=[];
 UI.renderCatalog(root,vm([file('one')]),{onAddSource:kind=>calls.push(['add',kind]),onOpenFile:()=>calls.push(['file']),onToggleFollow:id=>calls.push(['follow',id]),onTogglePin:id=>calls.push(['pin',id]),onReadMetadata:retry=>calls.push(['metadata',retry]),onOpenSourceUrl:id=>calls.push(['manage',id])});
 assert.ok(root.querySelector('.pw-local-header'));assert.equal(root.querySelector('.pw-hero'),null,'local must not reuse the large video-source hero');assert.equal(root.querySelectorAll('.pw-local-columns>span').length,4);assert.equal(root.querySelectorAll('.pw-local-header h2').length,1);
 const header=root.querySelector('.pw-local-header');[...header.querySelectorAll('button')].find(node=>node.textContent==='Klasör ekle').click();[...header.querySelectorAll('button')].find(node=>node.textContent==='Dosya aç').click();
 for(const label of ['Klasör takibini durdur','Sabitle','Klasörleri yönet','Sonraki 20 dosyanın süre/dil bilgisini oku','Hatalı dosya bilgilerini yeniden oku'])menu(w,root,'Yerel arşiv araçları',label);
 assert.deepEqual(calls,[['add','local'],['file'],['follow','folder:one'],['pin','folder:one'],['manage','folder:one'],['metadata',undefined],['metadata',true]]);
 const noFile=w.document.createElement('div');UI.renderCatalog(noFile,vm([file('two')]),{});assert.ok(![...noFile.querySelectorAll('button')].some(node=>node.textContent==='Dosya aç'),'file action is absent unless an existing integration owner is provided');
});

test('file table shows real measured fields and human unknowns while preserving play/detail/missing actions',t=>{
 const {w,root,UI}=setup(t),calls=[];
 const known=file('known',{durationSeconds:90,subtitleLanguages:['en'],spokenLanguages:['tr'],file:{name:'A.Real.File.2020.mkv',size:2*1024*1024}}),unknown=file('unknown'),missing=file('missing',{fileMissing:true});
 UI.renderCatalog(root,vm([known,unknown,missing]),{onOpenItem:(item,mode)=>calls.push([item.itemId,mode]),onLocate:item=>calls.push([item.itemId,'locate'])});
 const row=id=>root.querySelector('[data-item-id="'+id+'"]');assert.equal(row('known').querySelector('.pw-local-duration').textContent,'1:30');assert.equal(row('known').querySelector('.pw-local-file').textContent,'MKV · 2 MB');assert.equal(row('known').querySelector('.pw-local-subtitle').textContent,'İngilizce');assert.ok(row('known').querySelector('.pw-row__meta').textContent.includes('Türkçe'));
 assert.equal(row('unknown').querySelector('.pw-local-duration').textContent,'Süre okunmadı');assert.equal(row('unknown').querySelector('.pw-local-subtitle').textContent,'Altyazı bilgisi okunmadı');assert.ok(!root.textContent.includes('4K'),'unmeasured resolution is never invented');
 const friendly=w.document.createElement('div');UI.renderCatalog(friendly,vm([file('name',{title:'whisper-browser-tour.mp4'})]),{});assert.equal(friendly.querySelector('.pw-row__title').textContent,'Whisper Browser Tour');
 row('known').querySelector('.pw-thumb').click();row('known').querySelector('.pw-row__title button').click();menu(w,root,'Dosya işlemleri: A Real File 2020','Oynat');
 assert.equal(row('missing').querySelector('.pw-thumb').disabled,true);row('missing').querySelector('.pw-row__actions button').click();assert.deepEqual(calls,[['known','play'],['known','detail'],['known','play'],['missing','locate']]);
});
