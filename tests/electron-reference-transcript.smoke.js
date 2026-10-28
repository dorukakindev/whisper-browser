'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),i=process.argv.indexOf('--reference');
if(i<0){console.error('--reference synthetic WAV required');app.exit(2);return;}
const reference=path.resolve(process.argv[i+1]),out=path.join(root,'.uiprev','reference-transcript',Date.now()+'-'+process.pid),profile=path.join(out,'profile');
fs.mkdirSync(profile,{recursive:true});app.setAppPath(root);app.setPath('downloads',out);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;
app.commandLine.appendSwitch('disable-gpu');
const id='ca90fa20-1777-4444-8888-012345678901',folder=path.join(out,'Sesler','Ses referansları',id);
fs.mkdirSync(folder,{recursive:true});fs.copyFileSync(reference,path.join(folder,'reference.wav'));
const original='This is a clean reference for a controlled local test. We are reading a book together.';
fs.writeFileSync(path.join(folder,'reference.txt'),original);fs.writeFileSync(path.join(folder,'reference.json'),JSON.stringify({name:'Sentetik anlatıcı',createdAt:new Date().toISOString()}));
require('../src/voice-reference-baseline').save(path.join(folder,'reference.wav'),path.join(folder,'reference-asr.json'),original);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,ui:{uiLocale:'tr',uiTheme:'dark'}}));
fs.writeFileSync(path.join(profile,'dub-settings.json'),JSON.stringify({reference:path.join(folder,'reference.wav'),transcript:path.join(folder,'reference.txt')}));
global.fetch=async()=>{throw Error('Synthetic reference UI background network disabled');};
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await wait(60);}throw Error('Timeout: '+label);}
let win,run;
async function capture(name){
 await wait(350);
 await run("const target=document.getElementById('voiceReferenceComparison'),scroller=document.querySelector('#dubGeneratorDialog .dub-studio-scroll');target.querySelector('summary').focus({preventScroll:true});scroller.scrollTop+=target.getBoundingClientRect().top-scroller.getBoundingClientRect().top-12;return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
 await wait(100);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
}
require('../src/main');
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');
 win.setContentSize(1280,1000);win.showInactive();run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await run("document.getElementById('dubMainOpen').click();document.getElementById('voiceReferenceRecorder').open=true;return true");
 await until(()=>run("return document.getElementById('voiceReferenceComparisonTitle').textContent.includes('aynı')"),'baseline loaded');
 await run("document.getElementById('voiceReferenceComparison').open=true;document.getElementById('voiceReferenceComparison').scrollIntoView({block:'center'});return true");
 await capture('same-tr');
 await run("const t=document.getElementById('voiceReferenceText');t.value='This is a different reference. We paid twelve euros, not twenty.';t.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('voiceReferenceComparison').scrollIntoView({block:'center'});return true");
 await until(()=>run("return document.getElementById('voiceReferenceEdited').querySelector('.reference-diff-add')!==null"),'changed words');
 await capture('edited-tr');
 const savedBefore=fs.readFileSync(path.join(folder,'reference.txt'),'utf8');
 await run("document.getElementById('voiceReferenceRestoreTranscript').click();return true");
 assert.equal(await run("return document.getElementById('voiceReferenceText').value"),original);assert.equal(fs.readFileSync(path.join(folder,'reference.txt'),'utf8'),savedBefore);
 win.setContentSize(1000,950);win.webContents.setZoomFactor(1.25);
 await run("UiLocale.set('en',false);applyUiTheme('light');document.getElementById('voiceReferenceComparison').scrollIntoView({block:'center'});return true");
 await capture('same-en-light-125');
 const metrics=await run("const box=document.getElementById('voiceReferenceComparison'),r=box.getBoundingClientRect();return {title:document.getElementById('voiceReferenceComparisonTitle').textContent,viewport:innerWidth,box:{left:r.left,right:r.right,width:r.width},overflow:box.scrollWidth>box.clientWidth+1,restoreHeight:document.getElementById('voiceReferenceRestoreTranscript').getBoundingClientRect().height}");
 assert.match(metrics.title,/Matches/);assert.equal(metrics.overflow,false);assert(metrics.box.left>=0&&metrics.box.right<=metrics.viewport+1);assert(metrics.restoreHeight>=40);
 // A changed waveform invalidates the stored original on the next real listing.
 const bytes=fs.readFileSync(path.join(folder,'reference.wav'));bytes[bytes.length-1]^=1;fs.writeFileSync(path.join(folder,'reference.wav'),bytes);
 await run("const p=document.getElementById('voiceReferenceRecorder');p.open=false;p.open=true;p.dispatchEvent(new Event('toggle'));return true");
 await until(()=>run("return document.getElementById('voiceReferenceComparisonTitle').textContent.includes('No original')"),'changed audio rejected');
 await capture('unknown-en-light');
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({complete:true,controlledBaseline:true,liveASR:false,restoredEditorOnly:true,changedAudioInvalidated:true,metrics},null,2));
 console.log(JSON.stringify({out,complete:true,metrics}));app.exit(0);
}).catch(async e=>{console.error(e.stack);try{await capture('failure');}catch{}app.exit(1);});
setTimeout(()=>app.exit(2),60000).unref();
