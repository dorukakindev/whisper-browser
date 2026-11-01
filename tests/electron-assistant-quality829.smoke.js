'use strict';
// Native review of real source/setting contract strings; no network or user profile.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/quality829/assistant-native'),profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);app.commandLine.appendSwitch('disable-gpu');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:480,height:720,useContentSize:true,show:false,webPreferences:{preload:path.join(root,'src/assistant-overlay-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 await win.loadFile(path.join(root,'src/renderer/assistant-overlay.html'));win.showInactive();
 const owner={kind:'video',title:'Controlled video · 00:10–00:40',range:{start:10,end:40},tracks:[{id:'captured-A',role:'source',language:'en'}]};
 const plan=require('../src/assistant-workflow-plan').build(owner,'dubbing');
 const before={profile:'quality',concurrency:4,grouping:'cumle',verification:'fast',timingMode:'clip',expression:'calm',keepBackground:false,followDelivery:false,deliveryStrength:'gentle',sample:false,start:0,end:10};
 const after={profile:'fast',concurrency:8,grouping:'anlatim',verification:'detailed',timingMode:'video',expression:'warm',keepBackground:true,followDelivery:true,deliveryStrength:'strong',sample:true,start:10,end:40};
 const settings=require('../src/assistant-setting-proposals'),identity=settings.snapshot('configure_voice_generation',after,{status:'completed',voice:{settings:before,range:{start:0,end:10}}}),measurements=[];
 const labels={get_source_context:['Check source and selected range','Kaynağı ve seçili aralığı kontrol et'],choose_translation_source:['Choose existing captions, YouTube captions or explicitly requested Whisper','Mevcut altyazı, YouTube altyazısı veya açıkça istenen Whisper kaynağını seç'],translate_selected_source:['Review translation settings, then apply its card','Çeviri ayarlarını incele, sonra kartını uygula'],get_job_result:['Wait for the exact job and inspect incomplete output','İlgili işi bekle ve eksik çıktıyı kontrol et'],use_job_subtitles:['Load this job’s complete translated subtitles','Bu işin tamamlanmış çeviri altyazısını yükle'],open_voice_preparation:['Check reference voice and dubbing settings','Referans sesi ve dublaj ayarlarını kontrol et'],start_voice_generation:['Review a new generation card only when audio was requested','Yalnız ses üretimi istendiğinde yeni üretim kartını incele'],use_generated_voice:['Review the full generated output before attachment','Tam üretilen sesi bağlamadan önce incele']};
 for(const [width,height,locale]of [[480,720,'en'],[480,720,'tr'],[680,800,'en']]){
  win.setContentSize(width,height);
  const text=(locale==='tr'?'Kaynak: ':'Source: ')+plan.source.title+'\n\n'+plan.steps.map(row=>row.order+'. '+labels[row.tool][locale==='tr'?1:0]).join('\n')+'\n\n'+(locale==='tr'?'Yalnız plan; iş başlatılmadı. Her işlem ayrı onay kartı ve doğrulanmış sonuç gerektirir.':'Plan only; no job started. Each action requires its own review card and verified result.');
  win.webContents.send('assistant:snapshot',{opened:true,busy:false,canCancel:false,sourceToken:'controlled-829',conversation:'controlled-829-'+locale,context:owner.title,model:'Controlled fixture',locale,theme:'dark',videoContext:true,transcriptScope:false,sourcePreview:{summary:owner.title,detail:'Controlled source captions; only the selected range.'},threads:[],suggestions:[],messages:[{id:'plan',role:'ai',text,actions:[{id:'settings-829',kind:'app_action',label:locale==='tr'?'Dublaj ayarlarını incele':'Review dubbing settings',excerpt:settings.summary('configure_voice_generation',after,identity,locale)}]}]});
  await wait(180);
  await win.webContents.executeJavaScript("document.getElementById('log').scrollTop=0");
  fs.writeFileSync(path.join(out,width+'-'+locale+'-plan.png'),(await win.webContents.capturePage()).toPNG());
  const metrics=await win.webContents.executeJavaScript(`(()=>{const log=document.getElementById('log');log.scrollTop=log.scrollHeight;const card=document.querySelector('.tool-card'),button=card.querySelector('[data-tool-control="apply"]');button.scrollIntoView({block:'center'});button.focus();const r=button.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,buttonVisible:r.top>=0&&r.bottom<=innerHeight,hit:h===button,focused:document.activeElement===button,summary:card.textContent}})()`);
  assert(!metrics.overflow);assert(metrics.buttonVisible&&metrics.hit&&metrics.focused);assert(metrics.summary.includes('→'));measurements.push(metrics);
  fs.writeFileSync(path.join(out,width+'-'+locale+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,states:measurements.length,providerCalls:0,measurements},null,2));console.log(JSON.stringify({ok:true,out,states:measurements.length}));app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
