'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
test('page FTS migrates existing raw v4 index and keeps original text on reopen/update/delete', () => {
  const { DatabaseSync } = require('node:sqlite');
  const { WatchIndex } = require('../src/watch-index');
  const base = path.join(root, 'tmp', 'reports818-823');
  fs.mkdirSync(base, { recursive: true });
  const file = path.join(fs.mkdtempSync(path.join(base, 'fts-migration-')), 'index.sqlite');
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    INSERT INTO meta VALUES('schema_version','4');
    CREATE TABLE pages(rowid INTEGER PRIMARY KEY,url TEXT UNIQUE,title TEXT,content TEXT,visited_at INTEGER);
    CREATE VIRTUAL TABLE page_fts USING fts5(title,content,content='pages',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
    INSERT INTO pages VALUES(1,'https://fixture.test/upper','IŞIK','IŞIK araştırma için kaydedilen özgün bir paragraftır.',1);
    INSERT INTO pages VALUES(2,'https://fixture.test/lower','ışık','ışık araştırma için kaydedilen özgün bir paragraftır.',2);
    INSERT INTO page_fts(page_fts) VALUES('rebuild');`);
  db.close();
  let index = new WatchIndex(file);
  try {
    assert.equal(index.searchPages('IŞIK').length, 2);
    assert.equal(index.searchPages('ışık araştırma').length, 2);
    assert.equal(index.searchPages('ışı', 1).length, 1);
    assert.match(index.searchPages('ışık')[0].snippet, /\[(?:ışık|IŞIK)\]/u);
    assert.equal(index.db.prepare('SELECT title FROM pages WHERE rowid=1').get().title, 'IŞIK');
    index.upsertPage({ url: 'https://fixture.test/upper', title: 'LIGHT', content: 'Another original paragraph with light shining.' });
    assert.equal(index.searchPages('ışık').length, 1);
    assert.equal(index.searchPages('LIGHT').length, 1);
  } finally { index.close(); }
  index = new WatchIndex(file);
  try {
    assert.equal(index.searchPages('IŞIK').length, 1);
    assert.equal(index.searchPages('light').length, 1);
    assert.equal(index.clearPages(), 2);
    assert.equal(index.searchPages('ışık').length, 0);
    assert.equal(index.searchPages('light').length, 0);
  } finally { index.close(); }
});
test('portable watch remapping rejects collisions before writing any file', () => {
  const core = require('../src/workspace-package');
  const base = path.join(root, 'tmp', 'reports818-823');
  fs.mkdirSync(base, { recursive: true });
  const source = fs.mkdtempSync(path.join(base, 'watch-collision-source-'));
  const target = fs.mkdtempSync(path.join(base, 'watch-collision-target-'));
  const from = path.join(source, 'one'), other = path.join(source, 'two'), to = path.join(target, 'videos');
  fs.writeFileSync(path.join(source, 'watch-library.json'), JSON.stringify({ schemaVersion: 3, items: [
    { key: 'file:' + path.join(from, 'clip.mp4'), position: 10 },
    { key: 'file:' + path.join(other, 'clip.mp4'), position: 20 },
  ] }));
  const bundle = path.join(source, 'fixture.wbp');
  core.exportPackage(source, bundle);
  // Export makes paths under the source root portable.
  assert.throws(() => core.restorePackage(target, core.readPackage(bundle), [
    ['{{ROOT}}/one', to], ['{{ROOT}}/two', to],
  ]), /çakıştırıyor/);
  assert.equal(fs.existsSync(path.join(target, 'watch-library.json')), false);
});
for (const name of ['workflow', 'metadata', 'provider', 'search', 'package', 'notes']) {
  test(`report regression: ${name}`, () => {
    const base = path.join(root, 'tmp', 'reports818-823');
    fs.mkdirSync(base, { recursive: true });
    const output = fs.mkdtempSync(path.join(base, `${name}-`));
    const result = spawnSync(process.execPath, [path.join(__dirname, 'reports820-823', `${name}.cjs`)], {
      cwd: root, encoding: 'utf8', timeout: 120000, windowsHide: true,
      env: { ...process.env, AUDIT820_OUT: output, AUDIT821_OUT: output, AUDIT822_OUT: output, AUDIT823_OUT: output },
    });
    assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
  });
}
const { metadataComplete } = require('../src/catalog-metadata-completeness');
test('metadata completeness agrees on genres, missing poster and fully populated records', () => {
  const complete={posterPath:__filename,synopsis:'A story.',genres:['Drama'],directors:['Director'],runtime:110};
  assert.equal(metadataComplete(complete),true);
  assert.equal(metadataComplete({...complete,genres:[]}),false);
  assert.equal(metadataComplete({...complete,posterPath:path.join(__dirname,'missing-fixture-poster.png')}),false);
  assert.equal(metadataComplete({...complete,synopsis:''}),false);
  assert.equal(metadataComplete(null),false);
});
