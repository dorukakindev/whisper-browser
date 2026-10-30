"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const message=require("../src/caption-download-errors");
test("Caption errors are localized, actionable and do not echo process details",()=>{
 for(const [code,en,tr] of [["caption_unavailable",/Whisper was not started/,/Whisper otomatik/],["caption_conversion_failed",/FFmpeg/,/FFmpeg/],["caption_invalid_result",/valid caption/,/Geçerli altyazı/]]){
 assert.match(message(code,"en"),en);assert.match(message(code,"tr"),tr);assert.equal(message(code,"unknown"),message(code,"en"));assert.doesNotMatch(message(code,"en"),/https?:|Bearer|stack|argv/);}
 for(const code of ["__proto__","constructor","https://private.invalid/?token=secret",undefined])assert.equal(message(code,"en"),"");
});
