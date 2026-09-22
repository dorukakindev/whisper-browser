// Gerçek Electron'da hasarlı profil yeniden açılışı — T5.
// Profil dizinine çökmüş-önceki-oturum kalıntıları ekilir: bozuk birincil
// browser-session.json + sağlam .bak (temiz-çıkış işareti FALSE — çökme),
// browser-assets altında bayat/yeni .tmp yetimleri, bozuk çeviri önbelleği
// birincil + sağlam .bak, settings.json + bayat .tmp.
// Beklenen sözleşme: uygulama açılır; seans .bak'tan kurtarılır ve
// 'beklenmedik kapanış' uyarısı kullanıcıya ulaşır; açılış sweep'i bayat .tmp
// yetimlerini temizler, taze .tmp'ye dokunmaz; birincil dosya onarılır.
// node_modules/.bin/electron tests/electron-crash-integrity.smoke.js
// Çıktılar .uiprev/crash-integrity/ altında.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.CRASH_E2E_OUT||path.join(root,'.uiprev','crash-integrity'));
fs.mkdirSync(out,{recursive:true});
const profile=path.resolve(process.env.CRASH_E2E_PROFILE||path.join(out,'profile-'+process.pid));
fs.rmSync(profile,{recursive:true,force:true});
fs.mkdirSync(profile,{recursive:true});
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;

// --- 1) Bozuk profil hazırla ----------------------------------------------------
// browser-session: birincil bozuk (yarım yazım simülasyonu), .bak sağlam ve
// cleanExit=false işaretli (önceki oturum çökmüş) → uyarı + sekme kurtarma.
fs.writeFileSync(path.join(profile,'browser-session.json'),'{corrupt!!!','utf8');
fs.writeFileSync(path.join(profile,'browser-session.json.bak'),JSON.stringify({
  version:2,restoreEnabled:true,cleanExit:false,savedAt:Date.now()-60000,
  activeTabId:'tab-recovered',
  tabs:[{id:'tab-recovered',url:'https://crash-e2e.test/',title:'Recovered tab'}],
})+'\n','utf8');

// browser-assets: bayat .tmp yetimi (48sa) + taze .tmp (başka işlem yazıyor olabilir).
const assetDir=path.join(profile,'browser-assets','a'.repeat(24));
fs.mkdirSync(assetDir,{recursive:true});
const staleTmp=path.join(assetDir,'stale.1234.1.tmp');
const freshTmp=path.join(assetDir,'fresh.1234.2.tmp');
fs.writeFileSync(staleTmp,'half-written');fs.writeFileSync(freshTmp,'in-progress');
const old=new Date(Date.now()-48*3600*1000);fs.utimesSync(staleTmp,old,old);

// settings.json sağlam + bayat .tmp yetimi (yanlış nesil karışmasın diye).
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,ui:{}})+'\n','utf8');
fs.writeFileSync(path.join(profile,'settings.json.99999.tmp'),'{"partial":','utf8');

// browser-translation-cache.json bozuk + .bak sağlam → .bak'a düşmeli.
fs.writeFileSync(path.join(profile,'browser-translation-cache.json'),'NOT-JSON','utf8');
fs.writeFileSync(path.join(profile,'browser-translation-cache.json.bak'),
  JSON.stringify({version:2,entries:[['k1',{value:'yedek çeviri',updatedAt:1}]]})+'\n','utf8');

// CEA checkpoint dizini: bozuk checkpoint — açılışın çökmesine yol açmamalı.
const ceaDir=path.join(profile,'browser-cea-checkpoints');
fs.mkdirSync(ceaDir,{recursive:true});
fs.writeFileSync(path.join(ceaDir,'cea-'+'f'.repeat(64)+'.json'),'{broken','utf8');

// --- 2) Uygulamayı gerçek Electron ile aç ---------------------------------------
app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');
require('../src/main.js');
assert.equal(app.getPath('userData'),profile,'Test profili uygulanmalı');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,label,ms=20000)=>{const end=Date.now()+ms;let last;while(Date.now()<end){last=await fn();if(last)return last;await wait(200)}throw Error(label+' zaman aşımı: '+JSON.stringify(last));};
const report={checks:[],ok:true};
const check=(name,ok,detail)=>{report.checks.push({name,ok:!!ok,detail:detail||''});if(!ok)report.ok=false;};

