(() => {
  'use strict';
  const {h}=PlayerUiKit;
  const locale=()=>window.UiLocale?.get?.()==='tr'?'tr':'en';
  const t=(tr,en)=>locale()==='tr'?tr:en;
  const names=()=>({bulletin:t('Sinema bülteni','Cinema bulletin'),route:t('İzleme rotası','Watch itinerary'),matrix:t('Karşılaştırma','Comparison'),maintenance:t('Arşiv bakımı','Library maintenance'),health:t('Oynatma sağlığı','Playback health')});
  const call=async (api,input)=>{const result=await api(input);if(!result?.ok)throw Error(result?.error||t('İşlem tamamlanamadı.','The operation failed.'));return result;};
  const catalog=()=>call(window.api.mediaCatalog,{action:'list'}).then(r=>r.items);
  const feed=input=>call(window.api.feedsRequest,input);
  const hub=input=>call(window.api.mediaHub,input);
  function open(initial='bulletin') {
    const existing=document.getElementById('whisperV3Dialog');
    if(existing)existing.close();
    const origin=document.activeElement, dialog=h('dialog',{id:'whisperV3Dialog',class:'mtx-dialog media-surface', 'aria-label':names()[initial],data:{uiUntranslated:''}});
    const status=h('p',{role:'status',class:'mtx-status'}), body=h('main',{class:'mtx-body'});
    let tab=initial, epoch=0, sampleTimer=0, refreshResults=[];
    const report=error=>{if(dialog.open)status.textContent=error.message;};
    const button=(label,action)=>h('button',{type:'button',class:'pw-btn',text:label,on:{click:async event=>{const node=event.currentTarget;node.disabled=true;try{await action();}catch(error){report(error);}finally{if(node.isConnected)node.disabled=false;}}}});
    const nav=h('nav',{class:'mtx-tabs','aria-label':t('Medya araçları','Media tools')});
    for(const [key,label] of Object.entries(names()))nav.append(button(label,()=>draw(key)));
    dialog.append(h('header',null,h('h1',{text:t('Medya çalışma alanı','Media workspace')}),button(t('Kapat','Close'),()=>dialog.close())),nav,status,body);
    dialog.addEventListener('close',()=>{epoch++;clearTimeout(sampleTimer);dialog.remove();origin?.focus();void syncBrowserOcclusion();},{once:true});
    document.body.append(dialog);dialog.showModal();void syncBrowserOcclusion();
    async function draw(next=tab) {
      tab=next;const ticket=++epoch;clearTimeout(sampleTimer);
      const current=()=>dialog.open&&ticket===epoch;
      const setStatus=value=>{if(current())status.textContent=value;};
      const surface=h('section');
      body.replaceChildren(surface);setStatus(t('Yükleniyor…','Loading…'));
      [...nav.children].forEach((node,index)=>node.setAttribute('aria-current',Object.keys(names())[index]===tab?'page':'false'));
      const options={locale:locale(),handlers:{}};
      try {
        if(tab==='bulletin'){
          const [list,entries,items]=await Promise.all([feed({action:'list'}),feed({action:'entries',limit:100}),catalog()]);
          if(!current())return;
          const enabled=list.feeds.filter(f=>f.enabled);
          const rows=entries.rows.filter(e=>e.spoiler!=='marked'||e.spoilerAllowed).map(e=>({...e,entryId:e.id,publisherId:e.feedId,workId:e.links?.[0]?.catalogId}));
          const bulletin=CinemaBulletinModel.buildBulletin({entries:rows,library:items.map(i=>({workId:i.id,title:i.title})),feedResults:refreshResults,allFeedIds:enabled.map(f=>f.id),readState:Object.fromEntries(rows.map(e=>[e.id,e.read]))});
          const topics=[...bulletin.sections.flatMap(s=>s.topics),...bulletin.unlinked];
          options.handlers.onToggleRead=async id=>{try{
            const topic=topics.find(r=>r.topicId===id);if(!topic||!current())return;
            const ids=[...new Set(topic.stories.flatMap(r=>r.entryIds))];
            await feed({action:'state',entryIds:ids,read:true});if(current())await draw();
          }catch(error){report(error);}};
          options.handlers.onRetry=async()=>{try{
            const checked=new Set(refreshResults.filter(r=>['ok','not-modified'].includes(r.status)).map(r=>r.feedId));
            const result=await feed({action:'refresh',feedIds:enabled.map(f=>f.id).filter(id=>!checked.has(id))});
            if(current()){
              const byId=new Map(refreshResults.map(r=>[r.feedId,r]));
              for(const row of result.results||[]){
                const status=row.state==='updated'?'ok':row.state==='unchanged'?'not-modified':row.errorKind==='rate-limit'?'rate-limited':'error';
                byId.set(row.feedId,{feedId:row.feedId,status,newItems:row.inserted});
              }
              refreshResults=[...byId.values()];await draw();
            }
          }catch(error){report(error);}};
          V3SurfacesUI.renderBulletin(surface,bulletin,options);
          if(!rows.length)setStatus(t('Gösterilecek kayıtlı yazı yok.','No saved entries to display.'));
          else setStatus(t('Son 100 kayıt içinden.','From the latest 100 entries.'));
          return;
        }
        if(tab==='route'){
          const list=await call(window.api.mediaTools,{action:'daily-list'});
          if(!current())return;
          const budget=h('input',{type:'number',min:15,max:600,value:180,'aria-label':t('Dakika bütçesi','Minutes budget')});
          const controls=h('div',{class:'v3-runtime-controls'},h('label',null,t('Dakika bütçesi','Minutes budget'),budget));
          surface.before(controls);
          const render=()=>{
            const route=WatchItinerary.buildWatchItinerary({budgetMinutes:Number(budget.value),candidates:list.watchlist.map(i=>({itemId:i.id,title:i.title,runtimeMinutes:Number(i.runtime)||null,sourceReady:i.hasSource?'unknown':'needs-source'}))});
            options.handlers.onPreviewApply=()=>{
              if(!route.items.length)return;
              const name=h('input',{maxlength:80,'aria-label':t('Koleksiyon adı','Collection name')});
              const preview=h('section',{class:'v3-runtime-controls'},h('ol',null,route.items.map(i=>h('li',{text:i.title}))),name);
              preview.append(button(t('Üyeliği önizle','Review membership'),async()=>{
                const result=await call(window.api.mediaTools,{action:'film-watch-route-preview',name:name.value,ids:route.items.map(i=>i.itemId)});
                if(!current()||!preview.isConnected)return;
                preview.replaceChildren(h('strong',{text:result.name}),h('ol',null,result.items.map(i=>h('li',{text:i.title}))),
                  button(t('Koleksiyona ekle','Add to collection'),async()=>{
                    const saved=await call(window.api.mediaTools,{action:'film-watch-route-apply',token:result.token});
                    if(!current())return;
                    preview.replaceChildren(button(t('Rotayı geri al','Undo itinerary'),async()=>{
                      await call(window.api.mediaTools,{action:'film-watch-route-undo',token:saved.undoToken});
                      preview.remove();setStatus(t('Rota geri alındı.','Itinerary undone.'));
                    }));
                    setStatus(t('Koleksiyon ve sıra kaydedildi.','Collection and order saved.'));
                  }));
              }));
              surface.querySelector('.v3-runtime-controls')?.remove();surface.append(preview);
            };
            V3SurfacesUI.renderItinerary(surface,route,{...options,titles:Object.fromEntries(list.watchlist.map(i=>[i.id,i.title]))});
          };
          budget.addEventListener('change',()=>{if(budget.reportValidity())render();});render();
        }
        if(tab==='matrix'){
          const artifacts=async input=>{
            const result=await window.api.assistantArtifacts(input);
            if(result?.ok)return result;
            if(result?.code==='revision-conflict')throw Error(t('Karşılaştırma değişti. Kayıtlı sürümü yeniden açın.','The comparison changed. Reopen the saved version.'));
            if(result?.code==='source-missing')throw Error(t('Yapımlardan biri artık arşivde yok.','One of the titles is no longer in the library.'));
            if(result?.code==='archive-full')throw Error(t('Kayıtlı karşılaştırma sınırına ulaşıldı.','The saved comparison limit was reached.'));
            throw Error(t('Karşılaştırma arşivi işlemi tamamlanamadı.','The comparison archive operation could not be completed.'));
          };
          const [items,saved]=await Promise.all([catalog(),artifacts({action:'list'})]);
          if(!current())return;
          const picker=h('select',{'aria-label':t('Kayıtlı karşılaştırmalar','Saved comparisons')});
          const populate=(entries,value='')=>{
            picker.replaceChildren(h('option',{value:'',text:t('Kayıtlı karşılaştırmalar','Saved comparisons')}),
              ...entries.map(entry=>h('option',{value:entry.artifactId,text:entry.columns.map(col=>col.label).join(' · ')})));
            picker.value=value;
          };
          populate(saved.artifacts);
          const controls=h('div',{class:'v3-runtime-controls'});
          const revisions=h('div',{class:'v3-runtime-controls'});
          surface.before(controls);
          surface.after(revisions);
          let view=0;
          const show=async id=>{
            const request=++view;
            const {doc,body}=await artifacts({action:'get',id});
            if(!current()||request!==view)return;
            picker.value=id;
            setStatus('');
            options.handlers.onExport=async format=>{try{
              const out=AssistantArtifactExport.exportArtifact({doc,format,expectedRevision:doc.revision,locale:locale()});
              if(out.ok&&current())await hub({action:'v3-export',format,content:(out.bom?'\uFEFF':'')+out.content});
            }catch(error){report(error);}};
            V3SurfacesUI.renderMatrix(surface,doc,body,options);
            const update=button(t('Arşivden güncelle','Update from library'),async()=>{
              await artifacts({action:'save',id,expectedRevision:doc.revision,ids:body.columns.map(col=>col.id),locale:locale()});
              if(current()&&request===view)await show(id);
            });
            revisions.replaceChildren(update);
            if(doc.versions.length){
              const version=h('select',{'aria-label':t('Önceki sürüm','Previous revision')},doc.versions.slice().reverse().map(row=>
                h('option',{value:row.revision,text:t('Sürüm','Revision')+' '+row.revision})));
              revisions.append(version,button(t('Sürümü geri yükle','Restore revision'),async()=>{
                await artifacts({action:'restore',id,expectedRevision:doc.revision,revision:Number(version.value)});
                if(current()&&request===view)await show(id);
              }));
            }
          };
          if(items.length>=2){
            const select=label=>h('select',{'aria-label':label},items.map(i=>h('option',{value:i.id,text:i.title})));
            const left=select(t('Birinci yapım','First title')),right=select(t('İkinci yapım','Second title'));
            right.selectedIndex=1;
            controls.append(left,right,button(t('Karşılaştır ve kaydet','Compare and save'),async()=>{
              if(left.value===right.value){setStatus(t('İki farklı yapım seçin.','Select two different titles.'));return;}
              const {doc}=await artifacts({action:'save',ids:[left.value,right.value],locale:locale()});
              const updated=await artifacts({action:'list'});
              if(!current())return;
              populate(updated.artifacts,doc.id);
              await show(doc.id);
            }));
          }
          controls.append(picker,button(t('Kaydı aç','Open saved'),async()=>{if(picker.value)await show(picker.value);}));
          if(saved.artifacts.length)await show(saved.artifacts[0].artifactId);
          else setStatus(items.length<2?t('Karşılaştırmak için arşive iki yapım ekleyin.','Add two titles to the library to compare them.'):t('Karşılaştırmak için iki yapım seçin.','Select two titles to compare.'));
          return;
        }
        if(tab==='maintenance'){
          const result=await hub({action:'v3-maintenance'});if(!current())return;
          V3SurfacesUI.renderMaintenance(surface,result.preview,{...options,titles:result.titles});
          if(result.partial)surface.prepend(h('p',{role:'status',text:t('İlk 1.000 yapım ve 1.000 kaynak denetlendi.','Checked up to 1,000 titles and 1,000 sources.')}));
          const list=await hub({action:'folders'});if(!current())return;
          for(const folder of list.folders.filter(f=>f.enabled)){
            surface.append(button(t('Yeniden bağlamayı incele','Review relinking')+' · '+folder.path.split(/[\\/]/).at(-1),async()=>{
              const review=await hub({action:'relink-preview',folderId:folder.id});if(!current())return;
              const box=h('section',{class:'v3-runtime-controls'},h('ul',null,review.patches.map(p=>h('li',{text:p.title+' · '+p.old+' → '+p.next}))));
              if(review.patches.length)box.append(button(t('Bu bağlantıları uygula','Apply these links'),async()=>{const applied=await hub({action:'relink-apply',token:review.token});
                if(!current())return;
                box.replaceChildren(button(t('Bağlantıları geri al','Undo relinking'),async()=>{
                  await hub({action:'relink-undo',token:applied.undoToken});
                  if(current())await draw();
                }));
                setStatus(t('Güncellenen bağlantı: ','Updated links: ')+applied.count+(applied.warning?' · '+applied.warning:''));}));
              else box.append(h('p',{text:t('Tekil eşleşme bulunamadı.','No unique match found.')}));
              surface.querySelector('.v3-runtime-controls')?.remove();surface.append(box);
            }));
          }
        }
        if(tab==='health'){
          const samples=[];const video=document.getElementById('playerVideo');const key=player.mediaKey,generation=player.generation;
          const measure=async()=>{
            if(!current())return;
            if(key!==player.mediaKey||generation!==player.generation){void draw();return;}
            const native=await window.api.nativePlayer({action:'diagnostics',key,generation}).catch(()=>null);
            if(!current())return;
            if(key!==player.mediaKey||generation!==player.generation){void draw();return;}
            const props=native?.ok?native.props:{'frame-drop-count':video?.getVideoPlaybackQuality?.().droppedVideoFrames,'paused-for-cache':!!video?.currentSrc&&!video.paused&&video.readyState<3};
            if(native?.ok||video?.currentSrc)samples.push({t:Date.now(),props});
            if(samples.length>8)samples.shift();
            V3SurfacesUI.renderHealth(surface,NativePlayerDiagnostics.buildPlayerHealthReceipt({samples,now:Date.now(),requestedHwdec:native?.ok?'auto':null}),options);
            sampleTimer=setTimeout(measure,1000);
          };
          void measure().catch(report);
        }
        setStatus('');
      }catch(error){if(current())report(error);}
    }
    void draw();
  }
  window.WhisperV3=Object.freeze({open});
})();
