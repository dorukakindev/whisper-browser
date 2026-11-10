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
  const buildRoute=(rows,budgetMinutes,breakMinutes)=>WatchItinerary.buildWatchItinerary({
    budgetMinutes,breakMinutes,candidates:rows.map(i=>({itemId:i.id,title:i.title,
      runtimeMinutes:Number(i.runtime)||null,sourceReady:i.hasSource?'unknown':'needs-source',reason:i.reason||''}))});
  function open(initial='bulletin', routeOptions={}) {
    const existing=document.getElementById('whisperV3Dialog');
    if(existing)existing.close();
    const origin=document.activeElement, dialog=h('dialog',{id:'whisperV3Dialog',class:'mtx-dialog media-surface', 'aria-label':names()[initial],data:{uiUntranslated:''}});
    const status=h('p',{role:'status',class:'mtx-status'}), body=h('main',{class:'mtx-body'});
    const posterCache=new Map();
    const loadPoster=(target,id)=>{if(!posterCache.has(id))posterCache.set(id,call(window.api.mediaCatalog,{action:'poster',id}).catch(()=>null));posterCache.get(id).then(result=>{if(!target.isConnected||typeof result?.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(result.image)||result.image.length>=8000000)return;target.replaceChildren(h('img',{src:result.image,alt:''}));target.closest('.ws-film-column')?.style.setProperty('--poster-art',`url("${result.image}")`);});};
    let tab=initial, epoch=0, sampleTimer=0, maintenanceReceipt=null;
    const report=error=>{if(dialog.open)status.textContent=error.message;};
    const button=(label,action,kind='ghost')=>h('button',{type:'button',class:'button pw-btn '+kind,text:label,on:{click:async event=>{const node=event.currentTarget;node.disabled=true;try{await action();}catch(error){report(error);}finally{if(node.isConnected)node.disabled=false;PlayerUiKit.enhanceControls?.(dialog);}}}});
    const nav=h('nav',{class:'mtx-tabs','aria-label':t('Medya araçları','Media tools')});
    for(const [key,label] of Object.entries(names()))nav.append(button(label,()=>draw(key)));
    const close=PlayerUiKit.iconButton?PlayerUiKit.iconButton({icon:'close',label:t('Kapat','Close'),onClick:()=>dialog.close()}):button(t('Kapat','Close'),()=>dialog.close());
    const drawerBackdrop=h('div',{class:'v3-drawer-backdrop',hidden:true});let drawerOrigin=null;
    const closeDrawer=()=>{drawerBackdrop.hidden=true;drawerBackdrop.replaceChildren();body.inert=false;nav.inert=false;dialog.firstElementChild.inert=false;drawerOrigin?.focus();};
    const drawer=(title,content)=>{drawerOrigin=document.activeElement;const panel=h('section',{class:'v3-drawer ws-drawer',role:'dialog','aria-modal':'true','aria-label':title,tabindex:'-1'},h('header',null,h('h2',{text:title}),button(t('Kapat','Close'),closeDrawer)),content);drawerBackdrop.replaceChildren(panel);drawerBackdrop.hidden=false;body.inert=true;nav.inert=true;dialog.firstElementChild.inert=true;PlayerUiKit.enhanceControls?.(panel);panel.focus();return panel;};
    drawerBackdrop.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeDrawer();}if(event.key==='Tab'){const nodes=[...drawerBackdrop.querySelectorAll('button:not(:disabled),input:not([hidden]),textarea,select:not([hidden]),[tabindex="0"]')].filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
    nav.prepend(h('span',{class:'v3-tab-indicator','aria-hidden':'true'}));
    dialog.append(h('header',null,h('div',null,h('span',{class:'v3-eyebrow',text:t('WHISPER · MEDYA ARAÇLARI','WHISPER · MEDIA TOOLS')}),h('h1',{text:t('Medya çalışma alanı','Media workspace')})),close),nav,status,body,drawerBackdrop);
    dialog.addEventListener('close',()=>{epoch++;clearTimeout(sampleTimer);dialog.remove();origin?.focus();void syncBrowserOcclusion();},{once:true});
    document.body.append(dialog);dialog.showModal();PlayerUiKit.bindDialog?.(dialog);void syncBrowserOcclusion();
    async function draw(next=tab) {
      if(!drawerBackdrop.hidden)closeDrawer();
      tab=next;const ticket=++epoch;clearTimeout(sampleTimer);
      const current=()=>dialog.open&&ticket===epoch;
      const setStatus=value=>{if(current())status.textContent=value;};
      const surface=h('section');
      body.replaceChildren(surface);setStatus(t('Yükleniyor…','Loading…'));
      [...nav.querySelectorAll('button')].forEach((node,index)=>node.setAttribute('aria-current',Object.keys(names())[index]===tab?'page':'false'));
      nav.style.setProperty('--active-tab',Object.keys(names()).indexOf(tab));
      const options={locale:locale(),handlers:{},loadPoster};
      try {
        if(tab==='bulletin'){
          const [list,entries,items]=await Promise.all([feed({action:'list'}),feed({action:'entries',limit:100}),catalog()]);
          if(!current())return;
          const enabled=list.feeds.filter(f=>f.enabled);
          const rows=entries.rows.filter(e=>e.spoiler!=='marked'||e.spoilerAllowed).map(e=>({...e,entryId:e.id,publisherId:e.feedId,feedTitle:e.sourceFeed?.title||list.feeds.find(f=>f.id===e.feedId)?.title||e.provenance?.map(p=>p.title).filter(Boolean).join(', ')||t('Kaynak adı bilinmiyor','Source name unknown'),workId:e.links?.find(link=>link.state==='confirmed')?.catalogId}));
          const coverage=enabled.map(f=>({feedId:f.id,title:f.title,lastAttempt:f.lastAttempt,status:!f.lastAttempt?'not-attempted':f.state==='updated'?'ok':f.state==='unchanged'?'not-modified':f.errorKind==='rate-limit'?'rate-limited':f.state==='failed'?'error':'unavailable'}));
          const bulletin=CinemaBulletinModel.buildBulletin({entries:rows,library:items.map(i=>({workId:i.id,title:i.title})),feedResults:coverage,allFeedIds:enabled.map(f=>f.id),readState:Object.fromEntries(rows.map(e=>[e.id,e.read]))});
          const topics=[...bulletin.sections.flatMap(s=>s.topics),...bulletin.unlinked];
          options.handlers.onToggleRead=async id=>{try{
            const topic=topics.find(r=>r.topicId===id);if(!topic||!current())return;
            const ids=[...new Set(topic.stories.flatMap(r=>r.entryIds))];
            await feed({action:'state',entryIds:ids,read:!topic.read});if(current())await draw();
          }catch(error){report(error);}};
          options.handlers.onRetry=async()=>{try{
            const checked=new Set(coverage.filter(r=>['ok','not-modified'].includes(r.status)).map(r=>r.feedId));
            await feed({action:'refresh',feedIds:enabled.map(f=>f.id).filter(id=>!checked.has(id))});
            if(current())await draw();
          }catch(error){report(error);}};
          options.items=items;options.rows=rows;
          options.handlers.onOpenSource=async row=>{try{const url=new URL(row?.url||'');if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error(t('Geçerli bir kaynak adresi yok.','No valid source URL.'));await window.api.openExternal(url.href);}catch(error){report(error);}};
          options.handlers.onRefresh=async()=>{try{await feed({action:'refresh',feedIds:enabled.map(f=>f.id)});if(current())await draw();}catch(error){report(error);}};
          const review=h('section',{class:'v3-editorial'});
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
          const reset=()=>{const row=selected();if(!row)return;source.value=row.title+'\n'+row.text;kind.value=row.contentKind||'unknown';stance.value=row.stance||'unknown';quote.value=row.editorial?.quote||'';if(row.links?.[0]?.catalogId)film.value=row.links[0].catalogId;for(const input of [kind,stance,film])input.dispatchEvent(new Event('change',{bubbles:true}));relationships.replaceChildren(...row.links.map(link=>button(t('İlişkiyi kaldır','Remove relationship')+' · '+link.title,async()=>{await feed({action:'unlink',entryId:row.id,catalogId:link.catalogId});if(current())await draw();})));state.textContent=t('Sınıflandırma durumu','Classification status')+' · '+(row.editorialState==='current'?t('Güncel kullanıcı işareti','Current user classification'):row.editorialState==='stale'?t('Kaynak değişti, yeniden inceleyin','Source changed, review again'):t('Kullanıcı işareti yok','No user classification'));confirmation.replaceChildren();};
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
          options.handlers.onEditArticle=row=>{if(!row)return;choose.value=row.id;choose.dispatchEvent(new Event('change',{bubbles:true}));drawer(t('Yazı ilişkisi, türü ve görüşü','Article relationship, type and opinion'),review);};
          options.handlers.onRead=row=>{if(!row)return;const panel=h('div',null,h('h3',{text:row.title}),h('p',{class:'ws-reading-text',text:row.text}));panel.append(button(t('Yazıyı düzenle','Edit article'),()=>options.handlers.onEditArticle(row)));drawer(row.title,panel);};
          options.caption=t('Son 100 kayıt içinden.','From the latest 100 entries.');
          V3SurfacesUI.renderBulletin(surface,bulletin,options);reset();setStatus('');
          return;
        }
        if(tab==='route'){
          let list,localPlan;
          if(routeOptions.local){const [items,history]=await Promise.all([catalog(),window.api.listWatchLibrary()]);if(!current())return;localPlan=window.MediaToolsModel.eveningPlan(items,history,{minutes:600,breakMinutes:0});list={watchlist:localPlan.candidates.slice(0,100).map(r=>({id:r.key,catalogId:r.itemId,title:r.title+(r.episode?' · '+r.episode:''),runtime:Math.ceil(r.remainingSeconds/60),hasSource:true,reason:(r.durationBasis==='observed-playback'?t('Gözlenen oynatma süresi','Observed playback duration'):t('Katalog süresi','Catalogue duration'))+' · '+t('Kalan dakika yukarı yuvarlandı','Remaining minutes rounded up')}))};}
          else list=routeOptions.watchlist ? {watchlist:routeOptions.watchlist} : await call(window.api.mediaTools,{action:'daily-list'});
          if(!current())return;
          const budget=h('input',{type:'number',min:15,max:600,step:1,value:routeOptions.budget??180,'aria-label':t('Dakika bütçesi','Minutes budget')});
          const range=h('input',{class:'ws-range',type:'range',min:budget.min,max:budget.max,step:1,value:budget.value,'aria-label':t('İzleme süresini ayarla','Adjust watching time')});
          const syncRange=()=>{range.value=budget.value;range.style.setProperty('--range-progress',((Number(range.value)-Number(range.min))/(Number(range.max)-Number(range.min))*100)+'%');};
          options.budgetControl=[h('div',{class:'ws-budget-value'},budget,h('small',{text:t('dakika','minutes')})),range,h('div',{class:'ws-range-labels'},h('span',{text:budget.min+' '+t('dk','min')}),h('span',{text:budget.max+' '+t('dk','min')}))];
          options.presets=h('div',{class:'ws-route-presets',role:'group','aria-label':t('İzleme süresi','Watching time')},[[180,t('Bir akşam','An evening')],[360,t('Hafta sonu','Weekend')],[480,t('Uzun bir gün','A long day')],[null,t('Özel süre','Custom time')]].map(([value,label])=>{const node=button(label,()=>{if(value===null){budget.focus();budget.select();return;}budget.value=value;render();},'ws-preset');node.dataset.budget=value??'custom';node.replaceChildren(h('span',{text:label}),h('small',{text:value===null?t('Siz belirleyin','Choose your time'):value+' '+t('dakika','minutes')}));return node;}));
          options.items=list.watchlist;if(routeOptions.local)options.loadPoster=(target,id)=>loadPoster(target,list.watchlist.find(r=>r.id===id)?.catalogId||id);
          const excluded=new Set();
          let routeVersion=0;
          const breakInput=h('input',{type:'number',min:0,max:120,step:1,value:routeOptions.breakMinutes??10});
          options.budgetControl.push(h('label',null,t('Duraklar arası mola (dk)','Break between titles (min)'),breakInput));
          const choices=h('details',null,h('summary',{text:t('Rotadaki yapımları değiştir','Change route titles')}));
          for(const row of list.watchlist.slice(0,100)){
            const input=h('input',{type:'checkbox',checked:true});
            input.onchange=()=>{if(input.checked)excluded.delete(row.id);else excluded.add(row.id);render();};
            choices.append(h('label',null,input,row.title));
          }
          options.presets=[button(routeOptions.local?t('İzleme listesine dön','Use watchlist titles'):t('Yerel film ve bölümler','Local films & episodes'),()=>open('route',{...routeOptions,local:!routeOptions.local,budget:Number(budget.value),breakMinutes:Number(breakInput.value)})),options.presets,choices,...(localPlan?[h('p',{class:'mtx-muted',text:t('Süresi bilinmeyen giriş dışarıda: ','Unknown durations excluded: ')+localPlan.unknown+(localPlan.partial||localPlan.candidates.length>100?t(' · İlk 100 aday',' · First 100 candidates'):'')+' · '+t('Anlık plan; kaynak değişince yeniden açın.','Planning snapshot; reopen after source changes.')})]:[])];

          const render=()=>{
            const revision=++routeVersion;
            syncRange();
            for(const node of options.presets[1].querySelectorAll('button')){const selected=node.dataset.budget===budget.value||(node.dataset.budget==='custom'&&![180,360,480].includes(Number(budget.value)));node.classList.toggle('is-selected',selected);node.setAttribute('aria-pressed',String(selected));}
            const route=buildRoute(list.watchlist.filter(i=>!excluded.has(i.id)),Number(budget.value),Number(breakInput.value));
            options.handlers.onPreviewApply=()=>{
              if(!route.items.length||revision!==routeVersion)return;
              if(routeOptions.local){drawer(t('Yerel izleme planı','Local viewing plan'),h('section',null,h('ol',null,route.items.map(i=>h('li',{text:i.title+' · '+i.runtimeMinutes+' '+t('dk kaldı','min remaining')}))),h('p',{text:t('Salt okunur plan. Oynatma, kuyruk, durum ve puan değişmez.','Read-only plan. Playback, queue, status and ratings stay unchanged.')})));return;}
              const name=h('input',{maxlength:80,'aria-label':t('Koleksiyon adı','Collection name')});
              const preview=h('section',{class:'v3-runtime-controls'},h('ol',null,route.items.map(i=>h('li',{text:i.title}))),name);
              preview.append(button(t('Üyeliği önizle','Review membership'),async()=>{
                const result=await call(window.api.mediaTools,{action:'film-watch-route-preview',name:name.value,ids:route.items.map(i=>i.itemId),reviewed:route.items.map(i=>({id:i.itemId,title:i.title,runtime:i.runtimeMinutes,hasSource:i.sourceReady!=='needs-source'}))});
                if(!current()||!preview.isConnected||revision!==routeVersion)return;
                preview.replaceChildren(h('strong',{text:result.name}),h('ol',null,result.items.map(i=>h('li',{text:i.title}))),
                  button(t('Koleksiyona ekle','Add to collection'),async()=>{
                    if(!current()||!preview.isConnected||revision!==routeVersion)return;
                    const saved=await call(window.api.mediaTools,{action:'film-watch-route-apply',token:result.token});
                    if(!current())return;
                    preview.replaceChildren(button(t('Rotayı geri al','Undo itinerary'),async()=>{
                      await call(window.api.mediaTools,{action:'film-watch-route-undo',token:saved.undoToken});
                      preview.remove();setStatus(t('Rota geri alındı.','Itinerary undone.'));
                    }));
                    setStatus(t('Eklenen yapım: ','Titles added: ')+saved.added.length);
                  }));
              }));
              drawer(t('Rotayı önizle','Preview route'),preview);
            };
            V3SurfacesUI.renderItinerary(surface,route,{...options,titles:Object.fromEntries(list.watchlist.map(i=>[i.id,i.title]))});
          };
          range.addEventListener('input',()=>{budget.value=range.value;syncRange();});range.addEventListener('change',render);
          budget.addEventListener('change',()=>{if(budget.reportValidity())render();});breakInput.addEventListener('change',()=>{if(breakInput.reportValidity())render();});render();
        }
        if(tab==='matrix'){
          const artifacts=async input=>{const result=await window.api.assistantArtifacts(input);if(result?.ok)return result;const messages={'revision-conflict':t('Karşılaştırma değişti. Kayıtlı sürümü yeniden açın.','The comparison changed. Reopen the saved version.'),'source-missing':t('Yapımlardan biri artık arşivde yok.','One of the titles is no longer in the library.'),'invalid-number':t('Geçerli bir tam sayı girin. Yıl 1888–2100 aralığında olmalıdır.','Enter a valid integer. Year must be between 1888 and 2100.'),'archive-full':t('Kayıtlı karşılaştırma sınırına ulaşıldı.','The saved comparison limit was reached.')};throw Error(messages[result?.code]||t('Karşılaştırma işlemi tamamlanamadı.','The comparison operation failed.'));};
          let [items,saved]=await Promise.all([catalog(),artifacts({action:'list'})]);if(!current())return;
          let view=0,writing=false;
          const fieldValue=(item,key)=>key==='kind'?(item?.kind==='series'?t('Dizi','Series'):'Film'):Array.isArray(item?.[key])?item[key].join(', '):String(item?.[key]??'');
          const select=(label,value,onChange)=>PlayerUiKit.select({label,value,searchable:true,options:items.map(i=>({value:i.id,label:i.title,description:[i.year,(i.directors||[]).join(', ')].filter(Boolean).join(' · ')})),onChange});
          const show=async (id,chosenIds=null)=>{
            const request=++view;let doc,model;
            if(id){const got=await artifacts({action:'get',id});doc=got.doc;model=got.body;}else{
              const chosen=chosenIds?chosenIds.map(key=>items.find(i=>i.id===key)):items.slice(0,2);doc={revision:0,versions:[]};model={title:t('Karşılaştırma','Comparison'),columns:chosen.map(i=>({id:i.id,label:i.title})),rows:[['year',t('Yıl','Year')],['runtime',t('Süre','Runtime')],['kind',t('Tür','Type')],['directors',t('Yönetmen','Director')],['productionCountries',t('Ülke','Country')],['originalLanguage',t('Dil','Language')]].map(([id,label])=>({id,label})),cells:[]};model.cells=model.rows.flatMap(row=>chosen.map(item=>({rowId:row.id,colId:item.id,value:fieldValue(item,row.id),status:fieldValue(item,row.id)?'known':'unknown',claims:[],spoiler:'open'})));
            }
            if(!current()||request!==view)return;setStatus('');
            const selected=model.columns.map(c=>c.id);
            const mutate=async input=>{if(writing)return;writing=true;try{await artifacts(input);}finally{writing=false;}closeDrawer();if(current()&&request===view)await show(id);};
            options.items=items;
            options.columnPickers=selected.map((value,index)=>select(index?t('İkinci yapım','Second title'):t('Birinci yapım','First title'),value,next=>{if(selected[1-index]===next){options.columnPickers[index].value=value;setStatus(t('İki farklı yapım seçin.','Select two different titles.'));return;}selected[index]=next;void show(null,selected).catch(report);}));
            const save=button(t('Karşılaştır ve kaydet','Compare and save'),async()=>{if(selected[0]===selected[1])throw Error(t('İki farklı yapım seçin.','Select two different titles.'));const result=await artifacts({action:'save',ids:selected,locale:locale()});saved=await artifacts({action:'list'});if(current())await show(result.doc.id);},'primary');
            const openSaved=button(t('Kaydı aç','Open saved'),()=>{const list=h('div',null,saved.artifacts.length?saved.artifacts.map(entry=>button(entry.columns.map(c=>c.label).join(' · '),async()=>{closeDrawer();await show(entry.artifactId);})):h('p',{text:t('Henüz kayıtlı karşılaştırma yok.','No saved comparisons yet.')}));drawer(t('Kayıtlı karşılaştırmalar','Saved comparisons'),list);});
            const refresh=button(t('Arşivden yenile','Refresh from library'),async()=>{
              const fresh=await catalog();if(!current()||request!==view)return;const accepted=new Set(),box=h('div'),rows=h('div');
              const apply=button(t('Seçili alanları güncelle','Refresh selected fields'),async()=>{await mutate({action:'save',id,ids:model.columns.map(c=>c.id),locale:locale(),expectedRevision:doc.revision,refreshKeys:[...accepted]});items=fresh;},'primary');apply.disabled=true;
              for(const row of model.rows)for(const col of model.columns){const cell=model.cells.find(c=>c.rowId===row.id&&c.colId===col.id),key='cell:'+row.id+':'+col.id,next=fieldValue(fresh.find(i=>i.id===col.id),row.id);if(cell?.spoiler==='closed')continue;const choose=button(t('Arşiv değerini seç','Choose library value'),()=>{if(accepted.has(key))accepted.delete(key);else accepted.add(key);choose.setAttribute('aria-pressed',String(accepted.has(key)));choose.textContent=accepted.has(key)?t('Arşiv değeri seçildi','Library value selected'):t('Mevcut değeri koru','Keep current value');apply.disabled=accepted.size===0;});choose.setAttribute('aria-pressed','false');rows.append(h('div',{class:'ws-choice-row'},h('span',null,h('strong',{text:col.label+' · '+row.label}),h('small',{text:t('Mevcut: ','Current: ')+(cell?.value||t('Bilinmiyor','Unknown'))+(cell?.userEdited?' · '+t('elle düzenlendi','manual edit'):'')}),h('small',{text:t('Arşiv: ','Library: ')+(next||t('Bilinmiyor','Unknown'))})),choose));}
              box.append(h('p',{text:t('Başlangıçta hiçbir alan seçili değildir. Yalnız açıkça seçtiğiniz alanlar değişir; seçilmemiş ve gizli alanlar korunur.','No fields are selected initially. Only explicitly chosen fields change; unselected and hidden fields are preserved.')}),rows,apply);drawer(t('Alanları karşılaştır ve yenile','Compare and refresh fields'),box);
            });refresh.disabled=!id;
            const versions=button(t('Sürümler','Versions'),()=>drawer(t('Önceki sürümler','Previous versions'),h('div',null,doc.versions.length?doc.versions.slice().reverse().map(v=>button(t('Sürüm ','Revision ')+v.revision+' · '+t('Geri yükle','Restore'),()=>mutate({action:'restore',id,expectedRevision:doc.revision,revision:v.revision}))):h('p',{text:t('Önceki sürüm yok.','No previous revisions.')}))));versions.disabled=!id;
            for(const [node,name,label] of [[refresh,'refresh',t('Arşivden bilgileri yenile','Refresh details from library')],[versions,'history',t('Sürümleri görüntüle','View versions')]]){node.classList.add('ws-toolbar-command');node.setAttribute('aria-label',label);node.title=label;node.replaceChildren(PlayerUiKit.icon(name));}
            const exportMenu=PlayerUiKit.menuButton({label:t('Dışa aktar','Export'),icon:'list',items:['csv','json','markdown','html'].map(format=>({label:format.toUpperCase(),onSelect:async()=>{try{const out=AssistantArtifactExport.exportArtifact({doc,format,expectedRevision:doc.revision,locale:locale()});if(out.ok&&current())await hub({action:'v3-export',format,content:(out.bom?'\uFEFF':'')+out.content});}catch(error){report(error);}}}))});if(!id)exportMenu.inert=true;
            const exportTrigger=exportMenu.querySelector('.mk-picker-trigger');exportTrigger.classList.add('ws-toolbar-command');exportTrigger.title=t('Dışa aktar','Export');exportTrigger.replaceChildren(PlayerUiKit.icon('upload'));exportTrigger.disabled=!id;
            options.toolbar=h('div',{class:'ws-toolbar'},h('div',{class:'ws-toolbar-group'},save,openSaved),h('div',{class:'ws-toolbar-group'},h('span',{class:'ws-revision',title:id?t('Sürüm: bu kayıtlı karşılaştırmanın düzenleme sırası.','Revision: the edit sequence of this saved comparison.'):t('Henüz kaydedilmedi.','Not saved yet.')},h('span',{text:t('Revizyon','Revision')}),h('b',{text:doc.revision||'—'})),refresh,versions,exportMenu));
            options.handlers.onSource=(rowId,colId)=>{const cell=model.cells.find(c=>c.rowId===rowId&&c.colId===colId);if(!cell||cell.spoiler==='closed')return;drawer(t('Alan kaynağı','Field provenance'),h('div',null,h('h3',{text:model.columns.find(c=>c.id===colId).label+' · '+model.rows.find(r=>r.id===rowId).label}),h('p',{text:cell.userEdited?t('Elle düzenlenen değer korunuyor. Özgün kayıtlı kanıt aşağıdadır.','Manual override is preserved. Original saved evidence appears below.'):t('Bu kanıt kayıtlı katalog alanıdır; canlı sağlayıcı kontrolü değildir.','This evidence is the saved catalog field; it is not a live provider check.')}),cell.claims.length?cell.claims.map(claim=>h('blockquote',{text:claim.sourceId+' · '+(claim.quote||'')})):h('p',{text:t('Kayıtlı kaynak kanıtı yok.','No saved source evidence.')})));};
            options.handlers.onSpoiler=async(rowId,colId,value)=>{try{if(!id){const created=await artifacts({action:'save',ids:model.columns.map(c=>c.id),locale:locale()});await artifacts({action:'spoiler',id:created.doc.id,expectedRevision:created.doc.revision,key:'cell:'+rowId+':'+colId,value});saved=await artifacts({action:'list'});if(current())await show(created.doc.id);return;}await mutate({action:'spoiler',id,expectedRevision:doc.revision,key:'cell:'+rowId+':'+colId,value});}catch(error){report(error);}};
            options.handlers.onEdit=(rowId,colId)=>{
              if(writing)return;const cell=model.cells.find(c=>c.rowId===rowId&&c.colId===colId);if(!cell||cell.spoiler==='closed')return;const numeric=['year','runtime'].includes(rowId),input=h(numeric?'input':'textarea',{type:numeric?'number':undefined,min:rowId==='year'?1888:1,max:rowId==='year'?2100:10000,step:1,maxlength:2000,rows:3,value:cell.value,'aria-label':t('Hücre düzeltmesi','Cell correction')});
              const error=h('p',{role:'alert',class:'ws-error-text'});const editor=h('div',null,h('label',null,model.rows.find(r=>r.id===rowId).label,input),error,button(t('Düzeltmeyi kaydet','Save correction'),async()=>{if(numeric&&input.value!==''&&(!/^\d+$/.test(input.value)||!input.reportValidity())){error.textContent=t('Geçerli bir tam sayı girin.','Enter a valid integer.');return;}if(!id){const created=await artifacts({action:'save',ids:model.columns.map(c=>c.id),locale:locale()});await artifacts({action:'edit',id:created.doc.id,expectedRevision:created.doc.revision,key:'cell:'+rowId+':'+colId,value:input.value});saved=await artifacts({action:'list'});closeDrawer();if(current())await show(created.doc.id);return;}await mutate({action:'edit',id,expectedRevision:doc.revision,key:'cell:'+rowId+':'+colId,value:input.value});},'primary'),button(t('Vazgeç','Cancel'),closeDrawer));drawer(t('Hücreyi düzenle','Edit cell'),editor);input.focus();
            };
            V3SurfacesUI.renderMatrix(surface,doc,model,options);
          };
          if(items.length<2&&!saved.artifacts.length){surface.append(h('div',{class:'ws-state'},h('h2',{text:t('Karşılaştırmaya iki yapım ekleyin','Add two titles to compare')}),h('p',{text:t('Kütüphanenize kaydettiğiniz yapımlar burada seçilebilir.','Titles saved in your library can be selected here.')})));setStatus('');return;}
          await show(saved.artifacts[0]?.artifactId);return;
        }
        if(tab==='maintenance'){
          const [result,list]=await Promise.all([hub({action:'v3-maintenance'}),hub({action:'folders'})]);if(!current())return;
          options.handlers.onAddFolder=async()=>{try{await hub({action:'folder-add'});if(current())await draw();}catch(error){report(error);}};
          options.handlers.onReviewFolder=async folder=>{try{
            const review=await hub({action:'relink-preview',folderId:folder.id});if(!current())return;
            const selected=new Set(),box=h('div',null,h('p',{text:t('Kapsam: katalogdaki kayıp yerel kaynaklar, bu aday kökteki dosya adlarıyla eşleştirilir. Başka köklerdeki kayıtlar da eşleşebilir. Yalnız seçilen bağlantılar uygulanır.','Scope: missing local sources across the catalog are matched by filename inside this candidate root. Records from other roots may also match. Only selected links are applied.')}),h('p',{text:folder.path}));
            const apply=button(t('Seçili bağlantıları uygula','Apply selected links'),async()=>{const applied=await hub({action:'relink-apply',token:review.token,selectedIndices:[...selected]});if(!current())return;maintenanceReceipt={undoToken:applied.undoToken,count:applied.count,warning:applied.warning};closeDrawer();await draw();},'primary');apply.disabled=true;
            for(const [index,patch]of review.patches.entries()){const choice=button(t('Seç','Select'),()=>{if(selected.has(index))selected.delete(index);else selected.add(index);choice.setAttribute('aria-pressed',String(selected.has(index)));choice.textContent=selected.has(index)?t('Seçildi','Selected'):t('Seç','Select');apply.disabled=selected.size===0;});choice.setAttribute('aria-pressed','false');box.append(h('div',{class:'ws-choice-row'},h('span',null,h('strong',{text:patch.title}),h('small',{text:patch.old}),h('small',{text:'→ '+patch.next})),choice));}
            if(review.patches.length)box.append(apply);
            else box.append(h('p',{text:t('Tekil eşleşme bulunamadı.','No unique match found.')}));
            drawer(t('Yeniden bağlamayı incele','Review relinking'),box);
          }catch(error){report(error);}};
          let receipt=null;if(maintenanceReceipt){const saved=maintenanceReceipt;receipt=h('div',{class:'ws-notice',role:'status'},h('span',{text:t('Güncellenen bağlantı: ','Updated links: ')+saved.count+(saved.warning?' · '+saved.warning:'')}),button(t('Bağlantıları geri al','Undo relinking'),async()=>{await hub({action:'relink-undo',token:saved.undoToken});maintenanceReceipt=null;if(current())await draw();}));}
          V3SurfacesUI.renderMaintenance(surface,result.preview,{...options,titles:result.titles,folders:list.folders.filter(f=>f.enabled),rootChecks:result.rootChecks,untrackedSources:result.untrackedSources,receipt});
          if(result.partial)surface.prepend(h('p',{role:'status',text:t('İlk 1.000 yapım ve 1.000 kaynak denetlendi.','Checked up to 1,000 titles and 1,000 sources.')}));
        }
        if(tab==='health'){
          const samples=[];let measuring=false;const video=document.getElementById('playerVideo');const key=player.mediaKey,generation=player.generation;
          const measure=async()=>{
            if(!current()||measuring)return;
            clearTimeout(sampleTimer);measuring=true;
            try {
            if(!current())return;
            if(key!==player.mediaKey||generation!==player.generation){void draw();return;}
            const native=await window.api.nativePlayer({action:'diagnostics',key,generation}).catch(()=>null);
            if(!current())return;
            if(key!==player.mediaKey||generation!==player.generation){void draw();return;}
            const props=native?.ok?native.props:{'frame-drop-count':video?.getVideoPlaybackQuality?.().droppedVideoFrames,'paused-for-cache':!!video?.currentSrc&&!video.paused&&video.readyState<3};
            if(native?.ok||video?.currentSrc)samples.push({t:Date.now(),props});
            if(samples.length>8)samples.shift();
            V3SurfacesUI.renderHealth(surface,NativePlayerDiagnostics.buildPlayerHealthReceipt({samples,now:Date.now(),requestedHwdec:null}),{...options,bufferingKnown:samples.some(s=>typeof s.props?.['paused-for-cache']==='boolean')});
            } finally {measuring=false;if(current())sampleTimer=setTimeout(()=>{void measure().catch(report);},1000);}
          };
          options.handlers.onRefresh=()=>measure().catch(report);
          void measure().catch(report);
        }
        PlayerUiKit.enhanceControls?.(dialog);setStatus('');
      }catch(error){if(current())report(error);}
    }
    void draw();
  }
  window.WhisperV3=Object.freeze({open,buildRoute});
})();
