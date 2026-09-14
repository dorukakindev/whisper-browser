const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/main.js'),'utf8');
const fn=vm.runInNewContext('('+source.slice(source.indexOf('async function loadedDirectBrowserMedia('),source.indexOf('function isAbortedBrowserNavigation('))+')',{URL,setTimeout});
(async()=>{
 const url='https://example.com/clip.mp4';let probe=true;
 const wc={isDestroyed:()=>false,getURL:()=>url,executeJavaScriptInIsolatedWorld:async()=>probe};
 assert.equal(await fn(wc,url,{errno:-2}),true);
 assert.equal(await fn(wc,url,{errno:-105}),false);
 assert.equal(await fn(wc,'https://example.com/watch',{errno:-2}),false);
 assert.equal(await fn(wc,'https://example.com/other.mp4',{errno:-2}),false);
 probe=false;assert.equal(await fn(wc,url,{errno:-2}),false);
 wc.executeJavaScriptInIsolatedWorld=async()=>{throw Error('kapandı');};
 assert.equal(await fn(wc,url,{errno:-2}),false);
 console.log('Doğrudan video gezinmesi: çözülmüş medya, ağ hatası, farklı URL ve kapanma kontrolleri geçti.');
})().catch(e=>{console.error(e);process.exit(1);});
