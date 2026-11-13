// Controlled HLS inventory in production renderer; not real HLS/native playback acceptance.
import path from 'node:path';
import {launch,stageRenderer,ROOT,sleep} from './support/chromium-fixture.mjs';
const args=process.argv.slice(2),shots=args.includes('--shots')?args[args.indexOf('--shots')+1]:'';
const staged=stageRenderer(['discover-fixture-stub.js','stremio-sources-fixture-stub.js'].map(f=>path.join(ROOT,'tests/support',f)));
const browser=await launch({width:1920,height:1080}),checks=[];
const check=(label,ok,data)=>{checks.push(!!ok);console.log((ok?'PASS ':'FAIL ')+label+(ok?'':' '+JSON.stringify(data)));};
try{
 await browser.goto(staged.url);await browser.until('window.__sx&&window.StremioUI&&window.CinemaSahne','track fixture');await sleep(800);
 await browser.evaluate(`(()=>{window.__fx.setLocale('tr');applyUiTheme('dark');
  // The visual fixture owns source handoff; no unavailable CDN is opened.
  window.MediaHubUI={...window.MediaHubUI,playStream:async result=>{player.mediaKey=result.key;player.generation++;player.workspaceMode='player';player.localPath='fixture.mkv';document.getElementById('playerTitle').textContent='Night Train';document.getElementById('playerLayer').classList.remove('hidden');document.getElementById('playerWorkspaceV3').hidden=false;document.getElementById('playerEmpty').classList.add('hidden');hideHomeOnVideoLoad();return true;}};
  StremioUI.openStreams({type:'movie',id:'tt7000001',name:'Night Train'});return true;})()`);
 await browser.until("document.querySelector('.sx-streams .sx-stream')",'sources');
 await browser.click("[...document.querySelectorAll('.sx-streams .sx-stream')].find(r=>/1080p/.test(r.textContent))?.querySelector('button')");
 await browser.until('StremioUI._test.session()','source session');
 await browser.evaluate(`(()=>{let podcast=false;window.PlayerWorkspaceIntegration={...window.PlayerWorkspaceIntegration,bridge:{},snapshot:()=>({mediaKey:player.mediaKey,generation:player.generation,sourceKind:'local',title:'Night Train',duration:1800,time:21,paused:true,rate:1,capabilities:{seek:{support:'yes'}}}),getTranscriptTracks:()=>['source','translation'].map(role=>({id:role,revision:'empty',role,cues:[],offsetSeconds:0,timed:true})),executeExisting:async()=>({ok:true}),isPodcastMode:()=>podcast,setPodcastMode(value){podcast=value;}};return true;})()`);
 await browser.evaluate(`(()=>{player.hls={audioTracks:[{id:0,name:'English · 5.1',lang:'en'},{id:1,name:'Türkçe · Stereo',lang:'tr'}],audioTrack:0,subtitleTracks:[{id:0,name:'English',lang:'en'},{id:1,name:'Türkçe',lang:'tr'}],subtitleTrack:-1,subtitleDisplay:false};const s=document.getElementById('playerStreamAudio');s.replaceChildren(new Option('English','0'),new Option('Türkçe','1'));return true;})()`);
 for(const mode of ['cinema','study','podcast']){
  await browser.evaluate(`StremioUI.togglePanel('audio');document.querySelector('.sx-player-panel')&&StremioUI.togglePanel('audio');CinemaSahne.open({mode:'${mode}'});true`);await sleep(350);
  await browser.until("document.querySelector('.sh .sx-track-access [data-sx-track=audio]')",mode+' access');
  await browser.until("!document.querySelector('.sh.sh-enter')",mode+' entrance completed');
  await browser.click("document.querySelector('.sh .sx-track-access [data-sx-track=audio]')");await sleep(200);
  const geometry=await browser.evaluate(`(()=>{const p=document.querySelector('.sx-player-panel'),b=p?.getBoundingClientRect(),a=document.querySelector('.sh .sx-track-access'),r=a?.getBoundingClientRect();return{visible:!!b&&b.width>0,inside:!!b&&b.left>=0&&b.top>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1,accessVisible:!!r&&r.width>0&&r.left>=0&&r.right<=innerWidth+1,labels:p?.textContent,overflow:document.documentElement.scrollWidth>innerWidth};})()`);
  check(mode+' has visible audio/subtitle access and a contained language menu',geometry.visible&&geometry.inside&&geometry.accessVisible&&!geometry.overflow&&geometry.labels.includes('Türkçe'),geometry);
  if(shots)await browser.screenshot(path.join(shots,'tracks-'+mode+'-1920.png'));
  await browser.evaluate("StremioUI.togglePanel('audio');true");
 }
}catch(e){check('track flow completed',false,{error:e.message});}
await browser.close();staged.cleanup();console.log(checks.filter(Boolean).length+'/'+checks.length+' passed');process.exit(checks.every(Boolean)?0:1);
