(() => {
  'use strict';
  const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  async function request(action,id,values={}){const result=await window.api.mediaCatalog({action,id,...values});if(!result?.ok)throw Error(result?.error||t('TMDB information could not be loaded.','TMDB bilgileri alınamadı.'));return result;}
  function button(label,fn,cls='mh-action'){const n=el('button',cls,label);n.type='button';n.onclick=()=>void fn();return n;}
  function preview(row,owner){
    const popup=el('dialog','mx-dialog media-surface mtd-related-preview');popup.id='relatedTitlePreview';popup.dataset.uiUntranslated='';
    const heading=el('h2','',row.title+(row.year?' · '+row.year:''));heading.id='relatedTitleHeading';popup.setAttribute('aria-labelledby',heading.id);
    const status=el('p','mtd-extra-status');status.setAttribute('role','status');
    const actions=el('div','mtd-actions');
    const add=button(t('Add to library & open','Kütüphaneye ekle ve aç'),async()=>{
      if(add.disabled)return;add.disabled=true;
      try{
        const result=await request('metadata-add-recommendation',null,{kind:row.kind,providerId:row.id});
        // Enrich only the explicitly chosen title; do not restart the whole library sync.
        if(!result.item.hasPoster)await request('metadata-complete-missing',result.item.id).catch(()=>null);
        document.dispatchEvent(new Event('media-library-changed'));
        if(popup.open&&owner.isConnected){popup.close();await window.MediaTitleUI.open(result.item.id);}
      }catch(error){if(popup.open)status.textContent=error.message;}
      finally{add.disabled=false;}
    });
    const kind=row.kind==='series'?'tv':'movie';actions.append(add,button(t('View on TMDB ↗','TMDB’de incele ↗'),async()=>{try{await window.api.openExternal('https://www.themoviedb.org/'+kind+'/'+row.id);}catch(error){status.textContent=error.message;}}),button(t('Close','Kapat'),()=>popup.close()));
    popup.append(heading,el('p','mtd-synopsis',row.synopsis||t('TMDB has no summary in the selected information language.','TMDB’de seçili bilgi dilinde konu özeti yok.')),el('small','mtd-extra-copy',t('TMDB recommendation. This is not a personal taste prediction. Adding a title does not download a video.','TMDB önerisi; kişisel zevk tahmini değildir. Yapımı eklemek video indirmez.')),status,actions);
    const origin=document.activeElement;popup.addEventListener('close',()=>{popup.remove();if(origin?.isConnected)origin.focus();void syncBrowserOcclusion();},{once:true});document.body.append(popup);popup.showModal();void syncBrowserOcclusion();
    window.MediaExperience?.setContext(popup,{id:row.tmdbId,type:'discovery-title',title:row.title,synopsis:row.synopsis});
  }
  function mount(main,aside,item){
    if(!/^(movie|tv):[1-9]\d*$/.test(item.tmdbId||''))return;
    const watch=el('section','mtd-watch'),watchHeader=el('div','mtd-extra-heading');watch.append(watchHeader);watchHeader.append(el('h2','',t('Where to watch','Nerede izlenir?')));
    const country=el('select');country.setAttribute('aria-label',t('Watch country','İzleme ülkesi'));
    const master=document.getElementById('tmdbWatchRegion'),names=new Intl.DisplayNames([window.UiLocale?.get?.()==='tr'?'tr':'en'],{type:'region'});
    for(const code of master?[...master.options].map(n=>n.value):['TR','US','GB','DE','FR','ES','IT','NL','CA','AU','JP','KR','IN','BR']){const option=el('option','',names.of(code));option.value=code;country.append(option);}country.value=master?.value||'TR';watchHeader.append(country);
    const availability=el('div','mtd-watch-content');watch.append(availability,el('small','mtd-extra-copy','JustWatch · TMDB'));aside.append(watch);
    let watchSequence=0;
    async function loadWatch(refresh=false){
      const sequence=++watchSequence,region=country.value;availability.replaceChildren(el('p','mtd-extra-copy',t('Checking availability…','İzleme bilgileri alınıyor…')));availability.setAttribute('aria-busy','true');
      try{
        const result=await request('metadata-watch',item.id,{region,refresh:refresh===true});if(sequence!==watchSequence||!availability.isConnected)return;
        availability.replaceChildren();let count=0;
        const labels={flatrate:t('Subscription','Abonelik'),free:t('Free','Ücretsiz'),ads:t('With ads','Reklamlı'),rent:t('Rent','Kiralama'),buy:t('Buy','Satın alma')};
        for(const [mode,providers] of Object.entries(result.watch.groups))if(providers.length){count+=providers.length;const group=el('div','mtd-provider-group');group.append(el('h3','',labels[mode]||mode));const list=el('div','mtd-provider-list');for(const p of providers)list.append(el('span','',p.name));group.append(list);availability.append(group);}
        if(!count)availability.append(el('p','mtd-extra-copy',t('No availability information for this country. Results from other countries are not substituted.','Bu ülke için izleme bilgisi bulunamadı. Başka ülkelerin sonuçları gösterilmiyor.')));
        const checked=new Date(result.watch.checkedAt);availability.append(el('p','mtd-extra-copy',(Number.isFinite(result.watch.checkedAt)?t('Checked: ','Kontrol: ')+new Intl.DateTimeFormat(window.UiLocale?.get?.()==='tr'?'tr':'en',{dateStyle:'medium',timeStyle:'short'}).format(checked):t('Check date unavailable','Kontrol tarihi yok'))+(result.watch.cacheHit?t(' · cached (up to 10 minutes)',' · önbellek (en fazla 10 dakika)'):'')),el('p','mtd-extra-copy',t('Availability can change. Prices are not provided; verify terms on the source.','Bulunabilirlik değişebilir. Fiyat bilgisi verilmez; koşulları kaynaktan doğrula.')),button(t('Refresh availability','Bulunabilirliği yenile'),()=>loadWatch(true)));
        availability.append(button(t('Check on TMDB / JustWatch ↗','TMDB / JustWatch’ta kontrol et ↗'),async()=>{try{await window.api.openExternal(result.watch.url);}catch(error){availability.append(el('p','mtd-extra-status',error.message));}}));
      }catch(error){if(sequence===watchSequence&&availability.isConnected)availability.replaceChildren(el('p','mtd-extra-status',error.message),button(t('Retry','Yeniden dene'),loadWatch));}
      finally{if(sequence===watchSequence)availability.setAttribute('aria-busy','false');}
    }
    country.onchange=async()=>{const previous=master?.value;country.disabled=true;++watchSequence;availability.setAttribute('aria-busy','true');availability.replaceChildren(el('p','mtd-extra-copy',t('Changing watch country…','İzleme ülkesi değiştiriliyor…')));try{if(master){master.value=country.value;if(!await saveAppSettings())throw Error(t('The watch country could not be saved.','İzleme ülkesi kaydedilemedi.'));}await loadWatch();}catch(error){if(master)master.value=previous;country.value=previous||'TR';availability.replaceChildren(el('p','mtd-extra-status',error.message));}finally{country.disabled=false;availability.setAttribute('aria-busy','false');}};
    const section=el('section','mtd-related');section.append(el('h2','',t('Similar titles','Benzer yapımlar')),el('p','mtd-extra-copy',t('Recommendations from TMDB, not a prediction based on your personal profile.','TMDB önerileri; kişisel zevk profiline göre tahmin değildir.')));const list=el('div','mtd-related-grid'),message=el('p','mtd-extra-status');message.setAttribute('role','status');section.append(list,message);main.append(section);
    let rows=[],shown=5,nextPage=1,loading=false,loadError=false;
    const more=button(t('Show more','Daha fazla göster'),async()=>{if(rows.length>shown){shown+=5;draw();}else if(nextPage){const before=rows.length;await loadMore();if(rows.length>before)shown+=5;draw();}});section.append(more);
    function draw(){list.replaceChildren();for(const row of rows.slice(0,shown)){const card=button('',()=>preview(row,section),'mtd-related-card');card.append(el('strong','',row.title),el('small','',row.year||'—'),el('span','',row.synopsis.slice(0,150)+(row.synopsis.length>150?'…':'')));list.append(card);}more.hidden=rows.length<=shown&&!nextPage;more.disabled=loading;more.textContent=loadError?t('Retry','Yeniden dene'):t('Show more','Daha fazla göster');}
    async function loadMore(){if(loading||!nextPage)return;loading=true;loadError=false;more.disabled=true;message.textContent=t('Finding similar titles…','Benzer yapımlar aranıyor…');try{const result=await request('metadata-recommendations',item.id,{page:nextPage});if(!section.isConnected)return;const known=new Set(rows.map(r=>r.tmdbId));for(const row of result.rows)if(!known.has(row.tmdbId)){rows.push(row);known.add(row.tmdbId);}nextPage=result.nextPage;message.textContent=rows.length?'':t('No recommendations found.','Öneri bulunamadı.');}catch(error){loadError=true;if(section.isConnected)message.textContent=error.message;}finally{loading=false;if(section.isConnected)draw();}}
    void loadWatch();void loadMore();
  }
  window.TitleDiscoveryUI=Object.freeze({mount});
})();
