'use strict';
// Real main/preload close handshake, synthetic media, isolated profile. No playback claim.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
  const out=path.join(root,'.uiprev','watch-handoff-close-'+Date.now());fs.mkdirSync(out,{recursive:true});
  const env={...process.env,WHISPER_RESOURCE_SOAK_USER_DATA:path.join(out,'profile'),WATCH_CLOSE_SMOKE_OUT:out};delete env.ELECTRON_RUN_AS_NODE;
  const result=require('node:child_process').spawnSync(require('electron'),[__filename],{cwd:root,env,windowsHide:true,stdio:'ignore',timeout:45000});
  const report=JSON.parse(fs.readFileSync(path.join(out,'report.json'),'utf8'));assert.equal(result.status,0,JSON.stringify(report));assert.equal(report.ok,true);
  console.log(JSON.stringify({out,...report}));
}else{
  const {app}=require('electron'),out=process.env.WATCH_CLOSE_SMOKE_OUT;
  app.setPath('userData',process.env.WHISPER_RESOURCE_SOAK_USER_DATA);
  const finish=(report,code)=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));app.exit(code);};
  const timer=setTimeout(()=>finish({ok:false,error:'deadline'},1),35000);
  app.on('browser-window-created',(_event,win)=>{
    if(win.getParentWindow())return;
    win.webContents.once('did-finish-load',async()=>{
      try{
        const prepared=await win.webContents.executeJavaScript(`(async()=>{
          await initialSettingsReady;
          watchMutationQueue=new Promise(()=>{});
          const video=document.getElementById('playerVideo');
          Object.defineProperty(video,'duration',{configurable:true,value:600});
          Object.defineProperty(video,'currentTime',{configurable:true,writable:true,value:123});
          player.workspaceMode='player';player.isLive=false;player.watchSession=null;
          player.localPath='C:/synthetic-close-a.mp4';player.mediaKey='file:c:/synthetic-close-a.mp4';
          document.getElementById('playerTitle').textContent='Synthetic A';video.volume=.37;
          void flushWatchState(false,false);
          player.localPath='C:/synthetic-close-b.mp4';player.mediaKey='file:c:/synthetic-close-b.mp4';
          document.getElementById('playerTitle').textContent='Synthetic B';video.currentTime=45;video.volume=.81;
          return pendingWatchProgress.size;
        })()`);
        assert.equal(prepared,1);
        win.once('closed',()=>{
          try{
            const data=JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'watch-library.json'),'utf8'));
            const a=data.items.find(x=>x.key==='file:c:/synthetic-close-a.mp4'),b=data.items.find(x=>x.key==='file:c:/synthetic-close-b.mp4');
            assert.equal(a?.position,123);assert.equal(b?.position,45);assert.equal(a.prefs.volume,.37);assert.equal(b.prefs.volume,.81);
            clearTimeout(timer);finish({ok:true,actualMainPreload:true,syntheticMedia:true,persistedAfterClose:[{source:'A',position:a.position,volume:a.prefs.volume},{source:'B',position:b.position,volume:b.prefs.volume}]},0);
          }catch(error){finish({ok:false,error:error.message},1);}
        });
        win.close();
      }catch(error){finish({ok:false,error:error.message},1);}
    });
  });
  require('../src/main.js');
}
