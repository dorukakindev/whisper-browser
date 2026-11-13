#!/usr/bin/env node
// Keşfet → yapım detayı → yorumlar → geri: gerçek renderer'ı kontrollü katalog verisiyle Chromium'da çalıştırır.
//   node tests/chromium-discover-detail.smoke.mjs [--shots <klasör>] [--only <ad>] [--browser <yol>]
// Aynı adlı iki yapım (The Crossing 2019 kütüphanede, 2023 yalnız Keşfet'te) ve geciktirilebilir sağlayıcı kapıları kullanır.
// Mock; gerçek Electron, canlı Cinemeta/TMDB/Letterboxd veya mpv başarısı değildir.
import path from 'node:path';
import { launch, stageRenderer, ROOT, sleep } from './support/chromium-fixture.mjs';

const args = process.argv.slice(2);
const option = (name, fallback = '') => { const index = args.indexOf(name); return index >= 0 && args[index + 1] ? args[index + 1] : fallback; };
const TAG = option('--tag', 'run'), SHOTS = option('--shots'), ONLY = option('--only').split(',').filter(Boolean), BROWSER = option('--browser');
const results = [];
const info = (scenario, text) => { console.log(`  · bilgi (kabul ölçütü değil): ${text}`); };
const skip = (scenario, name, reason) => { results.push({ scenario, name, ok: true, skipped: true, detail: reason }); console.log(`  - ATLANDI ${name} — ${reason}`); };
const check = (scenario, name, ok, detail = '') => { results.push({ scenario, name, ok: !!ok, detail: ok ? '' : String(detail) }); if (!ok) console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); else console.log(`  ✓ ${name}`); };

const stub = path.join(ROOT, 'tests/support/discover-fixture-stub.js');
const staged = stageRenderer([stub]);
const browser = await launch({ browser: BROWSER, width: 1440, height: 900 });
const card = id => `[...document.querySelectorAll('.cn-poster')].find(c=>c.dataset.discoveryId==='${id}')`;
const page = `document.querySelector('.media-title-page')`;
const button = (re, root = page) => `[...(${root}?.querySelectorAll('button')||[])].find(x=>${re}.test(x.textContent)&&x.getClientRects().length)`;
const BACK = /Keşfete dön|Kütüphaneye dön|Sonuçlara dön/;
const fresh = async ({ locale = 'tr', theme = 'dark', width = 1440, height = 900 } = {}) => {
  await browser.viewport(width, height);
  await browser.goto(staged.url); await sleep(1800);
  await browser.until(`window.__fx&&document.querySelector('[data-home-page=discover]')`, 'home');
  await browser.evaluate(`window.__fx.setLocale('${locale}');applyUiTheme('${theme}');document.querySelector('[data-home-page=discover]').click()`);
  await browser.until(`document.querySelectorAll('.cn-poster').length>3`, 'Keşfet kartları'); await sleep(500);
};
const snap = () => browser.evaluate(`(()=>{const h=document.getElementById('mediaHome'),p=${page},a=document.activeElement;return {cards:document.querySelectorAll('.cn-poster').length,scroll:Math.round(h.scrollTop),query:document.querySelector('.cn-filter-search input')?.value??null,active:a?.dataset?.discoveryId||a?.id||a?.tagName,pages:document.querySelectorAll('.media-title-page').length,kind:p?.dataset.pageKind||null,h1:p?.querySelector('h1')?.textContent||null,text:p?.innerText||'',lib:window.__fx.library.map(i=>i.id+':'+i.watchStatus),libCards:[...document.querySelectorAll('.cn-poster')].filter(c=>/Kütüphanede/.test(c.textContent)).map(c=>c.dataset.discoveryId)}})()`);
const writes = () => browser.evaluate(`window.__fx.calls.filter(c=>/^(add|save|ensure-record|feedback|remove|delete|decision-save|plan|apply|like|dislike|undo)$/.test(c.action||'')).map(c=>c.api+':'+c.action+':'+(c.id||''))`);
const shot = async name => { if (SHOTS) await browser.screenshot(path.join(SHOTS, `${TAG}-${name}.png`)); };
const openDetail = async id => { await browser.click(card(id)); await browser.until(`document.querySelector('.media-title-page[data-page-kind=discovery] h1')`, 'detay ' + id); await sleep(450); };
const back = async () => { await browser.evaluate(`document.getElementById('mediaHome').scrollTop=0`); await sleep(120); await browser.click(button(BACK)); await browser.until(`!document.querySelector('.media-title-page')`, 'geri'); await sleep(350); };

