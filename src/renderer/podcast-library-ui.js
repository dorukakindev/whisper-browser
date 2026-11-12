(() => {
  'use strict';
  const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
  const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const continuing=r=>r.positionState!=='needs-review'&&Number(r.position)>0&&(!Number.isFinite(Number(r.duration))||Number(r.duration)<=0||Number(r.duration)>Number(r.position)+2);
  const ready=r=>completion(r).translation==='ready';
  function completion(row){const current=!!row.sourceVersion&&row.podcastWorkspace?.sourceVersion===row.sourceVersion,w=current?row.podcastWorkspace:null,has=track=>!!(track?.hasText||track?.text?.trim());return {audio:row.localSource?'personal-record':row.podcastAudioEvidence?.sha256?'download-record':'unconfirmed',transcript:has(w?.transcript)?!['complete','completed','ready',undefined].includes(w.transcript.status)?'partial':'ready':row.podcastWorkspace&&!current?'stale':'missing',translation:has(w?.translation)?!['complete','completed','ready',undefined].includes(w.translation.status)?'partial':'ready':row.podcastWorkspace&&!current?'stale':'missing',listening:row.listened===true?'confirmed':'unknown',coverage:w?.translation?.coverage||null,recovery:w?.translation?.recoveryAvailable?{completed:w.translation.completed,total:w.translation.total}:null};}
  const listeningAt=row=>Number.isFinite(row.lastListenedAt)&&row.lastListenedAt>0?row.lastListenedAt:0;
  function attention(row){const c=completion(row);return [...(row.positionState==='needs-review'||c.transcript==='stale'||c.translation==='stale'?['source']:[]),...(c.translation==='partial'?['translation']:[]),...(!row.localSource?['audio-unverified']:[])];}
  function completionPanel(row){const state=completion(row),panel=node('details','pl-completion'),labels={audio:t('Audio','Ses'),transcript:t('Transcript','Döküm'),translation:t('Translation','Çeviri'),listening:t('Listening','Dinleme')},words={'personal-record':t('Local source recorded; not reverified','Yerel kaynak kayıtlı; yeniden doğrulanmadı'),'download-record':t('Downloaded bytes recorded; availability unchecked','İndirme kanıtı kayıtlı; dosya varlığı kontrol edilmedi'),unconfirmed:t('Download not confirmed','İndirme doğrulanmadı'),ready:t('Saved','Kayıtlı'),partial:t('Partial; inspect coverage','Kısmi; kapsamı incele'),stale:t('Earlier source version; review required','Önceki kaynak sürümü; inceleme gerekli'),missing:t('Not saved','Kayıtlı değil'),confirmed:t('Explicitly marked listened','Açıkça dinlendi olarak işaretli'),unknown:t('Unknown; playback position is not completion','Bilinmiyor; oynatma konumu tamamlanma değildir')};panel.append(node('summary','',t('Separate completion states','Ayrı tamamlanma durumları')));for(const key of Object.keys(labels)){const line=node('p','pl-meta',labels[key]+': '+words[state[key]]);line.dataset.state=state[key];panel.append(line);}if(state.coverage)panel.append(node('p','pl-meta',t('Recorded translation coverage: ','Kayıtlı çeviri kapsamı: ')+JSON.stringify(state.coverage)));if(state.recovery)panel.append(node('p','pl-meta',state.recovery.completed+'/'+state.recovery.total+' · '+t('saved translation batches','kayıtlı çeviri grubu')));return panel;}
  function descriptionText(value){const doc=new DOMParser().parseFromString(String(value),'text/html');doc.querySelectorAll('script,style,iframe,object').forEach(n=>n.remove());doc.querySelectorAll('br,p,div,li').forEach(n=>n.append(' '));return doc.body.textContent.replace(/\s+/g,' ').trim();}
  function dateLabel(value){if(!value)return '';const date=new Date(value);return Number.isNaN(date.getTime())?'':date.toLocaleDateString(window.UiLocale?.get?.()==='tr'?'tr-TR':'en-US',{day:'numeric',month:'short',year:'numeric'});}
  function mount(root,data,actions){
    const state={query:'',filter:'all',program:'',sort:'newest',limit:60,selected:null};
    let disposed=false,playIntent=0,lastFeatured,lastFeaturedRevision,lastSpotify=null;
    const ownsNoteDisclosures=!actions.noteDisclosures;
    const openedEpisodeNotes=actions.noteDisclosures||new Set();
    const layout=node('section','pl-library pl-v2');layout.dataset.uiUntranslated='';
    const rail=node('aside','pl-rail'),main=node('main','pl-main'),side=node('aside','pl-side');
    const message=node('p','pl-message');message.setAttribute('role','status');
    const navigation=node('nav','pl-workspace-nav');navigation.setAttribute('aria-label',t('Podcast sections','Podcast bölümleri'));navigation.setAttribute('role','tablist');
    const views=new Map(),tabs=new Map();let currentView='episodes',initialView='episodes';
    const uid='podcast-'+Math.random().toString(36).slice(2);
    function addView(key,label){const pane=node('section','pl-workspace-view'),tab=node('button','',label);tab.type='button';tab.id=uid+'-tab-'+key;pane.id=uid+'-view-'+key;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',pane.id);pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',tab.id);tab.onclick=()=>showView(key);tabs.set(key,tab);views.set(key,pane);navigation.append(tab);return pane;}
    function showView(key,focus=false){if(!views.has(key))return;currentView=key;for(const [name,pane]of views){const active=name===key;pane.hidden=!active;const tab=tabs.get(name);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;if(active&&focus)tab.focus({preventScroll:true});}const area=views.get('search')?.querySelector('details');if(area){area.open=key==='search';if(actions.transcriptSearchState)actions.transcriptSearchState.open=area.open;}if(key==='storage')void loadStorage();if(key==='tools'){classic.open=true;classic.dispatchEvent(new Event('toggle'));}}
    navigation.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const keys=[...views.keys()],at=keys.indexOf(currentView);showView(keys[event.key==='Home'?0:event.key==='End'?keys.length-1:(at+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length],true);});
    const episodesView=addView('episodes',t('Episodes','Bölümler'));
    const button=(label,fn,cls='mh-action')=>{const b=node('button',cls,label);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(e){const alert=b.closest('dialog')?.querySelector('[role=alert]');if(alert)alert.textContent=e.message;else message.textContent=e.message;}finally{b.disabled=false;}});return b;};
    const search=node('input','pl-search');search.type='search';search.placeholder=t('Search episodes or shows','Bölüm veya yayın ara');search.setAttribute('aria-label',search.placeholder);
    rail.setAttribute('aria-label',t('Your subscriptions','Aboneliklerin'));
    const filters=node('div','pl-filters');
    for(const [key,label]of [['all',t('All','Tümü')],['continue',t('In progress','Yarım kalan')],['saved',t('Transcript saved','Transkript kayıtlı')],['ready',t('Translation saved','Çevirisi kayıtlı')],['local',t('Local copy','Yerel kopya')],['work',t('Needs attention','İşlem bekleyenler')]]){const b=button(label,()=>{state.filter=key;state.limit=60;paint();},'mh-text-button');b.dataset.filter=key;filters.append(b);}
    const programs=node('div','pl-programs');programs.setAttribute('role','group');programs.setAttribute('aria-label',t('Shows','Yayınlar'));rail.append(programs);
    const head=node('header','pl-heading'),heading=node('h1','',t('Podcast','Podcast')),intro=node('div','pl-intro'),counts=node('p','pl-counts');intro.append(heading,node('p','pl-heading-note',t('Your shows, listening and saved words.','Yayınların, dinlediklerin ve kayıtlı metinlerin.')),counts);
    const headActions=node('div','pl-head-actions');headActions.append(button(t('Open local file','Yerel dosyadan aç'),actions.openLocal),button(t('Add podcast link','Podcast bağlantısı ekle'),actions.addRss,'mh-action mh-primary pl-add'));head.append(intro,headActions);main.append(navigation,message);
    if(actions.searchTranscripts){
      const savedSearch=actions.transcriptSearchState||{};
      if(savedSearch.open||savedSearch.autorun)initialView='search';
      const area=node('details','pl-transcript-search'),form=node('form','pl-transcript-form');
      const input=node('input','pl-search'),results=node('div','pl-search-results'),status=node('p','pl-meta');
      const summary=node('summary','',t('Search saved transcripts','Kayıtlı transkriptlerde ara'));
      const scopes=node('div','pl-search-scopes'),fields=node('div','pl-search-query');
      area.open=!!savedSearch.open;
      area.ontoggle=()=>{savedSearch.open=area.open;};
      input.type='search';
      input.maxLength=200;
      input.value=savedSearch.query||'';
      input.placeholder=t('Enter a word or phrase','Sözcük veya ifade yaz');
      input.setAttribute('aria-label',input.placeholder);
      status.setAttribute('role','status');
      function select(label){
        const wrap=node('label','pl-search-field'),control=node('select');
        wrap.append(node('span','',label),control);
        scopes.append(wrap);
        return control;
      }
      function option(control,value,label){
        const item=node('option','',label);
        item.value=value;
        control.append(item);
      }
      const show=select(t('Show','Yayın')),episode=select(t('Episode','Bölüm')),role=select(t('Text','Metin'));
      const shows=(data.podcasts||[]).filter(p=>p.episodes?.length);
      option(show,'',t('All shows','Tüm yayınlar'));
      for(const p of shows)option(show,p.url||p.id,p.title);
      function updateEpisodes(value){
        episode.replaceChildren();
        option(episode,'',t('All episodes','Tüm bölümler'));
        for(const p of shows){
          if(show.value&&show.value!==(p.url||p.id))continue;
          for(const row of p.episodes){
            const id=row.entryId||row.episodeIdentity;
            if(id)option(episode,id,show.value?row.title:p.title+' · '+row.title);
          }
        }
        episode.value=value||'';
        if(episode.selectedIndex<0)episode.value='';
      }
      show.value=savedSearch.show||'';
      if(show.selectedIndex<0)show.value='';
      updateEpisodes(savedSearch.episode);
      option(role,'',t('Original and translation','Özgün ve çeviri'));
      option(role,'source',t('Original only','Yalnız özgün'));
      option(role,'translation',t('Saved translation only','Yalnız kayıtlı çeviri'));
      role.value=savedSearch.role||'';
      const submit=node('button','mh-action mh-primary',t('Search','Ara'));
      submit.type='submit';
      fields.append(input,submit);
      form.append(fields,scopes);
      const more=node('button','mh-action',t('Load more passages','Daha fazla pasaj yükle'));
      more.type='button';
      more.onclick=()=>void runSearch(true);
      more.hidden=true;
      area.append(summary,form,node('p','pl-meta',t('Local word and phrase matching. Searches saved original text and complete translations.','Yerel sözcük ve ifade eşleşmesi. Kayıtlı özgün metin ve tamamlanmış çeviriler taranır.')),status,results,more);
      const searchView=addView('search',t('Transcript search','Transkript araması'));searchView.append(node('h2','pl-view-title',t('Find a passage in your saved transcripts','Kayıtlı transkriptlerinde pasaj bul')),node('p','pl-meta',t('Search the words inside saved episodes, then open the matching passage.','Kayıtlı bölümlerin içindeki sözcükleri ara, eşleşen pasajı kaynağında aç.')),area);

      let ticket=0,loadingPage=false;
      function criteria(){return {query:input.value.trim(),show:show.value,episode:episode.value,role:role.value};}
      function render(){
        results.replaceChildren();
        const rows=savedSearch.rows||[],groups=new Map(),mine=ticket;
        const {query,...scope}=criteria();
        for(const row of rows){
          const key=row.episodeIdentity||row.episodeTitle;
          if(!groups.has(key)){
            const group=node('section','pl-search-group');
            const title=node('header','pl-search-episode');
            title.append(node('h3','',row.episodeTitle),node('p','pl-meta',row.showTitle));
            const passages=node('div','pl-search-passages');
            group.append(title,passages);
            groups.set(key,passages);
            results.append(group);
          }
          const card=node('article','pl-search-hit');
          const time=row.timed?row.seconds.toFixed(1)+'–'+row.end.toFixed(1)+' s':row.timingUnverified?t('Read only · audio timing unverified','Salt okunur · ses zamanı doğrulanmadı'):t('Read only','Salt okunur');
          card.append(node('p','pl-meta',(row.role==='translation'?t('Translation','Çeviri'):t('Original','Özgün'))+' · '+time),node('blockquote','',row.quote));
          card.append(button(row.timed?t('Go to passage','Pasaja git'):t('Read saved passage','Kayıtlı pasajı oku'),async()=>{
            try{
              const locator={...scope,episode:row.sourceEntryId||row.episodeIdentity||scope.episode};
              const fresh=(await actions.resolveTranscript(query,row.token,locator)).row;
              if(disposed||mine!==ticket)return;
              savedSearch.anchor=row.token;
              const d=node('dialog','mx-dialog media-surface');
              d.dataset.uiUntranslated='';
              const error=node('p','mh-error');
              error.setAttribute('role','alert');
              d.append(node('h2','',fresh.episodeTitle),node('p','pl-meta',fresh.showTitle+' · '+time),node('blockquote','',fresh.quote),error);
              if(fresh.timed){
                const open=button(t('Open episode at this passage','Bölümü bu pasajda aç'),async()=>{
                  open.disabled=true;
                  error.textContent='';
                  try{
                    await actions.openTranscriptResult(query,row.token,locator);
                    if(d.open)d.close();
                  }catch(cause){
                    if(d.open)error.textContent=cause?.message||t('The episode could not be opened. Try again.','Bölüm açılamadı. Yeniden deneyin.');
                  }finally{open.disabled=false;}
                },'mh-action mh-primary');
                d.append(open);
              }
              d.append(button(t('Back to results','Sonuçlara dön'),()=>d.close()));
              d.addEventListener('close',()=>{
                d.remove();
                card.querySelector('button')?.focus({preventScroll:true});
                if(typeof syncBrowserOcclusion==='function')void syncBrowserOcclusion();
              },{once:true});
              document.body.append(d);
              d.showModal();
              if(typeof syncBrowserOcclusion==='function')void syncBrowserOcclusion();
            }catch(error){
              if(!disposed&&mine===ticket)status.textContent=error.message;
            }
          },'mh-text-button pl-passage-open'));
          if(row.token)card.dataset.passage=row.token;
          groups.get(key).append(card);
        }
        more.hidden=savedSearch.nextOffset==null;
        const selected=scope.episode&&shows.flatMap(p=>p.episodes).find(row=>(row.entryId||row.episodeIdentity)===scope.episode);
        const missingTranslation=selected&&scope.role!=='source'&&!ready(selected)&&!rows.some(row=>row.role==='translation');
        status.textContent=rows.length
          ? rows.length+' '+(more.hidden?t('passages shown','pasaj gösteriliyor'):t('passages shown · more available','pasaj gösteriliyor · devamı var'))
          : savedSearch.searched?t('No passages match these filters. Try a different phrase or text filter.','Bu filtrelerle eşleşen pasaj yok. İfadeyi veya metin filtresini değiştirin.'):'';
        if(savedSearch.searched&&missingTranslation){
          const note=t('This episode has no complete translation in its current record.','Bu bölümün güncel kaydında tamamlanmış çeviri yok.');
          status.textContent=scope.role==='translation'&&!rows.length?note+' '+t('Try the original text.','Özgün metinde aramayı deneyin.'):status.textContent+' '+note;
        }
      }
      function invalidate(){
        ticket++;
        loadingPage=false;
        Object.assign(savedSearch,criteria(),{rows:[],nextOffset:null,searched:false,anchor:null});
        render();
      }
      async function runSearch(append=false){
        const {query,...scope}=criteria();
        const offset=append?savedSearch.nextOffset:0;
        if(append&&(offset==null||loadingPage))return;
        if(!append)invalidate();
        loadingPage=append;
        const mine=++ticket;
        if(!query){
          status.textContent=t('Enter a word or phrase to search.','Aramak için sözcük veya ifade yazın.');
          return;
        }
        status.textContent=t('Searching saved text…','Kayıtlı metin aranıyor…');
        try{
          const response=await actions.searchTranscripts(query,{...scope,offset});
          if(disposed||mine!==ticket)return;
          const rows=append?savedSearch.rows:[];
          const seen=new Set(rows.map(row=>row.token));
          const added=response.rows.filter(row=>!seen.has(row.token));
          savedSearch.rows=[...rows,...added];
          savedSearch.nextOffset=response.nextOffset??null;
          savedSearch.searched=true;
          const moveFocus=append&&document.activeElement===more;
          render();
          if(moveFocus){
            const first=[...results.querySelectorAll('[data-passage]')].find(card=>card.dataset.passage===added[0]?.token);
            (first?.querySelector('button')||(more.hidden?submit:more)).focus();
          }
        }catch(error){
          if(!disposed&&mine===ticket)status.textContent=t('Could not read saved text. Try again.','Kayıtlı metin okunamadı. Yeniden deneyin.')+' '+error.message;
        }finally{if(mine===ticket)loadingPage=false;}
      }
      form.onsubmit=event=>{event.preventDefault();void runSearch();};
      input.oninput=invalidate;
      show.onchange=()=>{updateEpisodes('');invalidate();};
      episode.onchange=role.onchange=invalidate;
      if(savedSearch.show&&savedSearch.show!==show.value||savedSearch.episode&&savedSearch.episode!==episode.value)invalidate();
      else render();
      if(savedSearch.autorun&&input.value.trim()){
        savedSearch.autorun=false;input.focus({preventScroll:true});void runSearch();
      }
      if(area.open&&savedSearch.anchor){
        requestAnimationFrame(()=>{
          if(disposed)return;
          const card=[...results.querySelectorAll('[data-passage]')].find(row=>row.dataset.passage===savedSearch.anchor);
          card?.scrollIntoView?.({block:'nearest'});
          card?.querySelector('button')?.focus({preventScroll:true});
        });
      }
    }
    const content=node('div','pl-content');episodesView.classList.add('pl-episodes-view');episodesView.append(content);
    const listControls=node('div','pl-list-tools'),listContent=node('div','pl-list-content');episodesView.append(listControls,listContent);content.before(listControls);
    const queueHead=node('div','pl-queue-heading');queueHead.append(node('h2','',t('Listening queue','Dinleme kuyruğu')),button(t('Manage queue','Kuyruğu yönet'),actions.openQueue,'mh-text-button'));side.append(queueHead);const queue=node('div','pl-queue');side.append(queue);
    let storageBusy=false,storageTicket=0,storageBody;
    async function loadStorage(){
      if(!actions.storageInventory||storageBusy)return;storageBusy=true;const ticket=++storageTicket;storageBody.setAttribute('aria-busy','true');
      try{const [inventory,retention]=await Promise.all([actions.storageInventory(),actions.retentionStatus()]);if(disposed||ticket!==storageTicket)return;if(!inventory?.ok||!retention?.ok)throw Error(inventory?.error||retention?.error||t('Storage details unavailable.','Depolama ayrıntıları alınamadı.'));storageBody.replaceChildren();const grid=node('div','pl-storage-grid'),mb=n=>(n/1048576).toFixed(1)+' MiB';for(const [key,label,explain]of [['preparation',t('Preparation audio','Hazırlık sesi'),t('Active downloads and leftover temporary files. No automatic cleanup.','Etkin indirmeler ve kalan geçici dosyalar. Otomatik temizlik yok.')],['exactAudio',t('Transcript audio cache','Döküme ait ses önbelleği'),t('Associated copies for saved source clocks. Inventory does not rehash bytes or guarantee offline playback.','Kayıtlı kaynak saatine bağlı kopyalar. Envanter byte hash’ini yeniden doğrulamaz veya çevrimdışı oynatmayı garanti etmez.')],['textCopies',t('Materialized text copies','Dosyaya hazırlanmış metin'),t('Generated subtitle files. Saved personal text remains in the feed workspace.','Hazırlanan altyazı dosyaları. Kişisel metnin asıl kaydı RSS çalışma alanındadır.')]]){const card=node('section','pl-storage-card'),g=inventory.groups[key];card.append(node('h3','',label),node('strong','',mb(g.bytes)),node('p','pl-meta',g.files+' '+t('files','dosya')),node('p','pl-description',explain));grid.append(card);}if(inventory.personalSources){const card=node('section','pl-storage-card');card.append(node('h3','',t('Your local originals','Kişisel yerel orijinaller')),node('strong','',inventory.personalSources.count+' '+t('associations','bağ')),node('p','pl-meta',mb(inventory.personalSources.recordedBytes)+' · '+t('recorded size','kayıtlı boyut')),node('p','pl-description',t('Metadata only. Original files were not scanned or reverified and are never automatically cleaned.','Yalnız metadata. Orijinal dosyalar taranmadı veya yeniden doğrulanmadı; otomatik temizlenmez.')));grid.append(card);}storageBody.append(grid,node('p','pl-meta',t('Exact audio quota: 32 copies / 1 GiB. Original files selected by you are outside this scan.','Döküm sesi kotası: 32 kopya / 1 GiB. Seçtiğin kişisel orijinaller bu taramanın dışındadır.')));if(inventory.partial)storageBody.append(node('p','pl-message',t('Partial inventory: up to 2000 entries scanned / 200 files listed.','Kısmi envanter: en fazla 2000 giriş taranır / 200 dosya listelenir.')));
      const policy=node('section','pl-retention'),title=node('h2','pl-view-title',t('Personal work is retained','Kişisel çalışma korunur'));policy.append(title,node('p','pl-description',t('Saved transcripts, translations, positions, notes and source pins are protected from automatic feed trimming and unsubscribe. Only ordinary cached entries can be replaced. At protected capacity, refresh is rejected without removing personal work.','Kayıtlı döküm, çeviri, konum, not ve kaynak sabitlemeleri otomatik RSS budamasında ve abonelikten çıkışta korunur. Yalnız sıradan önbellek kayıtları yenileriyle değişebilir. Korunan kapasite dolunca kişisel çalışma silinmeden yenileme reddedilir.')),node('p','pl-meta',`${retention.total}/${retention.limit} · `+t('protected: ','korunan: ')+retention.protected+' · '+t('cache candidates: ','önbellek adayı: ')+retention.evictable+' · '+mb(retention.bytes)+' / '+mb(retention.byteLimit)),node('p','pl-meta',t('Transcripts / translations / positions: ','Döküm / çeviri / konum: ')+retention.transcripts+' / '+retention.translations+' / '+retention.positions));if(retention.warning)policy.append(node('p','pl-message',t('Capacity is nearing its limit. Export a workspace backup and review saved sources before refreshing more.','Kapasite sınıra yaklaşıyor. Yeni yenilemeden önce çalışma alanı yedeği alıp kayıtlı kaynakları incele.')));if(actions.openBackup)policy.append(button(t('Open workspace backup tools','Çalışma alanı yedeklerini aç'),actions.openBackup));
      const personal=node('details','pl-storage-details');personal.append(node('summary','',t('Review retained sources','Korunan kaynakları incele')));for(const row of retention.rows||[]){const line=node('div','pl-storage-row');line.append(node('strong','',row.title),node('small','pl-meta',row.hasPrevious?t('Earlier source work is also retained','Önceki kaynak çalışması da korunuyor'):t('Personal record retained','Kişisel kayıt korunuyor')));if(row.kind==='podcast'&&actions.openSavedEpisode)line.append(button(t('Open saved episode','Kayıtlı bölümü aç'),()=>actions.openSavedEpisode(row.id),'mh-text-button'));personal.append(line);}if(retention.partial)personal.append(node('p','pl-meta',t('First 100 protected sources shown.','İlk 100 korunan kaynak gösteriliyor.')));policy.append(personal);storageBody.append(policy);
      const files=node('details','pl-storage-details');files.append(node('summary','',t('Managed artifact details','Yönetilen dosya ayrıntıları')));for(const artifact of inventory.rows){const line=node('div','pl-storage-row');line.append(node('span','',({preparation:t('Preparation','Hazırlık'),exactAudio:t('Transcript audio','Döküm sesi'),textCopies:t('Text copy','Metin kopyası')})[artifact.kind]),node('span','pl-meta',mb(artifact.bytes)+' · '+(artifact.active?t('active','etkin'):artifact.state==='leftover'?t('leftover; review before cleanup','kalan dosya; temizlikten önce incele'):artifact.owners.length?t('associated; bytes not reverified','bağlı; byte yeniden doğrulanmadı'):t('unassociated','bağı belirsiz'))));for(const owner of artifact.owners||[])line.append(node('small','pl-meta',owner.title));files.append(line);}storageBody.append(files);if(inventory.offline)storageBody.append(node('p','pl-meta',t('Permanent offline copies: ','Kalıcı çevrimdışı kopyalar: ')+(inventory.offline.keptFiles??inventory.offline.files)+'/'+inventory.offline.fileLimit+' · '+mb(inventory.offline.bytes)+' / '+mb(inventory.offline.limit)),node('p','pl-description',t('Offline audio is managed separately from transcript cache and workspace backups. No personal originals are scanned or deleted.','Çevrimdışı ses döküm önbelleğinden ve çalışma alanı yedeğinden ayrıdır. Kişisel orijinaller taranmaz veya silinmez.')));
      }catch(error){if(!disposed)storageBody.replaceChildren(node('p','pl-message',error.message));}finally{storageBusy=false;if(!disposed)storageBody.setAttribute('aria-busy','false');}
    }
    if(actions.storageInventory){const view=addView('storage',t('Storage & retention','Depolama ve saklama'));storageBody=node('div','pl-storage');view.append(node('h2','pl-view-title',t('Your podcast data','Podcast verilerin')),node('p','pl-description',t('Review saved work and managed copies together. Inspection changes no files.','Kişisel çalışma ve yönetilen kopyaları birlikte incele. İnceleme dosyaları değiştirmez.')),button(t('Refresh inventory','Envanteri yenile'),loadStorage),storageBody);}
    const classic=node('details','pl-classic');classic.append(node('summary','',t('Radio & advanced library tools','Radyo ve ileri kütüphane araçları')));const classicBody=node('div','pl-classic-body');classic.append(classicBody);const toolsView=addView('tools',t('Radio & tools','Radyo ve araçlar'));toolsView.append(node('h2','pl-view-title',t('Radio & library tools','Radyo ve kütüphane araçları')),classic);main.append(...views.values());let classicMounted=false;classic.addEventListener('toggle',()=>{if(classic.open&&!classicMounted){classicMounted=true;actions.classic(classicBody);}});showView(initialView);
    layout.append(head,rail,main);root.append(layout);
    function art(row,program){const box=node('div','pl-art',(row.title||program.title||'').split(/\s+/).filter(word=>/^\p{L}/u.test(word)).slice(0,2).map(word=>Array.from(word)[0]).join('').toLocaleUpperCase()||'♪');const url=row.image||program.image;if(typeof url==='string'&&/^https:\/\//i.test(url)){const img=node('img');img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.src=url;img.addEventListener('error',()=>img.remove(),{once:true});box.append(img);}return box;}
    const entries=(data.podcasts||[]).flatMap(program=>(program.episodes||[]).map(row=>({row,program,revision:0})));
    let newest=[],oldest=[];
    function syncMetadata(){
      let reordered=!newest.length;
      const fields=['title','published','date','description','duration','position','positionState','sourceVersion','episodeIdentity','entryId','sourceBinding','podcastWorkspace','lastListenedAt'];
      for(const entry of entries){
        const {row,program}=entry,values=fields.map(field=>row[field]);values.push(program.title,program.publisher);
        if(entry.values&&values.every((value,index)=>entry.values[index]===value))continue;
        const raw=row.published||row.date||0;
        if(!entry.values||entry.rawDate!==raw){entry.rawDate=raw;entry.publishedAt=new Date(raw).getTime()||0;entry.date=dateLabel(raw);reordered=true;}
        entry.search=[row.title,program.title,program.publisher].join(' ').toLocaleLowerCase();entry.values=values;entry.revision++;
      }
      if(reordered){newest=entries.slice().sort((a,b)=>b.publishedAt-a.publishedAt);oldest=entries.slice().sort((a,b)=>a.publishedAt-b.publishedAt);}
    }
    counts.append(node('b','',String((data.podcasts||[]).length)),document.createTextNode(t(' subscriptions · ',' abonelik · ')),node('b','',String(entries.length)),document.createTextNode(t(' episodes listed in your library',' bölüm kütüphanede listeleniyor')));counts.title=t('Listed episodes do not mean downloaded audio and may not include the full publisher catalogue. Spotify episode counts are unknown.','Listelenen bölümler ses dosyalarının indirildiği anlamına gelmez; yayıncının bütün arşivini kapsamayabilir. Spotify bölüm sayıları bilinmiyor.');
    const saved=r=>!!r.sourceVersion&&r.podcastWorkspace?.sourceVersion===r.sourceVersion&&!!(r.podcastWorkspace?.transcript?.hasText||r.podcastWorkspace?.transcript?.text?.trim());
    const sort=node('select','pl-sort');sort.setAttribute('aria-label',t('Episode order','Bölüm sırası'));for(const [v,label]of [['newest',t('Newest','En yeni')],['oldest',t('Oldest','En eski')],['listened',t('Last observed listening','Son oynatma gözlemi')]]){const o=node('option','',label);o.value=v;sort.append(o);}sort.addEventListener('change',()=>{state.sort=sort.value;paint();});
    listControls.append(filters,search,sort);
    function transcript(entry){const {row,program}=entry,box=node('div','pl-transcript');box.append(node('strong','',saved(row)?t('Saved transcript','Kayıtlı transkript'):t('Transcript','Transkript')));const chips=node('div','pl-chips');if(saved(row))chips.append(node('span','pl-ready',row.podcastWorkspace.transcript.status==='partial'?t('Partial original','Kısmi özgün'):row.podcastWorkspace.transcript.state==='untimed'?t('Original · read only','Özgün · salt okunur'):t('Original saved','Özgün kayıtlı')));const coverage=saved(row)&&row.podcastWorkspace.transcript.coverage;if(coverage&&Number.isFinite(coverage.start)&&coverage.start>=0&&Number.isFinite(coverage.end)&&coverage.end>coverage.start){const time=value=>Math.floor(value/60)+':'+String(Math.floor(value%60)).padStart(2,'0');chips.append(node('span','pl-ready pl-coverage',t('Selected interval','Seçili aralık')+' · '+time(coverage.start)+'–'+time(coverage.end)));}if(ready(row))chips.append(node('span','pl-ready',t('Translation saved','Çeviri kayıtlı')));if(row.positionState==='needs-review')chips.append(node('span','pl-ready',t('Source timing needs review','Kaynak zamanı inceleme gerektiriyor')));box.append(chips);if(!saved(row))box.append(node('p','pl-meta',row.transcriptDescriptors?.length?t('Publisher transcripts available. Choose language and timing in the player tools.','Yayıncı transkriptleri var. Oynatıcı araçlarında dili ve zamanlamayı seç.'):t('No saved transcript for this source version.','Bu kaynak sürümünün kayıtlı transkripti yok.')));box.append(button(saved(row)?(ready(row)?t('Open original + translation','Özgün + çeviriyle aç'):t('Open original','Özgünü aç')):t('Whisper & transcript tools','Whisper ve transkript araçları'),async()=>{if(await play(entry,'podcast')&&!saved(row))await actions.transcriptTools?.(program,row);},'mh-text-button pl-transcript-open'));return box;}
    function episodeNotes(entry){
      if(typeof actions.listEpisodeNotes!=='function')return null;
      const {row,program}=entry,wrap=node('section','pl-saved-notes'),toggle=node('button','mh-action pl-notes-toggle',t('Saved passages & notes','Kayıtlı pasajlar ve notlar')),body=node('div','pl-notes-body'),status=node('p','pl-meta pl-notes-status'),list=node('div','pl-notes-list');
      wrap.dataset.sourceEntryId=row.entryId||'';
      const identity=()=>String(row.episodeIdentity||row.sourceBinding?.episodeIdentity||''),entryId=()=>String(row.entryId||'');
      const sourceKey=()=>JSON.stringify([entryId(),identity(),row.sourceVersion||'']);
      const belongs=note=>note?.mediaType==='podcast'&&((entryId()&&note.sourceEntryId===entryId())||(identity()&&(note.episodeIdentity||note.sourceBinding?.episodeIdentity)===identity()));
      toggle.type='button';toggle.setAttribute('aria-expanded','false');body.hidden=true;status.setAttribute('role','status');body.append(status,list);wrap.append(toggle,body);
      if(!entryId()&&!identity()){toggle.disabled=true;toggle.title=t('Episode identity is unavailable.','Bölüm kimliği kullanılamıyor.');return wrap;}
      let loading=false,loaded=false,loadedKey='';
      const refresh=button(t('Refresh notes','Notları yenile'),()=>load(),'mh-text-button pl-notes-refresh');
      body.append(refresh);
      async function load(){
        if(disposed||loading)return;loading=true;loaded=false;const key=sourceKey();list.replaceChildren();status.textContent=t('Loading saved passages and notes…','Kayıtlı pasajlar ve notlar yükleniyor…');body.setAttribute('aria-busy','true');refresh.disabled=true;
        try{
          const result=await actions.listEpisodeNotes(program,row);
          if(disposed||!wrap.isConnected)return;
          if(sourceKey()!==key)throw Error(t('Episode changed. Close and reopen its notes.','Bölüm değişti. Notlarını kapatıp yeniden açın.'));
          if(!result?.ok||!Array.isArray(result.annotations))throw Error(t('Saved notes could not be loaded. Try again.','Kayıtlı notlar yüklenemedi. Yeniden deneyin.'));
          const notes=result.annotations.filter(belongs).sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0));
          loaded=true;loadedKey=key;toggle.textContent=t('Saved passages & notes','Kayıtlı pasajlar ve notlar')+' ('+notes.length+')';
          status.textContent=notes.length?t('From your research notebook.','Araştırma defterinizden.'):t('No saved passages, words or notes for this episode yet.','Bu bölüm için henüz kayıtlı pasaj, sözcük veya not yok.');
          for(const note of notes){
            const card=node('article','pl-note'),head=node('div','pl-note-head');
            const timed=note.timed!==false&&note.start!==null&&note.start!==undefined&&Number.isFinite(Number(note.start))&&Number(note.start)>=0;
            const label=note.type==='word'?t('Word','Sözcük'):note.type==='note'?t('Note','Not'):t('Passage','Pasaj');
            const seconds=timed?Math.floor(Number(note.start)):null,time=timed?Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):t('Untimed','Zamansız');
            head.append(node('span','pl-meta',label+' · '+time));card.append(head);
            if(note.source)card.append(node('blockquote','pl-note-source',note.source));if(note.translation)card.append(node('p','pl-note-translation',note.translation));if(note.note)card.append(node('p','pl-note-text',note.note));
            if(typeof actions.openEpisodeNote==='function'){
              const open=button(timed?t('Open saved sentence','Kayıtlı cümleyi aç'):t('Open episode','Bölümü aç'),async()=>{if(disposed||sourceKey()!==key)return;try{const result=await actions.openEpisodeNote(note);if(result===false)throw Error();}catch{status.textContent=t('The episode could not be opened. Your note is preserved.','Bölüm açılamadı. Notunuz korunuyor.');}},'mh-text-button pl-note-open');card.append(open);
            }
            list.append(card);
          }
        }catch{if(!disposed&&wrap.isConnected)status.textContent=sourceKey()!==key?t('Episode changed. Close and reopen its notes.','Bölüm değişti. Notlarını kapatıp yeniden açın.'):t('Saved notes could not be loaded. Try again.','Kayıtlı notlar yüklenemedi. Yeniden deneyin.');}
        finally{loading=false;if(!disposed&&wrap.isConnected){body.setAttribute('aria-busy','false');refresh.disabled=false;}}
      }
      const mountedKey=sourceKey();
      toggle.addEventListener('click',()=>{if(disposed||sourceKey()!==mountedKey)return;body.hidden=!body.hidden;toggle.setAttribute('aria-expanded',String(!body.hidden));if(body.hidden)openedEpisodeNotes.delete(mountedKey);else openedEpisodeNotes.add(mountedKey);if(!body.hidden&&(!loaded||loadedKey!==sourceKey()))void load();});
      if(openedEpisodeNotes.has(mountedKey))queueMicrotask(()=>{if(disposed||!wrap.isConnected||sourceKey()!==mountedKey||!openedEpisodeNotes.has(mountedKey))return;body.hidden=false;toggle.setAttribute('aria-expanded','true');const extras=wrap.closest('.pl-episode-extras');if(extras)extras.open=true;void load();});
      return wrap;
    }
    const readiness=state=>({ready:t('Saved','Kayıtlı'),complete:t('Complete','Tamam'),partial:t('Partial','Kısmi'),stale:t('Earlier source revision','Önceki kaynak sürümü'),missing:t('Not saved','Kayıtlı değil')})[state]||t('Unknown','Bilinmiyor');
    function resumePreview(entry){
      const {row,program}=entry,box=node('details','pl-completion');let reading=false;const savedText=node('div','pl-saved-text');box.append(node('summary','',t('Review exact resume target','Kesin devam hedefini incele')));
      const key=()=>JSON.stringify([row.entryId||row.id,row.episodeIdentity,row.sourceVersion,row.url,row.positionState,row.position,row.sourceBinding,row.localSource]),owner=key(),state=completion(row);
      const sourceSummary=node('p','pl-meta');box.append(sourceSummary);
      const paintSource=()=>{if(key()!==owner){sourceSummary.textContent=t('Source changed; close and reopen the preview.','Kaynak değişti; önizlemeyi kapatıp yeniden açın.');return;}const snapshot=actions.playbackSnapshot?.(),same=!!snapshot&&!!(row.entryId&&snapshot.entryId===row.entryId||row.episodeIdentity&&snapshot.episodeIdentity===row.episodeIdentity)&&snapshot.sourceVersion===row.sourceVersion;
      sourceSummary.textContent=[program.title,row.title,t('Source revision: ','Kaynak sürümü: ')+(row.sourceVersion||t('unknown','bilinmiyor')),t('Episode: ','Bölüm: ')+(row.episodeIdentity||row.entryId||t('unknown','bilinmiyor')),t('Position: ','Konum: ')+(Number.isFinite(row.position)?row.position+' s':t('unknown','bilinmiyor')),t('Original / translation: ','Özgün / çeviri: ')+readiness(state.transcript)+' / '+readiness(state.translation),same?t('This is the current playback source.','Şu anki oynatma kaynağı bu.'):t('Not the current verified playback source.','Şu anki doğrulanmış oynatma kaynağı değil.')].join(' · ')+t(' · Playback summary: ',' · Oynatma özeti: ')+(snapshot?(snapshot.title||snapshot.entryId||'?')+' · '+(snapshot.paused===false?t('not paused','duraklatılmamış'):t('paused/unverified','duraklatılmış/doğrulanmadı')):t('unknown','bilinmiyor'));};
      box.addEventListener('toggle',()=>{if(box.open)paintSource();});paintSource();
      box.append(button(t('Continue to this target','Bu hedefe devam et'),async()=>{if(disposed||key()!==owner){message.textContent=t('Source changed; reopen the target preview.','Kaynak değişti; hedef önizlemesini yeniden açın.');return;}await play(entry,'podcast');},'mh-text-button'));
      if(typeof actions.readWorkspace==='function')box.append(button(t('Read saved text only','Yalnız kayıtlı metni oku'),async()=>{if(reading)return;reading=true;const status=node('p','pl-meta',t('Reading local workspace…','Yerel çalışma okunuyor…'));savedText.replaceChildren(status);try{const result=await actions.readWorkspace(row);if(disposed||!box.isConnected)return;if(key()!==owner){status.textContent=t('Source changed; reopen saved text.','Kaynak değişti; kayıtlı metni yeniden açın.');return;}if(!result?.ok||result.sourceVersion!==row.sourceVersion)throw Error(t('Source changed or workspace unavailable.','Kaynak değişti veya çalışma kullanılamıyor.'));const w=result.workspace,current=w?.sourceVersion===row.sourceVersion;const tracks=[[current?'Original':'Earlier/unverified original · read only',current?'Özgün':'Önceki/doğrulanmamış özgün · salt okunur',w?.transcript],[current?'Translation':'Earlier/unverified translation · read only',current?'Çeviri':'Önceki/doğrulanmamış çeviri · salt okunur',w?.translation],['Earlier original · read only','Önceki özgün · salt okunur',w?.previous?.transcript],['Earlier translation · read only','Önceki çeviri · salt okunur',w?.previous?.translation]];status.textContent=t('Local text only; no playback, download, translation or seek.','Yalnız yerel metin; oynatma, indirme, çeviri veya atlama yok.');let found=false;for(const [en,tr,track]of tracks){if(!track?.text)continue;found=true;const section=node('details','pl-completion');section.append(node('summary','',t(en,tr)+' · '+readiness(track.status)),node('p','pl-description',track.text.slice(0,50000)));if(track.text.length>50000)section.append(node('small','',t('First 50,000 characters shown.','İlk 50.000 karakter gösteriliyor.')));savedText.append(section);}if(!found)status.textContent=t('No readable text returned here; inspect existing transcript tools. No generation was started.','Bu görünümde okunabilir metin dönmedi; mevcut transkript araçlarını inceleyin. Üretim başlatılmadı.');}catch(error){if(!disposed&&key()===owner)status.textContent=error.message;}finally{reading=false;}},'mh-text-button'));
      box.append(savedText);return box;
    }
    function episodeHeading(entry,hero){const heading=node(hero?'h2':'h3');if(hero){heading.textContent=entry.row.title;heading.tabIndex=-1;return heading;}const select=button(entry.row.title,()=>{state.selected=entry;paint();content.scrollIntoView?.({block:'start',behavior:'auto'});content.querySelector('.pl-hero h2')?.focus({preventScroll:true});},'pl-episode-select');select.setAttribute('aria-label',t('Inspect episode: ','Bölümü incele: ')+entry.row.title);heading.append(select);return heading;}
    async function play(entry,scene){const intent=++playIntent;const result=await actions.play(entry.program,entry.row,scene);if(disposed||intent!==playIntent)return false;if(result===false||result?.ok===false){message.textContent=result?.error||t('Playback could not start. Retry from the episode.','Oynatma başlatılamadı. Bölümden yeniden dene.');return false;}message.textContent='';paintQueue();return true;}
    function episode(entry,hero=false){const {row,program}=entry,card=node('article',hero?'pl-hero':'pl-episode');card.append(art(row,program));const copy=node('div','pl-episode-copy');copy.append(node('p','pl-eyebrow',hero?(continuing(row)?t('CONTINUE LISTENING','DİNLEMEYE DEVAM ET'):t('START LISTENING','DİNLEMEYE BAŞLA')):program.title),episodeHeading(entry,hero));const metadata=[hero?program.title:'',entry.date,Number(row.duration)>0?Math.ceil(row.duration/60)+' '+t('min','dk'):''].filter(Boolean);if(metadata.length)copy.append(node('p','pl-meta',metadata.join(' · ')));if(hero&&row.description)copy.append(node('p','pl-description',descriptionText(row.description)));const availability=node('p','pl-availability',saved(row)?(ready(row)?t('Original and translation saved','Özgün ve çeviri kayıtlı'):t('Original transcript saved','Özgün transkript kayıtlı')):ready(row)?t('Translation saved · original unavailable','Çeviri kayıtlı · özgün yok'):t('No saved transcript','Kayıtlı transkript yok'));copy.append(availability,completionPanel(row),resumePreview(entry));
      const reasons=attention(row);if(reasons.length)copy.append(node('p','pl-meta',reasons.map(reason=>reason==='source'?t('Source changed; inspect earlier text','Kaynak değişmiş; önceki metni inceleyin'):reason==='translation'?t('Partial translation; inspect coverage before retry','Kısmi çeviri; yeniden denemeden önce kapsamı inceleyin'):t('Offline audio availability unverified','Çevrimdışı ses varlığı doğrulanmadı')).join(' · ')));
      copy.append(node('p','pl-meta',t('Last observed listening: ','Son oynatma gözlemi: ')+(Number.isFinite(row.lastListenedAt)&&row.lastListenedAt>0?new Date(row.lastListenedAt).toLocaleString(window.UiLocale?.get?.()==='tr'?'tr-TR':'en-US'):t('unknown; publication/import dates are not listening','bilinmiyor; yayın/aktarım tarihi dinleme değildir'))));if(ready(row))copy.append(node('span','pl-ready',t('Saved translation','Kayıtlı çeviri')));if(continuing(row)){const time=seconds=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');copy.append(node('p','pl-listen-position',time(row.position)+(Number(row.duration)>0?' / '+time(row.duration)+' · '+Math.round(row.position/row.duration*100)+'%':' · '+t('Duration unknown','Süre bilinmiyor'))));if(Number(row.duration)>0){const progress=node('progress','pl-progress');progress.max=row.duration;progress.value=row.position;progress.setAttribute('aria-label',t('Listening progress','Dinleme ilerlemesi'));copy.append(progress);}}
      const controls=node('div','pl-episode-actions');controls.append(button(hero?(continuing(row)?t('Continue','Devam et'):t('Listen','Dinle')):t('Listen','Dinle'),()=>play(entry,hero?'podcast':false),'mh-action '+(hero?'mh-primary':'')));controls.append(button(t('Bilingual study','Çift dilli çalış'),()=>play(entry,'bilingual'),'mh-text-button pl-study'),button(t('Add to queue','Kuyruğa ekle'),async()=>{await actions.enqueue(program,row);paintQueue();},'mh-text-button pl-enqueue'));controls.querySelector('.pl-enqueue')._podcastEntry=entry;copy.append(controls);const notes=episodeNotes(entry);const extras=node('details','pl-episode-extras');extras.append(node('summary','',t('Episode tools & notes','Bölüm araçları ve notlar')));if(notes)extras.append(notes);{const first=copy.querySelector('.pl-meta');for(const n of [...copy.children])if(n!==first&&n.matches('.pl-meta,.pl-completion'))extras.append(n);}
      if(!saved(row)&&!ready(row))availability.remove();/* transkript yoksa "yok" uyarısı yazılmaz */if(hero){const sleeve=node('div','pl-record'),art=card.firstChild,disc=node('i','pl-disc'),ripple=node('i','pl-ripple');disc.setAttribute('aria-hidden','true');ripple.setAttribute('aria-hidden','true');sleeve.append(ripple,disc,art);card.append(sleeve);extras.append(transcript(entry));}else extras.append(transcript(entry));if(actions.episodeTools){const tools=node('div','pl-episode-tools');actions.episodeTools(tools,program,row);extras.append(tools);}copy.append(extras);card.append(copy);return card;}
    function paintQueue(){if(disposed)return;queue.replaceChildren();const q=actions.queue();const rows=q.rows||[];for(const button of layout.querySelectorAll('.pl-enqueue')){const entry=button._podcastEntry;if(!entry)continue;const count=rows.filter(item=>entry.row.canonicalFeed?item.entryId===entry.row.entryId:item.id===entry.program.id&&(entry.row.episodeIdentity?item.episodeIdentity===entry.row.episodeIdentity:item.url===entry.row.url)).length;button.textContent=count?t('Queued','Kuyrukta')+' · '+count:t('Add to queue','Kuyruğa ekle');button.setAttribute('aria-label',button.textContent+' · '+entry.row.title);}const start=Math.max(0,Math.min(q.index-1,rows.length-8));for(const [relative,row]of rows.slice(start,start+8).entries()){const i=start+relative;const item=node('div','pl-queue-row');item.append(node('span','pl-queue-number',String(i+1)),art(row,{title:row.publisher||row.title}),button((row.queueError?t('Retry · ','Yeniden dene · '):'')+row.title,()=>actions.playQueued(row.queueKey),'mh-text-button pl-queue-play'));if(i===q.index)item.setAttribute('aria-current','true');if(i===q.index+1)item.dataset.next='true';const detail=node('small','pl-queue-state',[i===q.index?t('Current','Şu an'):i===q.index+1?t('Next','Sıradaki'):'',row.scene==='bilingual'?t('Bilingual','Çift dilli'):''].filter(Boolean).join(' · '));if(Number.isFinite(row.duration)&&row.duration>0)detail.textContent+=' · '+Math.floor(row.duration/60)+':'+String(Math.floor(row.duration%60)).padStart(2,'0');if(row.queueError)detail.textContent+=' · '+row.queueError;item.append(detail);queue.append(item);}if(!rows.length)queue.append(node('p','pl-meta',t('Choose an episode to start your queue.','Kuyruğa başlamak için bir bölüm seç.')));}
    const fullProgram=node('p','pl-full-program');fullProgram.setAttribute('aria-live','polite');programs.after(fullProgram);function programSummary(p){fullProgram.textContent=p?[p.title,p.publisher].filter(Boolean).join(' · '):t('All subscribed shows','Abone olunan tüm yayınlar');}
    function paintPrograms(){programSummary((data.podcasts||[]).find(p=>p.id===state.program));
      programs.replaceChildren();const all=button('',()=>{state.program='';state.selected=null;state.limit=60;paint();},'pl-program pl-all');all.dataset.program='';all.append(node('span','pl-all-art','☷'),node('span','pl-program-name',t('All shows','Tüm yayınlar')),node('small','',String((data.podcasts||[]).length)));all.setAttribute('aria-pressed',String(!state.program));programs.append(all);
      for(const p of data.podcasts||[]){const b=button('',()=>{state.program=p.id;state.selected=null;state.limit=60;paint();},'pl-program');b.dataset.program=p.id;b.title=p.title;b.addEventListener('focus',()=>programSummary(p));b.addEventListener('blur',()=>programSummary((data.podcasts||[]).find(p=>p.id===state.program)));b.append(art({},p),node('span','pl-program-name',p.title),node('small','',p.sourceKind==='spotify'?'Spotify':String((p.episodes||[]).length)));b.setAttribute('aria-pressed',String(state.program===p.id));programs.append(b);}
    }
    function paint(){
      if(disposed)return;
      syncMetadata();
      const focusedProgram=programs.contains(document.activeElement)?document.activeElement.dataset.program:null;
      filters.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===state.filter)));
      programs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.program===state.program)));
      const q=state.query.toLocaleLowerCase(),rows=(state.sort==='listened'?entries.slice().sort((a,b)=>listeningAt(b.row)-listeningAt(a.row)):state.sort==='oldest'?oldest:newest).filter(({row,program,search})=>(!state.program||program.id===state.program)&&(!q||search.includes(q))&&(state.filter!=='ready'||ready(row))&&(state.filter!=='saved'||saved(row))&&(state.filter!=='continue'||continuing(row))&&(state.filter!=='local'||!!row.localSource)&&(state.filter!=='work'||attention(row).length>0)&&(state.filter!=='unknown-duration'||continuing(row)&&!(Number(row.duration)>0)));
      const resumed=rows.filter(({row})=>continuing(row)),featured=state.selected&&rows.includes(state.selected)?state.selected:resumed[0]||rows[0];
      const spotifyPrograms=(data.podcasts||[]).filter(p=>p.sourceKind==='spotify'&&state.filter==='all'&&(!state.program||state.program===p.id)&&(!q||p.title.toLocaleLowerCase().includes(q)));
      const spotifyKey=JSON.stringify([!!state.program,spotifyPrograms.map(p=>p.id)]);
      if(featured!==lastFeatured||featured?.revision!==lastFeaturedRevision||spotifyKey!==lastSpotify){
        lastFeatured=featured;lastFeaturedRevision=featured?.revision;lastSpotify=spotifyKey;content.replaceChildren();
      for(const program of spotifyPrograms){const card=node('article','pl-episode pl-spotify');card.append(art({},program));const copy=node('div','pl-episode-copy');copy.append(node('p','pl-eyebrow',t('SPOTIFY SOURCE','SPOTIFY KAYNAĞI')),node('h3','',program.title),node('p','pl-description',t('Listen in your existing browser. Live Whisper processes the system audio you hear in real time after your consent.','Mevcut tarayıcında dinle. Canlı Whisper, onayınla duyduğun sistem sesini gerçek zamanlı işler.')),button(t('Listen in Spotify','Spotify’da dinle'),()=>actions.openSpotify(program.url),'mh-action mh-primary'),node('p','pl-meta',t('Episode count unknown. Spotify and RSS keep separate source identities, transcripts and timelines.','Bölüm sayısı bilinmiyor. Spotify ve RSS ayrı kaynak kimliklerini, transkriptlerini ve zaman eksenlerini korur.')));card.append(copy);if(state.program){const stage=node('section','pl-stage');stage.append(card,side);content.append(stage);}else content.append(card);}

      if(featured){const stage=node('section','pl-stage');stage.append(episode(featured,true),side);content.prepend(stage);   /* devam/kuyruk üstte, filtre doğrudan altındaki bölüm listesinin üzerinde */const jump=button(t('Go to episodes','Bölümlere git'),()=>{const target=section.querySelector('h2');section.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});target?.focus({preventScroll:true});},'mh-text-button pl-jump');}   /* filtre artık listenin hemen üstünde; "Bölümlere git" yaması gerekmez */
      }
      const section=node('section','pl-section'),title=node('div','pl-section-heading');const episodesHeading=node('h2','',state.query?t('Search results','Arama sonuçları'):t('Episodes','Bölümler'));episodesHeading.tabIndex=-1;title.append(episodesHeading,node('span','pl-meta',String(rows.length)+' '+t('episodes','bölüm')));section.append(title);const archive=node('details','pl-archive-scope');archive.append(node('summary','',t('Loaded archive scope','Yüklü arşiv kapsamı')));const pool=entries.filter(e=>!state.program||e.program.id===state.program);archive.append(node('p','pl-meta',t('Loaded locally: ','Yerelde yüklü: ')+pool.length+' · '+t('matching: ','eşleşen: ')+rows.length+' · '+t('shown: ','gösterilen: ')+Math.min(rows.length,state.limit)),node('p','pl-meta',t('Personal records retained: ','Kişisel kaydı korunan: ')+pool.filter(e=>e.row.personalWorkRetained===true||e.row.localSource||e.row.podcastWorkspace||e.row.saved).length),node('p','pl-description',t('Publisher total and remaining older episodes are unknown. A rolling feed omitting an episode is not a deletion request. Load more shows locally loaded rows; it does not fetch older episodes.','Yayıncı toplamı ve kalan eski bölüm sayısı bilinmiyor. Dönen akışta bölümün görünmemesi silme isteği değildir. Daha fazla göster yerelde yüklü satırları açar; eski bölüm indirmez.')));section.append(archive);const program=(data.podcasts||[]).find(p=>p.id===state.program);if(program?.archiveInfo){archive.append(node('p','pl-meta',t('Last successful refresh additions: ','Son başarılı yenilemede eklenen: ')+(program.archiveInfo.lastNew??t('unknown','bilinmiyor'))),node('p','pl-description',program.archiveInfo.initial==='latest20'?t('Initial import selected the latest 20; this is not the publisher archive total.','İlk içe aktarım son 20 bölümü seçti; yayıncı arşiv toplamı değildir.'):t('Initial import used a bounded source snapshot; publisher history remains unknown.','İlk içe aktarım sınırlı kaynak örneğini kullandı; yayıncı geçmişi bilinmiyor.')));}if(program&&actions.refreshPodcast&&!['spotify','web-episode'].includes(program.sourceKind))title.append(button(t('Refresh show','Yayını yenile'),()=>actions.refreshPodcast(program),'mh-text-button'));if(program?.state==='failed')section.append(node('p','pl-meta',t('This source did not answer. Saved episodes and transcripts are kept.','Bu kaynak yanıt vermedi. Kayıtlı bölümler ve transkriptler duruyor.')));const list=node('div','pl-episodes');for(const e of rows.slice(0,state.limit))list.append(episode(e));section.append(list);if(!rows.length&&!spotifyPrograms.length)section.append(node('p','pl-empty',entries.length?t('No matching episodes. Try another search or filter.','Eşleşen bölüm yok. Aramayı veya filtreyi değiştir.'):t('Add a podcast RSS feed or open your own audio file to begin.','Başlamak için podcast RSS akışı ekle veya kendi ses dosyanı aç.')));if(rows.length>state.limit)section.append(button(t('Load more episodes','Daha fazla bölüm göster'),()=>{state.limit+=60;paint();},'mh-action pl-more'));listContent.replaceChildren(section);if(!content.contains(side))content.append(side);paintQueue();if(focusedProgram!==null)[...programs.querySelectorAll('button')].find(b=>b.dataset.program===focusedProgram)?.focus({preventScroll:true});
    }
    search.addEventListener('input',()=>{state.query=search.value;state.limit=60;paint();});paintPrograms();paint();
    window.PlayerUiKit?.enhanceControls(listControls);
    const unsubscribe=actions.subscribeQueue?.(paintQueue);
    return ()=>{disposed=true;if(ownsNoteDisclosures)openedEpisodeNotes.clear();playIntent++;unsubscribe?.();};
  }
  window.PodcastLibraryUI=Object.freeze({mount,completion,attention});
})();
