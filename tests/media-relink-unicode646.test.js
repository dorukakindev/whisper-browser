'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { selectRelinkCandidates, findLibraryDuplicates } = require('../src/media-relink-matcher');
test('Turkish dotted capital I and decomposed names match without merging dotless I', () => {
  const a = {key:'file:a',localPath:'D:\\a\\İğdır Şölen.mkv',sizeBytes:100};
  const b = {key:'file:b',localPath:'D:\\b\\iğdır şölen.mkv',sizeBytes:100};
  assert.equal(findLibraryDuplicates([a,b]).length,1);
  const candidate = {path:b.localPath,sizeBytes:200};
  const result = selectRelinkCandidates(a,[candidate]);
  assert.equal(result.status,'ambiguous');
  assert.equal(result.ranked[0].path,b.localPath);
  assert.equal(selectRelinkCandidates(a,[{...candidate,path: candidate.path.normalize('NFD')}]).ranked.length,1);
  assert.equal(findLibraryDuplicates([
    {key:'file:c',localPath:'D:\\a\\sık.mkv',sizeBytes:100},
    {key:'file:d',localPath:'D:\\b\\sik.mkv',sizeBytes:100},
  ]).length,0,'meaningful Turkish letter distinction is preserved');
  assert.equal(selectRelinkCandidates({localPath:'D:\\a\\FILM.mkv',sizeBytes:100},[{path:'D:\\b\\film.mkv',sizeBytes:100}]).status,'unique');
});

// Emulate POSIX path defaults while retaining both explicit parsers. Windows
// CI must exercise serialized Windows paths even without a Linux runner.
test('serialized Windows and POSIX paths match under POSIX host defaults',()=>{
  const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/media-relink-matcher'),'utf8'),{module,require:name=>{assert.equal(name,'path');return {...path,basename:path.posix.basename,extname:path.posix.extname};}});
  const select=module.exports.selectRelinkCandidates;
  assert.equal(select({localPath:'D:\\old\\Film.mkv'},[{path:'E:\\new\\Film.mkv'}]).status,'unique');
  assert.equal(select({localPath:'/old/Film.mkv'},[{path:'/new/Film.mkv'}]).status,'unique');
});
