const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const browserSubtitleSync = require('../src/browser-subtitle-sync');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { error.message = name + ': ' + error.message; throw error; }
}

function slice(from, to) {
  const start = renderer.indexOf(from);
  assert(start >= 0, 'başlangıç bulunamadı: ' + from);
  const end = renderer.indexOf(to, start);
  assert(end > start, 'bitiş bulunamadı: ' + to);
  return renderer.slice(start, end);
}

test('panel kaynak, çeviri, seçim ve üç değiştirme eylemini sunuyor', () => {
  for (const id of ['subtitleFindText', 'subtitleReplaceText', 'subtitleFindField',
    'subtitleFindCase', 'subtitleFindWhole', 'subtitleFindResults',
    'subtitleFindUndo', 'subtitleFindRedo',
    'subtitleReplaceOne', 'subtitleReplaceSelected', 'subtitleReplaceAll']) {
    assert(html.includes('id="' + id + '"'), 'eksik kontrol: ' + id);
  }
});

test('saf literal modül rendererdan önce yükleniyor', () => {
  assert(html.indexOf('../subtitle-find-replace.js') < html.indexOf('renderer.js'));
});

test('arama birleşmiş görünüm yerine iki kanalın ham cue dizilerini kullanıyor', () => {
  const body = slice('function subtitleFindDescriptors()', 'function subtitleFindEntries()');
  assert(/player\.cuesRaw \|\| player\.cues/.test(body));
  assert(/player\.cues2Raw \|\| player\.cues2/.test(body));
  assert(/sub2Raw/.test(body) && /sub2Format/.test(body));
});

test('gecikmeli arama hem arama hem medya kuşağıyla korunuyor', () => {
  const body = slice('function renderSubtitleFindMatches', 'function setSubtitleFindReplaceOpen');
  assert(/searchGeneration !== player\.subtitleFindReplace\.generation/.test(body));
  assert(/mediaGeneration !== currentGeneration\(\)/.test(body));
});

test('yazım sürerken aynı medyada altyazı değişirse sonuç belleğe uygulanmıyor', () => {
  const apply = slice('async function applySubtitleFindReplacement', 'function openPlayer');
  assert(/subtitleBulkFileStateStillMatches\(prepared\.files, 'before'\)/.test(apply));
  assert(/generation !== currentGeneration\(\)/.test(apply) && /mediaKey !== player\.mediaKey/.test(apply));
});

test('dosya işlemleri yol bazında gruplanıp dosya başına bir kez yazılıyor', () => {
  const prepare = slice('function prepareSubtitleBulkOperations', 'function subtitleBulkLogChanges');
  const write = slice('async function writeSubtitleBulkFiles', 'function browserBulkStateStillMatches');
  assert(/fileMap = new Map/.test(prepare) && /fileMap\.get\(descriptor\.path\)/.test(prepare));
  assert(/for \(const operation of files\)/.test(write));
  assert.equal((write.match(/window\.api\.writeSubtitle\(operation\.path/g) || []).length, 1);
});

test('browser çevirisi dosyaya değil kalıcı kullanıcı override kaydına gidiyor', () => {
  const prepare = slice('function prepareSubtitleBulkOperations', 'function subtitleBulkLogChanges');
  assert(/descriptor\.browserOverride/.test(prepare));
  assert(/browserSubtitleSync\.createEditRecord/.test(prepare));
  assert(/hasOverride:\s*true,\s*userOverride:\s*plan\.after/.test(prepare));
  assert(/untouched\.length \+ browserEdits\.length > 2000/.test(prepare));
});

test('toplu işlem tek geçmiş girdisiyle geri alınıp yineleniyor', () => {
  assert(/kind:\s*'subtitle-bulk'/.test(renderer));
  const history = slice('async function applyCueEditHistory', 'async function saveCueEdit');
  assert(/entry\?\.kind === 'subtitle-bulk'/.test(history));
  assert(/direction === 'undo' \? 'before' : 'after'/.test(history));
  assert(/source\.pop\(\)[\s\S]*target\.push\(entry\)/.test(history));
  assert(/subtitleFindUndo/.test(renderer) && /subtitleFindRedo/.test(renderer));
});

test('ikincil dosyanın ham metni ve biçimi yükleme ve sıfırlamada korunuyor', () => {
  const load = slice('async function loadSubtitle', '// Videonun yanindaki altyazilari bul');
  assert(/player\.sub2Raw = res\.text/.test(load));
  assert(load.includes("player.sub2Format = /\\.(ass|ssa)$/i.test(path)"));
  assert(/player\.sub2Raw = ''/.test(load) && /player\.sub2Format = 'srt'/.test(load));
});

test('toplu IPC günlüğü sayı ve metin boyutunu sınırlıyor', () => {
  const start = main.indexOf("ipcMain.handle('media:writeSubtitle'");
  const end = main.indexOf("ipcMain.handle('media:saveSubtitleCopy'", start);
  const body = main.slice(start, end);
  assert(/change\.changes\.slice\(0, 200\)/.test(body));
  assert(/String\(item\?\.before \|\| ''\)\.slice\(0, 1000\)/.test(body));
  assert(/changeCount/.test(body) && /changes,/.test(body));
  const write = slice('async function writeSubtitleBulkFiles', 'function browserBulkStateStillMatches');
  assert(/changeCount:\s*changes\.length,\s*changes:\s*changes\.slice\(0, 200\)/.test(write));
});

test('boş browser override geç gelen model metninden ayrı kalıyor', () => {
  const context = { mediaId: 'm', variantId: 'v', sourceHash: 's',
    cueId: 'c', sourceCueHash: 'h' };
  const record = browserSubtitleSync.createEditRecord({
    ...context, baseTranslation: 'Eski', hasOverride: true, userOverride: '', revision: 1,
  });
  const applied = browserSubtitleSync.applyEditRecord({ text: 'Geç model metni' }, record, context);
  assert.equal(applied.text, '');
  assert.equal(applied.baseTranslation, 'Geç model metni');
});

(async () => {
  const writeBody = slice('function subtitleBulkLogChanges', 'function browserBulkStateStillMatches');
  const makeWriter = (writeSubtitle) => new Function('window',
    writeBody + '; return writeSubtitleBulkFiles;')({ api: { writeSubtitle } });
  const files = [
    { path: 'a.srt', before: 'a0', after: 'a1', changes: [] },
    { path: 'b.vtt', before: 'b0', after: 'b1', changes: [] },
  ];

  const successCalls = [];
  const success = await makeWriter(async (...args) => {
    successCalls.push(args);
    return { ok: true };
  })(files, 'after', 'bulk-edit');
  assert(success.ok, 'başarılı yazım reddedildi');
  assert.deepEqual(successCalls.map((call) => [call[0], call[1]]),
    [['a.srt', 'a1'], ['b.vtt', 'b1']], 'dosya başına tek yazım yapılmadı');
  passed++;

  const rollbackCalls = [];
  const failed = await makeWriter(async (file, text) => {
    rollbackCalls.push([file, text]);
    if (file === 'b.vtt') return { ok: false, error: 'disk' };
    return { ok: true };
  })(files, 'after', 'bulk-edit');
  assert(!failed.ok && !failed.rollbackFailed, 'ikinci yazım hatası raporlanmadı');
  assert.deepEqual(rollbackCalls,
    [['a.srt', 'a1'], ['b.vtt', 'b1'], ['a.srt', 'a0']],
    'ilk dosya ikinci hata sonrasında geri yüklenmedi');
  passed++;

  console.log('subtitle-find-replace-integration: ' + passed + ' test');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
