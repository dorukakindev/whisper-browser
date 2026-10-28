"use strict";
// Saved display provenance only. Never retain an expiring signed stream URL.
function normalize(value){
 if(!value||!/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(String(value.url||'')))return null;
 const duration=x=>{const n=Number(x);return Number.isFinite(n)&&n>0&&n<86400?n:0;};
 const seconds=duration(value.duration),sourceSeconds=duration(value.sourceDuration);
 return {url:String(value.url),title:String(value.title||'').slice(0,300),duration:seconds,sourceDuration:sourceSeconds,
  durationMismatch:!!(seconds&&sourceSeconds&&Math.abs(seconds-sourceSeconds)>Math.max(10,sourceSeconds*.15))};
}
function fromSpotify(row){return normalize({url:row.youtubeUrl,title:row.youtubeTitle,duration:row.youtubeDuration,sourceDuration:row.duration});}
module.exports={normalize,fromSpotify};
