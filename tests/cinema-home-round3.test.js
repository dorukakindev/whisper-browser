'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), { JSDOM } = require('jsdom');
function setup() {
  const dom = new JSDOM('<main></main>', { runScripts: 'outside-only' }), w = dom.window;
  w.UiLocale = { get: () => 'tr' };
  w.MediaHomeModel = require('../src/renderer/media-home-model');
  w.ResizeObserver = class { observe() {} disconnect() {} };
  for (const file of ['media-visual', 'cinema-ui']) w.eval(fs.readFileSync(`src/renderer/${file}.js`, 'utf8'));
  return { dom, w, d: w.document };
}
test('Fallback initials skip punctuation and emoji while preserving Unicode letters and digits', () => {
  const h = setup(); try {
    for (const [title, expected] of [['TikTok - Make Your Day', 'TM'], ['🎬 — İstanbul / 2049', 'İ2'], ['--- !!!', ''], ['Çığlık • Ötesi', 'ÇÖ']]) {
      const art = h.d.createElement('div'); h.w.MediaVisual.art(art, title);
      assert.equal(art.querySelector('.mv-art-fallback').textContent, expected);
    }
    const a = h.d.createElement('div'), b = h.d.createElement('div');
    h.w.MediaVisual.art(a, 'TikTok - Make Your Day'); h.w.MediaVisual.art(b, 'A different title');
    assert.notEqual(a.style.getPropertyValue('--mv-art-hue'), b.style.getPropertyValue('--mv-art-hue'));
  } finally { h.dom.window.close(); }
});
test('Home shows source with duration and moves functional row arrows outside card content', async () => {
  const h = setup(); try {
    let played = 0;
    const item = { key: 'youtube:abcdefghijk', type: 'youtube', title: 'TikTok - Make Your Day', duration: 780, position: 90 };
    const page = h.w.CinemaUI.home(h.d.querySelector('main'), {
      items: [], continuing: [item], progress: h.w.MediaHomeModel.progress,
      art: (_, cls) => { const node = h.d.createElement('div'); node.className = cls; return node; },
      hasArtwork: () => true, play: () => played++, details: () => {}, page: () => {}, addFolder: () => {},
      minutes: () => '13 dk', onFeature: () => {}
    });
    assert.equal(h.d.querySelector('.cn-home-hero .cn-meta').textContent, 'Web videosuYouTube13 dk', 'the kind is named once, in the meta line');
    assert.equal(h.d.querySelector('.cn-poster-art .mv-art-fallback').textContent, 'TM');
    assert.equal(h.d.querySelector('.cn-source-mark').getAttribute('aria-label'), 'YouTube');
    const grid = h.d.querySelector('.cn-poster-row');
    Object.defineProperties(grid, { scrollWidth: { value: 1200 }, clientWidth: { value: 400 } });
    grid.scrollLeft = 0; let moved;
    grid.scrollBy = options => { moved = options.left; };
    h.w.matchMedia = () => ({ matches: true });
    await Promise.resolve();
    assert.equal(h.d.querySelector('.mv-rail > button'), null);
    h.d.querySelector('.cn-heading-tools .mv-rail-next').click();
    assert.equal(moved, 320);
    h.d.querySelector('.cn-poster').click(); await Promise.resolve();
    assert.equal(played, 1);
    page.dispose();
  } finally { h.dom.window.close(); }
});


test('v2 home doors and studio invoke existing routes without inventing library counts or a second player', async () => {
  const h=setup();try{
    const routes=[],modes=[],opens=[];h.w.PodcastLinkUI={enter:mode=>modes.push(mode)};
    const view=h.w.CinemaUI.home(h.d.querySelector('main'),{
      items:[],watch:[],continuing:[],progress:h.w.MediaHomeModel.progress,
      art:(_,cls)=>{const node=h.d.createElement('div');node.className=cls;return node;},
      hasArtwork:()=>false,play:()=>opens.push('play'),details:()=>{},page:route=>routes.push(route),addFolder:()=>opens.push('folder'),minutes:()=>'',onFeature:()=>{}
    });
    assert(h.d.querySelector('.cv2-first-use'));
    assert.equal(h.d.querySelectorAll('.cv2-home-door').length,8);
    assert([...h.d.querySelectorAll('.cv2-home-door')].every(door=>door.querySelectorAll('strong').length===1&&!door.querySelector(':scope > span')));
    h.d.querySelectorAll('.cv2-home-door')[3].click();
    h.d.querySelector('.cv2-studio-actions button').click();await Promise.resolve();
    assert.deepEqual(routes,['radio']);assert.deepEqual(modes,['bilingual']);assert.equal(opens.length,0);
    assert.equal(h.d.querySelectorAll('audio,video').length,0);
    view.dispose();
  }finally{h.dom.window.close();}
});

