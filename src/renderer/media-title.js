(() => {
  'use strict';
  const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;};
  const safe=value=>typeof value==='string'&&value.length<8e6&&/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value);
  let dialog,selected,opener,generation=0,item,storyJob,personalView,copyChoice,returnLabel=null,sessionOptions={};
  const originalStories=new Set();
  let activePage=null;const pagePositions=new Map();
  // Sayfa kapanınca odak: önce çağıranın verdiği hedef (kart yeniden çizilmiş olabilir), yoksa açan öğe.
  // Kullanıcı bu arada başka bir kontrole geçtiyse odağı geri çekmez.
  function restoreFocus(page,origin,returnFocus,host){
    const active=document.activeElement;
    if(active&&active!==document.body&&active.isConnected&&!page.contains(active))return;
    let target=null;try{target=returnFocus?.()||null;}catch{target=null;}
    const node=target?.isConnected?target:origin?.isConnected?origin:null;
    if(!node)return;
    node.focus({preventScroll:true});
    if(returnFocus&&host){const box=node.getBoundingClientRect(),area=host.getBoundingClientRect();if(box.bottom<area.top||box.top>area.bottom)node.scrollIntoView({block:'center'});}
  }
  function createPage(className,{key,returnFocus}={}){
    activePage?.close();
    const host=document.getElementById('mediaHome'),origin=document.activeElement,scroll=host.scrollTop;
    const page=el('section',className+' media-title-page');page.tabIndex=-1;page.open=true;
    page.restorePosition=()=>{if(key&&pagePositions.has(key))requestAnimationFrame(()=>{if(page.open&&activePage===page)host.scrollTop=pagePositions.get(key);});};
    page.close=()=>{if(!page.open)return;if(key){pagePositions.set(key,host.scrollTop);while(pagePositions.size>100)pagePositions.delete(pagePositions.keys().next().value);}page.open=false;page.dispatchEvent(new Event('close'));page.remove();host.classList.remove('has-title-page');host.removeEventListener('click',navigate,true);document.removeEventListener('keydown',escape);if(activePage===page)activePage=null;host.scrollTop=scroll;restoreFocus(page,origin,returnFocus,host);};
    const navigate=event=>{if(event.target.closest('.mh-header [data-home-page],.mh-header [data-home-mode]'))page.close();};
    const escape=event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')){event.preventDefault();page.close();}};
    host.addEventListener('click',navigate,true);document.addEventListener('keydown',escape);host.classList.add('has-title-page');host.append(page);host.scrollTop=0;activePage=page;return page;
  }

  async function request(action,options={}){const result=await window.api.mediaCatalog({action,id:selected,...options});if(result?.canceled)return result;if(!result?.ok)throw Error(result?.error||t('Could not complete this action.','İşlem tamamlanamadı.'));return result;}
  function button(label,run,primary=false){const node=el('button','mh-action'+(primary?' mh-primary':''),label);node.type='button';node.onclick=async()=>{if(node.disabled)return;node.disabled=true;const current=dialog;try{await run();}catch(error){if(current===dialog&&dialog?.open){const status=dialog.querySelector('[role=status]');status.textContent=error.message;status.classList.add('mtd-error');}}finally{node.disabled=false;}};return node;}
  function cancelStory(owner){const job=storyJob;if(!job||job.owner!==owner)return;storyJob=null;void window.api.mediaCatalog({action:'synopsis-stop',id:job.id,token:job.token}).catch(()=>{});}
  function close(){cancelStory(dialog);dialog?.close();}
  function story(main){
    const section=el('section','mtd-story'),heading=el('div','mtd-story-heading');heading.append(el('h2','',t('Story','Konu')));
    const translated=!!item.synopsisTr&&!originalStories.has(item.id),running=storyJob?.id===item.id&&storyJob.owner===dialog;
    section.setAttribute('aria-busy',String(!!running));
    if(item.synopsis){
      if(running){const pending=el('span','mtd-story-state',t('Translating…','Çevriliyor…'));pending.setAttribute('role','status');heading.append(pending,button(t('Stop','Durdur'),()=>{cancelStory(dialog);draw(++generation);}));}
      else if(item.synopsisTr){const toggle=button(translated?t('Show original','Özgününü göster'):t('Show Turkish','Türkçesini göster'),()=>{if(translated)originalStories.add(item.id);else originalStories.delete(item.id);draw(++generation);});toggle.dataset.titleAction='story';toggle.dataset.storyToggle='';heading.append(toggle);}
      else{const translate=button(t('Translate to Turkish','Türkçeye çevir'),async()=>{
        const job={id:item.id,token:crypto.randomUUID(),owner:dialog};storyJob=job;draw(++generation);
        try{const result=await request('synopsis-translate',{id:job.id,token:job.token});if(result.canceled)return;if(dialog!==job.owner||!dialog?.open||selected!==job.id||storyJob!==job)return;item=result.item;originalStories.delete(job.id);}
        finally{if(storyJob===job){storyJob=null;if(dialog===job.owner&&dialog?.open)draw(++generation);}}
      });translate.dataset.titleAction='story';translate.dataset.storyTranslate='';heading.append(translate);}
    }
    section.append(heading,el('p','mtd-synopsis',translated?item.synopsisTr:item.synopsis||t('The summary will appear here when TMDB matching finishes.','TMDB eşleştirmesi tamamlandığında konu özeti burada görünecek.')));
    if(translated)section.append(el('small','mtd-story-state',t('Turkish · AI translation','Türkçe · AI çevirisi')));
    main.append(section);
  }
  function management(metadata=false){const id=selected;close();const run=metadata?window.MediaCatalogUI.openMetadata(id):window.MediaCatalogUI.open({id}),reopenOptions=sessionOptions;void Promise.resolve(run).then(()=>{document.getElementById('mediaCatalogDialog')?.addEventListener('close',()=>void open(id,reopenOptions),{once:true});});}
  async function play(episodeId,voice=false,editionId){
    const current=dialog,id=selected;const result=await request('play',{episodeId,...(editionId===undefined?{}:{editionId})});
    if(current!==dialog||!current?.open||selected!==id)return;
    if(!result.watchItem)throw Error(t('Add a video file or link first.','Önce video dosyası veya bağlantısı ekle.'));
    close();await window.openMediaCatalogPlayback(result.watchItem);if(voice)await window.MediaExperience?.openVoice();
  }
  async function reload({refreshPersonalStatus=false}={}){const id=selected,version=++generation;const result=await window.api.mediaCatalog({action:'list'});if(version!==generation||!dialog?.open)return;
    if(result?.canceled)return result;if(!result?.ok)throw Error(result?.error||t('Could not load the title.','Yapım yüklenemedi.'));
    const current=result.items.find(row=>row.id===id);if(!current){close();return;}item=current;draw(version,refreshPersonalStatus);
  }
  function image(action,target,version,options={}){void request(action,options).then(result=>{if(version!==generation||!target.isConnected||!safe(result.image))return;const img=el('img');img.src=result.image;img.alt='';target.replaceChildren(img);}).catch(()=>{});}
  function draw(version,refreshPersonalStatus=false){
    const scroll=document.getElementById('mediaHome').scrollTop;const focused=dialog.contains(document.activeElement)?document.activeElement?.dataset.titleAction:null;
    const form=dialog.querySelector('.mtd-personal');const draft=form?.dataset.titleId===item.id?{status:refreshPersonalStatus?undefined:form.querySelector('select').value,rating:form.querySelector('input').value}:null;
    personalView?.dispose();personalView=null;
    dialog.replaceChildren();const header=el('header','mtd-header');const back=button(returnLabel?.()||(document.querySelector('.mhs-dialog[open]')?t('← Back to results','← Sonuçlara dön'):t('← Back to library','← Kütüphaneye dön')),close);back.dataset.titleAction='back';
    const edit=button(t('Manage title','Yapımı yönet'),()=>management());header.append(back,edit);dialog.append(header);
    const hero=el('section','mtd-hero'),backdrop=el('div','mtd-backdrop');backdrop.setAttribute('aria-hidden','true');hero.append(backdrop);
    if(item.kind!=='film'&&item.backdrop)image('backdrop',backdrop,version);
    const content=el('div','mtd-hero-content'),poster=el('div','mtd-poster');poster.dataset.artExpected=String(!!item.hasPoster);if(item.hasPoster)image('poster',poster,version,{large:true});else poster.append(el('span','',item.tmdbId?t('No poster available','Afiş bulunamadı'):t('Match a title for artwork','Afiş için yapımı eşleştir')));content.append(poster);
    const copy=el('div','mtd-copy');
    const heading=el('h1','',item.title);heading.id='mediaTitleHeading';copy.append(heading);
    if(item.originalTitle&&item.originalTitle!==item.title)copy.append(el('p','mtd-original',item.originalTitle));
    copy.append(el('p','mtd-facts',[item.kind==='series'?t('Series','Dizi'):t('Film','Film'),item.year,item.runtime?item.runtime+' '+t('min','dk'):''].filter(Boolean).join(' · ')));
    const genres=el('div','mtd-genres');for(const name of item.genres||[])genres.append(el('span','',name));copy.append(genres);
    const sourceRating=window.MediaVisual?.ratingOf?.(item),score=value=>window.MediaVisual?.score?.(value)??value;
    const ratings=el('div','mtd-ratings');for(const [label,value,scale]of [['TMDB',score(item.tmdbRating),'/10'],['IMDb',score(item.ratings?.imdb||(sourceRating?.source==='IMDb'?sourceRating.value:'')),'/10'],['Letterboxd',score(item.ratings?.letterboxd),'/5'],[t('Your rating','Puanın'),item.ratings?.personal,'']])if(value){const rate=el('div');rate.append(el('strong','',value+scale),el('span','',label));ratings.append(rate);}copy.append(ratings);
    if(item.tagline)copy.append(el('p','mtd-tagline',item.tagline));
    let editionId=copyChoice?.owner===item.id?copyChoice.id:(item.selectedEditionId||'');
    const actions=el('div','mtd-actions');const episodes=item.episodes||[];const next=[...episodes].sort((a,b)=>a.season-b.season||a.number-b.number).find(ep=>ep.source&&!ep.progress?.completed&&ep.watchStatus!=='completed');
    if(item.source||item.editions?.length||next){const first=button(next?t('Play next episode','Sıradaki bölümü oynat'):item.progress?.position&&!item.progress.completed?t('Continue watching','İzlemeye devam et'):t('Play film','Filmi oynat'),()=>play(next?.id,false,editionId),true);first.dataset.titleAction='play';actions.append(first,button(t('Watch in Turkish','Türkçe izleme hazırlığı'),()=>play(next?.id,true,editionId)));}
    else actions.append(button(t('Choose video file','Video dosyası seç'),async()=>{const r=await request('source-file',{});if(!r.canceled)await reload();},true));
    const favorite=button(item.favorite?t('Saved to favorites','Favorilere eklendi'):t('Add to favorites','Favorilere ekle'),async()=>{await request('save',{item:{id:selected,favorite:!item.favorite}});await reload();document.dispatchEvent(new Event('media-library-changed'));});favorite.setAttribute('aria-pressed',String(item.favorite));favorite.dataset.titleAction='favorite';actions.append(favorite);
    window.TitleGalleryUI?.mount(actions,item);
    copy.append(actions);personalView=window.PersonalMediaUI?.mount(copy,{item,identity:{catalogId:item.id}});content.append(copy);hero.append(content);dialog.append(hero);
    const status=el('p','mtd-status');status.setAttribute('role','status');dialog.append(status);
    const body=el('div','mtd-body'),main=el('main','mtd-main'),aside=el('aside','mtd-aside');
    story(main);
    if(item.cast?.length){main.append(el('h2','',t('Cast','Oyuncular')));const cast=el('div','mtd-cast');for(const name of item.cast)cast.append(el('span','',name));main.append(cast);}
    if(item.kind==='film'&&window.MediaVisual?.button&&window.MediaVisual?.overflow&&window.CinemaUI?.icon){
      const strip=el('section','cn-library-source');
      const label=el('div','cn-library-source-label');
      const metadata=el('div','cn-library-source-meta');
      metadata.setAttribute('aria-live','polite');
      const manage=button(t('Manage sources','Kaynakları yönet'),()=>management());
      window.MediaVisual.button(manage,'ghost');
      const copies=[...(item.source?[{id:'',source:item.source,progress:item.progress}]:[]),...(item.editions||[])];
      if(!copies.some(row=>row.id===editionId)) editionId=copies[0]?.id||'';
      const playButton=actions.querySelector('[data-title-action=play]');
      const chooseFile=actions.firstElementChild;
      const inspected = new Map();
      let probeVersion=0;
      const renderSource=()=>{
        const version=++probeVersion;
        const current=copies.find(row=>row.id===editionId);
        label.replaceChildren(el('small','',t('Playback source','Oynatma kaynağı')));
        metadata.replaceChildren();
        if(!current){
          label.append(el('strong','',t('No video linked','Video kaynağı bağlı değil')));
          manage.textContent=t('Choose video file','Video dosyası seç');
          manage.onclick=()=>chooseFile?.click();
          return;
        }
        const caption=row=>row.label||item.title;
        if(copies.length>1){
          const menu=window.MediaVisual.overflow(copies.map(row=>button(caption(row),()=>{editionId=row.id;copyChoice={owner:item.id,id:row.id};renderSource();})),t('Choose video copy','Video kopyasını seç'));
          menu.querySelector('summary').prepend(el('span','',caption(current)));
          label.append(menu);
        }else label.append(el('strong','',caption(current)));
        const progress=current.progress;
        const resumed=progress?.position>0&&!progress.completed;
        const playText=resumed?t('Continue watching','İzlemeye devam et'):t('Play','İzle');
        if(playButton){
          const text=playButton.querySelector('span');
          if(text)text.textContent=playText;else playButton.textContent=playText;
          playButton.setAttribute('aria-label',playText);
          playButton.title=playText;
        }
        const oldMeter=dialog.querySelector('.cn-library-resume');
        oldMeter?.remove();
        if(resumed&&progress.duration>0&&playButton){
          const meter=el('progress','cn-library-resume');meter.max=progress.duration;meter.value=progress.position;
          meter.setAttribute('aria-label',t('Viewing progress','İzleme ilerlemesi'));
          const row=playButton.closest('.cn-hero-actions');
          if(row)row.after(meter);else actions.after(meter);
        }
        if(current.source?.type!=='local')return;
        const trackLabels=tracks=>tracks.map(track=>{
          const lang=track.language;
          const names=new Intl.DisplayNames([t('en','tr')],{type:'language',fallback:'none'});
          const name=/^[a-z]{2,3}$/.test(lang||'')&&lang!=='und'?names.of(lang):'';
          return [name,track.channels?t(track.channels+' channels',track.channels+' kanal'):''].filter(Boolean).join(' · ');
        }).filter(Boolean).join(' / ');
        const read=button(t('Inspect file','Dosyayı oku'),async()=>{
          read.disabled=true;
          try{
            const result=inspected.get(current.id)||await request('inspect-playback-source',{editionId:current.id});
            inspected.set(current.id,result);
            if(!strip.isConnected||version!==probeVersion)return;
            const info=result.info;
            const list=el('dl');
            const fields=[
              [t('Video','Görüntü'),[info.width&&info.height?`${info.width} × ${info.height}`:'',info.codec?.toUpperCase(),info.bits?`${info.bits} bit`:''].filter(Boolean).join(' · ')],
              [t('Audio','Ses'),info.audio.length?[t(info.audio.length+' tracks',info.audio.length+' iz'),trackLabels(info.audio)].filter(Boolean).join(' · '):''],
              [t('Subtitles','Altyazı'),info.subtitles.length?[t(info.subtitles.length+' tracks',info.subtitles.length+' iz'),trackLabels(info.subtitles)].filter(Boolean).join(' · '):''],
              [t('File','Dosya'),[info.duration?`${Math.floor(info.duration/60)} ${t('min','dk')} ${Math.round(info.duration)%60} ${t('s','sn')}`:'',info.bytes?`${(info.bytes/(info.bytes>=1e9?1e9:info.bytes>=1e6?1e6:1024)).toLocaleString(t('en','tr'),{maximumFractionDigits:2})} ${info.bytes>=1e9?'GB':info.bytes>=1e6?'MB':'KB'}`:''].filter(Boolean).join(' · ')]
            ];
            for(const [key,value] of fields)if(value){const field=el('div');field.append(el('dt','',key),el('dd','',value));list.append(field);}
            label.title=info.name;
            metadata.replaceChildren(list);
          }catch{
            if(strip.isConnected&&version===probeVersion)metadata.firstElementChild.textContent=t('File could not be read','Dosya okunamadı');
          }finally{read.disabled=false;}
        });
        window.MediaVisual.button(read,'ghost');
        metadata.append(el('span','',t('File not yet inspected','Dosya henüz okunmadı')),read);
        if(inspected.has(current.id))read.click();
      };
      strip.append(window.CinemaUI.icon('folder'),label,metadata,manage);
      main.append(strip);
      renderSource();
    }
    const review=el('section','mtd-review');
    const info=el('dl');for(const [label,value]of [[t('Director / creator','Yönetmen / yaratıcı'),(item.directors||[]).join(', ')],[t('Original title','Özgün adı'),item.originalTitle]])if(value)info.append(el('dt','',label),el('dd','',value));aside.append(info);
    const personal=el('div','mtd-personal'),statusLabel=el('label','',t('Watch status','İzleme durumu')),statusSelect=el('select');
    for(const [value,en,tr]of [['unspecified','Not set','Belirtilmedi'],['planned','Watchlist','İzleme listesi'],['watching','Watching','İzleniyor'],['completed','Watched','İzlendi']]){const option=el('option','',t(en,tr));option.value=value;statusSelect.append(option);}statusSelect.value=draft?.status??item.watchStatus;statusSelect.dataset.titleAction='status';statusLabel.append(statusSelect);
    const rateLabel=el('label','',t('Your rating (0–10)','Puanın (0–10)')),rate=el('input');rate.type='number';rate.min='0';rate.max='10';rate.step='0.1';rate.value=draft?.rating??item.ratings?.personal??'';rate.dataset.titleAction='rating';rateLabel.append(rate);personal.dataset.titleId=item.id;
    personal.append(statusLabel,rateLabel,button(t('Save my rating & status','Puanımı ve durumumu kaydet'),async()=>{if(!rate.reportValidity())return;await request('save',{item:{id:selected,watchStatus:statusSelect.value,ratings:{personal:rate.value}}});await reload();document.dispatchEvent(new Event('media-library-changed'));}));aside.append(personal);
    aside.append(button(t('Edit sources & details','Kaynak ve bilgileri düzenle'),()=>management()),button(t('Change TMDB match','TMDB eşleşmesini değiştir'),()=>management(true)));
    const id=/^(movie|tv):(\d+)$/.exec(item.tmdbId||'');if(id)aside.append(button(t('View on TMDB ↗','TMDB’de görüntüle ↗'),()=>window.api.openExternal('https://www.themoviedb.org/'+id[1]+'/'+id[2])));
    if(episodes.length){const season=el('section','mtd-episodes'),label=el('label','',t('Episodes · season ','Bölümler · sezon ')),select=el('select');for(const num of [...new Set(episodes.map(ep=>ep.season))].sort((a,b)=>a-b)){const option=el('option','',num);option.value=num;select.append(option);}label.append(select);season.append(label);const list=el('div');season.append(list);const drawEpisodes=()=>{list.replaceChildren();for(const ep of episodes.filter(ep=>ep.season===Number(select.value))){const row=el('div','mtd-episode');row.append(el('span','',String(ep.number).padStart(2,'0')),el('strong','',ep.title||t('Episode '+ep.number,ep.number+'. bölüm')));if(ep.source)row.append(button(t('Play','Oynat'),()=>play(ep.id)));else row.append(button(t('Link source','Kaynak bağla'),()=>management()));list.append(row);}};select.onchange=drawEpisodes;drawEpisodes();main.append(season);}
    window.TitleDiscoveryUI?.mount(main,aside,item);window.FilmContextFeatures?.mount(main,item,((id)=>()=>open(id))(item.id),()=>management(true));
    body.append(main,aside,review);
    if(window.api.feedsRequest){const sourceTitleId=item.id,sourceGeneration=generation;
      void window.api.feedsRequest({action:'related',catalogId:item.id}).then(result=>{
        if(sourceGeneration!==generation||sourceTitleId!==selected||!body.isConnected||!result?.ok||!result.rows?.length)return;
        const related=el('section','mtd-feed-sources');related.append(el('h2','',t('Sources about this title','Bu yapım hakkında kaynaklar')));
        const list=el('div','mtd-feed-source-list');for(const source of result.rows.slice(0,6)){
          const link=button(source.title,()=>window.MediaHomeUI?.openFeedEntry(source.id));
          link.append(el('small','',source.provenance?.map(row=>row.title).filter(Boolean).join(' · ')||t('Saved feed source','Kayıtlı akış kaynağı')));list.append(link);
        }related.append(list);body.append(related);
      }).catch(()=>{});
    }
    dialog.append(body,el('p','mtd-attribution',t('This product uses the TMDB API but is not endorsed or certified by TMDB.','Bu ürün TMDB API’sini kullanır. TMDB tarafından onaylanmamış veya sertifikalandırılmamıştır.')));window.MediaReviewDecision?.mountTitle(review,item);
    if(item.kind==='film') void request('detail-artwork').then(result=>{
      if(version!==generation||!poster.isConnected)return;
      for(const [host,src] of [[poster,result.poster],[backdrop,result.backdrop]]){
        if(!safe(src)||host.querySelector('img'))continue;
        const img=el('img');img.src=src;img.alt='';
        void img.decode().then(()=>{
          if(version===generation&&host.isConnected&&!host.querySelector('img')){
            host.append(img);
            if(window.CinemaMotion?.mode!=='off'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)img.animate([{opacity:0},{opacity:1}],{duration:320});
          }
        }).catch(()=>{});
      }
      const match=/^(movie|tv):(\d+)$/.exec(item.tmdbId||'');
      if(match&&Number.isInteger(result.providerYear)&&item.year&&item.year!==result.providerYear){
        const notice=el('div','cn-year-notice');
        notice.append(el('span','',t('Year differs','Yıl farklı')+' · '+t('Library','Kayıt')+' '+item.year+' · TMDB '+result.providerYear));
        if(!item.fieldLocks?.includes('year')){
          const useYear=button(t('Use TMDB year','TMDB değerini kullan'),async()=>{
            const preview=await request('metadata-preview',{providerId:Number(match[2])});
            if(version!==generation||!notice.isConnected)return;
            if(preview.patch.tmdbId!==item.tmdbId||preview.patch.year!==result.providerYear){
              throw Error(t('TMDB data changed. Reopen the title and review it again.','TMDB bilgisi değişti. Yapımı yeniden açıp kontrol et.'));
            }
            await request('metadata-apply',{token:preview.token,fields:['year']});
            if(version===generation)await reload();
          });
          window.MediaVisual.button(useYear,'ghost');
          notice.append(useYear);
        }
        dialog.querySelector('.cn-film-copy .cn-meta')?.after(notice);
      }
      if(result.originalLanguage&&!item.originalLanguage){
        dialog.dispatchEvent(new CustomEvent('cinema-library-language',{detail:result.originalLanguage}));
      }
    }).catch(()=>{});
    window.MediaExperience?.setContext(dialog,{id:item.id,type:'library-title',title:item.title,synopsis:item.synopsis});document.getElementById('mediaHome').scrollTop=scroll;window.FilmPageEnhancements?.enhance(dialog,item);window.CinemaUI?.film(dialog,item);
    if(focused)dialog.querySelector('[data-title-action="'+focused+'"]')?.focus({preventScroll:true});
  }
  async function open(id){
    const given=arguments[1];if(dialog?.open&&selected===id&&item?.id===id&&dialog.dataset.titleReady==='true'){dialog.focus();return {ok:true,itemId:id};}if(dialog)close();copyChoice=null;selected=id;item=null;sessionOptions=given&&typeof given==='object'?given:{};returnLabel=typeof sessionOptions.backLabel==='function'?sessionOptions.backLabel:null;opener=document.activeElement;const mediaCard=opener?.closest?.('[data-home-item]'),mediaOrigin=mediaCard?.dataset.homeItem===id?window.UiMotion?.captureMedia(mediaCard):null;
    if(!document.body.classList.contains('media-home-active')||!document.getElementById('playerLayer')?.classList.contains('hidden'))await window.MediaHomeUI.returnHome();
    const current=createPage('mtd-dialog media-surface',{key:'library:'+id,returnFocus:sessionOptions.returnFocus});current.id='mediaTitleDialog';current.dataset.uiUntranslated='';current.setAttribute('aria-labelledby','mediaTitleHeading');dialog=current;
    const origin=opener;current.addEventListener('close',()=>{cancelStory(current);current.remove();if(dialog===current){personalView?.dispose();personalView=null;generation++;dialog=null;if(origin?.isConnected)origin.focus({preventScroll:true});}void syncBrowserOcclusion();document.dispatchEvent(new Event('media-library-changed'));});
    void syncBrowserOcclusion();current.append(el('h1','',t('Loading title…','Yapım yükleniyor…')));
    try{await reload();if(dialog!==current||!current.open||selected!==id||item?.id!==id)return {ok:false};window.UiMotion?.mediaTransfer(mediaOrigin,current.querySelector('.cn-film-poster'));window.UiMotion?.reveal(current,'page');current.focus({preventScroll:true});current.restorePosition();current.dataset.titleReady='true';return {ok:true,itemId:id};}catch(error){if(dialog===current&&current.open)current.replaceChildren(el('p','',error.message),button(t('Close','Kapat'),close));return {ok:false};}
  }
  document.addEventListener('ui-locale-change',()=>{if(dialog?.open&&item)draw(++generation);});
  document.addEventListener('media-metadata-updated',()=>{if(dialog?.open)void reload().catch(()=>{});});
  document.addEventListener('media-personal-changed',()=>{if(dialog?.open)void reload({refreshPersonalStatus:true}).catch(()=>{});});
  window.MediaTitleUI=Object.freeze({open,close,createPage});
})();
