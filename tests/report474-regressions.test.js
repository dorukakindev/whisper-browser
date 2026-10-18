'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateSubtitleExport } = require('../src/subtitle-export-validation');
const sync = require('../src/browser-subtitle-sync');
const relink = require('../src/media-relink-matcher');
const { searchSubtitles, downloadSubtitle } = require('../src/browser-subtitle-search');
const srt = '1\n00:00:00,000 --> 00:00:01,000\nLiteral \uFFFD\n';
const response = value => new Response(typeof value === 'string' ? value : JSON.stringify(value));
const searchConfig = subtitles => ({ apiKey: 'fixture', fetch: async url => response(url.includes('api.opensubtitles.com') ? { data: [] } : { subtitles }) });
const target = { query: 'Fixture', imdbId: 'tt0133093' };

test('474-01: valid UTF-8 replacement glyph can be exported without losing corruption detection', () => {
  assert.equal(validateSubtitleExport(srt, Buffer.from('\uFEFF'+srt), 'f.srt').cueCount, 1);
  const corrupt = Buffer.concat([Buffer.from('\uFEFF'+srt.replace('\uFFFD', '')), Buffer.from([0xff])]);
  assert.throws(() => validateSubtitleExport(srt, corrupt, 'f.srt'), /UTF-8/);
});
test('474-02: malformed cue does not abort export of valid cues', () => {
  const warnings = [];
  const result = sync.transformCuesForExport([null, {start:NaN,end:2,text:'bad'}, {start:1,end:2,text:'keep'}], {}, value=>warnings.push(value));
  assert.deepEqual(result.map(c=>c.text), ['keep']);
  assert.match(warnings[0], /2.*geçersiz/);
});
test('474-03: null synchronization points are not interpreted as a valid zero point', () => {
  assert.throws(()=>sync.calculateTwoPointTransform(null,{sourceTime:10,videoTime:10}));
  assert.throws(()=>sync.calculateTwoPointTransform({sourceTime:null,videoTime:0},{sourceTime:10,videoTime:10}));
});
test('474-04: merging duplicates keeps the chosen target media path', () => {
  const source = {key:'file:old',localPath:'D:/old.mkv',sourceRef:'D:/old.mkv',revision:9};
  const target = {key:'file:keep',localPath:'D:/keep.mkv',sourceRef:'D:/keep.mkv',revision:1};
  const result = relink.mergeWatchItems(source,target);
  assert.equal(result.localPath,target.localPath);
  assert.equal(result.sourceRef,target.sourceRef);
  assert.equal(relink.mergeWatchItems(source,{key:'file:keep'}).localPath,undefined);
});
test('474-05: distinct Turkish names are not collapsed into the same duplicate stem', () => {
  const result = relink.findLibraryDuplicates([
    {key:'file:a',localPath:'D:/Çağ.mkv',sizeBytes:100},
    {key:'file:b',localPath:'D:/Şaş.mkv',sizeBytes:100},
  ]);
  assert.equal(result.length,0);
  assert.equal(relink.findLibraryDuplicates([
    {key:'file:a',localPath:'D:/日本語.mkv',sizeBytes:100},
    {key:'file:b',localPath:'E:/日本語.mkv',sizeBytes:100},
  ]).length,1);
});
test('474-06: null provider file ids do not hide the valid downloadable file', async () => {
  const result = await searchSubtitles({query:'Fixture'}, {apiKey:'fixture', fetch:async()=>response({data:[{id:'a',attributes:{files:[null,{file_id:null},{file_id:''},{file_id:0},{file_id:7,file_name:'right.srt'}]}}]})});
  assert.equal(result.results[0].fileId,7);
  assert.equal(result.results[0].fileName,'right.srt');
});
test('474-07: ASS downloads preserve their declared format', async () => {
  const text = '[Script Info]\nScriptType: v4.00+\n[Events]\nDialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hello';
  const result = await downloadSubtitle({provider:'stremio',url:'https://opensubtitles-v3.strem.io/a.ass'}, {fetch:async()=>response(text)});
  assert.equal(result.format,'ass');
  const official = await downloadSubtitle({fileId:7},{apiKey:'fixture',fetch:async url=>response(url.includes('/download') ? {link:'https://dl.opensubtitles.com/a.ass'} : text)});
  assert.equal(official.format,'ass');
});
test('474-08: one malformed Stremio row does not lose valid search results', async () => {
  const result = await searchSubtitles(target,searchConfig([null, [], true, {lang:'en',url:'https://opensubtitles-v3.strem.io/a.srt'}]));
  assert.equal(result.results.length,1);
  assert.equal(result.results[0].language,'en');
});
test('474-09: Brazilian Portuguese alias is excluded from pt-PT results', async () => {
  const result = await searchSubtitles({...target,language:'pt-PT'},searchConfig([
    {lang:'pob',url:'https://opensubtitles-v3.strem.io/br.srt'},
    {lang:'pt-PT',url:'https://opensubtitles-v3.strem.io/pt.srt'},
  ]));
  assert.deepEqual(result.results.map(r=>r.language),['pt-PT']);
});
test('474-10: filesystem root can be used for bulk relink and missing-source scans', () => {
  const result = relink.planBulkRelink([{key:'file:a',localPath:'/media/a.mkv'}],{oldPrefix:'/',newPrefix:'/backup',exists:()=>false});
  assert.equal(result.rows[0]?.candidate,'/backup/media/a.mkv');
  const missing = relink.collectMissingSources([{title:'a',source:{type:'local',value:'/media/a.mkv'}}], '/',()=>false);
  assert.equal(missing.length,1);
  const win = relink.planBulkRelink([{key:'file:a',localPath:'D:/media/a.mkv'}],{oldPrefix:'D:/',newPrefix:'E:/',exists:()=>false});
  assert.equal(win.rows[0].candidate,'E:/media/a.mkv');
  const unc = relink.planBulkRelink([{key:'file:a',localPath:'//server/share/media/a.mkv'}],{oldPrefix:'//server/share/',newPrefix:'//new/share/',exists:()=>false});
  assert.equal(unc.rows[0].candidate,'//new/share/media/a.mkv');
});
