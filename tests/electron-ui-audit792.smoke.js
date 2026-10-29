'use strict';
const {app,BrowserWindow,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','dub-layout792-'+Date.now());fs.mkdirSync(out,{recursive:true});app.setAppPath(root);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.commandLine.appendSwitch('disable-gpu');global.fetch=async()=>{throw Error('Isolated layout test: no external requests');};const fixture=path.join(out,'synthetic.partial.srt');fs.writeFileSync(fixture,'1\n00:00:00,000 --> 00:00:02,000\nSynthetic source line.\n');dialog.showOpenDialog=async()=>({canceled:false,filePaths:[fixture]});require('../src/main');let win;const rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms)),run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
async function until(fn){for(let i=0;i<200;i++){if(await fn())return;await wait(80);}throw Error('UI state timed out');}
async function capture(name){await run('await document.fonts.ready');await wait(250);const m=await run(`const d=document.getElementById('dubGeneratorDialog'),f=d.querySelector('footer'),s=d.querySelector('.dub-studio-scroll'),r=d.getBoundingClientRect(),fr=f.getBoundingClientRect(),sr=s.getBoundingClientRect();return {width:innerWidth,height:innerHeight,overflow:d.scrollWidth>d.clientWidth+1,footerVisible:fr.bottom<=innerHeight+1&&fr.top>=0,scrollAboveFooter:sr.bottom<=fr.top+1,modalVisible:r.top>=0&&r.bottom<=innerHeight+1,editorHint:document.getElementById('dubEditorProviderHint').textContent};`);assert(!m.overflow,name);assert(m.footerVisible&&m.scrollAboveFooter&&m.modalVisible,name+' vertical layout');rows.push({name,...m});fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;});
 win.showInactive();win.setMinimumSize(600,480);await run('await initialSettingsReady');
 for(const [locale,theme,width] of [['tr','dark',1440],['en','light',800]]){
  win.setContentSize(width,950);win.webContents.setZoomFactor(1);
  await run(`UiLocale.set('${locale}',false);applyUiTheme('${theme}');await DubGeneratorUI.prepareCurrent();document.activeElement.blur();return true`);
  assert(await run(`const b=document.getElementById('sideAppSettings');return b.title===${JSON.stringify(locale==='en'?'Application settings':'Uygulama ayarları')}&&b.getAttribute('aria-label')===b.title`));
  await run(`document.getElementById('dubChooseSrt').click();return true`);await until(()=>run(`return !document.getElementById('dubInputNotice').hidden`));
  // Only a non-secret local engine fixture is needed for ready-state UI.
  await run(`document.getElementById('dubGeneratorDialog').close();return true`);
  const dubSettings=path.join(out,'profile','dub-settings.json');
  fs.writeFileSync(dubSettings,JSON.stringify({engine:'missing-synthetic-engine',reference:'missing-synthetic-reference.wav'}));
  await run(`await DubGeneratorUI.prepareCurrent();return true`);
  await wait(300);
  const disabled=await run(`const b=document.getElementById('dubGeneratorStart'),s=getComputedStyle(b);return {disabled:b.disabled,background:s.backgroundColor,description:document.getElementById('dubStartRequirement').textContent,visible:!document.getElementById('dubStartRequirement').hidden,linked:b.getAttribute('aria-describedby')}`);
  assert(disabled.disabled&&disabled.visible&&disabled.linked==='dubStartRequirement');assert(disabled.description);const neutral=await run(`const n=document.createElement('span');n.style.background='var(--bg-2)';document.getElementById('dubGeneratorDialog').append(n);const color=getComputedStyle(n).backgroundColor;n.remove();return color`);assert.equal(disabled.background,neutral,'disabled CTA must use neutral surface');
  await capture(locale+'-disabled');
  await run(`document.getElementById('dubProductionSettings').open=true;document.getElementById('dubProductionSettings').scrollIntoView({block:'start'});return true`);await capture(locale+'-details');
  await run(`document.getElementById('dubGeneratorDialog').close();return true`);
 }
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify({ok:true,out,screens:rows.length}));app.exit(0);
}).catch(e=>{console.error(e.stack);app.exit(1);});setTimeout(()=>app.exit(2),60000).unref();
