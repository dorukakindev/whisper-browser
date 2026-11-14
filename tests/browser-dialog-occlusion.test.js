'use strict';
// R269 — açık <dialog> native WebContentsView'in arkasında kalmasın.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const renderer = read('src/renderer/renderer.js');
const catalog = read('src/renderer/media-catalog.js');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}\n${e.stack}`); process.exitCode = 1; } };

test('occlusion hesabı açık <dialog> öğesini kapsar', () => {
  const body = renderer.slice(renderer.indexOf('function syncBrowserOcclusion'), renderer.indexOf('async function applyBrowserOcclusion'));
  assert.match(body, /document\.querySelector\('dialog\[open\]'\)/);
});

// Fark penceresi bölümlü hâlde büyüdü; dilimi fonksiyonun tamamına genişlet.
const reviewDialogBody = renderer.slice(
  renderer.indexOf('async function openRetranslationReview'),
  renderer.indexOf('function uiText'));

test('retranslate-review diyaloğu açılışta occlusion senkronlar', () => {
  assert.match(reviewDialogBody, /dialog\.showModal\(\);\s*syncBrowserOcclusion\(\);/);
});

test('retranslate-review kapanış yolları occlusion resync yapar', () => {
  const seg = reviewDialogBody;
  assert.match(seg, /dialog\.remove\(\); syncBrowserOcclusion\(\); \}/);
  assert.match(seg, /dialog\.addEventListener\('cancel', \(\) => \{ dialog\.remove\(\); syncBrowserOcclusion\(\); \}\)/);
});

test('katalog diyaloğu showModal sonrası resync eder', () => {
  // Shared dialog focus/motion setup may sit between opening and the same-line
  // native occlusion update; still require that update after showModal.
  assert.match(catalog, /dialog\.showModal\(\);[^\r\n]*if \(typeof syncBrowserOcclusion === 'function'\) syncBrowserOcclusion\(\)/);
  assert.match(catalog, /dialog\.addEventListener\('close',/);
});



// A docked studio must leave its narrowed native page visible. Other overlays
// and the small-screen studio still occlude it through the original owner.
test('studio docks on desktop but remains an overlay at narrow widths',()=>{
  const vm=require('node:vm');const at=renderer.indexOf('function syncBrowserOcclusion()');
  const source=renderer.slice(at,renderer.indexOf('\n}',at)+2);
  let width=1280,modal=false,result;
  const studio={open:true},workspace={classList:{contains:n=>n==='mc-studio-open'}};
  const window={get innerWidth(){return width},api:{setAssistantModalBlocked(){},setBrowserOccluded(){}}};
  const sync=vm.runInNewContext('('+source+')',{$:id=>({browserTranslateMenu:studio,browserWorkspace:workspace}[id]||null),window,document:{querySelector:()=>modal?{}:null},_activeModal:null,applyBrowserOcclusion:v=>{result=v;}});
  sync();assert.equal(result,false);
  width=900;sync();assert.equal(result,true);
  width=1280;modal=true;sync();assert.equal(result,true);
  modal=false;studio.open=false;sync();assert.equal(result,false);
});

console.log(`${passed} test geçti`);
