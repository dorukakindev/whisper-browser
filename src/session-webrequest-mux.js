'use strict';
// A single real listener per session/event; each owner can remove only its slot.
const instances=new WeakMap(),adapters=new WeakMap();
const EVENTS=['onBeforeRequest','onBeforeSendHeaders','onHeadersReceived','onSendHeaders','onResponseStarted','onBeforeRedirect','onCompleted','onErrorOccurred'];
const CALLBACK=new Set(EVENTS.slice(0,3));
function matches(url,patterns){if(!patterns?.length)return true;return patterns.some(pattern=>{if(pattern==='<all_urls>')return true;const escaped=pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');return new RegExp('^'+escaped+'$','i').test(url);});}
function sessionMux(session){
 if(instances.has(session))return instances.get(session);
 const slots=new Map();
 function set(owner,event,filter,fn){
  if(!EVENTS.includes(event))throw Error('Unsupported webRequest event');
  let handlers=slots.get(event);
  if(!handlers){handlers=new Map();slots.set(event,handlers);session.webRequest[event]((details,final)=>{
   const list=[...handlers.values()].filter(h=>matches(details.url,h.filter?.urls));
   if(!CALLBACK.has(event)){for(const h of list)try{Promise.resolve(h.fn(details)).catch(()=>{});}catch{}return;}
   let index=0,finished=false;const response={};
   const finish=value=>{if(!finished){finished=true;final(value);}};
   function next(){if(finished)return;if(index===list.length)return finish(response);const h=list[index++];let done=false;
    const accept=value=>{if(done||finished)return;done=true;clearTimeout(timer);value=value||{};if(value.cancel||value.redirectURL)return finish(value);for(const k of ['requestHeaders','responseHeaders','statusLine'])if(value[k]!==undefined){response[k]=value[k];if(k!=='statusLine')details[k]=value[k];}next();};
    const timer=setTimeout(()=>accept({}),3000);timer.unref?.();
    try{Promise.resolve(h.fn(details,accept)).catch(()=>accept({}));}catch{accept({});}
   }next();
  });}
  if(typeof fn==='function')handlers.set(owner,{filter,fn});else{handlers.delete(owner);
   // Abone kalmadıysa Electron'a her istekte JS çağırtmaya devam etme.
   if(handlers.size===0){slots.delete(event);try{session.webRequest[event](null);}catch{}}}
 }
 const api={set};instances.set(session,api);return api;
}
function ownedSession(session,owner='adblock'){
 let owners=adapters.get(session);if(!owners){owners=new Map();adapters.set(session,owners);}
 if(owners.has(owner))return owners.get(owner);
 const mux=sessionMux(session),wr={};for(const event of EVENTS)wr[event]=(...args)=>{const fn=args.at(-1),filter=args.length>1?args[0]:null;mux.set(owner,event,filter,fn);};
 const proxy=new Proxy(session,{get(target,key){if(key==='webRequest')return wr;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 owners.set(owner,proxy);return proxy;
}
module.exports={sessionMux,ownedSession,matches};
