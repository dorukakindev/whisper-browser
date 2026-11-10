(() => {
 'use strict';
 const el=id=>document.getElementById(id),dialog=el('dubGeneratorDialog');
 const panel=document.createElement('details');panel.className='dub-group-takes';panel.id='dubGroupTakes';panel.hidden=true;panel.setAttribute('data-ui-untranslated','');
 panel.innerHTML='<summary></summary><div class="dub-take-content"><p class="dub-take-hint"></p><label for="dubTakeChoice"></label><div class="dub-take-picker"><select id="dubTakeChoice"></select><button class="btn btn-ghost" type="button" id="dubTakeRefresh"></button></div><p id="dubTakeLevel" class="dub-take-hint"></p><div class="dub-ab-grid"><section><h4 id="dubTakeALabel"></h4><p id="dubTakeCurrentText"></p><audio id="dubTakeCurrent" aria-labelledby="dubTakeALabel" controls preload="none" hidden></audio><button type="button" class="btn btn-ghost" id="dubTakePlayA"></button></section><section><h4 id="dubTakeBLabel"></h4><p id="dubTakeText"></p><audio id="dubTakePreview" aria-labelledby="dubTakeBLabel" controls preload="none" hidden></audio><button type="button" class="btn btn-ghost" id="dubTakePlayB"></button></section></div><div class="dub-take-metrics-wrap"><table id="dubTakeMetrics"></table></div><p id="dubTakeMetricsHint" class="dub-take-hint"></p><div class="dub-take-actions"><button class="btn btn-secondary" type="button" id="dubTakeApply"></button><span id="dubTakeStatus" role="status"></span></div></div>';
 el('dubQualityResults').insertBefore(panel,el('dubQualityEvidence'));
 let switchSequence=0,shownPair='';
 let sequence=0,identity='',rows=[],busy=false;
 const en=()=>window.UiLocale?.get?.()==='en',copy=(tr,eng)=>en()?eng:tr;
 const read=()=>window.DubGeneratorUI.takeContext(),signature=c=>JSON.stringify([c.id,c.key,c.owner]);
 function labels(){
  el('dubTakeALabel').textContent=copy('A · Kullanılan kayıt','A · Current take');el('dubTakeBLabel').textContent=copy('B · Seçilen kayıt','B · Selected take');el('dubTakePlayA').textContent=copy('A kaydına geç','Switch to A');el('dubTakePlayB').textContent=copy('B kaydına geç','Switch to B');
  panel.querySelector('summary').textContent=copy('Grup kayıtları','Group recordings');
  panel.querySelector('label').textContent=copy('Karşılaştırılacak kayıt','Recording to compare');
  panel.querySelector('.dub-take-hint').textContent=copy('Ham kaydı dinleyip seçebilirsin. Kullanıldığında zamanlama ve ses dengesi yeniden hazırlanır; diğer gruplar yeniden seslendirilmez.','Listen to a raw take and choose it. Applying rebuilds timing and loudness; other groups are not synthesized again.');
  el('dubTakeRefresh').textContent=copy('Yenile','Refresh');el('dubTakeApply').textContent=copy('Bu kaydı kullan','Use this take');
 }
 function selected(){return rows.find(r=>r.token===el('dubTakeChoice').value);}
 function buttons(){const c=read(),r=selected();el('dubTakePlayA').disabled=busy||c.busy||!rows.some(r=>r.current);el('dubTakePlayB').disabled=busy||c.busy||!r;el('dubTakeRefresh').disabled=busy||c.busy;el('dubTakeChoice').disabled=busy||c.busy||!rows.length;el('dubTakeApply').disabled=busy||c.busy||!c.recipeReady||!r||r.current||r.compareOnly;}
 function comparison(a,b){
  const table=el('dubTakeMetrics');table.replaceChildren();const head=document.createElement('thead'),header=document.createElement('tr');for(const title of [copy('Kayıt ölçütü','Recorded measure'),'A','B']){const th=document.createElement('th');th.scope='col';th.textContent=title;header.append(th);}head.append(header);table.append(head);const body=document.createElement('tbody'),unknown=copy('Bilinmiyor','Unknown');
  const seconds=v=>Number.isFinite(v)?v.toFixed(2)+' s':unknown,verification=v=>({passed:copy('ASR geçti','ASR passed'),review:copy('Kontrol gerekli','Review required'),not_checked:copy('Denetlenmedi','Not checked'),unavailable:copy('Kullanılamıyor','Unavailable')})[v]||unknown;
  const fields=[[copy('Kapsam','Scope'),m=>({sample:copy('Kısa örnek','Short sample'),range:copy('Seçili aralık','Selected range'),full:copy('Tam üretim','Full production')})[m.scope]||unknown],[copy('Kaynak zaman aralığı','Source time span'),m=>seconds(m.sourceSeconds)],[copy('Kayıtlı çıktı zaman aralığı','Saved output timeline span'),m=>seconds(m.renderedSeconds)],[copy('Kayıtlı zaman esnetme','Recorded time stretch'),m=>Number.isFinite(m.stretch)?m.stretch.toFixed(2)+'×':unknown],[copy('Anlaşılırlık denetimi','Intelligibility check'),m=>verification(m.verification)],[copy('Ses referansı kimliği','Voice reference identity'),m=>({same:copy('Aynı','Same'),different:copy('Farklı','Different'),unavailable:unknown})[m.referenceMatch]||unknown],[copy('Uygulama reçetesi','Application recipe'),m=>typeof m.recipeMatch==='boolean'?m.recipeMatch?copy('Eşleşiyor','Matches'):copy('Farklı','Different'):unknown]];
  for(const [label,value]of fields){const tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=label;tr.append(th);for(const r of [a,b]){const td=document.createElement('td');td.textContent=r?.metrics?value(r.metrics):unknown;tr.append(td);}body.append(tr);}table.append(body);el('dubTakeMetricsHint').textContent=copy('Kaydedilmiş üretim kanıtlarıdır; ham dosya süresi veya insan dinleme puanı değildir. ASR geçişi doğal ses garantisi vermez. Bilinmeyen ölçüt geçer sayılmaz.','Saved production evidence; these are not raw-file durations or human listening scores. Passing ASR does not guarantee natural speech. Unknown measures do not count as passed.');
 }
 function show(){
  const row=selected(),audio=el('dubTakePreview'),a=el('dubTakeCurrent'),current=rows.find(r=>r.current);
  comparison(current,row);
  const pair=JSON.stringify([current?.token,current?.url,row?.token,row?.url]);
  if(pair!==shownPair){pause();shownPair=pair;}
  audio.hidden=!row;a.hidden=!current;if(current){if(a.getAttribute('src')!==current.url){a.pause();a.src=current.url;}}else{a.pause();a.removeAttribute('src');a.load();}el('dubTakePlayA').disabled=!current||read().busy;el('dubTakePlayB').disabled=!row||read().busy;
  if(row){if(audio.getAttribute('src')!==row.url){audio.pause();audio.src=row.url;}}
  else{audio.pause();audio.removeAttribute('src');audio.load();}
  const measured=[current?.levelDb,row?.levelDb].every(v=>Number.isFinite(v)&&v>=-150&&v<=40);
  const target=measured?Math.min(current.levelDb,row.levelDb):0;
  a.volume=measured?Math.pow(10,(target-current.levelDb)/20):1;audio.volume=measured?Math.pow(10,(target-row.levelDb)/20):1;
  el('dubTakeLevel').textContent=measured?copy('Karşılaştırma ses düzeyi dengelendi; ham kayıtlar değişmez.','Comparison levels matched; raw recordings stay unchanged.'):copy('Ses düzeyi ölçümü yok; kayıtlar özgün düzeyinde çalar.','Level measurement unavailable; recordings play at their original levels.');
  el('dubTakeText').textContent=row?.text||'';el('dubTakeCurrentText').textContent=current?.text||'';
  el('dubTakeStatus').textContent=row?row.compareOnly?copy('Yalnız karşılaştırma: metin veya ses ayarları farklı. Bu kayıt uygulanamaz.','Comparison only: text or voice settings differ. This take cannot be applied.'):row.current?copy('Şu an kullanılan kayıt','Current recording'):copy('Önce dinle, sonra uygula.','Listen first, then apply.'):copy('Bu üretimde saklanmış ham kayıt yok.','No saved raw recordings for this production.');buttons();
 }
 function render(){
  const selectedToken=el('dubTakeChoice').value;el('dubTakeChoice').replaceChildren();
  for(const [index,row]of rows.entries()){
   const option=document.createElement('option');option.value=row.token;
   const time=new Date(row.recordedAt),date=Number.isFinite(time.getTime())?new Intl.DateTimeFormat(en()?'en':'tr',{dateStyle:'short',timeStyle:'short'}).format(time):copy('Kayıt','Recording');
   option.textContent=(row.current?copy('Kullanılan','Current'):copy('Önceki','Previous'))+' · '+date+' · '+(row.status==='ready'?copy('Hazır','Ready'):copy('Kontrol gerekli','Review'))+' · '+(index+1);
   el('dubTakeChoice').append(option);
  }
  if(rows.some(r=>r.token===selectedToken))el('dubTakeChoice').value=selectedToken;
  else if(rows.length)el('dubTakeChoice').value=(rows.find(r=>!r.current)||rows[0]).token;
  show();
 }
 async function refresh(){
  const c=read();if(!c.id||!c.key||c.busy)return;
  const serial=++sequence,expected=signature(c);busy=true;buttons();el('dubTakeStatus').textContent=copy('Kayıtlar yükleniyor…','Loading recordings…');
  try{
   const result=await window.api.dubGroupTakes({id:c.id,key:c.key});
   if(serial!==sequence||signature(read())!==expected||!dialog.open)return;
   if(!result?.ok)throw Error(result?.error||'Recording list failed.');
   rows=result.choices||[];render();
  }catch(error){if(serial===sequence&&signature(read())===expected){rows=[];render();el('dubTakeStatus').textContent=copy('Kayıtlar alınamadı. Yenile ile tekrar deneyin.','Recordings could not load. Try Refresh.');el('dubTakeStatus').title=error.message;}}
  finally{if(serial===sequence){busy=false;buttons();}}
 }
 function pause(){++switchSequence;el('dubTakePreview').pause();el('dubTakeCurrent').pause();}
 function update(){
  const c=read(),next=signature(c),changed=next!==identity;panel.hidden=!c.id||!c.key;
  if(changed){identity=next;++sequence;busy=false;rows=[];render();if(panel.open&&!panel.hidden)void refresh();}
  if(c.busy)pause();buttons();
 }
 panel.addEventListener('toggle',()=>{if(!panel.open)pause();else if(!rows.length)void refresh();});
 el('dubTakeRefresh').addEventListener('click',()=>void refresh());el('dubTakeChoice').addEventListener('change',show);
 el('dubTakeApply').addEventListener('click',()=>{const c=read(),row=selected();if(!row||row.current||row.compareOnly||busy||c.busy||!c.recipeReady||signature(c)!==identity)return;pause();void window.DubGeneratorUI.useTake(c.key,row.token);});
 function isolateRawPreview(other){
  el(other).pause();el('dubGeneratedPreview').pause();el('dubPreviousPreview').pause();
  const playback=window.BrowserDubAudioUI,context=playback?.context?.();
  void playback?.pauseSource?.(context);playback?.stop();
 }
 el('dubTakePreview').addEventListener('play',()=>isolateRawPreview('dubTakeCurrent'));
 el('dubTakeCurrent').addEventListener('play',()=>isolateRawPreview('dubTakePreview'));
 for(const [button,target,other]of [['dubTakePlayA','dubTakeCurrent','dubTakePreview'],['dubTakePlayB','dubTakePreview','dubTakeCurrent']])el(button).onclick=async()=>{if(read().busy||busy)return;const a=el(target),b=el(other),expected=identity,source=a.getAttribute('src'),move=++switchSequence;if(!source)return;const time=b.currentTime||0;b.pause();try{if(a.readyState<1)await new Promise((resolve,reject)=>{const done=()=>{a.removeEventListener('loadedmetadata',ok);a.removeEventListener('error',bad);clearTimeout(timer);};const ok=()=>{done();resolve();},bad=()=>{done();reject(Error('Audio unavailable'));},timer=setTimeout(bad,5000);a.addEventListener('loadedmetadata',ok,{once:true});a.addEventListener('error',bad,{once:true});a.load();});if(move!==switchSequence||!dialog.open||read().busy||signature(read())!==expected||a.getAttribute('src')!==source)return;a.currentTime=Math.min(time,Math.max(0,(a.duration||0)-.01));await a.play();}catch{if(move!==switchSequence||identity!==expected)return;el('dubTakeStatus').textContent=copy('Ses açılamadı; kaydı yenileyin.','Audio unavailable; refresh recordings.');}};
 for(const id of ['dubGeneratedPreview','dubPreviousPreview'])el(id).addEventListener('play',pause);
 dialog.addEventListener('close',()=>{++sequence;busy=false;pause();});
 window.addEventListener('dub-takes:open',()=>{update();if(!panel.hidden){panel.open=true;panel.scrollIntoView({block:'center'});if(!busy&&!rows.length)void refresh();}});
 window.addEventListener('dub-takes:context',update);document.addEventListener('ui-locale-change',()=>{labels();render();});labels();update();
})();
