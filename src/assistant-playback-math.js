(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.AssistantPlaybackMath=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 function options(args={}){
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!['speed','break_minutes'].includes(key)))throw Error('Unsupported playback time argument.');
  if(Object.hasOwn(args,'speed')&&(!Number.isFinite(args.speed)||args.speed<0.25||args.speed>4))throw Error('Playback speed must be between 0.25 and 4.');
  if(Object.hasOwn(args,'break_minutes')&&(!Number.isFinite(args.break_minutes)||args.break_minutes<0||args.break_minutes>240))throw Error('Break minutes must be between 0 and 240.');
  return args;
 }
 const digest=value=>{let a=2166136261,b=5381;for(const char of value){a=Math.imul(a^char.charCodeAt(0),16777619);b=Math.imul(b,33)^char.charCodeAt(0);}return (a>>>0).toString(16)+'-'+(b>>>0).toString(16);};
 function identity(context){
  if(!context?.visible||!context.hasMedia||!['player','browser'].includes(context.mode)||typeof context.mediaKey!=='string'||!context.mediaKey||!Number.isSafeInteger(context.generation)||context.generation<0||typeof context.tabId!=='string'||!context.tabId)return null;
  const source=JSON.stringify([context.mode,context.tabId,context.mediaKey,context.mediaId||'']);
  return {key:JSON.stringify([source,context.generation]),source_id:'playback:'+digest(source),source_revision:digest(JSON.stringify([source,context.generation]))};
 }
 function calculate(playback,args={},source){
  options(args);
  const unsupported=reason=>({status:'unsupported',reason});
  if(!source)return unsupported('No current visible media source is available.');
  if(!playback||!Number.isFinite(playback.duration)||playback.duration<=0)return unsupported('A finite positive media duration is unavailable; live or unknown-duration media cannot be calculated.');
  if(!Number.isFinite(playback.position)||playback.position<0||playback.position>playback.duration)return unsupported('A valid current playback position is unavailable.');
  const speed=Object.hasOwn(args,'speed')?args.speed:playback.rate;
  if(!Number.isFinite(speed)||speed<0.25||speed>4)return unsupported('A supported actual playback speed is unavailable.');
  const remaining=playback.duration-playback.position,wall=remaining/speed,breaks=(args.break_minutes||0)*60;
  if(!Number.isFinite(wall+breaks))return unsupported('The playback duration exceeds the supported calculation range.');
  return {status:'completed',source_id:source.source_id,source_revision:source.source_revision,position_seconds:playback.position,duration_seconds:playback.duration,remaining_media_seconds:remaining,speed,speed_source:Object.hasOwn(args,'speed')?'explicit':'actual',break_seconds:breaks,wall_seconds:wall,with_breaks_seconds:wall+breaks,paused:playback.paused===true,note:'Estimated playback durations assuming continuous playback at this speed, plus the specified total breaks. No finish clock or media-content analysis is inferred.'};
 }
 return Object.freeze({options,identity,calculate});
});
