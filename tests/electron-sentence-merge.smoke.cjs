'use strict';
// Real main/preload/UI with synthetic cues in an isolated profile. No media, model or provider calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','sentence-merge-20261113');fs.mkdirSync(out,{recursive:true});
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const result=require('node:child_process').spawnSync(require('electron'),[__filename],{cwd:root,env,windowsHide:true,stdio:'ignore',timeout:45000});
 const report=JSON.parse(fs.readFileSync(path.join(out,'report.json'),'utf8'));assert.equal(result.status,0,JSON.stringify(report));assert(report.ok);console.log(JSON.stringify(report));
}else{
 const {app,screen}=require('electron');app.setPath('userData',path.join(out,'profile-'+process.pid));
 const finish=(report,code)=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));app.exit(code);};
 setTimeout(()=>finish({ok:false,error:'deadline'},1),35000);
 app.on('browser-window-created',(_event,win)=>{if(win.getParentWindow())return;
  win.webContents.once('did-finish-load',async()=>{try{
   const display=screen.getAllDisplays().find(d=>/asus/i.test(d.label))||screen.getPrimaryDisplay();win.setBounds(display.bounds);win.setFullScreen(true);win.show();
   const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()');
   await new Promise(r=>setTimeout(r,700));
   await run(`await initialSettingsReady;UiLocale.set('tr',false);openPlayer();player.mediaKey='sentence-merge-fixture';setWorkspaceMode('player',false);document.body.classList.remove('media-home-active');document.getElementById('mediaHome').classList.add('hidden');
    player.cuesRaw=[{start:0,end:1,text:'We asked Dr.'},{start:1.2,end:2,text:'Smith about it.'},{start:3,end:4,text:'A complete sentence.'}];
    player.cues2Raw=[{start:0,end:1,text:'Dr.'},{start:1.2,end:2,text:'Smith’e sorduk.'},{start:3,end:4,text:'Tam bir cümle.'}];
    player.cues=player.cuesRaw;player.cues2=player.cues2Raw;window.mergeOriginal=JSON.stringify([player.cuesRaw,player.cues2Raw]);
    document.getElementById('continuationGap').value='3';document.getElementById('mergeContinuation').checked=true;
    document.getElementById('mergeContinuation').dispatchEvent(new Event('change',{bubbles:true}));
    setSettingsDrawer(true);document.getElementById('playerSentenceMergeStatus').scrollIntoView({block:'center'});return true;`);
   await new Promise(r=>setTimeout(r,150));
   const merged=await run(`const el=document.getElementById('playerSentenceMergeStatus'),b=el.getBoundingClientRect();return {summary:el.textContent,primary:player.cues.length,translation:player.cues2.length,visible:b.width>0&&b.height>0&&b.bottom<=innerHeight,viewport:{width:innerWidth,height:innerHeight}};`);
   assert.equal(merged.primary,2);assert.equal(merged.translation,2);assert(merged.visible,JSON.stringify(merged));
   fs.writeFileSync(path.join(out,'merged.png'),(await win.webContents.capturePage()).toPNG());
   const restored=await run(`document.getElementById('playerMergeCont').click();return !player.mergeCont&&!document.getElementById('mergeContinuation').checked&&player.cues===player.cuesRaw&&player.cues2===player.cues2Raw&&JSON.stringify([player.cuesRaw,player.cues2Raw])===mergeOriginal;`);
   assert(restored);await run(`UiLocale.set('en',false);return true;`);
   const english=await run(`return document.getElementById('playerSentenceMergeStatus').textContent;`);assert.match(english,/Off/);
   finish({ok:true,actualMainPreload:true,syntheticCues:true,display:display.label,...merged,restored,english},0);
  }catch(error){finish({ok:false,error:error.stack},1);}});
 });
 require('../src/main.js');
}
