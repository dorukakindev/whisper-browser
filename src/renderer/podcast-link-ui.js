/* Explicit source review over the existing feed tokens and player. Never owns audio. */
(() => {
  'use strict';
  const text=(tr,en)=>window.UiLocale?.get?.()==='en'?en:tr;
  const kit=()=>window.PlayerUiKit;
  const h=(tag,props,...children)=>kit().h(tag,props,...children);
  let current=null, sequence=0;
  function isSpotify(raw){try{const u=new URL(raw);return u.protocol==='https:'&&u.hostname==='open.spotify.com'&&/^\/episode\/[A-Za-z0-9]{22}$/.test(u.pathname);}catch{return false;}}
  async function enter(view='podcast') {
    const url=typeof player!=='undefined'?player.browserPageUrl:'';
    if(isSpotify(url)&&player.workspaceMode==='browser')return open({url,view});
    const layer=document.getElementById('playerLayer');
    if(layer?.classList.contains('hidden')&&player.mediaKey)await window.MediaHomeUI?.resumeWorkspace?.();
    if(!layer?.classList.contains('hidden')){
      if(player.workspaceMode==='browser'&&player.browserMediaSeen){if(view==='podcast')window.BrowserPodcastUI.setMode(true);else window.BrowserStudy.open();return;}
      if(player.workspaceMode==='player'&&player.mediaKey&&document.getElementById('playerVideo')?.getAttribute('src')){if(window.CinemaSahne)window.CinemaSahne.open({mode:view==='podcast'?'podcast':'study'});else window.PlayerWorkspaceIntegration.setPodcastMode(view==='podcast');return;}
    }
    return open({view});
  }
  function open({url='',view='podcast'}={}) {
    current?.close();
    let mode=view==='bilingual'?'bilingual':'podcast',epoch=0,busy=false,preview=null,selected=null,requestId='',spotify=false;
    const dialog=h('dialog',{class:'pdl-dialog mk-dialog media-surface','aria-labelledby':'podcastLinkTitle','data-ui-untranslated':''});current=dialog;
    const close=kit().iconButton({icon:'close',label:text('Kapat','Close'),onClick:()=>dialog.close()});
    const heading=h('h2',{id:'podcastLinkTitle'}),lead=h('p',{class:'pdl-lead',text:text('Bölüm linkini yapıştır. Yayıncı kaynağını incele, seçtiğin görünümde aç.','Paste an episode link. Review its publisher source and open your preferred view.')});
    const head=h('header',{class:'pdl-head'},h('div',null,h('span',{class:'pdl-eyebrow',text:text('DİNLE VE OKU','LISTEN AND READ')}),heading),close);
    const modes=h('div',{class:'pdl-modes',role:'group','aria-label':text('Açılacak görünüm','View to open')});
    for(const [value,tr,en]of [['bilingual','Çift dilli çalış','Bilingual study'],['podcast','Podcast','Podcast']])modes.append(h('button',{type:'button',class:'pdl-mode','data-view':value,on:{click:()=>{mode=value;sync();}}},text(tr,en)));
    const input=h('input',{type:'url',id:'podcastLinkUrl',value:url,autocomplete:'off',maxlength:'4096',placeholder:'https://open.spotify.com/episode/…','aria-describedby':'podcastLinkHint'});
    const label=h('label',{class:'pdl-field',for:'podcastLinkUrl'},h('span',{text:text('Spotify bölümü veya RSS adresi','Spotify episode or RSS URL')}),input);
    const status=h('p',{class:'pdl-status',role:'status','aria-live':'polite',id:'podcastLinkHint',text:text('Spotify sesi alınmaz; uygun bölüm yayıncının RSS kaynağından açılır.','Spotify audio is not acquired; a matching episode opens from its publisher RSS source.')});
    const results=h('div',{class:'pdl-results'}),source=h('div',{class:'pdl-source'});
    const lookup=h('button',{type:'submit',class:'pdl-button pdl-primary',text:text('Bağlantıyı incele','Review link')});
    const apply=h('button',{type:'button',class:'pdl-button pdl-primary',hidden:true,text:text('Onayla ve aç','Confirm and open')});
    const actions=h('div',{class:'pdl-actions'},lookup,apply);
    const form=h('form',{class:'pdl-form'},modes,lead,label,actions,status,source,results);
    const other=h('button',{type:'button',class:'pdl-button',text:text('Diğer medya kaynakları','Other media sources'),on:{click:()=>{dialog.close();window.MediaHubUI?.open();}}});
    const footer=h('footer',{class:'pdl-footer'},h('span',{text:text('Aynı oynatıcı · ayrı kaynak kimliği','Same player · separate source identity')}),other);
    dialog.append(head,h('div',{class:'pdl-scroll'},form),footer);
    const alive=mine=>dialog.isConnected&&dialog.open&&epoch===mine;
    const cancel=()=>{if(requestId)void window.api.feedsRequest({action:'cancel',requestId}).catch(()=>{});requestId='';};
    function sync(){
      heading.textContent=mode==='podcast'?text('Podcast dinle. Metni takip et.','Listen to podcasts. Follow the transcript.'):text('İki dille aynı bölüme bak.','Study the same episode in two languages.');
      modes.style.setProperty('--pdl-mode',mode==='podcast'?'1':'0');
      for(const button of modes.children){button.setAttribute('aria-pressed',String(button.dataset.view===mode));button.disabled=busy;}
      lookup.disabled=busy;apply.disabled=busy||!selected;input.disabled=busy;
      const feedAction=results.querySelector('[data-pdl-feed-use]');
      lookup.classList.toggle('pdl-primary',!selected&&!feedAction);lookup.classList.toggle('pdl-secondary',!!selected||!!feedAction);
      feedAction?.classList.toggle('pdl-primary',!selected);
      for(const button of results.querySelectorAll('button'))button.disabled=busy||button.dataset.unavailable==='true';
      apply.hidden=!selected;dialog.setAttribute('aria-busy',String(busy));
    }
    async function request(action,args={}){
      const result=await window.api.feedsRequest({action,locale:window.UiLocale?.get?.(),...args});
      if(!result?.ok)throw Error(result?.error||text('Kaynak alınamadı.','Could not read source.'));return result;
    }
    const comparableUrl=raw=>{try{const url=new URL(raw);url.hash='';return url.href;}catch{return '';}};
    async function useFeed(review,mine){
      const known=await request('list');if(!alive(mine))return null;
      const urls=new Set([review.feed.url,review.feed.effectiveUrl].map(comparableUrl).filter(Boolean));
      const existing=known.feeds?.find(feed=>[feed.url,feed.effectiveUrl].some(value=>urls.has(comparableUrl(value))));
      if(existing)return existing;
      const added=await request('subscribe',{token:review.token,initial:'all'});if(!alive(mine))return null;
      if(!added.feed?.id)throw Error(text('RSS kaynağı kaydedilemedi.','RSS source could not be saved.'));
      return added.feed;
    }
    async function task(fn){if(busy)return;const mine=++epoch;busy=true;sync();try{await fn(mine);}catch(error){if(alive(mine))status.textContent=error.message;}finally{if(epoch===mine){busy=false;requestId='';sync();}}}
    function clear(){cancel();++epoch;busy=false;preview=null;selected=null;results.replaceChildren();source.replaceChildren();sync();}
    input.addEventListener('input',clear);
    const hostname=raw=>{try{return new URL(raw).hostname;}catch{return '';}};
    function metadata(row){return [row.publisher,row.publishedAt?new Date(row.publishedAt).toLocaleDateString(window.UiLocale?.get?.()||'tr'):null,row.durationSeconds?text(Math.round(row.durationSeconds/60)+' dk',Math.round(row.durationSeconds/60)+' min'):null,hostname(row.feedUrl)].filter(Boolean).join(' · ');}
    function showCandidates(rows){
      const list=h('div',{class:'pdl-candidates',role:'radiogroup','aria-label':text('RSS bölüm adayları','RSS episode candidates')});
      for(const row of rows){
        const choice=h('button',{type:'button',class:'pdl-candidate',role:'radio','aria-checked':'false','data-unavailable':String(row.audioAvailable===false),disabled:row.audioAvailable===false,
          title:row.audioAvailable===false?text('Bu bölümde açık ses bağlantısı yok.','This episode has no public audio link.'):metadata(row),on:{click:()=>{if(busy)return;selected=row;for(const node of list.children)node.setAttribute('aria-checked',String(node===choice));sync();}}},
          h('span',{class:'pdl-cover','aria-hidden':'true',text:String(row.publisher||row.title||'').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toLocaleUpperCase('tr')}),
          h('span',{class:'pdl-candidate-copy'},h('strong',{text:row.title}),h('small',{text:metadata(row)}),h('span',{class:'pdl-evidence',text:spotify?text('Spotify eşleşmesi öneridir; ses zamanlaması doğrulanmadı.','Spotify matching is a suggestion; audio timing is unverified.'):text('Yayıncı RSS bölümü','Publisher RSS episode')})),kit().icon('check'));
        list.append(choice);
      }
      results.append(list);
      if(!rows.length&&!spotify)results.append(h('p',{class:'pdl-empty',text:text('Bu kaynakta uygun bölüm bulunamadı. Başka bir RSS adresini inceleyebilirsin.','No matching episode in this source. You can review another RSS URL.')}));
    }
    async function spotifyPreview(mine,rssUrl){
      requestId='podcast-link-'+(++sequence);
      const data=await request('podcast-spotify-preview',{url:input.value.trim(),discover:!rssUrl,rssUrl,requestId});
      if(!alive(mine))return;preview=data;selected=null;results.replaceChildren();source.replaceChildren(h('span',{class:'pdl-eyebrow',text:text('SPOTIFY BÖLÜMÜ','SPOTIFY EPISODE')}),h('h3',{text:data.title}),h('p',{class:'pdl-status',text:text('Spotify’dan bölüm adı alındı. RSS eşleşmesini yayıncı ve tarihle kontrol et.','The episode title came from Spotify. Check the RSS match against publisher and date.')}));
      showCandidates(data.candidates||[]);
      if(data.feedPreview){
        const review=data.feedPreview;
        const card=h('section',{class:'pdl-feed-review'},h('h3',{text:review.feed.title}),h('p',{text:hostname(review.feed.url)+' · '+text(review.count+' kayıt',review.count+' entries')}),h('p',{text:text('Yeni RSS kaynağı Akışlar’a eklenir; mevcut kaynak korunur. Sonra bölüm adayını onaylayabilirsin.','New RSS sources are added to Feeds; existing sources are reused. You can then confirm the episode candidate.')}));
        for(const episode of (data.suggestedEpisodes||[]).slice(0,3))card.append(h('p',{class:'pdl-preview-title',text:episode.title}));
        card.append(h('button',{type:'button',class:'pdl-button','data-pdl-feed-use':'',text:text('Bu RSS kaynağını kullan','Use this RSS source'),on:{click:()=>void task(async next=>{await useFeed(review,next);if(alive(next))await spotifyPreview(next);})}}));results.prepend(card);
      }
      for(const feed of data.suggestedFeeds||[])results.append(h('button',{type:'button',class:'pdl-feed pdl-button',on:{click:()=>void task(next=>spotifyPreview(next,feed.url))}},h('strong',{text:feed.title}),h('small',{text:[feed.publisher,hostname(feed.url)].filter(Boolean).join(' · ')}),h('span',{text:text('RSS adayını incele','Review RSS candidate')})));
      status.textContent=(data.candidates||[]).length?text('Bölüm, yayıncı ve tarihi karşılaştır; açmadan önce bir adayı seç.','Compare episode, publisher and date; select a candidate before opening.'):data.discovery?.state==='unavailable'?text('RSS dizinine ulaşılamadı. Yayıncının RSS adresiyle devam edebilirsin.','The RSS directory is unavailable. Continue with the publisher RSS URL.'):text('RSS önerileri eşleşme kanıtı değildir. Bir kaynağı incele veya RSS adresini kendin gir.','RSS suggestions are not match evidence. Review a source or enter its RSS URL.');
      manualRss();sync();
    }
    function manualRss(){
      const field=h('input',{type:'url',placeholder:'https://…/podcast.xml','aria-label':text('Yayıncının RSS adresi','Publisher RSS URL')});
      const inspect=h('button',{type:'button',class:'pdl-button',text:text('RSS adresini incele','Review RSS URL'),on:{click:()=>void task(mine=>{let url;try{url=new URL(field.value.trim());}catch{throw Error(text('Yayıncının RSS adresini gir.','Enter the publisher RSS URL.'));}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error(text('Geçerli bir RSS adresi gir.','Enter a valid RSS URL.'));return spotifyPreview(mine,url.href);})}});
      results.append(kit().accordion({title:text('RSS adresini biliyorum','I know the RSS URL'),children:[field,inspect]}));
    }
    form.addEventListener('submit',event=>{event.preventDefault();void task(async mine=>{
      selected=null;preview=null;results.replaceChildren();source.replaceChildren();status.textContent=text('Kaynaklar kontrol ediliyor…','Checking sources…');
      let parsed;try{parsed=new URL(input.value.trim());}catch{throw Error(text('Geçerli bir Spotify bölüm veya RSS adresi gir.','Enter a valid Spotify episode or RSS URL.'));}
      if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error(text('Yalnız güvenli web bağlantıları kullanılabilir.','Only safe web links can be used.'));
      spotify=isSpotify(input.value.trim());
      if(parsed.hostname==='open.spotify.com'&&!spotify)throw Error(text('Spotify programı yerine bölümün paylaşım bağlantısını yapıştır.','Paste an episode share link rather than a Spotify show link.'));
      if(spotify){await spotifyPreview(mine);return;}
      requestId='podcast-link-'+(++sequence);const review=await request('preview',{url:input.value.trim(),requestId});if(!alive(mine))return;
      source.replaceChildren(h('h3',{text:review.feed.title}));
      results.append(h('p',{text:text('Kaynak Akışlar’da kullanılacak; ardından bölümü seçebilirsin.','The source will be used in Feeds; you can then choose an episode.')}),h('button',{type:'button',class:'pdl-button','data-pdl-feed-use':'',text:text('Kaynağı kullan ve bölümleri göster','Use source and show episodes'),on:{click:()=>void task(async next=>{
        const feed=await useFeed(review,next);if(!alive(next)||!feed)return;
        const rows=await request('entries',{feedId:feed.id,kind:'podcast',limit:200});if(!alive(next))return;results.replaceChildren();preview={};showCandidates(rows.rows.filter(row=>row.feedId===feed.id).map(row=>({...row,entryId:row.id,publisher:row.author||row.sourceFeed?.title,feedUrl:row.sourceFeed?.url,audioAvailable:row.enclosures?.some(e=>/^audio\//.test(e.type))})));status.textContent=text('Açılacak bölümü seç.','Choose an episode to open.');
      })}}));status.textContent=text('RSS kaynağı hazır; ekleme için onayını bekliyor.','RSS source is ready and waiting for your approval to add.');
    });});
    apply.addEventListener('click',()=>void task(async mine=>{
      const row=selected,chosen=mode;if(!row||!preview)return;
      if(spotify)await request('podcast-spotify-confirm',{token:preview.token,entryId:row.entryId});if(!alive(mine))return;
      status.textContent=text('Bölüm açılıyor…','Opening episode…');
      await window.PlayerSourceCatalogIntegration.openPodcastEntry(row.entryId,{view:chosen,isCancelled:()=>!alive(mine)});
      if(alive(mine))dialog.close();
    }));
    dialog.addEventListener('close',()=>{++epoch;cancel();dialog.remove();if(current===dialog)current=null;if(typeof syncBrowserOcclusion==='function')syncBrowserOcclusion();},{once:true});
    document.body.append(dialog);sync();dialog.showModal();kit().bindDialog(dialog);if(typeof syncBrowserOcclusion==='function')syncBrowserOcclusion();
    requestAnimationFrame(()=>{if(dialog.open)input.focus({preventScroll:true});});
    return dialog;
  }
  const browserEntry=document.getElementById('browserPodcastOpen');
  const linkEntry=kit().iconButton({icon:'link',label:text('Bölüm bağlantısı aç','Open episode link'),onClick:()=>open({url:isSpotify(player.browserPageUrl)?player.browserPageUrl:'',view:window.BrowserPodcastUI?.isActive()?'podcast':'bilingual'})});
  linkEntry.id='podcastLinkOpen';linkEntry.classList.add('browser-nav-button');browserEntry?.after(linkEntry);
  const labelBrowser=()=>{const label=text('Bölüm bağlantısı aç','Open episode link');linkEntry.title=label;linkEntry.setAttribute('aria-label',label);if(browserEntry){browserEntry.textContent=text('Podcast','Podcast');browserEntry.title=text('Podcast görünümüne geç veya bölüm linki yapıştır','Open podcast view or paste an episode link');}};
  browserEntry?.addEventListener('click',()=>void enter('podcast'));
  document.addEventListener('ui-locale-change',labelBrowser);labelBrowser();
  window.PodcastLinkUI=Object.freeze({open,enter,isSpotify});
})();
