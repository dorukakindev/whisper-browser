/* Local scene audition. Audio is the clock; each version has its own sync map. */
(() => {
  'use strict';
  const data=JSON.parse(document.getElementById('data').textContent),get=id=>document.getElementById(id);
  const video=get('video'),audio=get('audio'),select=get('group');
  const en=document.documentElement.lang==='en',t=(tr,english)=>en?english:tr;
  if(en){document.title='Scene comparison';document.querySelector('h1').textContent='Scene comparison';document.querySelector('main>p').textContent='Compare the old and new group in the same scene. Automated checks are not naturalness or emotion scores. Source audio is muted.';document.querySelector('label').textContent='Sentence group';get('before').textContent='Listen to previous group';get('after').textContent='Listen to new group';get('stop').textContent='Stop';const headings=document.querySelectorAll('section h2');headings[0].textContent='Source';headings[1].textContent='Turkish';}
  let current=null,stopAt=0,epoch=0;
  video.src=data.video;
  for(const row of data.after.groups){const option=document.createElement('option');option.value=row.key;option.textContent=row.key+' · '+row.translation.slice(0,100);select.append(option);}
  function stop(){epoch++;audio.pause();video.pause();current=null;for(const name of ['before','after'])get(name).classList.remove('active');}
  function show(){const row=data.after.groups.find(row=>row.key===select.value);get('source').textContent=row.source;get('translation').textContent=row.translation;get('checks').textContent=(row.blocking.length?t('Çeviri kontrolü: ','Translation check: ')+row.blocking.join(', '):t('Bu yapısal çeviri kontrolleri geçti.','These structural translation checks passed.'))+(row.listen_for_level_change?t(' Komşu grupla ses yüksekliğini dinleyerek karşılaştırın.',' Compare loudness with the adjacent group by listening.'):'')+t(' Ses durumu: ',' Audio status: ')+row.status;}
  function originalTime(time,sync){let low=0,high=sync.videoDuration;for(let i=0;i<40;i++){const mid=(low+high)/2;if(window.DubSyncMap.at(sync,mid).time<time)low=mid;else high=mid;}return (low+high)/2;}
  function syncVideo(){if(!current)return;const mapped=originalTime(audio.currentTime,current.sync),factor=window.DubSyncMap.at(current.sync,mapped).factor;
    if(Math.abs(video.currentTime-mapped)>.15)video.currentTime=Math.min(mapped,Number.isFinite(video.duration)?video.duration:mapped);
    video.playbackRate=Math.max(.0625,Math.min(16,1/factor));
    if(audio.currentTime>=stopAt)stop();
  }
  function metadata(element){if(element.readyState>=1)return Promise.resolve();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(new Error(t('Medya açılamadı','Could not load media'))),10000);const done=()=>finish(),failed=()=>finish(new Error(t('Medya açılamadı','Could not load media')));function finish(error){clearTimeout(timer);element.removeEventListener('loadedmetadata',done);element.removeEventListener('error',failed);error?reject(error):resolve();}element.addEventListener('loadedmetadata',done,{once:true});element.addEventListener('error',failed,{once:true});});}
  async function play(name){stop();const token=epoch,row=data[name].groups.find(row=>row.key===select.value);get('status').textContent=t('Hazırlanıyor…','Preparing…');
    try{audio.src=name+'.wav';audio.load();await Promise.all([metadata(audio),metadata(video)]);if(token!==epoch)return;
      current=data[name];stopAt=row.audioEnd;audio.currentTime=row.audioStart;syncVideo();get(name).classList.add('active');
      await Promise.all([audio.play(),video.play()]);if(token===epoch)get('status').textContent=(name==='before'?t('Önceki grup','Previous group'):t('Yeni grup','New group'))+' · '+row.key;
    }catch(error){if(token===epoch){stop();get('status').textContent=error.message;}}
  }
  for(const name of ['before','after'])get(name).addEventListener('click',()=>play(name));
  get('stop').addEventListener('click',stop);select.addEventListener('change',()=>{stop();show();});
  audio.addEventListener('timeupdate',syncVideo);audio.addEventListener('seeking',syncVideo);audio.addEventListener('pause',()=>video.pause());audio.addEventListener('play',()=>{if(current)video.play().catch(()=>stop());});audio.addEventListener('ended',stop);window.addEventListener('pagehide',stop);show();
})();
