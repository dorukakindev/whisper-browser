(() => {
  'use strict';
  const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
  const node=(tag,cls='',text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const states={planned:['Up next','Sırada'],watching:['In progress','Devam ediyorum'],completed:['Completed','Tamamladım'],paused:['On hold','Ara verdim'],dropped:['Dropped','Bıraktım']};
  const formats={TV:['TV series','TV dizisi'],TV_SHORT:['Short series','Kısa dizi'],MOVIE:['Film','Film'],SPECIAL:['Special','Özel bölüm'],OVA:['OVA','OVA'],ONA:['Web series','Web dizisi'],MUSIC:['Music video','Müzik videosu'],MANGA:['Manga','Manga'],NOVEL:['Novel','Roman'],ONE_SHOT:['One-shot','Tek bölüm']};
  const releases={FINISHED:['Finished','Tamamlandı'],RELEASING:['Ongoing','Devam ediyor'],NOT_YET_RELEASED:['Not yet released','Henüz yayımlanmadı'],CANCELLED:['Cancelled','İptal edildi'],HIATUS:['On hiatus','Ara verildi']};
  const imageUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^s\d*\.anilist\.co$/.test(u.hostname)?u.href:'';}catch{return '';}};
  const request=async(id,refresh=false)=>{const r=await window.api.mediaShelf({action:'collection-detail',id,refresh});if(!r?.ok)throw Error(r?.error||t('Details unavailable.','Bilgiler alınamadı.'));return r;};
  const kindName=row=>row.domain==='anime'?t('Anime','Anime'):row.kind==='manhwa'?'Manhwa':row.kind==='manhua'?'Manhua':row.metadata?.format==='NOVEL'?t('Novel','Roman'):'Manga';

  function open(initial,{onEdit,onSources,returnFocus}={}){
    if(!initial||!['anime','manga'].includes(initial.domain))throw Error(t('Choose an anime or manga title.','Anime veya manga kaydı seç.'));
    const page=window.MediaTitleUI.createPage('collection-title-page',{key:JSON.stringify(['collection',initial.id]),returnFocus});
    page.dataset.pageKind='collection';page.dataset.sourceOnly='true';page.dataset.uiUntranslated='';page.setAttribute('aria-labelledby','mediaTitleHeading');
    let row={...initial},generation=0,busy=false,message='';
    const updates=new AbortController();
    page.addEventListener('close',()=>{generation++;updates.abort();},{once:true});
    document.addEventListener('media-metadata-updated',()=>{void reloadRecord();},{signal:updates.signal});
    const button=(label,fn)=>{const b=node('button','mh-action',label);b.type='button';b.onclick=()=>Promise.resolve().then(fn).catch(error=>{if(page.open){message=error.message;const status=page.querySelector('[role=status]');if(status)status.textContent=message;}});return b;};
    function paint(){
      if(!page.open)return;
      const metadata=row.metadata||{},kind=kindName(row),header=node('header','mtd-header');
      header.append(button(t('Back to library','Kütüphaneye dön'),()=>page.close()));
      const hero=node('section','mtd-hero'),poster=node('div','mtd-poster'),copy=node('div','mtd-copy'),actions=node('div','mtd-actions');
      const art=imageUrl(metadata.cover),banner=imageUrl(metadata.banner);
      if(art){const image=node('img');image.alt=row.title;image.src=art;poster.append(image);const ticket=generation;void window.api.mediaShelf({action:'collection-cover-get',id:row.id}).then(r=>{if(page.open&&ticket===generation&&image.isConnected&&/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(r?.image||''))image.src=r.image;}).catch(()=>{});}
      if(banner){const image=node('img','mtd-backdrop');image.src=banner;image.alt='';hero.append(image);}
      const edit=button(t('Rate / edit','Puanla / düzenle'),async()=>{
        if(!onEdit)return;
        const current=await onEdit(row,()=>page.open);if(page.open&&current?.id===row.id){generation++;busy=false;row={...current};message='';paint();}
      });edit.disabled=!onEdit;actions.append(edit);
      if(onSources)actions.append(button(t('Sources / refresh','Kaynaklar / yenile'),()=>onSources(row)));
      const retry=button(busy?t('Loading details…','Bilgiler yükleniyor…'):t('Get details from AniList','Bilgileri AniList’ten getir'),()=>enrich(true));
      retry.disabled=busy||!/^\d{1,10}$/.test(row.providerId||'')||Number(row.providerId)<1;actions.append(retry);
      const title=node('h1','',row.title);title.id='mediaTitleHeading';copy.append(title,actions);hero.append(poster,copy);
      const status=node('p','mtd-status',message);status.setAttribute('role','status');
      const story=node('section','mtd-story'),heading=node('div');heading.append(node('h2','',t('Story','Hikâye')));story.append(heading,node('p','',metadata.description||t('No synopsis saved yet. You can request the details from AniList.','Henüz kayıtlı konu özeti yok. Bilgileri AniList’ten getirebilirsin.')));
      const personal=node('section','mtd-personal'),personalFacts=node('div','plog-facts');
      personal.append(node('h2','cn-section-heading',t('Your record','Senin kaydın')));
      const state=states[row.status];personalFacts.append(node('span','',state?t(...state):t('No status','Durum yok')),node('span','plog-score',row.rating==null?t('Not rated','Puanlanmadı'):`${row.rating}/10`));
      const total=row.total||metadata.total||0,progress=Number(row.progress)||0,unit=row.domain==='anime'?t('episodes','bölüm'):t('chapters','bölüm');
      if(progress||total)personalFacts.append(node('span','',`${progress}${total?' / '+total:''} ${unit}`));personal.append(personalFacts);
      if(total){const bar=node('progress','plog-progress');bar.max=total;bar.value=progress;bar.setAttribute('aria-label',t('Your progress','İlerlemen'));personal.append(bar);}
      if(row.note)personal.append(node('p','cn-story-text',row.note));
      const attribution=node('p','mtd-attribution',t('Metadata: AniList · Personal status, rating and progress belong to your archive.','Bilgiler: AniList · Kişisel durum, puan ve ilerleme arşivine aittir.'));
      page.replaceChildren(header,hero,status,story,personal,attribution);
      const item={title:row.title,originalTitle:(metadata.aliases||[]).find(title=>title!==row.title)||'',kind:row.domain,year:row.year||metadata.year,runtime:row.domain==='anime'?metadata.duration:0,genres:metadata.genres||[],tagline:kind};
      window.CinemaUI.film(page,item);
      page.classList.add('collection-title-page');
      const facts=page.querySelector('[data-cinema-credits]'),grid=page.querySelector('.cn-story-grid');
      if(facts){
        const dl=node('dl'),add=(label,value)=>{if(value===undefined||value===null||value==='')return;const line=node('div');line.append(node('dt','',label),node('dd','',value));dl.append(line);};
        add(t('Media','İçerik'),kind);add(t('Format','Biçim'),formats[metadata.format]?t(...formats[metadata.format]):metadata.format||row.format);
        add(t('Publication','Yayın durumu'),releases[metadata.status]?t(...releases[metadata.status]):metadata.status);
        if(metadata.total)add(row.domain==='anime'?t('Episodes','Bölüm sayısı'):t('Chapters','Bölüm sayısı'),metadata.total);
        if(metadata.volumes)add(t('Volumes','Cilt sayısı'),metadata.volumes);
        if(metadata.studios?.length)add(t('Studio','Stüdyo'),metadata.studios.join(', '));
        if(metadata.averageScore)add(t('AniList community score','AniList topluluk puanı'),metadata.averageScore+'/100');
        if(metadata.themes?.length)add(t('Themes','Temalar'),metadata.themes.map(value=>typeof value==='string'?value:value.name).filter(Boolean).slice(0,8).join(' · '));
        facts.replaceChildren(node('h2','',t('Title details','Yapım bilgileri')),dl);facts.dataset.creditCount=String(dl.children.length);facts.hidden=false;grid?.classList.remove('cn-sparse-credits');
      }
      // Provider identities are links, never fuzzy title searches or player actions.
      const source=node('div','cn-inline-story-actions');
      for(const [label,url]of [['MyAnimeList',/^\d{1,10}$/.test(row.providerId||'')&&Number(row.providerId)>0?'https://myanimelist.net/'+row.domain+'/'+Number(row.providerId):''],['AniList',Number.isSafeInteger(metadata.providerId)&&metadata.providerId>0?'https://anilist.co/'+row.domain+'/'+metadata.providerId:'']])if(url)source.append(button(label,()=>window.api.openExternal(url)));
      if(source.children.length)page.querySelector('.cn-advanced-body')?.append(source);
    }
    async function enrich(refresh){
      if(busy||!page.open)return;const ticket=++generation;busy=true;message=refresh?t('Getting public title information…','Yapım bilgileri alınıyor…'):'';paint();
      try{const result=await request(row.id,refresh);if(!page.open||ticket!==generation)return;row={...row,metadata:result.metadata};message=refresh?t('Details loaded for this session. Your personal record is unchanged.','Bilgiler bu oturum için yüklendi. Kişisel kaydın korundu.'):'';}
      catch(error){if(page.open&&ticket===generation)message=error.message;}
      finally{if(page.open&&ticket===generation){busy=false;paint();}}
    }
    async function reloadRecord(){
      if(!page.open)return;const ticket=++generation;busy=true;
      try{const result=await window.api.mediaShelf({action:'collection-list'});if(!page.open||ticket!==generation)return;if(!result?.ok)throw Error(result?.error||t('Details unavailable.','Bilgiler alınamadı.'));const current=result.rows.find(value=>value.id===row.id);if(!current){page.close();return;}row={...current};message='';}
      catch(error){if(page.open&&ticket===generation)message=error.message;}
      finally{if(page.open&&ticket===generation){busy=false;paint();}}
    }
    paint();void enrich(false);page.restorePosition?.();requestAnimationFrame(()=>{if(page.open)page.focus({preventScroll:true});});return page;
  }
  window.CollectionTitleUI=Object.freeze({open});
})();