test('v2 home opens catalog details when no playable source exists and keeps stored title intact',async()=>{
  const h=setup();try{
    const item={id:'catalog-a',title:'Original_source.mp4',hasPoster:true},opened=[];
    const view=h.w.CinemaUI.home(h.d.querySelector('main'),{items:[item],continuing:[],progress:h.w.MediaHomeModel.progress,
      art:(_,cls)=>{const node=h.d.createElement('div');node.className=cls;return node;},hasArtwork:()=>true,
      play:()=>assert.fail('No playable source'),details:id=>opened.push(id),page:()=>{},addFolder:()=>{},minutes:()=>'',onFeature:()=>{}});
    h.d.querySelector('.cn-hero-actions button').click();await Promise.resolve();
    assert.deepEqual(opened,['catalog-a']);assert.equal(item.title,'Original_source.mp4');view.dispose();
  }finally{h.dom.window.close();}
});

test('Home feature skips web access error pages while keeping their history card',()=>{
 const h=setup();try{
  const rows=[{key:'browser:https://tiktok.com/@private',type:'browser',title:'Bu hesap özel. Videolarını görmek için bu hesabı takip edin',position:5,duration:6},{key:'file:d:/film.mkv',title:'A real film',position:10,duration:100}];
  const view=h.w.CinemaUI.home(h.d.querySelector('main'),{items:[],continuing:rows,progress:h.w.MediaHomeModel.progress,
   art:(_,cls)=>{const node=h.d.createElement('div');node.className=cls;return node;},hasArtwork:()=>false,play(){},details(){},page(){},addFolder(){},minutes:()=>'',onFeature(){}});
  assert.equal(h.d.querySelector('.cn-home-hero h1').textContent,'A real film');
  assert(h.d.querySelector('.cn-home-shelves').textContent.includes('Bu hesap özel'));
  assert.equal(rows.length,2);view.dispose();
 }finally{h.dom.window.close();}
});

test('Home hero says where and when you left off, names the source once, never shows a tab title as the video name, and offers the other unfinished items', async () => {
  const h = setup(); try {
    const played = [], now = Date.now(), art = (_, cls) => { const node = h.d.createElement('div'); node.className = cls; return node; };
    const rows = [
      { key: 'youtube:abcdefghijk', type: 'youtube', title: '(3) YouTube', duration: 1800, position: 610, lastWatched: now - 2 * 3600e3 },
      { key: 'file:d:/a.mkv', type: 'local', title: 'Film A', duration: 6000, position: 2310, lastWatched: now - 86400e3, source: { type: 'local', value: 'D:/a.mkv' } },
      { key: 'file:d:/b.mkv', type: 'local', title: 'Film B', duration: 6000, position: 600, lastWatched: now - 3 * 86400e3, source: { type: 'local', value: 'D:/b.mkv' } },
      { key: 'file:d:/c.mkv', type: 'local', title: 'Film C', duration: 6000, position: 5900, lastWatched: now - 4 * 86400e3, source: { type: 'local', value: 'D:/c.mkv' } }];
    h.w.CinemaUI.home(h.d.querySelector('main'), { items: [], continuing: rows, progress: h.w.MediaHomeModel.progress, art, hasArtwork: () => true,
      play: item => played.push(item.key), details: () => {}, page: () => {}, addFolder: () => {}, minutes: s => Math.round(s / 60) + ' dk', onFeature: () => {} });
    const hero = h.d.querySelector('.cn-home-hero');
    assert.equal(hero.querySelector('h1').textContent, 'Başlıksız web videosu', 'a tab title like "(3) YouTube" is not the video name');
    assert.match(hero.querySelector('.cn-eyebrow').textContent, /Kaldığın yerden · 2 saat önce/);
    assert.match(hero.querySelector('.cn-hero-progress small').textContent, /Kaldığın yer 10:10 · 20 dk kaldı/);
    assert.equal((hero.querySelector('.cn-home-hero .cn-meta, .cn-meta').textContent.match(/Web videosu/g) || []).length, 1, 'the kind is named once');
    assert.equal(hero.querySelector('.cv2-browser-chrome span').textContent, 'youtube.com');
    const chips = [...hero.querySelectorAll('.cv2-next-chip')];
    assert.deepEqual(chips.map(chip => chip.querySelector('strong').textContent), ['Film A', 'Film B'], 'finished or nearly finished items are not offered as "in progress"');
    assert.match(chips[0].querySelector('small').textContent, /38:30 · dün/);
    chips[0].click(); await new Promise(setImmediate); assert.deepEqual(played, ['file:d:/a.mkv'], 'a chip resumes exactly its own item');
    const long = h.d.createElement('main'); h.d.body.append(long);
    h.w.CinemaUI.home(long, { items: [], continuing: [{ key: 'file:d:/l.mkv', type: 'local', title: 'U'.repeat(80), duration: 100, position: 10, source: { type: 'local', value: 'D:/l.mkv' } }], progress: h.w.MediaHomeModel.progress, art, hasArtwork: () => true, play() {}, details() {}, page() {}, addFolder() {}, minutes: () => '2 dk', onFeature() {} });
    const heading = long.querySelector('.cn-home-hero h1'); assert(heading.classList.contains('cv2-title-long')); assert.equal(heading.title, 'U'.repeat(80), 'the full title stays available');
  } finally { h.dom.window.close(); }
});
