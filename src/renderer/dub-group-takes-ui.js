(() => {
 'use strict';
 const el=id=>document.getElementById(id),dialog=el('dubGeneratorDialog');
 const panel=document.createElement('details');panel.className='dub-group-takes';panel.id='dubGroupTakes';panel.hidden=true;panel.setAttribute('data-ui-untranslated','');
 panel.innerHTML='<summary></summary><div class="dub-take-content"><p class="dub-take-hint"></p><label for="dubTakeChoice"></label><div class="dub-take-picker"><select id="dubTakeChoice"></select><button class="btn btn-ghost" type="button" id="dubTakeRefresh"></button></div><p id="dubTakeText"></p><audio id="dubTakePreview" controls preload="none" hidden></audio><div class="dub-take-actions"><button class="btn btn-secondary" type="button" id="dubTakeApply"></button><span id="dubTakeStatus" role="status"></span></div></div>';
 el('dubQualityResults').insertBefore(panel,el('dubQualityEvidence'));
 let sequence=0,identity='',rows=[],busy=false;
 const en=()=>window.UiLocale?.get?.()==='en',copy=(tr,eng)=>en()?eng:tr;
 const read=()=>window.DubGeneratorUI.takeContext(),signature=c=>JSON.stringify([c.id,c.key,c.owner]);
 function labels(){
  panel.querySelector('summary').textContent=copy('Grup kayıtları','Group recordings');
  panel.querySelector('label').textContent=copy('Karşılaştırılacak kayıt','Recording to compare');
  panel.querySelector('.dub-take-hint').textContent=copy('Ham kaydı dinleyip seçebilirsin. Kullanıldığında zamanlama ve ses dengesi yeniden hazırlanır; diğer gruplar yeniden seslendirilmez.','Listen to a raw take and choose it. Applying rebuilds timing and loudness; other groups are not synthesized again.');
  el('dubTakeRefresh').textContent=copy('Yenile','Refresh');el('dubTakeApply').textContent=copy('Bu kaydı kullan','Use this take');
 }
 function selected(){return rows.find(r=>r.token===el('dubTakeChoice').value);}
 function buttons(){const c=read(),r=selected();el('dubTakeRefresh').disabled=busy||c.busy;el('dubTakeChoice').disabled=busy||c.busy||!rows.length;el('dubTakeApply').disabled=busy||c.busy||!c.recipeReady||!r||r.current;}
 function show(){
  const row=selected(),audio=el('dubTakePreview');audio.hidden=!row;
  if(row){if(audio.getAttribute('src')!==row.url){audio.pause();audio.src=row.url;}}
  else{audio.pause();audio.removeAttribute('src');audio.load();}
  el('dubTakeText').textContent=row?.text||'';
  el('dubTakeStatus').textContent=row?row.current?copy('Şu an kullanılan kayıt','Current recording'):copy('Önce dinle, sonra uygula.','Listen first, then apply.'):copy('Bu üretimde saklanmış ham kayıt yok.','No saved raw recordings for this production.');buttons();
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
  else if(rows.some(r=>r.current))el('dubTakeChoice').value=rows.find(r=>r.current).token;
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
 function update(){
  const c=read(),next=signature(c),changed=next!==identity;panel.hidden=!c.id||!c.key;
  if(changed){identity=next;++sequence;busy=false;rows=[];render();if(panel.open&&!panel.hidden)void refresh();}
  if(c.busy)el('dubTakePreview').pause();buttons();
 }
 panel.addEventListener('toggle',()=>{if(!panel.open)el('dubTakePreview').pause();else if(!rows.length)void refresh();});
 el('dubTakeRefresh').addEventListener('click',()=>void refresh());el('dubTakeChoice').addEventListener('change',show);
 el('dubTakeApply').addEventListener('click',()=>{const c=read(),row=selected();if(!row||row.current||busy||c.busy||!c.recipeReady||signature(c)!==identity)return;el('dubTakePreview').pause();void window.DubGeneratorUI.useTake(c.key,row.token);});
 el('dubTakePreview').addEventListener('play',()=>{el('dubGeneratedPreview').pause();el('dubPreviousPreview').pause();});
 for(const id of ['dubGeneratedPreview','dubPreviousPreview'])el(id).addEventListener('play',()=>el('dubTakePreview').pause());
 dialog.addEventListener('close',()=>{++sequence;busy=false;el('dubTakePreview').pause();});
 window.addEventListener('dub-takes:context',update);document.addEventListener('ui-locale-change',()=>{labels();render();});labels();update();
})();
