'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {match}=require('../src/assistant-video-intent');

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
