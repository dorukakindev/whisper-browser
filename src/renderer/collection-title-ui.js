(() => {
  'use strict';
  const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
  const part=value=>{const rows=String(value||'').split(' / ');return window.UiLocale?.get?.()==='tr'&&rows[1]?rows[1]:rows[0];};
  const node=(tag,cls='',text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const states={planned:['Up next','Sırada'],watching:['In progress','Devam ediyorum'],completed:['Completed','Tamamladım'],paused:['On hold','Ara verdim'],dropped:['Dropped','Bıraktım']};
  const formats={TV:['TV series','TV dizisi'],TV_SHORT:['Short series','Kısa dizi'],MOVIE:['Film','Film'],SPECIAL:['Special','Özel bölüm'],OVA:['OVA','OVA'],ONA:['Web series','Web dizisi'],MUSIC:['Music video','Müzik videosu'],MANGA:['Manga','Manga'],NOVEL:['Novel','Roman'],ONE_SHOT:['One-shot','Tek bölüm']};
  const releases={FINISHED:['Finished','Tamamlandı'],RELEASING:['Ongoing','Devam ediyor'],NOT_YET_RELEASED:['Not yet released','Henüz yayımlanmadı'],CANCELLED:['Cancelled','İptal edildi'],HIATUS:['On hiatus','Ara verildi']};
  const imageUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^s\d*\.anilist\.co$/.test(u.hostname)?u.href:'';}catch{return '';}};
  const request=async(id,refresh=false)=>{const r=await window.api.mediaShelf({action:'collection-detail',id,refresh});if(!r?.ok)throw Error(r?.error||t('Details unavailable.','Bilgiler alınamadı.'));return r;};
  const kindName=row=>row.domain==='anime'?t('Anime','Anime'):(row.kind==='manhwa'||!row.kindEditedAt&&row.metadata?.country==='KR')?'Manhwa':(row.kind==='manhua'||!row.kindEditedAt&&row.metadata?.country==='CN')?'Manhua':row.metadata?.format==='NOVEL'?t('Novel','Roman'):'Manga';

  function open(initial,{onEdit,onSources,returnFocus}={}){
    if(!initial||!['anime','manga'].includes(initial.domain))throw Error(t('Choose an anime or manga title.','Anime veya manga kaydı seç.'));
    const page=window.MediaTitleUI.createPage('collection-title-page',{key:JSON.stringify(['collection',initial.id]),returnFocus});
    page.dataset.pageKind='collection';page.dataset.sourceOnly='true';page.dataset.uiUntranslated='';page.setAttribute('aria-labelledby','mediaTitleHeading');
    let row={...initial},generation=0,busy=false,message='',match=null,preferenceState=null,reviewRows=null,reviewBusy=false,reviewError='',openReviewIds=new Set(),preferenceReload=false;
    const updates=new AbortController();
    page.addEventListener('close',()=>{generation++;updates.abort();},{once:true});
    document.addEventListener('collection-preferences-updated',()=>{if(busy)preferenceReload=true;else void enrich(false);},{signal:updates.signal});
    document.addEventListener('ui-locale-change',()=>paint(),{signal:updates.signal});
    document.addEventListener('media-metadata-updated',()=>{void reloadRecord();},{signal:updates.signal});
    const button=(label,fn)=>{const b=node('button','mh-action',label);b.type='button';b.onclick=()=>Promise.resolve().then(fn).catch(error=>{if(page.open){message=part(error.message);const status=page.querySelector('[role=status]');if(status)status.textContent=message;}});return b;};
    function paint(){
      if(!page.open)return;
      for(const card of page.querySelectorAll('[data-review-id]')){if(card.open)openReviewIds.add(card.dataset.reviewId);else openReviewIds.delete(card.dataset.reviewId);}
      const scroll=page.scrollTop,metadata=row.metadata||{},kind=kindName(row),header=node('header','mtd-header');
      header.append(button(t('Back to library','Kütüphaneye dön'),()=>page.close()));
      const hero=node('section','mtd-hero'),poster=node('div','mtd-poster'),copy=node('div','mtd-copy'),actions=node('div','mtd-actions');
      const art=imageUrl(metadata.cover),banner=imageUrl(metadata.banner);
      if(art){const image=node('img');image.alt=row.title;image.src=art;poster.append(image);const ticket=generation;void window.api.mediaShelf({action:'collection-cover-get',id:row.id}).then(r=>{if(page.open&&ticket===generation&&image.isConnected&&/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(r?.image||''))image.src=r.image;}).catch(()=>{});}
      if(banner){const image=node('img','mtd-backdrop');image.src=banner;image.alt='';hero.append(image);}
      const edit=button(t('Rate / edit','Puanla / düzenle'),async()=>{
        if(!onEdit)return;
        const current=await onEdit(row,()=>page.open);if(page.open&&current?.id===row.id){generation++;busy=false;row={...current};match=null;reviewRows=null;reviewError='';message='';paint();void enrich(false);}
      });edit.disabled=!onEdit;actions.append(edit);
      actions.append(button(t('Why I liked / disliked it','Neden sevdim / sevmedim?'),()=>window.CollectionPreferencesUI.reason(row,{owner:page})),button(t('My taste · short questions','Zevkim · kısa sorular'),()=>window.CollectionPreferencesUI.quiz(row.domain,{owner:page})));
      if(onSources)actions.append(button(t('Sources / refresh','Kaynaklar / yenile'),()=>onSources(row)));
      const retry=button(busy?t('Loading details…','Bilgiler yükleniyor…'):t('Get details from AniList','Bilgileri AniList’ten getir'),()=>enrich(true));
      retry.disabled=busy||!/^\d{1,10}$/.test(row.providerId||'')||Number(row.providerId)<1;actions.append(retry);
      const title=node('h1','',row.title);title.id='mediaTitleHeading';const heroState=node('div','mtd-state');{const known=states[row.status],heroTotal=row.total||metadata.total||0,heroProgress=Number(row.progress)||0,heroUnit=row.domain==='anime'?t('episodes','bölüm'):t('chapters','bölüm');heroState.append(node('span','mtd-chip mtd-chip-status',known?t(...known):t('No status','Durum yok')));if(row.rating!=null)heroState.append(node('span','mtd-chip mtd-chip-score','★ '+row.rating+'/10'));if(heroProgress||heroTotal)heroState.append(node('span','mtd-chip',`${heroProgress}${heroTotal?' / '+heroTotal:''} ${heroUnit}`));if(heroTotal){const heroBar=node('progress','mtd-hero-progress');heroBar.max=heroTotal;heroBar.value=Math.min(heroProgress,heroTotal);heroBar.setAttribute('aria-label',t('Your progress','İlerlemen'));heroState.append(heroBar);}}copy.append(title,heroState,actions);hero.append(poster,copy);
      const status=node('p','mtd-status',part(message));status.setAttribute('role','status');
      const story=node('section','mtd-story'),heading=node('div');heading.append(node('h2','',t('Story','Hikâye')));story.append(heading,node('p','',metadata.description||t('Title information loads automatically when available.','Yapım bilgileri erişilebildiğinde otomatik yüklenir.')));
      const personal=node('section','mtd-personal'),personalFacts=node('div','plog-facts');
      personal.append(node('h2','cn-section-heading',t('Your record','Senin kaydın')));
      const state=states[row.status];personalFacts.append(node('span','',state?t(...state):t('No status','Durum yok')),node('span','plog-score',row.rating==null?t('Not rated','Puanlanmadı'):`${row.rating}/10`));
      const total=row.total||metadata.total||0,progress=Number(row.progress)||0,unit=row.domain==='anime'?t('episodes','bölüm'):t('chapters','bölüm');
      if(progress||total)personalFacts.append(node('span','',`${progress}${total?' / '+total:''} ${unit}`));personal.append(personalFacts);
      if(total){const bar=node('progress','plog-progress');bar.max=total;bar.value=progress;bar.setAttribute('aria-label',t('Your progress','İlerlemen'));personal.append(bar);}
      if(row.note)personal.append(node('p','cn-story-text',row.note));
      const attribution=node('p','mtd-attribution',t('Metadata: AniList · Personal status, rating and progress belong to your archive.','Bilgiler: AniList · Kişisel durum, puan ve ilerleme arşivine aittir.'));
      const reviews=node('section','film-review-section ct-reviews');
      reviews.append(node('h2','cn-section-heading',t('Readers & viewers','Okurlar ve izleyiciler')),node('p','ct-note',t('Public AniList reviews may contain spoilers. Reading does not send them to AI; analysis needs a separate preview and confirmation.','Herkese açık AniList yorumları spoiler içerebilir. Okumak AI’a göndermez; analiz ayrıca önizleme ve onay gerektirir.')));
      if(reviewRows===null){const load=button(reviewBusy?t('Loading reviews…','Yorumlar yükleniyor…'):t('Read public reviews','Yorumları oku'),loadReviews);load.disabled=reviewBusy;reviews.append(load);}
      if(reviewError){const error=node('p','ct-note',reviewError);error.setAttribute('role','status');reviews.append(error);}
      if(reviewRows?.length)reviews.append(button(t('Select reviews & analyze','Yorum seç ve analiz et'),()=>window.CollectionAnalysisUI.open(row,reviewRows,page)));
      if(reviewRows){if(!reviewRows.length)reviews.append(node('p','ct-note',t('No public reviews found for this title.','Bu yapıma ait herkese açık yorum bulunamadı.')));for(const r of reviewRows){const card=node('details','ct-review'),summary=node('summary');card.dataset.reviewId=String(r.id);card.open=openReviewIds.has(String(r.id));summary.append(node('strong','',r.summary||t('Review','İnceleme')),node('span','',r.author+(r.score===null?'':' · '+r.score+'/100')));card.append(summary,node('p','ct-review-body',r.body),button(t('Open original review','Yorumun kaynağını aç'),()=>window.api.openExternal(r.url)));reviews.append(card);}}
      page.replaceChildren(header,hero,status,story,reviews,personal,attribution);
      const item={title:row.title,originalTitle:(metadata.aliases||[]).find(title=>title!==row.title)||'',kind:row.domain,year:row.year||metadata.year,runtime:row.domain==='anime'?metadata.duration:0,genres:metadata.genres||[],tagline:kind};
      window.CinemaUI.film(page,item);
      page.classList.add('collection-title-page');
      {const filmCopy=page.querySelector('.cn-film-copy');if(filmCopy){const before=filmCopy.querySelector('.mtd-actions');before?before.before(heroState):filmCopy.append(heroState);}}
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
        facts.replaceChildren(node('h2','',t('Title details','Yapım bilgileri')),dl,matchPanel());facts.dataset.creditCount=String(dl.children.length);facts.hidden=false;grid?.classList.remove('cn-sparse-credits');
      }
      const categoryName=value=>String(value).split('-').map(part=>({Theme:t('Themes','Temalar'),Setting:t('Setting','Ortam'),Cast:t('Cast','Karakterler'),Demographic:t('Demographic','Hedef kitle'),Drama:t('Drama','Dram'),Scene:t('Scene','Mekân'),Other:t('Other','Diğer'),Traits:t('Traits','Özellikler'),'Main Cast':t('Main cast','Ana karakterler'),Universe:t('Universe','Evren'),Action:t('Action','Aksiyon'),Fantasy:t('Fantasy','Fantastik'),Romance:t('Romance','Romantizm')})[part]||part).join(' / ');
      const groups=new Map();for(const tag of metadata.themes||[]){const name=typeof tag==='string'?tag:tag.name;if(!name)continue;const category=tag.category||t('Themes','Temalar');if(!groups.has(category))groups.set(category,[]);groups.get(category).push(tag);}
      if(groups.size){const themes=node('section','ct-themes');themes.append(node('h2','cn-section-heading',t('Themes & subgenres','Temalar ve alt türler')));for(const [category,tags]of groups){const group=node('div','ct-theme-group');group.append(node('h3','',categoryName(category)));const list=node('ul','ct-tags');for(const tag of tags){const item=node('li','',typeof tag==='string'?tag:tag.name);if(typeof tag==='object'&&Number.isFinite(tag.rank)){const rank=node('small','',String(tag.rank));rank.title=t('AniList tag relevance /100','AniList etiket ağırlığı /100');item.append(rank);}list.append(item);}group.append(list);themes.append(group);}page.querySelector('.cn-story')?.append(themes);}
      page.scrollTop=scroll;
      // Provider identities are links, never fuzzy title searches or player actions.
      const source=node('div','cn-inline-story-actions');
      for(const [label,url]of [['MyAnimeList',/^\d{1,10}$/.test(row.providerId||'')&&Number(row.providerId)>0?'https://myanimelist.net/'+row.domain+'/'+Number(row.providerId):''],['AniList',Number.isSafeInteger(metadata.providerId)&&metadata.providerId>0?'https://anilist.co/'+row.domain+'/'+metadata.providerId:'']])if(url)source.append(button(label,()=>window.api.openExternal(url)));
      if(source.children.length)page.querySelector('.cn-advanced-body')?.append(source);
    }
    function matchPanel(){
      const panel=node('section','ct-match');if(preferenceState?.reason){const r=preferenceState.reason;if(r.liked)panel.append(node('h3','',t('What I liked','Sevdiğim yönler')),node('p','ct-note',r.liked));if(r.disliked)panel.append(node('h3','',t('What I disliked','Sevmediğim yönler')),node('p','ct-note',r.disliked));}panel.append(node('h2','',t('For your taste','Zevkine uygunluk')));
      if(match?.preferenceEvidence?.length){panel.append(node('p','ct-note',t('Your explicit choices also contribute to this match.','Açık tercihlerin de bu eşleşmeye katkı sağlıyor.')));const list=node('ul');for(const e of match.preferenceEvidence)list.append(node('li','',(e.direction==='like'?t('Prefer: ','Daha çok: '):t('Avoid: ','Daha az: '))+e.key.replace(/^(genre|theme):/,'')+' · '+t(e.title,e.titleTr||e.title)));panel.append(list);}
      if(match?.score==null){panel.append(node('p','ct-note',t('Rate other titles in this media pool to build a match. Completion and community scores are not likes.','Uygunluk için bu türde başka yapımları puanla. Tamamlama ve topluluk puanı beğeni sayılmaz.')));return panel;}
      const score=node('p','ct-match-score');score.append(node('strong','',String(match.score)),node('span','',' / 100'));panel.append(score,node('p','ct-note',t('Metadata similarity, not a probability of enjoyment.','Metadata benzerliği; beğenme olasılığı değildir.')));
      const evidence=(rows,label)=>{if(!rows?.length)return;panel.append(node('h3','',label));const list=node('ul');for(const r of rows){const shared=(r.shared||[]).slice(0,3).map(v=>String(v).replace(/^(genre|theme|creator):/,''));list.append(node('li','',r.title+' · '+r.rating+'/10'+(shared.length?' — '+shared.join(', '):'')));}panel.append(list);};
      evidence(match.support,t('Matches your ratings','Beğendiğin yapımlarla ortak'));evidence(match.counter,t('Possible mismatch','Dikkat edebileceğin benzerlikler'));
      panel.append(node('p','ct-note',t('Based on '+match.rated+' other rated titles in this pool.','Bu havuzdaki puanladığın '+match.rated+' farklı yapıma dayanır.')));return panel;
    }
    async function loadReviews(){
      if(reviewBusy||!page.open)return;const id=row.id,domain=row.domain,providerId=row.providerId;reviewBusy=true;reviewError='';paint();
      try{const result=await window.api.mediaShelf({action:'collection-reviews',id});if(!page.open||row.id!==id||row.domain!==domain||row.providerId!==providerId)return;if(!result?.ok||result.id!==id)throw Error(t('Reviews unavailable. Try again.','Yorumlar alınamadı. Yeniden deneyebilirsin.'));reviewRows=result.rows||[];}
      catch{if(page.open)reviewError=t('Reviews unavailable. Try again.','Yorumlar alınamadı. Yeniden deneyebilirsin.');}
      finally{if(page.open){reviewBusy=false;paint();}}
    }
    async function enrich(refresh){
      if(busy||!page.open)return;const ticket=++generation;busy=true;message=t('Loading public title information…','Yapım bilgileri yükleniyor…');paint();
      try{const result=await request(row.id,refresh);if(!page.open||ticket!==generation)return;row={...row,metadata:result.metadata||row.metadata};match=result.match||null;preferenceState=result.preferenceState||null;message=result.warning|| (refresh?t('Details updated. Your rating and progress are unchanged.','Bilgiler yenilendi. Puanın ve ilerlemen korundu.'):'');}
      catch(error){if(page.open&&ticket===generation)message=part(error.message);}
      finally{if(page.open&&ticket===generation){busy=false;paint();if(preferenceReload){preferenceReload=false;void enrich(false);}}}
    }
    async function reloadRecord(){
      if(!page.open)return;const ticket=++generation;busy=true;
      try{const result=await window.api.mediaShelf({action:'collection-list'});if(!page.open||ticket!==generation)return;if(!result?.ok)throw Error(result?.error||t('Details unavailable.','Bilgiler alınamadı.'));const current=result.rows.find(value=>value.id===row.id);if(!current){page.close();return;}row={...current};message='';}
      catch(error){if(page.open&&ticket===generation)message=part(error.message);}
      finally{if(page.open&&ticket===generation){busy=false;paint();void enrich(false);}}
    }
    paint();void enrich(false);page.restorePosition?.();requestAnimationFrame(()=>{if(page.open)page.focus({preventScroll:true});});return page;
  }
  window.CollectionTitleUI=Object.freeze({open});
})();
