#!/usr/bin/env node
// Sahne kompozisyonları: gerçek renderer HTML/CSS/JS'si, kontrollü kaynaklarla Chromium'da.
//   node tests/chromium-sahne.smoke.mjs [--shots <klasör>] [--tag <ad>] [--only a,b] [--root <klasör>] [--browser <yol>]
// Mock; gerçek Electron, canlı sağlayıcı, native video veya ses kanıtı değildir.
import path from 'node:path';
import { launch, stageRenderer, ROOT, sleep } from './support/chromium-fixture.mjs';
const args = process.argv.slice(2), option = (n, d = '') => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const ROOT_DIR = option('--root', ROOT), SHOTS = option('--shots'), TAG = option('--tag', 'run'), ONLY = option('--only').split(',').filter(Boolean), BROWSER = option('--browser');
const results = [], check = (name, ok, detail = '') => { results.push({ ok: !!ok }); console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : ' — ' + detail}`); };
const staged = stageRenderer([path.join(ROOT, 'tests/support/discover-fixture-stub.js'), path.join(ROOT, 'tests/support/dub-panel-fixture-stub.js')], { rootDir: ROOT_DIR });
const browser = await launch({ browser: BROWSER, width: 1920, height: 1080 });
const open = async (mode, variant) => {
  await browser.goto(staged.url); await sleep(1500);
  await browser.until(`window.__dub&&window.CinemaSahne`, 'sahne');
  const r = await browser.evaluate(`window.__fx.setLocale('tr');applyUiTheme('dark');window.__dub.sahne('${mode}','${variant}')`); await sleep(1200); return r;
};
const geometry = () => browser.evaluate(`(()=>{const q=s=>document.querySelector(s),r=el=>{if(!el)return null;const b=el.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}};
 const cards=[...document.querySelectorAll('.sh-cards [data-i]')],vis=cards.filter(c=>c.getClientRects().length);
 return {mounted:!!q('.sh'),mode:q('.sh')?.dataset.mode||'',main:r(q('.sh-main')),media:r(q('.sh-theater')),panel:r(q('.sh-cardsbox')),cover:r(q('.sh-cover')),title:q('.sh-title')?.textContent||'',cards:cards.length,visibleCards:vis.length,
  blank:vis.filter(c=>!c.textContent.replace(/\\d+:\\d{2}/,'').trim()).length,docScrollX:document.documentElement.scrollWidth>document.documentElement.clientWidth,active:q('.sh-cards .on, .sh-cards [aria-current]')?.textContent.slice(0,60)||''}})()`);
const shot = async name => { if (SHOTS) await browser.screenshot(path.join(SHOTS, `${TAG}-${name}.png`)); };
const cases = [['podcast', 'both', 'podcast-both'], ['study', 'both', 'study-both'], ['podcast', 'single', 'podcast-single'], ['study', 'single', 'study-single'], ['podcast', 'untimed', 'podcast-untimed'], ['cinema', 'single', 'cinema-single'], ['study', 'missing', 'study-missing']];
for (const [mode, variant, name] of cases) {
  if (ONLY.length && !ONLY.includes(name)) continue; console.log(`\n[${name}]`);
  try {
    const r = await open(mode, variant); const g = await geometry(); await shot(name); console.log('  bilgi:', JSON.stringify(g));
    check(`${name}: Sahne açıldı`, r?.ok && g.mounted, JSON.stringify({ r, g }));
    if (mode === 'cinema') {
      const dock = await browser.evaluate(`(() => {
        const stage = CinemaSahne.current, language = stage.q('[data-a=display]');
        return {language:getComputedStyle(language).display, mode:stage.displayMode(),
          volume:stage.q('.sh-local-volume').getBoundingClientRect().width};
      })()`);
      check('Oynatıcı: tek altyazıda dil düğmesi gizli ve ses denetimi görünür', dock.language === 'none' && dock.mode === 'src' && dock.volume > 0, JSON.stringify(dock));
      const handoff = await browser.evaluate(`(() => {
        CinemaSahne.open({mode:'study'});
        let stage=CinemaSahne.current, query=stage.q('[data-r=q]');
        query.value='good translation';query.dispatchEvent(new Event('input',{bubbles:true}));
        stage.moveMatch(1);
        const time=stage.a.state().time;
        CinemaSahne.open({mode:'cinema'});stage=CinemaSahne.current;
        return {query:stage.q('[data-r=q]').value,selected:stage.matchLine?.dataset.i,open:stage.s.transcript,time:stage.a.state().time===time,commands:window.__dub.stageCommands.length};
      })()`);
      check('Görünüm değişince arama ve oynatma konumu korunur',handoff.query==='good translation' && handoff.selected==='3' && handoff.open && handoff.time && !handoff.commands,JSON.stringify(handoff));
      await shot('cinema-search-handoff');
      const drawerDock=await browser.evaluate(`(()=>{const stage=CinemaSahne.current,drawer=stage.q('.sh-cardsbox').getBoundingClientRect(),dock=stage.q('.sh-dock').getBoundingClientRect();return {drawerBottom:drawer.bottom,dockTop:dock.top};})()`);
      check('Açık transkript alt oynatıcı araçlarını örtmez',drawerDock.drawerBottom<=drawerDock.dockTop,JSON.stringify(drawerDock));
      const timing = await browser.evaluate(`(async () => {
        const stage=CinemaSahne.current;
        stage.q('.sh-top-r [data-a=panel]').click();
        const button=()=>stage.q('[data-pid="action:timing-preview-source"]');
        button().click();
        await new Promise(resolve=>setTimeout(resolve,100));
        const bounds=[player.abA,player.abB];
        stage.q('.sh-offset-actions button:nth-child(2)').click();
        return {active:button().getAttribute('aria-pressed'), offset:player.offset,
          bounds, fixed:bounds[0]===player.abA&&bounds[1]===player.abB};
      })()`);
      check('Zamanlama önizlemesinde 0,1 sn kaydırma ses döngüsünü oynatmaz',timing.active==='true' && timing.offset===.1 && timing.bounds[0]===21 && timing.fixed,JSON.stringify(timing));
      await shot('cinema-timing-preview');
      const ended=await browser.evaluate(`(() => {CinemaSahne.current.q('[data-pclose]').click();return player.abA===null&&player.abB===null;})()`);
      check('İşlemler kapanınca önizleme döngüsü temizlenir',ended);
      const header = await browser.evaluate(`(() => {
        const stage = CinemaSahne.current, rect = el => el.getBoundingClientRect();
        const names = ['sleep','classic','fullscreen'].map(a => stage.q('.sh-top-r [data-a='+a+']')?.getAttribute('aria-label') || '');
        const sub = stage.q('.sh-cinema-meta p').textContent;
        stage.q('.sh-top-r [data-a=panel]').click();
        const panel = stage.q('.sh-panel'), context = panel.querySelector('.sh-panel-context'), work = panel.querySelector('.sh-panel-workspace');
        const overlap = rect(context).bottom > rect(work).top + 1;
        stage.q('[data-pclose]').click();
        return {names, sub, overlap, generic: /Bilingual viewing workspace|Çift dilli izleme/.test(sub),
          bars: Math.round(rect(document.querySelector('.player-head')).height + rect(stage.q('.sh-top')).height + rect(stage.q('.sh-workbar')).height)};
      })()`);
      check('Üst yapı: ikon düğmelerinin erişilebilir adı var, genel çalışma alanı cümlesi film alt satırında yok, işlem paneli bağlam metni çalışma alanına binmiyor', header.names.every(Boolean) && !header.generic && !header.overlap, JSON.stringify(header));
      console.log('  üst yapı toplam yükseklik:', header.bars + 'px');
      continue;
    }
    check(`${name}: görünen metin satırı var ve hiçbiri boş değil, sayfa yatay taşmıyor`, g.visibleCards > 0 && g.blank === 0 && !g.docScrollX, JSON.stringify(g));
    if (variant === 'both') {
      const layout = await browser.evaluate(`(() => {
        const stage = CinemaSahne.current, state = stage.a.state, info = stage.a.info;
        stage.restoreCaptionFixture = () => { stage.a.state=state;stage.a.info=info;stage.tick(); };
        stage.a.info=()=>({...info(),audio:false,webVideo:false});
        const strip=stage.q(stage.o.mode==='study'?'[data-r=subs]':'[data-r=liveSpeech]');
        const rect=el=>{const r=el.getBoundingClientRect();return [r.y,r.height];};
        const frames=[21,27.5,28,27.5].map(time=>{
          stage.a.state=()=>({...state(),time,displayTime:time});stage.tick();
          const lines=stage.o.mode==='study'?['s','t']:['liveSource','liveTranslation'];
          return {strip:rect(strip),video:rect(stage.q('.sh-screenwrap')),dock:rect(stage.q('.sh-dock')),
            visible:!strip.hidden,text:lines.map(key=>stage.q('[data-r='+key+']').textContent.trim()).join('')};
        });
        return {frames,stable:frames.every(f=>f.visible&&f.strip[1]>0&&
          ['strip','video','dock'].every(key=>f[key].every((v,i)=>Math.abs(v-frames[0][key][i])<1))),
          clears:!!frames[0].text&&!frames[1].text&&!!frames[2].text&&!frames[3].text};
      })()`);
      check(`${name}: konuşma aralarında şerit kalır, eski metin temizlenir ve video/kontrol yerleşimi değişmez`,layout.stable&&layout.clears,JSON.stringify(layout));
      await shot(name+'-silent-gap');
      await browser.evaluate(`(() => { const stage=CinemaSahne.current;stage.restoreCaptionFixture();delete stage.restoreCaptionFixture; })()`);
    }
    if (name === 'study-single') {
      const reading = await browser.evaluate(`(() => {
        const stage = CinemaSahne.current, subtitle = stage.q('[data-r=subs]');
        const height = subtitle.getBoundingClientRect().height;
        const text = stage.q('[data-r=s]'), size = getComputedStyle(text).fontSize;
        stage.writeCaption(subtitle,'Short sentence.','');
        const stable = height > 0 && height === subtitle.getBoundingClientRect().height && size === getComputedStyle(text).fontSize;
        stage.tick();
        const query=stage.q('[data-r=q]'), commands=[];
        stage.a.cmd=(...args)=>{commands.push(args[0]);return {ok:true};};
        query.value='good translation';
        query.dispatchEvent(new Event('input',{bubbles:true}));
        query.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
        const match=stage.q('.sh-query-match');
        const highlights=CSS.highlights.get('sahne-transcript-match');
        const matches=Array.from(highlights || [],range=>range.toString());
        query.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        return {stable,wrap:getComputedStyle(text).textWrapStyle,matches,selected:match?.dataset.i,commands};
      })()`);
      check('Tek altyazıda kısa ve uzun cümle aynı alanı ve yazı boyutunu kullanır', reading.stable && reading.wrap==='balance', JSON.stringify(reading));
      check('Arama metni vurgular, ok tuşu seçer ve Enter oynatır', reading.matches.length > 0 && reading.matches.every(text=>text==='good translation') && reading.selected==='3' && reading.commands.join(',')==='playCue', JSON.stringify(reading));
      await shot('study-single-search');
    }
    if (variant === 'missing') {
      const missing = await browser.evaluate(`(() => {
        const stage = CinemaSahne.current;
        stage.q('[data-d=tr]').click();
        stage.q('[data-a=missingFilter]').click();
        stage.q('[data-a=missingNext]').click();
        return {labels:Array.from(stage.root.querySelectorAll('.sh-card:not([hidden]) .sh-translation-missing'), el=>el.textContent),
          shown:stage.lines.filter(line=>!line.hidden).length, selected:stage.q('.sh-missing-current')?.dataset.i};
      })()`);
      check('Tek altyazı görünümünde doğrulanmış ve olası eksikler ayrılır', missing.shown===2 && missing.labels.join('|')==='Çeviri eksik|Çeviri eksik olabilir' && missing.selected==='3', JSON.stringify(missing));
      await sleep(250);
      await shot('study-missing-filtered');
    }
    if (name === 'podcast-both') {
      await browser.evaluate(`(() => {
        MediaShelfUI.podcastTaskState = () => ({hasSourceTranscript:true, job:{state:'done'},
          translationRetry:{partial:true, failed:12, completed:207, total:219, canRetry:true}});
        CinemaSahne.current.tick();
      })()`);
      await shot('podcast-partial');
      const status = await browser.evaluate(`(() => {
        const stage = CinemaSahne.current, message = stage.q('[data-r=jobt]');
        const job = stage.q('[data-r=job]');
        return {visible:!job.hidden && !stage.q('[data-a=jobretry]').hidden,
          count:stage.q('[data-a=jobretry]').textContent,
          duplicate:!!stage.q('[data-task=retry-translation]'),
          wraps:getComputedStyle(message).whiteSpace==='normal' && message.scrollWidth<=message.clientWidth};
      })()`);
      check('Podcast: kısmi çeviri sayısı ve tek tamamlama düğmesi görünür', status.visible && /12/.test(status.count) && !status.duplicate && status.wraps, JSON.stringify(status));
    }
    if (variant === 'both') {
      const sections = await browser.evaluate(`(() => {
        const stage = CinemaSahne.current;
        stage.q('.sh-top-r [data-a=panel]').click();
        return Array.from(stage.root.querySelectorAll('.sh-psec h3'), heading => heading.textContent);
      })()`);
      check(`${name}: İşlemler ilk sırada Podcast eylemlerini gösteriyor ve kuyruğu koruyor`,
        sections[0] === 'Podcast işlemleri' && sections.includes('Dinleme kuyruğu'), JSON.stringify(sections));
      await shot(name + '-tasks');
    }
  } catch (error) { check(name + ' çalıştı', false, error.message); }
}
const errors = await browser.evaluate(`window.__fxErrors||[]`).catch(() => []);
check('sayfa hatası yok', errors.length === 0, JSON.stringify(errors).slice(0, 300));
await browser.close?.(); staged.cleanup();
const failed = results.filter(r => !r.ok).length; console.log(`\n${results.length - failed}/${results.length} kontrol geçti`); process.exit(failed ? 1 : 0);
