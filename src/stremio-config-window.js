'use strict';
const {randomUUID}=require('node:crypto');
const {isPrivateHost}=require('./podcast-transcript');

// This page never receives the application's preload or a persistent browser session.
function createStremioConfigurator({BrowserWindow,owner,title=()=> 'Addon settings'}={}) {
  const pending=new Set();
  const failure=code=>Object.assign(Error('Addon configuration could not complete.'),{code});
  function webUrl(value) {
    if(typeof value!=='string'||value.length>8192)return null;
    try {
      const u=new URL(value),host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
      const local=host==='localhost'||host.endsWith('.localhost')||host==='::1'||/^127\./.test(host);
      if(isPrivateHost(u.hostname)&&!local)return null;
      if(u.username||u.password||!(u.protocol==='https:'||u.protocol==='http:'&&local))return null;
      return u;
    }catch{return null;}
  }
  async function configure({url,expectedOrigin}={}) {
    const start=webUrl(url),expected=webUrl(expectedOrigin),parent=owner?.();
    if(!start||!expected||start.origin!==expected.origin)throw failure('CONFIG_ORIGIN');
    if(!parent||parent.isDestroyed())return {cancelled:true};
    return new Promise((resolve,reject)=>{
      let settled=false,root,configSession;
      const windows=new Set(),partition='stremio-config-'+randomUUID();
      const prefs={partition,sandbox:true,contextIsolation:true,nodeIntegration:false,webviewTag:false};
      const label=title();
      const finish=(result,error)=>{
        if(settled)return;settled=true;clearTimeout(timer);pending.delete(cancel);
        parent.removeListener('closed',cancel);
        for(const win of windows){try{if(!win.isDestroyed())win.destroy();}catch{}}
        void (async()=>{try{configSession?.protocol?.unhandle?.('stremio');await configSession?.clearStorageData?.();await configSession?.clearCache?.();}catch{}})();
        error?reject(error):resolve(result||{cancelled:true});
      };
      const cancel=()=>finish({cancelled:true});
      const timer=setTimeout(cancel,15*60*1000);timer.unref?.();pending.add(cancel);
      parent.once('closed',cancel);
      const allowedNavigation=raw=>{const next=webUrl(raw);return next&&(!isPrivateHost(next.hostname)||next.origin===expected.origin);};
      const destination=raw=>{
        const custom=typeof raw==='string'&&/^stremio:\/\//i.test(raw);
        const next=webUrl(custom?expected.protocol+'//'+raw.slice('stremio://'.length):raw);
        if(!custom&&!next?.pathname.match(/\/manifest\.json$/i))return false;
        if(!next||next.origin!==expected.origin||!/\/manifest\.json$/i.test(next.pathname))finish(null,failure('CONFIG_ORIGIN'));
        else {next.hash='';finish({manifestUrl:next.href});}
        return true;
      };
      function attach(win,isRoot=false) {
        windows.add(win);const wc=win.webContents;if(isRoot)configSession=wc.session;
        wc.session.setPermissionRequestHandler((_contents,_permission,done)=>done(false));
        wc.session.setPermissionCheckHandler(()=>false);
        // Configuration pages are not a download surface or a privileged app bridge.
        if(isRoot)wc.session.on('will-download',event=>event.preventDefault());
        // Hidden iframe installs may bypass cancellable top-level navigation events.
        // Handle the scheme in this ephemeral session, never as an OS default.
        if(isRoot&&wc.session.protocol?.handle)wc.session.protocol.handle('stremio',request=>{destination(request.url);return new Response(null,{status:204});});
        wc.on('will-attach-webview',event=>event.preventDefault());
        const navigation=(event,target)=>{
          if(destination(target)){event.preventDefault();return;}
          if(!allowedNavigation(target))event.preventDefault();
        };
        wc.on('will-navigate',navigation);wc.on('will-redirect',navigation);
        wc.on('will-frame-navigate',(event,details)=>{
          // Electron passes one navigation-details event here; support older wrappers too.
          const info=details||event;
          if(typeof info.url!=='string')return;
          if(/^stremio:\/\//i.test(info.url)){destination(info.url);event.preventDefault();return;}
          if(info.isMainFrame===false){if(info.url!=='about:blank'&&!allowedNavigation(info.url))event.preventDefault();return;}
          navigation(event,info.url);
        });
        wc.setWindowOpenHandler(details=>{
          if(destination(details.url)||!allowedNavigation(details.url))return {action:'deny'};
          // Debrid's API-key/help page can open beside the form without losing its fields.
          return {action:'allow',overrideBrowserWindowOptions:{parent:root,show:false,title:label,webPreferences:{...prefs}}};
        });
        wc.on('did-create-window',child=>{if(settled){child.destroy();return;}attach(child);child.once('ready-to-show',()=>{if(!settled&&!child.isDestroyed())child.show();});});
        wc.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{
          if(isRoot&&isMainFrame!==false&&code!==-3)finish(null,failure('CONFIG_LOAD'));
        });
        win.on('page-title-updated',event=>{event.preventDefault();});
        win.on('closed',()=>{windows.delete(win);if(isRoot)cancel();});
      }
      try {
        root=new BrowserWindow({parent,modal:true,show:false,width:1040,height:800,minWidth:640,minHeight:480,title:label,autoHideMenuBar:true,webPreferences:{...prefs}});
        attach(root,true);
        root.once('ready-to-show',()=>{if(!settled&&!root.isDestroyed())root.show();});
        Promise.resolve(root.loadURL(start.href)).catch(()=>{if(!settled)finish(null,failure('CONFIG_LOAD'));});
      }catch{finish(null,failure('CONFIG_LOAD'));}
    });
  }
  configure.dispose=()=>{for(const cancel of [...pending])cancel();};
  return configure;
}
module.exports={createStremioConfigurator};
