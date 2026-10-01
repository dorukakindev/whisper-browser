// Kuyruk-50 madde 22 — iz kökeni inceleme: browserTrackOriginSummary ve
// browserTrackSelectionReason davranış kilitleri (vm dilimi).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const start = source.indexOf('// ---- İz kökeni inceleme görünümü');
const end = source.indexOf('function browserTrackSelection(secondary');
assert(start > 0 && end > start, 'madde-22 dilim işaretleri bulunamadı');
const slice = source.slice(start, end);

const sandbox = {
  Math, Number, String, JSON,
  globalThis: {},
  $: () => null,
  player: { browserTracks: [], browserCeaCapture: null },
  completedBrowserCeaTrack: () => null,
  browserTrackSelection: () => null,
};
vm.createContext(sandbox);
vm.runInContext(slice, sandbox);

const { browserTrackOriginSummary, browserTrackSelectionReason, renderBrowserTrackOrigin } = sandbox;

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---- browserTrackOriginSummary ----
check('boş iz → boş satır', browserTrackOriginSummary(null) === '');
check('boş iz → tanımsız da güvenli', browserTrackOriginSummary({}) === 'web');

const ceaTrack = {
  role: 'source', source: 'network', format: 'cea-608', captureKind: 'embedded-cea',
  language: 'en', mediaId: 'netflix:81215568', cueCount: 412,
  timeTransform: { offsetSeconds: 1.24, matches: 5, confidence: 'high' },
};
const summary = browserTrackOriginSummary(ceaTrack);
check('CEA köken: gömülü CEA etiketi', summary.includes('gömülü CEA'), summary);
check('CEA köken: format', summary.includes('cea-608'), summary);
check('CEA köken: dil', summary.includes('EN'), summary);
check('CEA köken: video kimliği', summary.includes('netflix:81215568'), summary);
check('CEA köken: kalibrasyon', summary.includes('+1.240') && summary.includes('5 eşleşme'), summary);

const netTrack = { role: 'source', source: 'network', format: 'vtt', language: 'tr', mediaId: '' };
const netSummary = browserTrackOriginSummary(netTrack);
check('ağ köken: ağ yakalama + vtt + TR', netSummary.includes('ağ yakalama') && netSummary.includes('vtt') && netSummary.includes('TR'), netSummary);
check('ağ köken: mediaId yoksa video satırı yok', !netSummary.includes('video kimliği'), netSummary);
check('ağ köken: transform yoksa kalibre yok', !netSummary.includes('kalibre'), netSummary);

check('sıfır offset kalibre göstermez',
  !browserTrackOriginSummary({ source: 'manifest', timeTransform: { offsetSeconds: 0, matches: 3 } }).includes('kalibre'));
check('NaN offset kalibre göstermez',
  !browserTrackOriginSummary({ source: 'manifest', timeTransform: { offsetSeconds: NaN } }).includes('kalibre'));
check('negatif offset işaretli gösterilir',
  browserTrackOriginSummary({ source: 'manifest', timeTransform: { offsetSeconds: -2.5, matches: 2 } }).includes('-2.500'));
check('translation rolü çeviri sayılır', browserTrackOriginSummary({ role: 'translation' }).includes('çeviri'));
check('text-track kaynağı site izi', browserTrackOriginSummary({ source: 'text-track' }).includes('site izi'));
check('live-asr kaynağı', browserTrackOriginSummary({ source: 'live-asr' }).includes('canlı ASR'));
check('bilinmeyen kaynak ham değeri korur', browserTrackOriginSummary({ source: 'acme-cdn' }).includes('acme-cdn'));
check('uzun mediaId 60’a kesilir', !browserTrackOriginSummary({ mediaId: 'x'.repeat(300) }).includes('x'.repeat(61)));

// ---- browserTrackSelectionReason ----
const t1 = { id: 'a', role: 'source', path: '/a.srt' };
const t2 = { id: 'b', role: 'source', path: '/b.srt' };
const tr = { id: 'c', role: 'translation', path: '/c.srt' };

sandbox.player.browserTracks = [t1];
check('tek iz → gerekçe yok', browserTrackSelectionReason(t1) === '');

sandbox.player.browserTracks = [t1, t2, tr];
sandbox.browserTrackSelection = () => t2;
check('listeden seçili iz gerekçesi', browserTrackSelectionReason(t2).includes('iz listesinde seçili'), browserTrackSelectionReason(t2));
check('aday sayısı translation hariç', browserTrackSelectionReason(t2).startsWith('2 '), browserTrackSelectionReason(t2));
sandbox.browserTrackSelection = () => null;
check('seçim yoksa ilk aday', browserTrackSelectionReason(t1).includes('ilk kaynak izi'), browserTrackSelectionReason(t1));
check('diğer aday bekliyor', browserTrackSelectionReason(t2).includes('kaynak adayı olarak'), browserTrackSelectionReason(t2));

const ceaDone = { id: 'cea', role: 'source', path: '/cea.srt' };
sandbox.player.browserTracks = [t1, t2, ceaDone];
sandbox.player.browserCeaCapture = { state: 'complete', tracks: [] };
sandbox.completedBrowserCeaTrack = () => ceaDone;
check('tamamlanmış CEA önceliği', browserTrackSelectionReason(ceaDone).includes('tamamlanmış gömülü'), browserTrackSelectionReason(ceaDone));
check('CEA tamamsa seçili iz aday gerekçesi korur', browserTrackSelectionReason(t2).includes('kaynak adayı'), browserTrackSelectionReason(t2));
sandbox.player.browserCeaCapture = null;
sandbox.completedBrowserCeaTrack = () => null;

// ---- renderBrowserTrackOrigin (DOM ucu) ----
let lastText = null, lastHidden = true, lastTitle = null;
const fakeBox = {
  set textContent(v) { lastText = v; },
  get textContent() { return lastText; },
  set title(v) { lastTitle = v; },
  classList: { add: (c) => { if (c === 'hidden') lastHidden = true; }, remove: (c) => { if (c === 'hidden') lastHidden = false; } },
};
sandbox.$ = (id) => (id === 'browserTrackOrigin' ? fakeBox : null);
check('render: iz yoksa gizlenir', (renderBrowserTrackOrigin(null), lastHidden === true));
sandbox.player.browserTracks = [ceaTrack, t2];
renderBrowserTrackOrigin(ceaTrack);
check('render: özet satırı dolu', typeof lastText === 'string' && lastText.includes('gömülü CEA'), lastText);
check('render: gerekçe dahil', lastText.includes('kaynak adayı'), lastText);
check('render: görünür', lastHidden === false);
check('render: title sayfa+kaynak URL içerir', (ceaTrack.pageUrl = 'https://netflix.com/watch/1', ceaTrack.sourceUrl = 'https://nflxvideo.net/x.vtt',
  renderBrowserTrackOrigin(ceaTrack), lastTitle.includes('netflix.com') && lastTitle.includes('nflxvideo.net')), lastTitle);

console.log(`browser-track-origin: ${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
