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
    let tab=initial, epoch=0, sampleTimer=0;
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
          const rows=entries.rows.filter(e=>e.spoiler!=='marked'||e.spoilerAllowed).map(e=>({...e,entryId:e.id,publisherId:e.feedId,workId:e.links?.find(link=>link.state==='confirmed')?.catalogId}));
          const coverage=enabled.map(f=>({feedId:f.id,title:f.title,lastAttempt:f.lastAttempt,status:!f.lastAttempt?'not-attempted':f.state==='updated'?'ok':f.state==='unchanged'?'not-modified':f.errorKind==='rate-limit'?'rate-limited':f.state==='failed'?'error':'unavailable'}));
          const bulletin=CinemaBulletinModel.buildBulletin({entries:rows,library:items.map(i=>({workId:i.id,title:i.title})),feedResults:coverage,allFeedIds:enabled.map(f=>f.id),readState:Object.fromEntries(rows.map(e=>[e.id,e.read]))});
          const topics=[...bulletin.sections.flatMap(s=>s.topics),...bulletin.unlinked];
          options.handlers.onToggleRead=async id=>{try{
            const topic=topics.find(r=>r.topicId===id);if(!topic||!current())return;
            const ids=[...new Set(topic.stories.flatMap(r=>r.entryIds))];
            await feed({action:'state',entryIds:ids,read:true});if(current())await draw();
          }catch(error){report(error);}};
          options.handlers.onRetry=async()=>{try{
            const checked=new Set(coverage.filter(r=>['ok','not-modified'].includes(r.status)).map(r=>r.feedId));
            await feed({action:'refresh',feedIds:enabled.map(f=>f.id).filter(id=>!checked.has(id))});
            if(current())await draw();
          }catch(error){report(error);}};
          V3SurfacesUI.renderBulletin(surface,bulletin,options);
          const review=h('details',{class:'v3-section v3-editorial'},h('summary',{text:t('Yazı ilişkisi, türü ve görüşü','Article relationship, type and opinion')}));
          const choose=h('select',{'aria-label':t('Kaynak yazı','Source article')},rows.map(row=>h('option',{value:row.id,text:row.title})));
          const film=h('select',{'aria-label':t('İlişkili yapım','Related title')},items.map(row=>h('option',{value:row.id,text:row.title})));
          const kindLabels={unknown:t('Tür bilinmiyor','Unknown type'),news:t('Haber','News'),'festival-selection':t('Festival seçkisi','Festival selection'),award:t('Ödül haberi','Award news'),interview:t('Söyleşi','Interview'),criticism:t('Eleştiri','Criticism')};
          const stanceLabels={unknown:t('Görüş bilinmiyor','Unknown opinion'),positive:t('Olumlu','Positive'),negative:t('Olumsuz','Negative'),mixed:t('Karma','Mixed'),neutral:t('Tarafsız','Neutral')};
          const kind=h('select',{'aria-label':t('Yazı türü','Article type')},Object.entries(kindLabels).map(([value,text])=>h('option',{value,text})));
          const stance=h('select',{'aria-label':t('Yazının görüşü','Article opinion')},Object.entries(stanceLabels).map(([value,text])=>h('option',{value,text})));
          const source=h('textarea',{rows:5,readonly:true,'aria-label':t('Kayıtlı kaynak metni','Saved source text')});
          const quote=h('textarea',{rows:2,maxlength:500,'aria-label':t('Kaynak metninden aynen alıntı','Exact quote from source')});
          const state=h('p',{role:'status'}),relationships=h('div',{class:'v3-runtime-controls'}),confirmation=h('div',{class:'v3-runtime-controls'});
          const selected=()=>rows.find(row=>row.id===choose.value);
          const reset=()=>{const row=selected();if(!row)return;source.value=row.title+'\n'+row.text;kind.value=row.contentKind||'unknown';stance.value=row.stance||'unknown';quote.value=row.editorial?.quote||'';relationships.replaceChildren(...row.links.map(link=>button(t('İlişkiyi kaldır','Remove relationship')+' · '+link.title,async()=>{await feed({action:'unlink',entryId:row.id,catalogId:link.catalogId});if(current())await draw();})));state.textContent=t('Sınıflandırma durumu','Classification status')+' · '+(row.editorialState==='current'?t('Güncel kullanıcı işareti','Current user classification'):row.editorialState==='stale'?t('Kaynak değişti, yeniden inceleyin','Source changed, review again'):t('Kullanıcı işareti yok','No user classification'));confirmation.replaceChildren();};
          choose.addEventListener('change',reset);
          review.append(h('div',{class:'v3-runtime-controls'},h('label',null,t('Kaynak yazı','Source article'),choose),h('label',null,t('İlişkili yapım','Related title'),film),button(t('Film ilişkisini önizle','Preview film relationship'),async()=>{
            const row=selected();if(!row||!film.value)return;
            const result=await feed({action:'link-preview',entryId:row.id,catalogId:film.value});if(!current())return;
            confirmation.replaceChildren(h('p',{text:result.source.title+' → '+result.catalog.title}),button(t('İlişkiyi onayla','Confirm relationship'),async()=>{await feed({action:'link-confirm',token:result.token});if(current())await draw();}));
          })),relationships,h('label',null,t('Kayıtlı kaynak metni','Saved source text'),source),h('p',{text:t('Tür ve görüş kaynak metninden bir alıntıyla kullanıcı tarafından işaretlenir. Ödül haberi kazanma kanıtı sayılmaz.','Type and opinion are user classifications supported by a source quote. Award news does not establish a win.')}),h('div',{class:'v3-runtime-controls'},h('label',null,t('Yazı türü','Article type'),kind),h('label',null,t('Yazının görüşü','Article opinion'),stance)),h('label',null,t('Kaynak metninden aynen alıntı','Exact quote from source'),quote),state,button(t('Sınıflandırmayı önizle','Preview classification'),async()=>{
            const row=selected();if(!row)return;
            const result=await feed({action:'editorial-preview',entryId:row.id,contentKind:kind.value,stance:stance.value,quote:quote.value});if(!current())return;
            confirmation.replaceChildren(h('p',{text:kindLabels[result.record.contentKind]+' · '+stanceLabels[result.record.stance]}),h('blockquote',{text:result.source.quote}),button(t('Sınıflandırmayı onayla','Confirm classification'),async()=>{await feed({action:'editorial-confirm',token:result.token});if(current())await draw();}));
          }),confirmation);
          if(rows.length)surface.append(review);reset();
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
              if(editing)return;
              const out=AssistantArtifactExport.exportArtifact({doc,format,expectedRevision:doc.revision,locale:locale()});
              if(out.ok&&current())await hub({action:'v3-export',format,content:(out.bom?'\uFEFF':'')+out.content});
            }catch(error){report(error);}};
            let editing=false,writing=false;
            const mutate=async input=>{
              if(editing||writing)return;
              writing=true;
              try{await artifacts(input);}finally{writing=false;}
              if(current()&&request===view)await show(id);
            };
            options.handlers.onSpoiler=async(rowId,colId,value)=>{try{
              await mutate({action:'spoiler',id,expectedRevision:doc.revision,key:'cell:'+rowId+':'+colId,value});
            }catch(error){report(error);}};
            options.handlers.onEdit=(rowId,colId)=>{
              if(editing||writing||!current())return;
              const cell=body.cells.find(row=>row.rowId===rowId&&row.colId===colId);
              if(!cell||cell.spoiler==='closed')return;
              editing=true;controls.inert=true;revisions.inert=true;
              const input=h('textarea',{maxlength:2000,rows:3,value:cell.value,'aria-label':t('Hücre düzeltmesi','Cell correction')});
              const editor=h('section',{class:'v3-runtime-controls'},input);
              const finish=()=>{editing=false;controls.inert=false;revisions.inert=false;surface.querySelectorAll('[inert]').forEach(node=>node.removeAttribute('inert'));editor.remove();};
              editor.append(button(t('Düzeltmeyi kaydet','Save correction'),async()=>{
                await artifacts({action:'edit',id,expectedRevision:doc.revision,key:'cell:'+rowId+':'+colId,value:input.value});
                finish();if(current()&&request===view)await show(id);
              }),button(t('Düzenlemeyi iptal et','Cancel editing'),finish));
              surface.querySelector('.v3-foot')?.setAttribute('inert','');surface.append(editor);input.focus();
            };
            V3SurfacesUI.renderMatrix(surface,doc,body,options);
            const update=button(t('Arşivden güncelle','Update from library'),async()=>{
              await mutate({action:'save',id,expectedRevision:doc.revision,ids:body.columns.map(col=>col.id),locale:locale()});
            });
            revisions.replaceChildren(update);
            if(doc.versions.length){
              const version=h('select',{'aria-label':t('Önceki sürüm','Previous revision')},doc.versions.slice().reverse().map(row=>
                h('option',{value:row.revision,text:t('Sürüm','Revision')+' '+row.revision})));
              revisions.append(version,button(t('Sürümü geri yükle','Restore revision'),async()=>{
                await mutate({action:'restore',id,expectedRevision:doc.revision,revision:Number(version.value)});
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
