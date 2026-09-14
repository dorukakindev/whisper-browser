'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { previewNmdbImport, episodeFromName, mapWorks } = require('../src/nmdb-catalog-import');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-nmdb-import-'));
  try {
    const dbPath = path.join(dir, 'synthetic.sqlite');
    const pythonPath = path.join(__dirname, '..', 'backend', 'venv', 'Scripts', 'python.exe');
    const create = String.raw`
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.executescript('''
CREATE TABLE works(id INTEGER PRIMARY KEY,title TEXT,original_title TEXT,year TEXT,kind TEXT,imdb_id TEXT,tmdb_id TEXT);
CREATE TABLE filmler(id INTEGER PRIMARY KEY,izleme_durumu TEXT,favori INTEGER,poster_yolu TEXT,konu_ozeti TEXT);
CREATE TABLE work_legacy_links(work_id INTEGER,legacy_film_id INTEGER);
CREATE TABLE media_files(id INTEGER PRIMARY KEY,work_id INTEGER,path TEXT,filename TEXT,is_primary INTEGER);
INSERT INTO works VALUES(1,'Kuzey','North','2024','Film','tt1234567','movie:2');
INSERT INTO filmler VALUES(11,'İzlenecek',1,'C:/Posters/kuzey.jpg','Sentetik özet');
INSERT INTO work_legacy_links VALUES(1,11);
INSERT INTO media_files VALUES(21,1,'C:/Movies/kuzey.mp4','kuzey.mp4',1);
INSERT INTO media_files VALUES(22,1,'C:/Movies/kuzey-copy.mp4','kuzey-copy.mp4',0);
INSERT INTO works VALUES(2,'Dizi','Series','2023','Dizi','','tv:42');
INSERT INTO filmler VALUES(12,'İzlendi',0,'https://bad.example/poster.jpg','');
INSERT INTO work_legacy_links VALUES(2,12);
INSERT INTO media_files VALUES(23,2,'C:/TV/Dizi.S01E02.mp4','Dizi.S01E02.mp4',1);
''')
db.commit(); db.close()
`;
    const created = spawnSync(pythonPath, ['-c', create, dbPath], { encoding: 'utf8', windowsHide: true });
    assert.equal(created.status, 0, created.stderr);
    const before = fs.readFileSync(dbPath);
    const preview = await previewNmdbImport({ dbPath, pythonPath });
    assert.equal(preview.count, 2);
    assert.match(preview.items[0].importRef, /^nmdb:[a-f0-9]{16}:work:1$/);
    assert.notEqual(mapWorks({ works: [{ work_id: 1, title: 'A' }] }, { namespace: 'first' }).items[0].importRef,
      mapWorks({ works: [{ work_id: 1, title: 'B' }] }, { namespace: 'second' }).items[0].importRef);
    const invalidIds = mapWorks({ works: [{ work_id: 5, title: 'Sentinel', kind: 'Film', imdb_id: '-', tmdb_id: 'N/A' }] });
    assert.equal(invalidIds.items[0].imdbId, '');
    assert.equal(invalidIds.items[0].tmdbId, '');
    assert.equal(invalidIds.warnings.length, 2);
    assert.equal(mapWorks({ works: [{ work_id: 6, title: 'Kimlik', kind: 'Film', imdb_id: 'TT1234567', tmdb_id: '7' }] }).items[0].tmdbId, 'movie:7');
    assert.equal(preview.items[0].watchStatus, 'planned');
    assert.equal(preview.items[0].favorite, true);
    assert.equal(preview.items[0].synopsis, 'Sentetik özet');
    assert.deepEqual(preview.items[0].ratings, { imdb: null, letterboxd: null, personal: null });
    assert.equal(preview.items[0].source.value, 'C:/Movies/kuzey.mp4');
    assert.equal(preview.items[1].kind, 'series');
    assert.equal(preview.items[1].episodes[0].season, 1);
    assert.equal(preview.items[1].episodes[0].number, 2);
    assert.equal(preview.items[1].posterPath, '');
    assert(preview.warnings.some((warning) => /Birden fazla dosya/.test(warning)));
    assert(before.equals(fs.readFileSync(dbPath)), 'Önizleme veritabanını değiştirmemeli');
    const addRatings = spawnSync(pythonPath, ['-c',
      "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute('ALTER TABLE filmler ADD COLUMN imdb_puani TEXT');c.execute('ALTER TABLE filmler ADD COLUMN lb_puani TEXT');c.execute('ALTER TABLE filmler ADD COLUMN kisisel_puan TEXT');c.execute(\"UPDATE filmler SET imdb_puani='8.2',lb_puani='4.1',kisisel_puan='92/100' WHERE id=11\");c.commit();c.close()",
      dbPath], { encoding: 'utf8', windowsHide: true });
    assert.equal(addRatings.status, 0, addRatings.stderr);
    const withRatings = await previewNmdbImport({ dbPath, pythonPath });
    assert.deepEqual(withRatings.items[0].ratings, { imdb: '8.2', letterboxd: '4.1', personal: '92/100' });
    assert.deepEqual(episodeFromName('Series.S02E03.WEB.mp4'), { season: 2, number: 3 });
    console.log('nmdb-catalog-import: synthetic read-only SQLite preview passed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