app.whenReady().then(async()=>{
 try{
  const win=await until(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading()),'Pencere açılması');
  check('app-booted',true);
  const run=code=>win.webContents.executeJavaScript(`(async()=>{${code}})()`,true);
  await run('await initialSettingsReady');

  // Açılış sweep'i: bayat .tmp kaldırıldı, taze .tmp korundu.
  check('stale-tmp-swept',!fs.existsSync(staleTmp),'bayat .tmp yetimi açılışta temizlenmeli');
  check('fresh-tmp-kept',fs.existsSync(freshTmp),'taze .tmp başka işlemin canlı yazısı olabilir — korunmalı');

  // settings.json sağlam ve bayat .tmp karışmadı.
  const settings=JSON.parse(fs.readFileSync(path.join(profile,'settings.json'),'utf8'));
  check('settings-intact',settings.settingsVersion===3&&!settings.partial);
  check('stale-settings-tmp-isolated',fs.existsSync(path.join(profile,'settings.json.99999.tmp')),
    'bayat tmp ana dosyayı bozmadan yerinde kalabilir (kaldırılması şart değil)');

  // Tarayıcı alanını aç → seans .bak'tan kurtarılmalı, uyarı gelmeli.
  const shown=await run(`return await window.api.showBrowser('',{x:0,y:0,width:800,height:600})`);
  check('browser-opened',shown&&shown.ok===true,JSON.stringify(shown).slice(0,400));
  check('session-recovered-from-bak',shown&&Array.isArray(shown.tabs)&&shown.tabs.some(t=>t.id==='tab-recovered'&&t.title==='Recovered tab'),
    'kurtarılan sekme: '+(shown&&JSON.stringify(shown.tabs||[]).slice(0,300)));
  check('unclean-exit-warning',shown&&/beklenmedik|okunamadı/i.test(String(shown.sessionWarning||'')),
    'sessionWarning='+(shown&&shown.sessionWarning));

  // Birincil dosya onarıldı — debounce'lu kayıt planlayıcısı sağlam snapshot'ı yazar.
  const repaired=await until(()=>{try{const p=JSON.parse(fs.readFileSync(path.join(profile,'browser-session.json'),'utf8'));return Array.isArray(p.tabs)&&p.tabs.length?p:null;}catch(_){return null}},'browser-session.json onarımı',15000);
  check('primary-repaired',!!repaired,'bozuk birincil yerine geçerli oturum yazıldı');

  // settings.tmp yetimi settings dosyasına karışmadı — içerik hâlâ geçerli JSON.
  JSON.parse(fs.readFileSync(path.join(profile,'settings.json'),'utf8'));

  await win.webContents.capturePage().then(img=>fs.writeFileSync(path.join(out,'crash-integrity.png'),img.toPNG()));
  fs.writeFileSync(path.join(out,'crash-integrity-report.json'),JSON.stringify(report,null,2));
  console.log('CRASH-INTEGRITY '+(report.ok?'PASS':'FAIL'));
  for(const c of report.checks)console.log(` ${c.ok?'✓':'✗'} ${c.name}${c.detail?' — '+c.detail:''}`);
  app.exit(report.ok?0:1);
 }catch(error){
  report.ok=false;report.fatal=String(error&&error.stack||error);
  fs.writeFileSync(path.join(out,'crash-integrity-report.json'),JSON.stringify(report,null,2));
  console.error('CRASH-INTEGRITY FATAL',error);
  app.exit(1);
 }
});
setTimeout(()=>{console.error('CRASH-INTEGRITY watchdog timeout');try{fs.writeFileSync(path.join(out,'crash-integrity-report.json'),JSON.stringify({ok:false,fatal:'watchdog 240s'},null,2));}catch(_){}app.exit(1);},240000);
