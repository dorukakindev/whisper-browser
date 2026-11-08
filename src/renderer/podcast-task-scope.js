(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PodcastTaskScope=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 function seconds(value){
  if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:NaN;
  const text=String(value??'').trim();if(!text)return NaN;
  if(/^\d+(?:\.\d{1,3})?$/.test(text))return Number(text);
  if(!/^\d{1,4}:\d{2}(?::\d{2})?(?:\.\d{1,3})?$/.test(text))return NaN;
  const parts=text.split(':').map(Number);if(parts.slice(1).some(n=>n>=60))return NaN;
  return parts.reduce((n,part)=>n*60+part,0);
 }
 function normalize(range,duration){
  if(range==null)return null;
  const start=seconds(range.start),end=seconds(range.end),known=Number(duration);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>31536000||known>0&&Number.isFinite(known)&&end>known+.05)throw Error('Geçerli bir başlangıç ve bitiş seçin; aralık bölüm süresini aşamaz. / Choose valid start and end times within the episode.');
  return Object.freeze({start,end});
 }
 function stamp(value){
  const number=Number(value),milliseconds=Math.round((Number.isFinite(number)?Math.max(0,number):0)*1000);
  const seconds=Math.floor(milliseconds/1000),fraction=String(milliseconds%1000).padStart(3,'0').replace(/0+$/,'');
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+(fraction?'.'+fraction:'');
 }
 return {seconds,normalize,stamp};
});
