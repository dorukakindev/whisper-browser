'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {match}=require('../src/assistant-video-intent');

test('explicit whole-video requests override a saved interval and conflicting ranges are rejected',()=>{
 for(const text of ['Whisper ile videonun tamamını Türkçeye çevir','Transcribe the entire video','Whisper ile tüm videoyu çevir'])assert.equal(match(text)?.wholeVideo,true,text);
 assert.equal(match('Whisper 05:00–10:00 altyazı çıkar').wholeVideo,false);
 assert.equal(match('Whisper ile tüm videoyu 05:00–10:00 çevir').rangeInvalid,true);
});

test('Explicit video requests preserve the three distinct existing operations',()=>{
 for(const [text,kind] of [
  ['Videonun mevcut altyazısını Türkçeye çevir','translate-track'],
  ['Translate the video subtitles to Turkish','translate-track'],
  ['Whisper ile yalnız altyazı çıkar','whisper-only'],
  ['Whisper ile altyazı çıkar ama çevirme','whisper-only'],
  ['Transcribe this YouTube video','whisper-only'],
  ['Whisper + çeviri yap','whisper-translate'],
  ['Whisper ile bu videonun altyazısını çevir','whisper-translate'],
 ])assert.equal(match(text)?.kind,kind,text);
 assert.deepEqual(match('Whisper + çeviri yap 5 ile 10 dakika').range,{start:300,end:600});
 assert.deepEqual(match('Whisper 05:12–08:37 altyazı çıkar').range,{start:312,end:517});
 assert.equal(match('Whisper + çeviri yap, seslendirmeye uygun').forSpeech,true);
 assert.equal(match('Translate Turkish captions to English').targetLanguage,'en');
 assert.equal(match('İngilizce altyazıyı Türkçeye çevir').targetLanguage,'tr');
});

test('Descriptions, negations, quoted page content and page translation are not video commands',()=>{
 for(const text of ['Whisper nasıl çalışır?','Altyazıyı çevirme','Do not translate the captions',
  'Bu sayfayı Türkçeye çevir','"Whisper + çeviri yap" ne demek?',
  'Kitabı seslendir','Videodaki altyazı çevirisi nasıl?'])assert.equal(match(text),null,text);
});


test('Whisper and subtitle configuration is never a transcription start',()=>{
 for(const text of ['Whisper modelini tiny yap','Whisper motorunu değiştir','Set Whisper model to tiny','Whisper ile tiny model kullan ve altyazı çıkar','Altyazı boyutunu 34 yap'])assert.equal(match(text),null,text);
});

test('Podcast transcription phrasing uses the existing Whisper workflow without treating translation-only as transcription',()=>{
 for(const [text,kind] of [['Bu podcasti yazıya dök ve Türkçeye çevir','whisper-translate'],['Bu podcasti yazıya dök','whisper-only'],['Transcribe this podcast and translate','whisper-translate']])assert.equal(match(text)?.kind,kind,text);
 for(const text of ['Bu podcasti yazıya dökme','Bu podcasti yazıya dökmeden çevir','Bu podcasti çevir'])assert.equal(match(text),null,text);
});


test('podcast source intervals accept explicit mixed units without guessing an unresolved duration',()=>{
 const M=require('../src/assistant-video-intent');for(const q of ['bu podcasti 30. saniyeden 2. dakikaya kadar yazıya dök ve çevir','transcribe this podcast from 30 seconds to 2 minutes'])assert.deepEqual(M.match(q).range,{start:30,end:120});
 assert.equal(M.match('bu podcasti 30 saniye yazıya dök').rangeUnresolved,true);assert.equal(M.match('bu podcasti 30. saniyeden 2. dakikaya kadar yazıya dökme'),null);
});
