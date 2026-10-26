'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parsePdfPageSelection}=require('../src/pdf-translate');
const Model=require('../src/renderer/dub-workspace-model');
const {publicFilmUrl}=require('../src/letterboxd-reviews');
test('PDF range parser bounds allocation before expanding user ranges',()=>{
 assert.equal(parsePdfPageSelection('1-9999999',0),null);
 assert.equal(parsePdfPageSelection('1-9999999',63),null);
 assert.deepEqual(parsePdfPageSelection('5-10, 7',63),{pages:[5,6,7,8,9,10],scope:'range'});
});
test('Voice and background mix reject non-finite gains without muting the whole session',()=>{
 const m=Model.mix({voice:NaN,background:Infinity,music:-1,ambience:2});
 assert.equal(m.voice,1);assert.equal(m.background,.75);assert.equal(m.music,.75);assert.equal(m.ambience,.75);
});
test('Letterboxd review pagination accepts supported public routes and excludes credentials/foreign hosts',()=>{
 for(const url of ['https://letterboxd.com/film/witness/reviews/page/2/','https://letterboxd.com/film/witness/reviews/by/rating/page/2/','https://letterboxd.com/film/witness/reviews/?page=2'])assert.equal(publicFilmUrl(url),url);
 for(const url of ['https://letterboxd.com.evil.test/film/witness/','https://user:pass@letterboxd.com/film/witness/','https://letterboxd.com/film/witness/reviews/?page=0'])assert.equal(publicFilmUrl(url),null);
});
