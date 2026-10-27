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
