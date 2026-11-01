'use strict';
const {publicFilmUrl,reviewPageSource,reviewPageScript,expandReviewHtml,fullTextFetchScript}=require('./letterboxd-reviews');
const LIMIT=3000000;
function trusted(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='letterboxd.com'||u.port||u.username||u.password||u.search||u.hash)return null;
 return /^\/(?:tmdb\/[1-9]\d{0,11}|imdb\/tt\d{7,12})\/$/.test(u.pathname)||publicFilmUrl(u.href)?u.href:null;}catch{return null;}
}
function film(value){return /^https:\/\/letterboxd\.com\/film\/([a-z0-9-]+)\//.exec(value)?.[1];}
// Uses normal site navigation in one owned window. Never changes shared session policy.
function createBrowserReviewReader({BrowserWindow,parent,partition,userAgent,onDiagnostic}){
 if(typeof BrowserWindow!=='function'||typeof partition!=='string'||!partition)throw Error('A browser window and browser partition are required.');
 let window=null,active=null,closed=false,reads=0,filmId=null;
 const deadline=Date.now()+45000;
 function diagnostic(stage,value,error,details){
  // Diagnostics contain only allowlisted public routes, never page content or
  // arbitrary redirect addresses (which may contain account information).
  if(typeof onDiagnostic!=='function')return;
  const url=trusted(value),code=typeof error?.code==='string'&&/^ERR_[A-Z_]+$/.test(error.code)?error.code:Number.isInteger(error?.errno)?error.errno:undefined;
  try{onDiagnostic({stage,...(url?{url}:{}),...(code!==undefined?{code}:{}),...details});}catch{}
 }
 function deniedDetails(value){
  try{
   const u=new URL(value),host=u.hostname==='letterboxd.com'&&u.protocol==='https:'&&!u.port&&!u.username&&!u.password;
   const reason=!host?'host':u.search||u.hash?'query':'route';
   // Never record query/fragment values or arbitrary account paths.
   const path=/^\/(?:tmdb\/[1-9]\d{0,11}|imdb\/tt\d{7,12}|film\/[a-z0-9-]+(?:\/reviews(?:\/by\/[a-z-]+)?(?:\/page\/[1-9]\d{0,3})?)?)\/$/.test(u.pathname)?u.pathname:undefined;
   return {reason,...(/^[a-z0-9.-]{1,253}$/i.test(u.hostname)?{hostname:u.hostname}:{}),...(path?{path}:{})};
  }catch{return {reason:'route'};}
 }
 function currentUrl(){try{return window&&!window.isDestroyed()?window.webContents.getURL():'';}catch{return '';}}
 function destroy(){if(window&&!window.isDestroyed())window.destroy();}
 function close(){if(closed)return;closed=true;active?.fail(Error('Letterboxd collection was closed. Retry collection or import reviews.'));destroy();}
 function allowed(value){
  const url=trusted(value);if(!url||!active)return false;
  if(active.identity)return url===active.address||!!film(url)&&!new URL(url).pathname.includes('/reviews/');
  const before=reviewPageSource(active.address),after=reviewPageSource(url);
  return film(url)===film(active.address)&&after?.sort===before?.sort&&after?.page===before?.page&&
   (before.sort!=='unknown'||new URL(url).pathname===new URL(active.address).pathname);
 }
 function ensureWindow(){
  if(window)return;
  window=new BrowserWindow({width:1050,height:780,show:true,autoHideMenuBar:true,...(parent?{parent}:{}),title:'Letterboxd — collecting public reviews',
   webPreferences:{partition,sandbox:true,contextIsolation:true,nodeIntegration:false,nodeIntegrationInSubFrames:false,webSecurity:true,allowRunningInsecureContent:false,autoplayPolicy:'user-gesture-required',webviewTag:false,disableDialogs:true}});
  if(userAgent)window.webContents.setUserAgent(userAgent);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const guard=(event,legacyUrl,_isInPlace,legacyIsMainFrame)=>{
   // New Electron Event details carry navigation fields on the event; older
   // releases pass positional arguments. Site challenge frames are ordinary
   // subframes and must not be mistaken for a top-level film navigation.
   const isMainFrame=typeof event.isMainFrame==='boolean'?event.isMainFrame:legacyIsMainFrame;
   if(isMainFrame===false)return;
   const url=typeof event.url==='string'?event.url:legacyUrl;
   if(!allowed(url)){diagnostic('navigation-denied',url,undefined,deniedDetails(url));event.preventDefault();active?.fail(Error('Letterboxd navigation changed the requested film or review order.'));}
  };
  window.webContents.on('will-navigate',guard);
  window.webContents.on('will-redirect',guard);
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.on('render-process-gone',()=>active?.fail(Error('Letterboxd browser stopped. Retry collection or import reviews.')));
  window.on('closed',()=>{closed=true;active?.fail(Error('Letterboxd window was closed. Retry collection or import reviews.'));});
 }
 async function readPage(address,{signal,expectedBase}={}){
  if(closed)throw Error('Letterboxd collection is closed.');
  if(active)throw Error('A Letterboxd page is already loading.');
  address=trusted(address);if(!address)throw Error('Unsupported Letterboxd address.');
  const identity=!film(address);
  if((filmId&&film(address)!==filmId)||expectedBase&&address.slice(0,expectedBase.length)!==expectedBase)throw Error('The requested page belongs to a different film.');
  if(++reads>5)throw Error('Letterboxd collection reached its five-page limit.');
  if(signal?.aborted){close();throw signal.reason||Error('Letterboxd collection cancelled.');}
  if(Date.now()>=deadline){close();throw Error('Letterboxd collection timed out. Retry or import reviews.');}
  let rejectStop,timer,pauseTimer;
  const stopped=new Promise((_,reject)=>{rejectStop=reject;});
  stopped.catch(()=>{});
  const job={address,identity,fail:error=>{rejectStop(error);}};active=job;
  const abort=()=>{job.fail(signal.reason||Error('Letterboxd collection cancelled.'));close();};
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>{job.fail(Error('Letterboxd collection timed out. Finish site verification normally and retry, or import reviews.'));close();},Math.max(1,deadline-Date.now()));
  const race=promise=>Promise.race([promise,stopped]);
  try{
   ensureWindow();
   diagnostic('navigation-start',address);
   try{
    // Reviews can be ready while advertising subresources keep loadURL pending.
    // Wait for the document, then validate its URL and content as usual.
    const contents=window.webContents;let onReady;
    const documentReady=new Promise(resolve=>{onReady=()=>{if(allowed(currentUrl()))resolve();};contents.on('dom-ready',onReady);});
    try{await race(Promise.race([window.loadURL(address),documentReady]));}
    finally{contents.removeListener('dom-ready',onReady);}
   }
   catch(error){
    // Chromium can report a 403 navigation failure while showing the site's
    // verification document. Keep that normal page visible for the user.
    const current=currentUrl();diagnostic('navigation-error',current,error);
    const statusPage=error?.code==='ERR_HTTP_RESPONSE_CODE_FAILURE'||error?.errno===-379;
    // A normal identifier redirect or site reload can supersede loadURL's
    // navigation. Continue only after it has reached the allowed film route;
    // cancellation and arbitrary/off-origin ERR_ABORTED failures still fail.
    const superseded=(error?.code==='ERR_ABORTED'||error?.errno===-3)&&!signal?.aborted&&!!film(current);
    if(!(statusPage||superseded)||!allowed(current))throw error;
    if(superseded){
     diagnostic('navigation-superseded',current,error);
     while(window.webContents.isLoadingMainFrame?.()){
      await race(new Promise(resolve=>{pauseTimer=setTimeout(resolve,100);}));
      if(!allowed(window.webContents.getURL()))throw Error('Letterboxd changed the requested film or review order.');
     }
    }
   }
   let emptySince=0,emptyHtml='';
   while(true){
    const current=window.webContents.getURL();
    if(!allowed(current))throw Error('Letterboxd changed the requested film or review order.');
    const script=`(()=>{const data=${reviewPageScript()};return {...data,ready:document.readyState==='complete'};})()`;
    const data=await race(window.webContents.executeJavaScript(script,false));
    if(window.webContents.getURL()!==current)throw Error('Letterboxd page changed while reading reviews.');
    if(data?.tooLarge)throw Error('Letterboxd response exceeds the 3000000 byte limit.');
    if(data?.blocked){emptySince=0;emptyHtml='';diagnostic('verification-required',current);window.setTitle('Letterboxd — finish site verification here to continue');}
    else{
     if(!data||data.url!==current||typeof data.html!=='string')throw Error('The loaded Letterboxd page could not be read.');
     if(Buffer.byteLength(data.html,'utf8')>LIMIT)throw Error('Letterboxd response exceeds the 3000000 byte limit.');
     const cards=/class=["'][^"']*\bjs-review-body\b/.test(data.html);
     // A completed, stable film page can legitimately have no review cards
     // (end of pagination). Give normal page scripts time to populate first.
     if(!cards&&data.ready&&/<(?:h1|meta)\b/i.test(data.html)){
      if(emptyHtml!==data.html){emptyHtml=data.html;emptySince=Date.now();}
     }else{emptySince=0;emptyHtml='';}
     if(!new URL(current).pathname.includes('/reviews/')||cards||emptySince&&Date.now()-emptySince>=1800){
      if(!film(current))throw Error('No Letterboxd film matched this identifier.');
      const expanded=!new URL(current).pathname.includes('/reviews/')?{html:data.html}:await race(expandReviewHtml(data.html,{signal,load:async address=>{if(!allowed(currentUrl())||currentUrl()!==current)throw Error('Letterboxd page changed while reading a full review.');return race(window.webContents.executeJavaScript(fullTextFetchScript(address),false));}}));
      if(currentUrl()!==current||!allowed(currentUrl()))throw Error('Letterboxd page changed while reading reviews.');
      filmId=film(current);diagnostic('page-read',current);return {url:current,html:expanded.html};
     }
    }
    await race(new Promise(resolve=>{pauseTimer=setTimeout(resolve,300);}));
   }
  }catch(error){diagnostic('read-failed',currentUrl(),error);close();throw error;}
  finally{clearTimeout(timer);clearTimeout(pauseTimer);signal?.removeEventListener('abort',abort);if(active===job)active=null;}
 }
 return {readPage,close};
}
module.exports={createBrowserReviewReader};
