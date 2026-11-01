'use strict';
// Native Windows renderer, synthetic source/action, no provider or user profile.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'assistant-review824', String(Date.now()));
fs.mkdirSync(path.join(out, 'profile'), { recursive: true });
app.setPath('userData', path.join(out, 'profile'));
for (const flag of ['disable-gpu', 'disable-backgrounding-occluded-windows']) app.commandLine.appendSwitch(flag);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const commands = [], measurements = [];
let win;
ipcMain.on('assistant:action', (event, packet) => { if (event.sender === win?.webContents) commands.push(packet); });
app.whenReady().then(async () => {
  win = new BrowserWindow({ width:480, height:600, useContentSize:true, show:false,
    webPreferences:{ preload:path.join(root,'src/assistant-overlay-preload.js'), sandbox:true, contextIsolation:true, nodeIntegration:false } });
  await win.loadFile(path.join(root, 'src/renderer/assistant-overlay.html'));
  win.showInactive();win.webContents.setBackgroundThrottling(false);
  const run = code => win.webContents.executeJavaScript('(async()=>{' + code + '})()', true);
  const base = {
    opened:true, sourceToken:'synthetic:review824', context:'Kontrollü asistan tasarım senaryosu',
    sourcePreview:{summary:'Kontrollü yerel metin · sentetik',detail:'Bu deneme kişisel veri veya sağlayıcı kullanmaz.',attached:true},
    sourceDescription:'Yalnız sağlanan sentetik metin.', transcriptScope:false, busy:false,
    threads:[{id:'first',title:'Kontrollü işlem önerisi'}],activeThread:'first',
    suggestions:[{id:'explain',label:'Daha anlaşılır açıkla',direct:true}],
    messages:[{id:'q',role:'user',text:'Görünüm ayarlarını açmak için bir öneri hazırla.'},
      {id:'a',role:'ai',text:'## İnceleme sonucu\n\n'+('Bu metin kontrollü inceleme örneğidir. ').repeat(22),
        actions:[{id:'act',kind:'app_action',label:'Görünüm ayarlarını aç',excerpt:'Mevcut ayarlar penceresinin görünüm bölümünü açar. Hiçbir ayar değiştirilmez.'}]}],
  };
  for (const [width,height,locale,theme] of [[480,600,'tr','dark'],[360,600,'tr','dark'],[480,600,'en','light'],[360,600,'en','light'],[480,720,'tr','dark']]) {
    win.setContentSize(width,height);
    win.webContents.send('assistant:snapshot',{...base,locale,theme,conversation:`synthetic:${width}:${height}:${locale}`});
    await wait(300);
    await run("document.getElementById('log').scrollTop=99999;await document.fonts.ready;return true");
    const point = await run("const r=document.querySelector('.tool-card button').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}");
    win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
    win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
    await wait(180);
    const measured = await run("const box=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {dpr:devicePixelRatio,review:box('review'),confirm:box('reviewConfirm'),cancel:box('reviewCancel'),form:box('form'),textClient:reviewText.clientHeight,textScroll:reviewText.scrollHeight,active:document.activeElement.id,documentWidth:document.documentElement.scrollWidth}");
    measurements.push({width,height,locale,theme,...measured});
    assert.equal(measured.active,'reviewConfirm');
    assert(measured.confirm.top>=measured.review.top && measured.confirm.bottom<=measured.review.bottom);
    assert(measured.cancel.bottom<=measured.review.bottom && measured.review.bottom<=measured.form.top+1);
    assert(measured.documentWidth<=width+1);
    if(height<=620) assert(measured.textScroll>measured.textClient,'Short-panel explanation scrolls separately');
    assert.equal(commands.filter(row=>row.action==='apply-tool').length,0,'Opening a review never dispatches its action');
    fs.writeFileSync(path.join(out,`assistant-${width}x${height}-${locale}-${theme}-review.png`),(await win.webContents.capturePage()).toPNG());
    await run("document.getElementById('reviewCancel').click();return true");
    assert(await run("return document.activeElement===document.querySelector('.tool-card button')&&review.hidden"),'Cancel restores the proposal trigger');
  }
  fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(measurements,null,2));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,states:measurements.length,providerCalls:0,implicitActions:0},null,2));
  console.log(JSON.stringify({ok:true,out,states:measurements.length,providerCalls:0}));app.exit(0);
}).catch(error=>{fs.writeFileSync(path.join(out,'error.txt'),error.stack);console.error(error);app.exit(1);});
