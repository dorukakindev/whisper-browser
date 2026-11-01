(() => {
  'use strict';
  const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;};
  const statuses=()=>[['unspecified',t('Not set','Belirtilmedi')],['planned',t('Watchlist','İzleme listesi')],['watching',t('Watching','İzleniyor')],['completed',t('Watched','İzlendi')]];
  const statusName=value=>statuses().find(row=>row[0]===value)?.[1]||statuses()[0][1];
  const reactionName=value=>value==='like'?t('Liked it','Beğendim'):value==='dislike'?t('Not for me','Bana göre değil'):value==='neutral'?t('Mixed','Kararsızım'):'';
  const time=seconds=>{const n=Math.max(0,Math.floor(Number(seconds)||0));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':');};
  function summary(value){
    if(!value)return '';
    const resume=value.effectiveResume||value.manualResume,episode=resume?.episodeId?(value.episodes||[]).find(row=>row.id===resume.episodeId):null;
    const playback=(value.playback||[]).filter(row=>!row.completed&&row.position>0).sort((a,b)=>(b.lastWatched||0)-(a.lastWatched||0))[0];
    const season=resume?.season??episode?.season,number=resume?.number??episode?.number;
    return [statusName(value.watchStatus),reactionName(value.reaction),resume?(number!=null?t(`Season ${season} · Episode ${number}`,`Sezon ${season} · Bölüm ${number}`)+' · ':'')+time(resume.positionSeconds):playback?t('Continue at ','Devam konumu: ')+time(playback.position):'',value.note?t('Has a personal note','Kişisel not var'):''].filter(Boolean).join(' · ');
  }
  const mounted=new WeakMap();
  function mount(host,{item={},identity,onChanged}={}){
    mounted.get(host)?.dispose();
    identity=identity||{catalogId:item.id};
    const owner={sourceToken:'personal-ui:'+crypto.randomUUID()},root=el('section','pm-panel');root.dataset.uiUntranslated='';root.setAttribute('aria-label',t('My viewing','İzleme durumum'));host.append(root);
    let disposed=false,epoch=0,pending=true,value=item.personalMedia||null,preview=null;
    const abort=new AbortController(),alive=()=>!disposed&&root.isConnected;
    const api=async(action,input={})=>{const result=await window.api.personalMedia({action,...input});if(!result?.ok)throw Error(result?.error||t('Could not save your viewing details.','İzleme bilgilerin kaydedilemedi.'));return result;};
    const notice=message=>{if(alive()){const status=root.querySelector('.pm-status');if(status)status.textContent=message;}};
    const button=(label,run,cls='')=>{const node=el('button','mh-action '+cls,label);node.type='button';node.addEventListener('click',()=>void work(run));return node;};
    function controls(){root.setAttribute('aria-busy',String(pending));root.querySelectorAll('button,input,textarea,select').forEach(node=>{node.disabled=pending;});}
    async function work(run){if(!alive()||pending)return;pending=true;controls();try{await run();}catch(error){notice(error.message);}finally{if(alive()){pending=false;controls();}}}
    function invalidate(){if(!preview)return;preview=null;root.querySelector('.pm-preview')?.remove();notice(t('Changes edited. Preview again before saving.','Değişiklik düzenlendi. Kaydetmeden önce yeniden önizleyin.'));}
    async function stage(changes){
      if(!Object.keys(changes).length){notice(t('No changes to preview.','Önizlenecek değişiklik yok.'));return;}
      const ticket=++epoch;preview=null;root.querySelector('.pm-preview')?.remove();notice(t('Preparing preview…','Önizleme hazırlanıyor…'));
      const result=await api('preview',{identity,owner,changes});if(!alive()||ticket!==epoch)return;
      preview={token:result.token,changes:result.preview?.changes||changes};drawPreview(result.preview);notice(t('Review these changes, then confirm to save.','Değişiklikleri inceleyin, ardından kaydetmeyi onaylayın.'));
    }
    function changeLines(changes){const lines=[];if(Object.hasOwn(changes,'watchStatus'))lines.push(t('Viewing: ','İzleme: ')+statusName(changes.watchStatus));if(Object.hasOwn(changes,'reaction'))lines.push(t('Reaction: ','Tepki: ')+(reactionName(changes.reaction)||t('Cleared','Kaldırıldı')));if(changes.episode)lines.push(t(`Season ${changes.episode.season} · Episode ${changes.episode.number}`,`Sezon ${changes.episode.season} · Bölüm ${changes.episode.number}`));if(Object.hasOwn(changes,'positionSeconds'))lines.push(t('Continue from: ','Devam konumu: ')+time(changes.positionSeconds));if(Object.hasOwn(changes,'note'))lines.push(t('Note: ','Not: ')+(changes.note||t('Cleared','Kaldırıldı')));return lines;}
    function drawPreview(info){
      const box=el('section','pm-preview');box.setAttribute('aria-label',t('Confirm personal changes','Kişisel değişiklikleri onayla'));box.append(el('strong','',t('Save these changes?','Bu değişiklikler kaydedilsin mi?')),el('p','pm-target',info?.title||item.title||''));
      const list=el('ul');for(const line of changeLines(preview.changes))list.append(el('li','',line));box.append(list);
      if(info?.createPersonalRecord)box.append(el('p','pm-muted',t('A personal library record will be created for this title. No video is downloaded.','Bu yapım için kütüphanede kişisel kayıt oluşturulacak. Video indirilmez.')));
      const actions=el('div','pm-actions');actions.append(button(t('Confirm save','Kaydetmeyi onayla'),async()=>{
        const exact=preview;if(!exact)return;const ticket=++epoch;
        const result=await api('apply',{token:exact.token,owner});if(!alive()||ticket!==epoch)return;
        value=result.item;preview=null;draw();notice(result.networkSync?.ok===false?t('Saved. Taste network could not be updated; your viewing details are safe.','Kaydedildi. Zevk ağı güncellenemedi; izleme bilgilerin korundu.'):t('Viewing details saved.','İzleme bilgilerin kaydedildi.'));
        document.dispatchEvent(new CustomEvent('media-personal-changed',{detail:{identity:value.identity,catalogId:value.catalogId,personalMedia:value}}));
        if(alive())onChanged?.(value);
      },'pm-confirm'),button(t('Cancel','Vazgeç'),()=>{preview=null;draw();}));box.append(actions);root.append(box);controls();
    }
    function field(label,type,value,options={}){const wrap=el('label','pm-field'),input=el(type==='textarea'?'textarea':'input');wrap.append(el('span','',label),input);if(type!=='textarea')input.type=type;input.value=value;for(const [key,val]of Object.entries(options))input[key]=val;input.addEventListener('input',invalidate);return {wrap,input};}
    function draw(){
      root.replaceChildren();const heading=el('div','pm-heading');heading.append(el('h3','',t('My viewing','İzleme durumum')),el('p','pm-summary',summary(value)));root.append(heading);
      if(value?.note)root.append(el('p','pm-note',value.note));
      const quick=el('div','pm-actions'),label=el('label','pm-watch'),select=el('select');label.append(el('span','pm-muted',t('Viewing','İzleme')),select);for(const [key,text]of statuses()){const option=el('option','',text);option.value=key;select.append(option);}select.value=value?.watchStatus||'unspecified';select.setAttribute('aria-label',t('Watch status','İzleme durumu'));select.onchange=()=>void work(()=>stage({watchStatus:select.value}));quick.append(label);
      for(const [reaction,text]of [['like',t('Liked it','Beğendim')],['dislike',t('Not for me','Bana göre değil')]]){const node=button(text,()=>stage({reaction}));node.setAttribute('aria-pressed',String(value?.reaction===reaction));quick.append(node);}
      if(value?.reaction)quick.append(button(t('Clear reaction','Tepkiyi kaldır'),()=>stage({reaction:null}),'pm-subtle'));
      root.append(quick);
      const disclosure=el('details','pm-details');disclosure.append(el('summary','',t('Personal note & continue position','Kişisel not ve devam konumu')));
      const form=el('form','pm-form');form.addEventListener('submit',event=>event.preventDefault());
      const note=field(t('My note','Notum'),'textarea',value?.note||'',{maxLength:2000,rows:2});form.append(note.wrap);
      const resume=value?.manualResume,episode=(value?.episodes||[]).find(row=>row.id===resume?.episodeId),series=(value?.kind||item.kind)==='series';
      const row=el('div','pm-resume');let season,number;
      if(series){season=field(t('Season','Sezon'),'number',resume?.season??episode?.season??'',{min:'0',max:'1000',step:'1'});number=field(t('Episode','Bölüm'),'number',resume?.number??episode?.number??'',{min:'1',max:'10000',step:'1'});row.append(season.wrap,number.wrap);}
      const position=field(t('Continue from (mm:ss)','Devam konumu (dk:sn)'),'text',resume?time(resume.positionSeconds):'',{placeholder:'12:30',maxLength:12});position.input.inputMode='numeric';row.append(position.wrap);form.append(row);
      const initial=[season?.input.value,number?.input.value,position.input.value].join('|');
      form.append(button(t('Preview changes','Değişiklikleri önizle'),()=>{
        if(!form.reportValidity())return;const changes={};if(note.input.value!==(value?.note||''))changes.note=note.input.value;
        if([season?.input.value,number?.input.value,position.input.value].join('|')!==initial){
          if(series){if(!season.input.value||!number.input.value)throw Error(t('Enter both season and episode.','Sezon ve bölümün ikisini de girin.'));changes.episode={season:Number(season.input.value),number:Number(number.input.value)};}
          const text=position.input.value.trim();if(text){const match=/^(?:(\d{1,4}):)?(\d{1,4}):([0-5]\d)$/.exec(text);if(!match||(match[1]!==undefined&&Number(match[2])>59))throw Error(t('Use mm:ss or hh:mm:ss, for example 12:30.','dk:sn veya sa:dk:sn biçimini kullanın; örnek: 12:30.'));changes.positionSeconds=Number(match[1]||0)*3600+Number(match[2])*60+Number(match[3]);}
          else if(!series)throw Error(t('Enter a time to continue from.','Devam edilecek konumu girin.'));
        }
        return stage(changes);
      }));disclosure.append(form);root.append(disclosure);
      const status=el('p','pm-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(status);controls();
    }
    async function reload(){const ticket=++epoch;preview=null;try{const result=await api('get',{identity});if(!alive()||ticket!==epoch)return;value=result.item;draw();}catch(error){if(alive()&&ticket===epoch)notice(error.message);}finally{if(alive()&&ticket===epoch){pending=false;controls();}}}
    function dispose(){disposed=true;epoch++;abort.abort();root.remove();mounted.delete(host);}
    draw();void reload();
    document.addEventListener('media-personal-changed',event=>{const detail=event.detail;if(detail?.catalogId&&detail.catalogId!==value?.catalogId)return;if(alive()&&!pending&&!root.querySelector('details[open]')&&!preview)void reload();},{signal:abort.signal});
    const controller={dispose,reload};mounted.set(host,controller);return controller;
  }
  window.PersonalMediaUI=Object.freeze({mount,summary});
})();