const scenarios = {
  async 'identity-race'() {
    await fresh();
    await browser.evaluate(`window.__fx.hold('detail:tt1000001');true`);
    await browser.click(card('tt1000001'));
    await browser.evaluate(`window.__fx.gates['detail:tt1000001'].called`);
    await back(); await openDetail('tt1000002');
    const before = await snap();
    await browser.evaluate(`window.__fx.gates['detail:tt1000001'].release();true`); await sleep(700);
    const after = await snap();
    check('identity-race', 'ikinci yapım (2023) açık ve tek sayfa var', after.pages === 1 && after.h1 === 'The Crossing' && /2023/.test(after.text) && !/2019/.test(after.text.split('Konu')[0]), JSON.stringify({ pages: after.pages, h1: after.h1 }));
    check('identity-race', 'geciken 2019 yanıtı sayfayı değiştirmedi', before.text === after.text, 'metin değişti');
    check('identity-race', '2023 sayfası kütüphanede değil, eylem “İzleneceklere ekle”', /Kütüphanende yok/.test(after.text) && /İzleneceklere ekle/.test(after.text) && !/Kütüphanede aç/.test(after.text));
    check('identity-race', 'yalnız okuma: kişisel kayıt yazılmadı', (await writes()).length === 0, JSON.stringify(await writes()));
  },
  async 'library-open-race'() {
    await fresh();
    await browser.evaluate(`window.__fx.hold('catalog-list');window.__lib=MediaTitleUI.open('cat-1000001');true`);
    await browser.evaluate(`window.__fx.gates['catalog-list'].called`);
    await browser.evaluate(`MediaDiscoveryUI.openDetail(window.__fx.catalog.find(r=>r.providerId==='tt1000002'));true`);
    await browser.until(`document.querySelector('.media-title-page[data-page-kind=discovery] h1')`, '2023 detay'); await sleep(400);
    await browser.evaluate(`window.__fx.gates['catalog-list'].release();true`); await sleep(900);
    const state = await snap();
    check('library-open-race', 'geciken kütüphane (2019) yanıtı 2023 detayının yerine geçmedi', state.pages === 1 && state.kind === 'discovery' && /2023/.test(state.text), JSON.stringify({ pages: state.pages, kind: state.kind }));
    const closed = await browser.evaluate(`(async()=>{try{MediaTitleUI.close();return true}catch(e){return String(e)}})()`);
    check('library-open-race', 'MediaTitleUI.close() hata vermiyor', closed === true, closed);
  },
  async 'membership-and-add'() {
    await fresh();
    await openDetail('tt1000001');
    const lib = await snap();
    check('membership-and-add', '2019 (kütüphanede, izleme listesinde): “Kütüphanede aç” ve “İzleme listende”', /Kütüphanende · İzleme listende/.test(lib.text) && /Kütüphanede aç/.test(lib.text) && !/İzleneceklere ekle/.test(lib.text), lib.text.slice(0, 200));
    check('membership-and-add', 'kayıtlı yapımı açma düğmesi ekleme yerine klasör simgesini kullanır', await browser.evaluate(`document.querySelector('.cn-hero-actions>[data-kind=primary] svg')?.outerHTML===CinemaUI.icon('folder').outerHTML`));
    await shot('detail-library-final');
    await back();
    await browser.evaluate(`document.getElementById('mediaHome').scrollTop=0`); await sleep(200);
    await openDetail('tt1000002');
    await browser.evaluate(`window.__fx.hold('add:tt1000002');true`);
    await browser.click(button(/İzleneceklere ekle/));
    await browser.evaluate(`window.__fx.gates['add:tt1000002'].called`);
    const pending = await browser.evaluate(`(()=>{const b=${button(/İzleneceklere ekle/)};return b?b.disabled:'yok'})()`);
    check('membership-and-add', 'ekleme beklerken düğme kilitli ve başarı metni yok', pending === true && !/Eklendi|eklendi/.test((await snap()).text), String(pending));
    await browser.evaluate(`window.__fx.gates['add:tt1000002'].release();true`);
    await browser.until(`/zleme listene eklendi/.test(document.querySelector('.media-title-page')?.innerText||'')`, 'ekleme sonucu');
    const after = await snap();
    check('membership-and-add', 'doğru kimlikle eklendi (cat-1000002:planned), 2019 kaydı değişmedi', after.lib.includes('cat-1000002:planned') && after.lib.includes('cat-1000001:planned') && after.lib.length === 3, JSON.stringify(after.lib));
    check('membership-and-add', 'ekleme sonrası detay açık kalır: 2023, “Kütüphanede aç”, “İzleme listende”', after.pages === 1 && after.kind === 'discovery' && /2023/.test(after.text) && /Kütüphanede aç/.test(after.text) && /İzleme listende/.test(after.text), JSON.stringify({ pages: after.pages, kind: after.kind }));
    check('membership-and-add', '“İzleme listesinden çıkar” görünür', await browser.evaluate(`Boolean(${button(/İzleme listesinden çıkar/)})`));
    await shot('after-add');
  },
  async 'source-read-error'() {
    await fresh();
    await browser.evaluate(`window.api=new Proxy(window.api,{get(target,key){if(key==='mediaCatalog'||key==='mediaTools')return async()=>({ok:false,error:'Controlled read failure'});return target[key];}});true`);
    await openDetail('tt1000001');
    await browser.until(`document.querySelector('.md-strip-sources')?.dataset.state==='error'`, 'kaynak okuma hatası', 4000);
    const text=await browser.evaluate(`document.querySelector('.md-strip-sources').textContent`);
    check('source-read-error', 'okuma hatası, kaynak yokmuş gibi gösterilmez; mevcut kütüphane eylemine yönlendirir', /Kaynak bilgileri okunamadı/.test(text)&&!/Henüz kaynak bağlı değil/.test(text)&&/Kütüphanede aç/.test(text), text);
  },
  async 'remove-from-watchlist'() {
    await fresh();
    await browser.evaluate(`Object.assign(window.__fx.library.find(i=>i.id==='cat-1000001'),{favorite:true,ratings:{imdb:'7.4',personal:'8.5'}});true`);
    await openDetail('tt1000001');
    const lib = () => browser.evaluate(`(i=>JSON.stringify({s:i.watchStatus,f:i.favorite,r:i.ratings,id:i.id}))(window.__fx.library.find(i=>i.id==='cat-1000001'))`);
    const first = await lib();
    const top = () => browser.evaluate(`document.getElementById('mediaHome').scrollTop=0`).then(() => sleep(150));
    const pm = () => browser.evaluate(`(()=>{const r=document.querySelector('.pm-panel'),s=r?.querySelector('.pm-watch select');return {busy:r?.getAttribute('aria-busy'),sel:s?.value,preview:!!r?.querySelector('.pm-preview'),status:r?.querySelector('.pm-status')?.textContent||'',confirmDisabled:r?.querySelector('.pm-confirm')?.disabled}})()`);
    const startRemoval = async label => { await top(); await browser.click(button(/İzleme listesinden çıkar/), { wait: 4000 }); await browser.until(`document.querySelector('.pm-preview')`, label, 6000); await sleep(300); };
    // 1) çıkar → önizleme; onaydan önce kayıt değişmez
    await startRemoval('1. önizleme');
    check('remove-from-watchlist', 'çıkarma önce onay ister; onaydan önce kayıt değişmez', (await lib()) === first && !(await writes()).some(w => /apply/.test(w)), await lib());
    // 2) vazgeç → durum aynı, kilit/önizleme kalmadı
    await browser.click(button(/Vazgeç/), { wait: 4000 }); await sleep(400);
    const cancelled = await pm();
    check('remove-from-watchlist', 'vazgeç: kayıt aynı, kontroller kayıtlı duruma döndü, kilit yok', (await lib()) === first && cancelled.sel === 'planned' && cancelled.busy === 'false' && !cancelled.preview, JSON.stringify(cancelled));
    // 3) yeniden çıkar → ikinci önizleme gelir
    await startRemoval('2. önizleme');
    const second = await pm();
    check('remove-from-watchlist', 'vazgeçtikten sonra yeniden çıkar: ikinci önizleme açılır, onay düğmesi kullanılabilir', second.preview && second.confirmDisabled === false && second.busy === 'false', JSON.stringify(second));
    // 4) kayıt hatası: önizleme düşer, durum korunur
    await browser.evaluate(`window.__fx.hold('personal-apply');true`);
    await browser.click(button(/Kaydetmeyi onayla/), { wait: 4000 });
    await browser.evaluate(`window.__fx.gates['personal-apply'].called`);
    const during = await pm();
    const responsive = await browser.evaluate('1+1', { timeout: 3000 }).then(() => true, () => false);
    const duringText = responsive ? (await snap()).text : '';
    check('remove-from-watchlist', 'bekleyen onay sırasında sayfa donmaz (renderer yanıt verir)', responsive, 'sayfa 3 sn içinde yanıt vermedi: gözlemci döngüsü');
    const rate = responsive ? await browser.evaluate(`new Promise(res=>{let n=0;const o=new MutationObserver(m=>{n+=m.length});o.observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});setTimeout(()=>{o.disconnect();res(n)},700)})`, { timeout: 5000 }).catch(() => -1) : -1;
    // Mutasyon sayısı donanıma ve animasyonlara bağlıdır (yük altında 160 ölçüldü, sessizde 0); kabul ölçütü YOK, yalnız yardımcı gözlem.
    // Kabul: sayfa yanıt verir + onay yanıtı tamamlanır + panel son duruma ulaşır (aşağıdaki kontroller ve 'ipc-task-response').
    info('remove-from-watchlist', `bekleyen onay sırasında 0,7 sn'de ${rate} DOM mutasyonu`);
    check('remove-from-watchlist', 'kayıt sürerken kilitli ve başarı metni yok', during.busy === 'true' && !/izleme bilgilerin kaydedildi/i.test(duringText), JSON.stringify(during));
    await browser.evaluate(`window.__fx.gates['personal-apply'].fail('Kontrollü kayıt hatası');true`); await sleep(600);
    const failed = await pm(); const failedSnap = await snap();
    check('remove-from-watchlist', 'kayıt hatası: neden gösterilir, önizleme kalkar, seçim kayıtlı duruma döner', /Kontrollü kayıt hatası/.test(failed.status) && /Hiçbir şey değişmedi/.test(failed.status) && !failed.preview && failed.sel === 'planned' && failed.busy === 'false', JSON.stringify(failed));
    check('remove-from-watchlist', 'kayıt hatası: izleme durumu, puan ve favori silinmez; üyelik “İzleme listende”', (await lib()) === first && /İzleme listende/.test(failedSnap.text), await lib());
    // 5) yeni önizleme → onay → çıkarıldı
    await startRemoval('3. önizleme');
    await browser.click(button(/Kaydetmeyi onayla/), { wait: 4000 });
    await browser.until(`!/İzleme listende/.test(document.querySelector('.media-title-page .md-membership')?.textContent||'')`, 'üyelik metni', 6000);
    const done = await lib(); const doneSnap = await snap();
    const parsed = JSON.parse(done), prior = JSON.parse(first);
    check('remove-from-watchlist', 'onaylanınca “Belirtilmedi”: aynı kayıt kimliği, puan ve favori değişmedi', parsed.s === 'unspecified' && parsed.id === prior.id && parsed.f === prior.f && JSON.stringify(parsed.r) === JSON.stringify(prior.r), done);
    check('remove-from-watchlist', 'üyelik “Kütüphanende”, “Çıkar” gizli, “Kütüphanede aç” hâlâ var', /Kütüphanende/.test(doneSnap.text) && !/İzleme listende/.test(doneSnap.text) && /Kütüphanede aç/.test(doneSnap.text) && !(await browser.evaluate(`(b=>Boolean(b&&!b.hidden&&b.getClientRects().length))(${button(/İzleme listesinden çıkar/)})`)));
    const sent = await browser.evaluate(`[...window.__fx.previews.values()].map(p=>JSON.stringify(p.changes))`);
    check('remove-from-watchlist', 'her önizleme yalnız {watchStatus:"unspecified"} gönderdi (puan, tepki, not, konum yok)', sent.length === 3 && sent.every(x => x === '{"watchStatus":"unspecified"}'), JSON.stringify(sent));
    await back(); const home = await snap();
    check('remove-from-watchlist', 'geri: Keşfet’te kart hâlâ “Kütüphanede”, odak karttadır', home.libCards.includes('tt1000001') && home.active === 'tt1000001', JSON.stringify({ lib: home.libCards, active: home.active }));
  },
  async 'ipc-task-response'() {
    await fresh();
    await browser.evaluate(`window.__fx.ipcLatency=800;true`); // her IPC yanıtı ayrı bir makro görev olarak döner (gerçek Electron gibi)
    await openDetail('tt1000001');
    const lib = () => browser.evaluate(`window.__fx.library.find(i=>i.id==='cat-1000001').watchStatus`);
    const top = () => browser.evaluate(`document.getElementById('mediaHome').scrollTop=0`).then(() => sleep(150));
    const panel = () => browser.evaluate(`(()=>{const r=document.querySelector('.pm-panel');const all=[...r.querySelectorAll('button,select,input,textarea')];const seg=[...document.querySelectorAll('.media-title-page .cn-status-segments button')];const sel=r.querySelector('.pm-watch select');return {busy:r.getAttribute('aria-busy'),sel:sel.value,disabled:all.filter(n=>n.disabled).length,preview:!!r.querySelector('.pm-preview'),status:r.querySelector('.pm-status')?.textContent||'',segPressed:seg.filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.statusValue).join(','),segDisabled:seg.filter(b=>b.disabled).length,lib:window.__fx.library.find(i=>i.id==='cat-1000001').watchStatus}})()`);
    // Bekleyen istek sırasında kullanıcı etkileşimi: sayfa tıklamayı ve kaydırmayı işler mi?
    const interactive = async label => {
      await browser.evaluate(`document.getElementById('mediaHome').scrollTop=0`, { timeout: 4000 }); await sleep(120);
      const t0 = Date.now();
      const before = await browser.evaluate(`document.querySelector('.media-title-page .md-recommendation-basis')?.open`, { timeout: 4000 });
      await browser.click(`document.querySelector('.media-title-page .md-recommendation-basis summary')`, { wait: 3000 });
      const toggled = await browser.until(`document.querySelector('.media-title-page .md-recommendation-basis').open!==${before}`, 'tıklama', 1500).then(() => true, () => false);
      const scroll0 = await browser.evaluate(`document.getElementById('mediaHome').scrollTop`, { timeout: 4000 });
      await browser.wheel(720, 520, 360);
      const scrolled = await browser.until(`document.getElementById('mediaHome').scrollTop>${scroll0}+40`, 'kaydırma', 1500).then(() => true, () => false);
      await browser.wheel(720, 520, -360); await sleep(120);
      await browser.click(`document.querySelector('.media-title-page .md-recommendation-basis summary')`, { wait: 3000 }).catch(() => {});
      const stillPending = Date.now() - t0 < 800;
      check('ipc-task-response', `${label}: bekleyen istek sırasında tıklama ve kaydırma işleniyor`, toggled && scrolled, JSON.stringify({ toggled, scrolled, ms: Date.now() - t0 }));
      return stillPending;
    };
    // 1) çıkar → önizleme (görev olarak dönen yanıt) → vazgeç
    await top(); await browser.click(button(/İzleme listesinden çıkar/), { wait: 4000 });
    await interactive('önizleme beklerken');
    await browser.until(`document.querySelector('.pm-preview')`, 'önizleme', 8000);
    await top(); await browser.click(button(/Vazgeç/), { wait: 4000 }); await sleep(300);
    let p = await panel();
    check('ipc-task-response', 'vazgeç sonrası panel: kilitsiz, tüm kontroller etkin, seçim kayıtlı durumda, segment doğru', p.busy === 'false' && p.disabled === 0 && !p.preview && p.sel === 'planned' && p.segPressed === 'planned' && p.segDisabled === 0 && p.lib === 'planned', JSON.stringify(p));
    // 2) çıkar → onay → kayıt hatası (görev olarak dönen hata)
    await browser.evaluate(`window.__fx.applyError='Kontrollü kayıt hatası';true`);
    await top(); await browser.click(button(/İzleme listesinden çıkar/), { wait: 4000 }); await browser.until(`document.querySelector('.pm-preview')`, 'önizleme 2', 8000); await sleep(200);
    await browser.click(button(/Kaydetmeyi onayla/), { wait: 4000 });
    await interactive('hata yanıtı beklerken');
    await browser.until(`/Kontrollü kayıt hatası/.test(document.querySelector('.pm-status')?.textContent||'')`, 'hata metni', 8000);
    p = await panel();
    check('ipc-task-response', 'hata sonrası panel: neden görünür, önizleme kalkmış, kilitsiz, durum korunmuş', /Hiçbir şey değişmedi/.test(p.status) && p.busy === 'false' && p.disabled === 0 && !p.preview && p.sel === 'planned' && p.segPressed === 'planned' && p.lib === 'planned', JSON.stringify(p));
    // 3) çıkar → onay → başarı
    await top(); await browser.click(button(/İzleme listesinden çıkar/), { wait: 4000 }); await browser.until(`document.querySelector('.pm-preview')`, 'önizleme 3', 8000); await sleep(200);
    const tConfirm = Date.now();
    await browser.click(button(/Kaydetmeyi onayla/), { wait: 4000 });
    await interactive('onay yanıtı beklerken');
    await browser.until(`window.__fx.library.find(i=>i.id==='cat-1000001').watchStatus==='unspecified'&&document.querySelector('.pm-panel').getAttribute('aria-busy')==='false'`, 'onay tamamlandı', 8000);
    await sleep(300);
    p = await panel(); const elapsed = Date.now() - tConfirm;
    check('ipc-task-response', `onay yanıtı tamamlandı (${elapsed} ms) ve panel son durumda: Belirtilmedi, kilitsiz, segment doğru`, p.lib === 'unspecified' && p.sel === 'unspecified' && p.busy === 'false' && p.disabled === 0 && !p.preview && p.segPressed === 'unspecified' && p.segDisabled === 0 && elapsed < 6000, JSON.stringify(p));
    await browser.until(`!/İzleme listende/.test(document.querySelector('.media-title-page .md-membership')?.textContent||'')`, 'üyelik metni (son IPC turu)', 8000);
    const text = (await snap()).text;
    check('ipc-task-response', 'üyelik “Kütüphanende” (izleme listesinde değil), “Çıkar” gizli', /Kütüphanende/.test(text) && !/İzleme listende/.test(text));
    const rate = await browser.evaluate(`new Promise(res=>{let n=0;const o=new MutationObserver(m=>{n+=m.length});o.observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});setTimeout(()=>{o.disconnect();res(n)},700)})`, { timeout: 5000 }).catch(() => -1);
    info('ipc-task-response', `iş bittikten sonra 0,7 sn'de ${rate} DOM mutasyonu (sessiz durum)`);
  },
  async 'observer-lifecycle'() {
    await fresh();
    await browser.evaluate(`window.__fx.ipcLatency=300;true`);
    const stats = async () => ({ ...(await browser.evaluate(`({obs:window.__fx.observers.size,timers:window.__fx.timers.size})`)), ...(await browser.listeners()) });
    const cycle = async (id, midPending) => {
      await openDetail(id);
      if (midPending) { await browser.click(button(/İzleme listesinden çıkar/), { wait: 3000 }).catch(() => {}); }
      await back(); await sleep(120);
    };
    for (const [id, mid] of [['tt1000001', true], ['tt1000002', false], ['tt1000001', false], ['tt1000002', false]]) await cycle(id, mid); // ısınma: her iki başlık, bekleyen işlemli tur dahil
    await browser.evaluate(`window.__fx.ipcLatency=-1;true`); await sleep(500);
    const base = await stats();
    await browser.evaluate(`window.__fx.ipcLatency=300;true`);
    for (let i = 0; i < 16; i++) await cycle(i % 2 ? 'tt1000002' : 'tt1000001', i % 3 === 0); // bazı turlarda bekleyen işlem varken kapat
    await browser.evaluate(`window.__fx.ipcLatency=-1;true`); await sleep(700);
    const after = await stats();
    const grew = key => after[key] - base[key];
    info('observer-lifecycle', `önce ${JSON.stringify(base)} → sonra ${JSON.stringify(after)}`);
    check('observer-lifecycle', '16 aç/kapat turu sonunda izleyen MutationObserver sayısı artmadı (≤2 tolerans)', grew('obs') <= 2, JSON.stringify({ base: base.obs, after: after.obs }));
    check('observer-lifecycle', 'bekleyen zamanlayıcı birikmedi (≥50 ms)', grew('timers') <= 2, JSON.stringify({ base: base.timers, after: after.timers }));
    check('observer-lifecycle', 'document/window/body dinleyicileri birikmedi', grew('doc') <= 2 && grew('win') <= 2 && grew('body') <= 2, JSON.stringify({ base, after }));
    const tail = await snap();
    check('observer-lifecycle', 'turlardan sonra Keşfet listesi ve odak sağlam', tail.pages === 0 && tail.cards >= 24, JSON.stringify({ pages: tail.pages, cards: tail.cards }));
  },
  async 'observer-storm-defer'() {
    await fresh();
    await openDetail('tt1000001'); await sleep(900);
    await browser.until(`document.querySelector('.media-title-page .cn-status-segments')`, 'durum segmentleri', 8000);
    const timersBefore = await browser.evaluate(`window.__fx.timers.size`);
    // Kasıtlı, SONLU fırtına: iki gözlemcinin de izlediği öznitelikleri 260 kez mikro görevde yazar; ortasında gerçek bir güncelleme olur.
    // Kırıcı devreye girip gözlemciyi kapatır; güncelleme bu pencerede kaçar ve ertelenen enhance() tarafından uygulanmalıdır.
    await browser.evaluate(`(()=>{
      const page=document.querySelector('.media-title-page'),panel=page.querySelector('.pm-panel'),select=panel.querySelector('.pm-watch select'),seg=page.querySelector('.cn-status-segments');
      const dummy=document.createElement('button');dummy.type='button';dummy.textContent='fırtına';panel.append(dummy);
      let left=260,flipped=false;window.__stormDone=false;
      const hostile=new MutationObserver(()=>{
        if(left-->0){dummy.toggleAttribute('disabled');if(left===150&&!flipped){flipped=true;select.value='watching';select.disabled=true;}}
        else{hostile.disconnect();dummy.removeAttribute('disabled');window.__stormDone=true;}
      });
      hostile.observe(panel,{attributes:true,attributeFilter:['disabled'],subtree:true});
      dummy.toggleAttribute('disabled');
      return true;})()`);
    await browser.until(`window.__stormDone===true`, 'fırtına bitti', 5000);
    await sleep(500);
    const state = await browser.evaluate(`(()=>{const seg=[...document.querySelectorAll('.media-title-page .cn-status-segments button')];const hint=[...document.querySelectorAll('.media-title-page .pm-panel button:disabled')].filter(b=>b.textContent!=='fırtına');return {pressed:seg.filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.statusValue).join(','),allDisabled:seg.length>0&&seg.every(b=>b.disabled),hintOk:hint.length>0&&hint.every(b=>b.title&&b.dataset.cinemaTooltip===b.title),hintCount:hint.length,responsive:true}})()`, { timeout: 4000 });
    check('observer-storm-defer', 'fırtına sırasında olan güncelleme sonradan uygulandı: segmentler seçimle (watching) ve devre dışı durumla eşleşti', state.pressed === 'watching' && state.allDisabled, JSON.stringify(state));
    // Not: round4'ün 'button:disabled' ipucu yazımı fırtınasız temel durumda da bu panelde uygulanmıyor; bu yüzden ölçüt yapılmadı. round4/motion ertelemeleri tools ile aynı kalıbı kullanır ama ayrıca ölçülmedi.
    // Fırtınanın ortasında sayfa kapanırsa ertelenen iş kapanmış sayfada çalışmaya devam etmemeli
    await browser.evaluate(`(()=>{const panel=document.querySelector('.media-title-page .pm-panel'),dummy=document.createElement('button');panel.append(dummy);let left=200;window.__stormDone=false;const hostile=new MutationObserver(()=>{if(left-->0)dummy.toggleAttribute('disabled');else{hostile.disconnect();window.__stormDone=true;}});hostile.observe(panel,{attributes:true,attributeFilter:['disabled'],subtree:true});dummy.toggleAttribute('disabled');return true;})()`);
    await browser.evaluate(`document.getElementById('mediaHome').scrollTop=0`); await sleep(100);
    await back(); await sleep(600);
    const timersAfter = await browser.evaluate(`window.__fx.timers.size`);
    check('observer-storm-defer', 'fırtına sürerken sayfa kapatıldı: bekleyen zamanlayıcı kalmadı, sayfa hatası yok', timersAfter <= timersBefore + 1 && (await browser.evaluate('window.__fxErrors')).length === 0, JSON.stringify({ timersBefore, timersAfter, errors: await browser.evaluate('window.__fxErrors') }));
  },
  async 'detail-motion'() {
    // Hareket gerçek duruma bağlı: üyelik ancak doğrulanmış ekleme tamamlanınca vurgulanır; hata ve azaltılmış hareket durumunda yok.
    const animations = () => browser.evaluate(`document.querySelector('.md-strip-member')?.getAnimations().length??-1`, { timeout: 4000 });
    await fresh();
    await openDetail('tt1000002');
    check('detail-motion', 'ekleme öncesi üyelik hücresinde animasyon yok', (await animations()) === 0, String(await animations()));
    await browser.evaluate(`window.__fx.hold('add:tt1000002');true`);
    await browser.click(button(/İzleneceklere ekle/), { wait: 4000 });
    await browser.evaluate(`window.__fx.gates['add:tt1000002'].fail('Kontrollü ekleme hatası');true`); await sleep(500);
    check('detail-motion', 'başarısız ekleme: durum aynı, vurgu animasyonu yok', (await animations()) === 0 && /Kütüphanende yok/.test((await snap()).text), String(await animations()));
    await browser.click(button(/İzleneceklere ekle/), { wait: 4000 });
    await browser.until(`/İzleme listende/.test(document.querySelector('.md-membership-text')?.textContent||'')`, 'üyelik güncellendi', 8000);
    const pulsed = await browser.evaluate(`document.querySelector('.md-strip-member').getAnimations().length`, { timeout: 4000 });
    check('detail-motion', 'başarılı eklemeden sonra üyelik hücresi vurgulanır (animasyon çalışıyor)', pulsed > 0, String(pulsed));
    await sleep(1100);
    check('detail-motion', 'vurgu biter ve kalıcı animasyon bırakmaz', (await animations()) === 0, String(await animations()));
    // Azaltılmış hareket
    await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await fresh();
    await openDetail('tt1000002');
    await browser.click(button(/İzleneceklere ekle/), { wait: 4000 });
    await browser.until(`/İzleme listende/.test(document.querySelector('.md-membership-text')?.textContent||'')`, 'üyelik (azaltılmış hareket)', 8000);
    const reduced = await animations();
    check('detail-motion', 'azaltılmış hareket: durum yine güncellenir ama animasyon çalışmaz', reduced === 0, String(reduced));
    await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  },
  async 'discover-layout'() {
    await fresh({ width: 1440, height: 900 }); await sleep(900);
    const layout = await browser.evaluate(`(()=>{
      const rect=n=>n?.getBoundingClientRect(),vh=innerHeight;
      const heading=rect(document.querySelector('.cv2-discover-section-heading')),firstCard=rect(document.querySelector('.cn-catalog-grid .cn-poster'));
      const row=[...document.querySelectorAll('.cn-catalog-grid .cn-poster')].slice(0,7);
      const metaTops=row.map(c=>Math.round(rect(c.querySelector('.cn-poster-meta')).top)),titleTops=row.map(c=>Math.round(rect(c.querySelector('.cn-poster-title')).top)),posterTops=row.map(c=>Math.round(rect(c.querySelector('.cn-poster-art')).top));
      const head=document.querySelector('.cn-discover-feature-heading'),parts=[...head.children].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').map(n=>{const r=rect(n);return Math.round(r.top+r.height/2)});
      const hero=rect(document.querySelector('.cn-discover-hero'));
      return {vh,hero:Math.round(hero.height),headingTop:Math.round(heading.top),firstCardTop:Math.round(firstCard.top),metaTops,titleTops,posterTops,headRow:parts};})()`);
    const spread = a => Math.max(...a) - Math.min(...a);
    check('discover-layout', `1440×900: katalog başlığı ilk ekranda (üst ${layout.headingTop}px, ekran ${layout.vh}px) ve ilk kart satırı görünür başlıyor`, layout.headingTop < layout.vh - 140 && layout.firstCardTop < layout.vh - 40, JSON.stringify(layout));
    check('discover-layout', `hero yüksekliği sınırlı (${layout.hero}px ≤ 480)`, layout.hero <= 480, String(layout.hero));
    check('discover-layout', 'ilk satırda afiş, başlık ve yıl satırları aynı hizada (uzun başlık ve afişsiz kart dahil)', spread(layout.metaTops) <= 1 && spread(layout.titleTops) <= 1 && spread(layout.posterTops) <= 1, JSON.stringify({ meta: layout.metaTops, title: layout.titleTops }));
    check('discover-layout', 'hero üst satırında en az iki görünür parça aynı çizgide', layout.headRow.length >= 2 && spread(layout.headRow) <= 2, JSON.stringify(layout.headRow));
    const tips = await browser.evaluate(`(c=>({tip:c.title,name:c.querySelector('.cn-poster-title').textContent}))([...document.querySelectorAll('.cn-poster')].find(c=>c.dataset.discoveryId==='tt1000003'))`);
    check('discover-layout', 'uzun başlıklı kartta tam başlık ipucu olarak erişilebilir', tips.tip.startsWith('Bir Deniz Fenerinin') && /Sessiz Kış Üzerine/.test(tips.tip) && tips.tip.includes('(2021)'), JSON.stringify(tips));
    await shot('discover-final');
    await openDetail('tt1000003');
    const h = await browser.evaluate(`(h=>({title:h.title,long:h.classList.contains('cn-title-long')}))(document.querySelector('.cn-film-copy h1'))`);
    check('discover-layout', 'uzun başlıklı detayda tam başlık erişilebilir ve küçültme sınıfı uygulanır', /Sessiz Kış Üzerine/.test(h.title) && h.long, JSON.stringify(h));
  },
  async 'refresh-race'() {
    await fresh();
    await browser.click(`document.querySelector('.md-more')`); await browser.until(`document.querySelectorAll('.cn-poster').length===48`, '48 kart'); await sleep(300);
    await browser.evaluate(`window.__fx.hold('list:unwatched:0');window.__fx.library.push({id:'cat-1000030',kind:'film',title:'x',year:2001,imdbId:'tt1000030',watchStatus:'planned',genres:[],ratings:{},editions:[],extras:[],episodes:[],personalMedia:{},source:null,progress:null,fieldLocks:[]});document.dispatchEvent(new Event('media-library-changed'));true`);
    await browser.evaluate(`window.__fx.gates['list:unwatched:0'].called`);
    await browser.evaluate(`document.getElementById('mediaHome').scrollTop=0`); await sleep(150);
    await browser.click(`document.querySelector('.cn-filter-search input')`); await browser.type('Sessiz'); await browser.key('Enter');
    await browser.until(`document.querySelectorAll('.cn-poster').length>0&&document.querySelectorAll('.cn-poster').length<24`, 'arama sonucu');
    const searched = await snap();
    await browser.evaluate(`window.__fx.gates['list:unwatched:0'].release();true`); await sleep(900);
    const late = await snap();
    check('refresh-race', 'geciken eski yenileme yeni aramayı ezmedi', late.query === 'Sessiz' && late.cards === searched.cards, JSON.stringify({ q: late.query, önce: searched.cards, sonra: late.cards }));
    const dup = await browser.evaluate(`(()=>{const ids=[...document.querySelectorAll('.cn-poster')].map(c=>c.dataset.discoveryKey);return ids.length-new Set(ids).size})()`);
    check('refresh-race', 'aynı yapım iki kez eklenmedi', dup === 0, String(dup));
  },
  async 'library-detail-return'() {
    await fresh();
    await browser.click(`document.querySelector('.md-more')`); await browser.until(`document.querySelectorAll('.cn-poster').length===48`, '48 kart'); await sleep(300);
    await browser.evaluate(`document.getElementById('mediaHome').scrollTop=2300`); await sleep(300);
    const target = await browser.evaluate(`(()=>{const top=document.getElementById('mediaHome').getBoundingClientRect().top;return [...document.querySelectorAll('.cn-poster')].find(c=>c.getBoundingClientRect().top>top+250&&c.getBoundingClientRect().bottom<innerHeight-40).dataset.discoveryId})()`);
    await browser.evaluate(`${card(target)}.scrollIntoView({block:'center'})`); await sleep(250);
    const before = await snap();
    await openDetail(target);
    await browser.click(button(/İzleneceklere ekle/)); await browser.until(`/zleme listene eklendi/.test(document.querySelector('.media-title-page')?.innerText||'')`, 'ekleme');
    await browser.click(button(/Kütüphanede aç/));
    await browser.until(`document.querySelector('.media-title-page:not([data-page-kind=discovery])')&&document.querySelector('.media-title-page h1')?.textContent!=='Yapım yükleniyor…'`, 'kütüphane detayı'); await sleep(600);
    const libPage = await snap();
    check('library-detail-return', 'kütüphane detayı gerçek kayıt kimliğiyle açıldı', libPage.pages === 1 && libPage.kind !== 'discovery', JSON.stringify({ kind: libPage.kind, pages: libPage.pages }));
    const label = await browser.evaluate(`${page}?.querySelector('[data-title-action=back]')?.textContent||''`);
    check('library-detail-return', 'geri düğmesi Keşfet’e döneceğini söyler', /Keşfete dön/.test(label), label);
    await shot('library-detail-from-discover');
    await back(); await sleep(700);
    const after = await snap();
    check('library-detail-return', 'geri: 48 kart, konum ve odak aynı yapımda', after.cards === 48 && Math.abs(after.scroll - before.scroll) < 60 && after.active === target, JSON.stringify({ kart: after.cards, önce: before.scroll, sonra: after.scroll, odak: after.active, hedef: target }));
    check('library-detail-return', 'geri: kart “Kütüphanede” gösterir', after.libCards.includes(target), JSON.stringify(after.libCards));
  },
  async 'reviews-readonly'() {
    await fresh();
    await openDetail('tt1000002');
    await browser.click(button(/Yorumlar ve analiz/)); await sleep(900);
    check('reviews-readonly', 'yorum bağlantısı kişisel kayıt yazmadı', (await writes()).length === 0, JSON.stringify(await writes()));
    const hasAuto = await browser.until(`document.querySelector('[data-review-action=auto]')`, 'yorum düğmesi', 4000).then(() => true, () => false);
    if (!hasAuto) skip('reviews-readonly', 'geciken yorum yanıtının başka yapıma sızmaması', 'kontrollü Chromium düzeneğinde yorum okuma düğmesi kurulmadı (Letterboxd okuma yolu bu turda sınanmadı)');
    else {
      await browser.evaluate(`window.__fx.hold('reviews:tt1000002');true`);
      await browser.click(`document.querySelector('[data-review-action=auto]')`);
      await browser.evaluate(`window.__fx.gates['reviews:tt1000002'].called`);
      await back(); await openDetail('tt1000001');
      await browser.evaluate(`window.__fx.gates['reviews:tt1000002'].release();true`); await sleep(900);
      const late = await snap();
      check('reviews-readonly', 'geciken 2023 yorumları 2019 sayfasına sızmadı', late.h1 === 'The Crossing' && /2019/.test(late.text) && !/border thriller|Tense 2023/.test(late.text), late.text.slice(0, 120));
      check('reviews-readonly', 'yorum okumak kişisel kayıt yazmadı', (await writes()).length === 0, JSON.stringify(await writes()));
    }
    await back(); const home = await snap();
    check('reviews-readonly', 'yorumlardan geri: Keşfet listesi ve odak korunur', home.pages === 0 && home.cards >= 24 && ['tt1000001', 'tt1000002'].includes(home.active), JSON.stringify({ cards: home.cards, active: home.active }));
  },
  async 'back-state'() {
    await fresh();
    await browser.click(`document.querySelector('.md-more')`); await browser.until(`document.querySelectorAll('.cn-poster').length===48`, '48 kart'); await sleep(400);
    await browser.evaluate(`document.getElementById('mediaHome').scrollTop=2300`); await sleep(300);
    const target = await browser.evaluate(`(()=>{const top=document.getElementById('mediaHome').getBoundingClientRect().top;return [...document.querySelectorAll('.cn-poster')].find(c=>c.getBoundingClientRect().top>top+250&&c.getBoundingClientRect().bottom<innerHeight-40).dataset.discoveryId})()`);
    await browser.evaluate(`${card(target)}.scrollIntoView({block:'center'})`); await sleep(250);
    const opened = await snap();
    await openDetail(target);
    await back(); await sleep(400); const after = await snap();
    check('back-state', 'geri: yüklenen 48 kart korunur', after.cards === 48, `kart=${after.cards}`);
    check('back-state', 'geri: liste konumu korunur', Math.abs(after.scroll - opened.scroll) < 40, `önce=${opened.scroll} sonra=${after.scroll}`);
    check('back-state', 'geri: odak geldiği karttadır', after.active === target, `odak=${after.active}`);
    // Aynı akış, yapım bu sırada kütüphaneye eklenirse
    const reopened = await snap();
    await openDetail(target);
    await browser.evaluate(`window.__fx.library.push({id:'cat-x',kind:'film',title:'x',year:2001,imdbId:'${target}',watchStatus:'planned',genres:[],ratings:{},editions:[],extras:[],episodes:[],personalMedia:{},source:null,progress:null,fieldLocks:[]});document.dispatchEvent(new Event('media-library-changed'))`); await sleep(500);
    await back(); await sleep(600); const added = await snap();
    check('back-state', 'kütüphane değişince de 48 kart ve konum korunur', added.cards === 48 && Math.abs(added.scroll - reopened.scroll) < 40, `kart=${added.cards} önce=${reopened.scroll} sonra=${added.scroll}`);
    check('back-state', 'kütüphane değişince kart “Kütüphanede” gösterir', added.libCards.includes(target), JSON.stringify(added.libCards));
    check('back-state', 'kütüphane değişince odak kartta kalır', added.active === target, `odak=${added.active}`);
  },
  async 'search-back-state'() {
    await fresh();
    const catalogSearch=await browser.evaluate(`(()=>{const input=document.querySelector('.cn-filter-search input'),group=input.closest('.mv-search-group');return {visible:input.getClientRects().length>0,width:input.getBoundingClientRect().width,label:input.labels?.[0]?.querySelector('span')?.textContent,submit:group.querySelector('button').getAttribute('aria-label')};})()`);
    check('search-back-state', 'katalog araması erişilebilir ve genel aramadan ayrı adlandırılır', catalogSearch.visible&&catalogSearch.width>0&&catalogSearch.label==='Katalogda ara'&&catalogSearch.submit==='Katalogda ara', JSON.stringify(catalogSearch));
    await browser.click(`document.querySelector('.cn-filter-search input')`);
    await browser.type('Sessiz'); await browser.key('Enter');
    await browser.until(`document.querySelectorAll('.cn-poster').length>0&&[...document.querySelectorAll('.cn-poster-title')].every(n=>/Sessiz/.test(n.textContent))`, 'arama sonucu');
    await sleep(400);
    const first = await browser.evaluate(`document.querySelector('.cn-poster').dataset.discoveryId`);
    await openDetail(first); await back(); await sleep(400);
    const state = await snap();
    check('search-back-state', 'geri: arama metni korunur', state.query === 'Sessiz', `q=${state.query}`);
    check('search-back-state', 'geri: arama sonuçları korunur', state.cards > 0 && state.cards < 24, `kart=${state.cards}`);
    check('search-back-state', 'geri: odak geldiği karttadır', state.active === first, `odak=${state.active}`);
  },
  async visuals() {
    if (!SHOTS) return;
    const openRow = async id => { await browser.evaluate(`MediaDiscoveryUI.openDetail(window.__fx.catalog.find(r=>r.providerId==='${id}'));true`); await browser.until(`document.querySelector('.media-title-page[data-page-kind=discovery] h1')`, 'detay ' + id); await sleep(700); };
    for (const [w, h] of [[1440, 900], [1920, 1080]]) {
      await fresh({ width: w, height: h });
      await sleep(900); await shot(`discover-${w}-top`);
      await browser.evaluate(`document.getElementById('mediaHome').scrollTop=Math.round(innerHeight*0.55)`); await sleep(350);
      await shot(`discover-${w}-catalog`);
      await browser.evaluate(`document.getElementById('mediaHome').scrollTop=0`); await sleep(200);
      if (w === 1920) break;
      for (const [id, name] of [['tt1000002', 'detail-2023'], ['tt1000001', 'detail-2019-library'], ['tt1000003', 'detail-long-title'], ['tt1000004', 'detail-no-poster'], ['tt1000007', 'detail-series']]) {
        await openRow(id); await shot(name);
        await browser.evaluate(`document.getElementById('mediaHome').scrollTop=Math.round(innerHeight*0.8)`); await sleep(300); await shot(name + '-lower');
        await back();
      }
    }
    await fresh({ width: 1100, height: 760 }); await shot('discover-1100-top');
    await fresh({ theme: 'light' }); await shot('discover-1440-light-top');
  },
};

let crashed = false;
try {
  for (const [name, run] of Object.entries(scenarios)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    console.log(`\n# ${name}`);
    try { await run(); } catch (error) { crashed = true; check(name, 'senaryo hatasız tamamlandı', false, error.message); if (SHOTS) await browser.screenshot(path.join(SHOTS, name + '-hata.png')).catch(() => {}); }
  }
  const pageErrors = [...browser.pageErrors];
  check('genel', 'sayfa hatası / işlenmemiş reddedilme yok', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} finally { await browser.close(); staged.cleanup(); }
const failed = results.filter(row => !row.ok);
console.log(`\n${results.filter(row => row.ok && !row.skipped).length}/${results.length} kontrol geçti, ${results.filter(row => row.skipped).length} atlandı`);
process.exit(failed.length || crashed ? 1 : 0);
