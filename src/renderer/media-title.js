(() => {
  'use strict';
  const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;};
  const safe=value=>typeof value==='string'&&value.length<8e6&&/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value);
  let dialog,selected,opener,generation=0,item,storyJob;
  const originalStories=new Set();
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
  function management(metadata=false){const id=selected;close();const run=metadata?window.MediaCatalogUI.openMetadata(id):window.MediaCatalogUI.open({id});void Promise.resolve(run).then(()=>{document.getElementById('mediaCatalogDialog')?.addEventListener('close',()=>void open(id),{once:true});});}
  async function play(episodeId,voice=false){
    const current=dialog,id=selected;const result=await request('play',{episodeId});
    if(current!==dialog||!current?.open||selected!==id)return;
    if(!result.watchItem)throw Error(t('Add a video file or link first.','Önce video dosyası veya bağlantısı ekle.'));
    close();await window.openMediaCatalogPlayback(result.watchItem);if(voice)await window.MediaExperience?.openVoice();
  }
  async function reload(){const id=selected,version=++generation;const result=await window.api.mediaCatalog({action:'list'});if(version!==generation||!dialog?.open)return;
    if(result?.canceled)return result;if(!result?.ok)throw Error(result?.error||t('Could not load the title.','Yapım yüklenemedi.'));
    const current=result.items.find(row=>row.id===id);if(!current){close();return;}item=current;draw(version);
  }
  function image(action,target,version,options={}){void request(action,options).then(result=>{if(version!==generation||!target.isConnected||!safe(result.image))return;const img=el('img');img.src=result.image;img.alt='';target.replaceChildren(img);}).catch(()=>{});}
  function draw(version){
    const scroll=dialog.scrollTop;const focused=dialog.contains(document.activeElement)?document.activeElement?.dataset.titleAction:null;
    const form=dialog.querySelector('.mtd-personal');const draft=form?.dataset.titleId===item.id?{status:form.querySelector('select').value,rating:form.querySelector('input').value}:null;
    dialog.replaceChildren();const header=el('header','mtd-header');const back=button(t('← Back to library','← Kütüphaneye dön'),close);back.dataset.titleAction='back';
    const edit=button(t('Manage title','Yapımı yönet'),()=>management());header.append(back,edit);dialog.append(header);
    const hero=el('section','mtd-hero'),backdrop=el('div','mtd-backdrop');backdrop.setAttribute('aria-hidden','true');hero.append(backdrop);
    if(item.backdrop)image('backdrop',backdrop,version);
    const content=el('div','mtd-hero-content'),poster=el('div','mtd-poster');if(item.hasPoster)image('poster',poster,version,{large:true});else poster.append(el('span','',item.tmdbId?t('No poster available','Afiş bulunamadı'):t('Match a title for artwork','Afiş için yapımı eşleştir')));content.append(poster);
    const copy=el('div','mtd-copy');copy.append(el('span','mtd-kind',item.kind==='series'?t('Series','Dizi'):t('Film','Film')));
    const heading=el('h1','',item.title);heading.id='mediaTitleHeading';copy.append(heading);
    if(item.originalTitle&&item.originalTitle!==item.title)copy.append(el('p','mtd-original',item.originalTitle));
    copy.append(el('p','mtd-facts',[item.year,item.runtime?item.runtime+' '+t('min','dk'):''].filter(Boolean).join(' · ')));
    const genres=el('div','mtd-genres');for(const name of item.genres||[])genres.append(el('span','',name));copy.append(genres);
    const ratings=el('div','mtd-ratings');for(const [label,value,scale]of [['TMDB',item.tmdbRating&&Number(item.tmdbRating).toFixed(1),'/10'],['IMDb',item.ratings?.imdb,'/10'],['Letterboxd',item.ratings?.letterboxd,'/5'],[t('Your rating','Puanın'),item.ratings?.personal,'']])if(value){const rate=el('div');rate.append(el('strong','',value+scale),el('span','',label));ratings.append(rate);}copy.append(ratings);
    if(item.tagline)copy.append(el('p','mtd-tagline',item.tagline));
    const actions=el('div','mtd-actions');const episodes=item.episodes||[];const next=[...episodes].sort((a,b)=>a.season-b.season||a.number-b.number).find(ep=>ep.source&&!ep.progress?.completed&&ep.watchStatus!=='completed');
    if(item.source||next){const first=button(next?t('Play next episode','Sıradaki bölümü oynat'):item.progress?.position&&!item.progress.completed?t('Continue watching','İzlemeye devam et'):t('Play film','Filmi oynat'),()=>play(next?.id),true);first.dataset.titleAction='play';actions.append(first,button(t('Watch in Turkish','Türkçe izleme hazırlığı'),()=>play(next?.id,true)));}
    else actions.append(button(t('Choose video file','Video dosyası seç'),async()=>{const r=await request('source-file',{});if(!r.canceled)await reload();},true));
    const favorite=button(item.favorite?t('Saved to favorites','Favorilere eklendi'):t('Add to favorites','Favorilere ekle'),async()=>{await request('save',{item:{id:selected,favorite:!item.favorite}});await reload();document.dispatchEvent(new Event('media-library-changed'));});favorite.setAttribute('aria-pressed',String(item.favorite));favorite.dataset.titleAction='favorite';actions.append(favorite);
    window.TitleGalleryUI?.mount(actions,item);
    copy.append(actions);content.append(copy);hero.append(content);dialog.append(hero);
    const status=el('p','mtd-status');status.setAttribute('role','status');dialog.append(status);
    const body=el('div','mtd-body'),main=el('main','mtd-main'),aside=el('aside','mtd-aside');
    story(main);
    if(item.cast?.length){main.append(el('h2','',t('Cast','Oyuncular')));const cast=el('div','mtd-cast');for(const name of item.cast)cast.append(el('span','',name));main.append(cast);}
    const review=el('section','mtd-review');review.append(el('h2','',t('Is this for you?','Bana uygun mu?')),el('p','',t('Read reviews and compare this title with your taste profile.','Yorumları incele, yapımı zevk profilinle karşılaştır.')),button(t('Reviews & personal fit','Yorumlar ve bana uygunluğu'),()=>window.MediaToolsUI?.open('decision',item)));main.append(review);
    const info=el('dl');for(const [label,value]of [[t('Director / creator','Yönetmen / yaratıcı'),(item.directors||[]).join(', ')],[t('Original title','Özgün adı'),item.originalTitle],[t('Watch status','İzleme durumu'),({planned:t('Watchlist','İzleme listesi'),watching:t('Watching','İzleniyor'),completed:t('Watched','İzlendi')})[item.watchStatus]]])if(value)info.append(el('dt','',label),el('dd','',value));aside.append(info);
    const personal=el('div','mtd-personal'),statusLabel=el('label','',t('Watch status','İzleme durumu')),statusSelect=el('select');
    for(const [value,en,tr]of [['unspecified','Not set','Belirtilmedi'],['planned','Watchlist','İzleme listesi'],['watching','Watching','İzleniyor'],['completed','Watched','İzlendi']]){const option=el('option','',t(en,tr));option.value=value;statusSelect.append(option);}statusSelect.value=draft?.status??item.watchStatus;statusSelect.dataset.titleAction='status';statusLabel.append(statusSelect);
    const rateLabel=el('label','',t('Your rating (0–10)','Puanın (0–10)')),rate=el('input');rate.type='number';rate.min='0';rate.max='10';rate.step='0.1';rate.value=draft?.rating??item.ratings?.personal??'';rate.dataset.titleAction='rating';rateLabel.append(rate);personal.dataset.titleId=item.id;
    personal.append(statusLabel,rateLabel,button(t('Save my rating & status','Puanımı ve durumumu kaydet'),async()=>{if(!rate.reportValidity())return;await request('save',{item:{id:selected,watchStatus:statusSelect.value,ratings:{personal:rate.value}}});await reload();document.dispatchEvent(new Event('media-library-changed'));}));aside.append(personal);
    aside.append(button(t('Edit sources & details','Kaynak ve bilgileri düzenle'),()=>management()),button(t('Change TMDB match','TMDB eşleşmesini değiştir'),()=>management(true)));
    const id=/^(movie|tv):(\d+)$/.exec(item.tmdbId||'');if(id)aside.append(button(t('View on TMDB ↗','TMDB’de görüntüle ↗'),()=>window.api.openExternal('https://www.themoviedb.org/'+id[1]+'/'+id[2])));
    if(episodes.length){const season=el('section','mtd-episodes'),label=el('label','',t('Episodes · season ','Bölümler · sezon ')),select=el('select');for(const num of [...new Set(episodes.map(ep=>ep.season))].sort((a,b)=>a-b)){const option=el('option','',num);option.value=num;select.append(option);}label.append(select);season.append(label);const list=el('div');season.append(list);const drawEpisodes=()=>{list.replaceChildren();for(const ep of episodes.filter(ep=>ep.season===Number(select.value))){const row=el('div','mtd-episode');row.append(el('span','',String(ep.number).padStart(2,'0')),el('strong','',ep.title||t('Episode '+ep.number,ep.number+'. bölüm')));if(ep.source)row.append(button(t('Play','Oynat'),()=>play(ep.id)));else row.append(button(t('Link source','Kaynak bağla'),()=>management()));list.append(row);}};select.onchange=drawEpisodes;drawEpisodes();main.append(season);}
    window.TitleDiscoveryUI?.mount(main,aside,item);
    body.append(main,aside);dialog.append(body,el('p','mtd-attribution','This product uses the TMDB API but is not endorsed or certified by TMDB.'));
    window.MediaExperience?.setContext(dialog,{id:item.id,type:'library-title',title:item.title,synopsis:item.synopsis});dialog.scrollTop=scroll;
    if(focused)dialog.querySelector('[data-title-action="'+focused+'"]')?.focus({preventScroll:true});
  }
  async function open(id){
    if(dialog?.open&&selected===id){dialog.focus();return;}if(dialog)close();selected=id;opener=document.activeElement;
    const current=el('dialog','mtd-dialog media-surface');current.id='mediaTitleDialog';current.dataset.uiUntranslated='';current.setAttribute('aria-labelledby','mediaTitleHeading');dialog=current;
    const origin=opener;current.addEventListener('close',()=>{cancelStory(current);current.remove();if(dialog===current){generation++;dialog=null;if(origin?.isConnected)origin.focus({preventScroll:true});}void syncBrowserOcclusion();document.dispatchEvent(new Event('media-library-changed'));});
    document.body.append(current);current.showModal();void syncBrowserOcclusion();current.append(el('h1','',t('Loading title…','Yapım yükleniyor…')));
    try{await reload();current.querySelector('header button')?.focus({preventScroll:true});}catch(error){current.replaceChildren(el('p','',error.message),button(t('Close','Kapat'),close));}
  }
  document.addEventListener('ui-locale-change',()=>{if(dialog?.open&&item)draw(++generation);});
  document.addEventListener('media-metadata-updated',()=>{if(dialog?.open)void reload().catch(()=>{});});
  window.MediaTitleUI=Object.freeze({open,close});
})();
