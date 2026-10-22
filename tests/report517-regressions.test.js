const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { BrowserNoteStore } = require('../src/browser-note-store');
const { BrowserTranslationArchive } = require('../src/browser-translation-archive');
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r517-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test('partial note recovery does not invent identities and survives reload', t => {
  const file = path.join(temp(t), 'notes.json');
  fs.writeFileSync(file, JSON.stringify({version:1, annotations:[null, {}, {id:4,mediaId:'x'},
    {id:'valid',media_id:'movie',note:'Korunan not'}]}));
  const store = new BrowserNoteStore(file);
  assert.deepEqual(store.list().map(n => n.id), ['valid']);
  assert.equal(store.loadError, '');
  store.upsert({id:'new',mediaId:'movie',note:'Yeni'});
  assert.equal(new BrowserNoteStore(file).get('valid').note, 'Korunan not');
});
test('translation revision replaces only its own source selection', t => {
  const archive = new BrowserTranslationArchive(temp(t));
  function save(source, translation, complete=false) {
    return archive.savePage({url:'https://example.test/page',targetLanguage:'tr',scope:'article',complete,
      blocks:[{id:'p',text:source,tag:'p'}],translations:new Map([['p',translation]])});
  }
  const full = save('Whole page','Bütün sayfa',true);
  const first = save('First section','İlk bölüm');
  const other = save('Other section','Diğer bölüm');
  const revised = save('First section','Birinci bölüm');
  assert.equal(first.id, revised.id);
  assert.notEqual(other.id, revised.id);
  assert.notEqual(full.id, revised.id);
  assert.equal(archive.listPages().length,3);
  assert.equal(fs.existsSync(first.path),false);
  assert.equal(fs.existsSync(full.path),true);
  assert.equal(fs.existsSync(other.path),true);
});
test('archive index eviction removes unreferenced files only inside archive', t => {
  const root = temp(t), archive = new BrowserTranslationArchive(root);
  archive.ensure();
  const orphan = path.join(root,'Sayfalar','evicted.json'); fs.writeFileSync(orphan,'old');
  const outside = path.join(path.dirname(root), path.basename(root)+'-outside');
  fs.writeFileSync(outside,'keep'); t.after(()=>fs.rmSync(outside,{force:true}));
  archive.index = {version:1,entries:Array.from({length:5000},(_,i)=>({id:'old:'+i,
    jsonPath:i===4999 ? 'Sayfalar/evicted.json' : i===4998 ? path.relative(root,outside) : ''}))};
  archive._saveIndex({id:'new',kind:'page'});
  assert.equal(fs.existsSync(orphan),false);
  assert.equal(fs.existsSync(outside),true);
  assert.equal(archive.index.entries.length,5000);
});
