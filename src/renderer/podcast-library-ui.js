(() => {
  'use strict';
  const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
  const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const continuing=r=>r.positionState!=='needs-review'&&Number(r.position)>0&&Number(r.duration)>Number(r.position)+2;
  const ready=r=>!!r.sourceVersion&&r.podcastWorkspace?.sourceVersion===r.sourceVersion&&r.podcastWorkspace?.translation?.status!=='partial'&&!!(r.podcastWorkspace?.translation?.hasText||r.podcastWorkspace?.translation?.text?.trim());
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
    const button=(label,fn,cls='mh-action')=>{const b=node('button',cls,label);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(e){message.textContent=e.message;}finally{b.disabled=false;}});return b;};
    const search=node('input','pl-search');search.type='search';search.placeholder=t('Search episodes or shows','Bölüm veya yayın ara');search.setAttribute('aria-label',search.placeholder);
    rail.setAttribute('aria-label',t('Your subscriptions','Aboneliklerin'));
    const filters=node('div','pl-filters');
    for(const [key,label]of [['all',t('All','Tümü')],['continue',t('In progress','Yarım kalan')],['saved',t('Transcript saved','Transkript kayıtlı')],['ready',t('Translation saved','Çevirisi kayıtlı')],['local',t('Local copy','Yerel kopya')]]){const b=button(label,()=>{state.filter=key;state.limit=60;paint();},'mh-text-button');b.dataset.filter=key;filters.append(b);}
    const programs=node('div','pl-programs');programs.setAttribute('role','group');programs.setAttribute('aria-label',t('Shows','Yayınlar'));rail.append(programs);
    const head=node('header','pl-heading'),heading=node('h1','',t('Podcast','Podcast')),intro=node('div','pl-intro'),counts=node('p','pl-counts');intro.append(heading,counts);
    const headActions=node('div','pl-head-actions');headActions.append(button(t('Radio & tools','Radyo ve araçlar'),()=>{classic.open=true;classic.dispatchEvent(new Event('toggle'));classic.scrollIntoView?.({block:'start'});}),button(t('Open local file','Yerel dosyadan aç'),actions.openLocal),button(t('Add podcast link','Podcast bağlantısı ekle'),actions.addRss,'mh-action mh-primary pl-add'));head.append(intro,headActions);main.append(message);
    const content=node('div','pl-content');main.append(content);
    const listControls=node('div','pl-list-tools'),listContent=node('div','pl-list-content');main.append(listControls,listContent);
    const queueHead=node('div','pl-queue-heading');queueHead.append(node('h2','',t('Up next','Sıradakiler')),button(t('Manage','Yönet'),actions.openQueue,'mh-text-button'));side.append(queueHead);const queue=node('div','pl-queue');side.append(queue);
    const classic=node('details','pl-classic');classic.append(node('summary','',t('Radio & advanced library tools','Radyo ve ileri kütüphane araçları')));const classicBody=node('div','pl-classic-body');classic.append(classicBody);main.append(classic);let classicMounted=false;classic.addEventListener('toggle',()=>{if(classic.open&&!classicMounted){classicMounted=true;actions.classic(classicBody);}});
    layout.append(head,rail,main);root.append(layout);
    function art(row,program){const box=node('div','pl-art',(row.title||program.title||'?').split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toLocaleUpperCase());const url=row.image||program.image;if(typeof url==='string'&&/^https:\/\//i.test(url)){const img=node('img');img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.src=url;img.addEventListener('error',()=>img.remove(),{once:true});box.append(img);}return box;}
    const entries=(data.podcasts||[]).flatMap(program=>(program.episodes||[]).map(row=>({row,program,revision:0})));
    let newest=[],oldest=[];
    function syncMetadata(){
      let reordered=!newest.length;
      const fields=['title','published','date','description','duration','position','positionState','sourceVersion','episodeIdentity','entryId','sourceBinding','podcastWorkspace'];
      for(const entry of entries){
        const {row,program}=entry,values=fields.map(field=>row[field]);values.push(program.title,program.publisher);
        if(entry.values&&values.every((value,index)=>entry.values[index]===value))continue;
        const raw=row.published||row.date||0;
        if(!entry.values||entry.rawDate!==raw){entry.rawDate=raw;entry.publishedAt=new Date(raw).getTime()||0;entry.date=dateLabel(raw);reordered=true;}
        entry.search=[row.title,program.title,program.publisher].join(' ').toLocaleLowerCase();entry.values=values;entry.revision++;
      }
      if(reordered){newest=entries.slice().sort((a,b)=>b.publishedAt-a.publishedAt);oldest=entries.slice().sort((a,b)=>a.publishedAt-b.publishedAt);}
    }
    counts.append(node('b','',String((data.podcasts||[]).length)),document.createTextNode(t(' subscriptions · ',' abonelik · ')),node('b','',String(entries.length)),document.createTextNode(t(' episodes loaded on this device',' bölüm bu cihazda yüklü')));counts.title=t('Loaded records are not the full publisher catalogue. Spotify episode counts are unknown.','Yüklü kayıtlar yayıncının bütün arşivi değildir. Spotify bölüm sayıları bilinmiyor.');
    const saved=r=>!!r.sourceVersion&&r.podcastWorkspace?.sourceVersion===r.sourceVersion&&!!(r.podcastWorkspace?.transcript?.hasText||r.podcastWorkspace?.transcript?.text?.trim());
    const sort=node('select','pl-sort');sort.setAttribute('aria-label',t('Episode order','Bölüm sırası'));for(const [v,label]of [['newest',t('Newest','En yeni')],['oldest',t('Oldest','En eski')]]){const o=node('option','',label);o.value=v;sort.append(o);}sort.addEventListener('change',()=>{state.sort=sort.value;paint();});
    listControls.append(filters,search,sort);
    function transcript(entry){const {row,program}=entry,box=node('div','pl-transcript');box.append(node('strong','',saved(row)?t('Saved transcript','Kayıtlı transkript'):t('Transcript','Transkript')));const chips=node('div','pl-chips');if(saved(row))chips.append(node('span','pl-ready',row.podcastWorkspace.transcript.status==='partial'?t('Partial original','Kısmi özgün'):row.podcastWorkspace.transcript.state==='untimed'?t('Original · read only','Özgün · salt okunur'):t('Original saved','Özgün kayıtlı')));const coverage=saved(row)&&row.podcastWorkspace.transcript.coverage;if(coverage&&Number.isFinite(coverage.start)&&coverage.start>=0&&Number.isFinite(coverage.end)&&coverage.end>coverage.start){const time=value=>Math.floor(value/60)+':'+String(Math.floor(value%60)).padStart(2,'0');chips.append(node('span','pl-ready pl-coverage',t('Selected interval','Seçili aralık')+' · '+time(coverage.start)+'–'+time(coverage.end)));}if(ready(row))chips.append(node('span','pl-ready',t('Translation saved','Çeviri kayıtlı')));if(row.positionState==='needs-review')chips.append(node('span','pl-ready',t('Source timing needs review','Kaynak zamanı inceleme gerektiriyor')));box.append(chips);if(!saved(row))box.append(node('p','pl-meta',row.transcriptDescriptors?.length?t('Publisher transcripts available. Choose language and timing in the player tools.','Yayıncı transkriptleri var. Oynatıcı araçlarında dili ve zamanlamayı seç.'):t('No saved transcript for this source version.','Bu kaynak sürümünün kayıtlı transkripti yok.')));box.append(button(saved(row)?(ready(row)?t('Open original + translation','Özgün + çeviriyle aç'):t('Open original','Özgünü aç')):t('Whisper & transcript tools','Whisper ve transkript araçları'),async()=>{if(await play(entry,'podcast')&&!saved(row))await actions.transcriptTools?.(program,row);},'mh-text-button pl-transcript-open'));return box;}
    function episodeNotes(entry){
      if(typeof actions.listEpisodeNotes!=='function')return null;
      const {row,program}=entry,wrap=node('section','pl-saved-notes'),toggle=node('button','mh-text-button pl-notes-toggle',t('Saved passages & notes','Kayıtlı pasajlar ve notlar')),body=node('div','pl-notes-body'),status=node('p','pl-meta pl-notes-status'),list=node('div','pl-notes-list');
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
      if(openedEpisodeNotes.has(mountedKey))queueMicrotask(()=>{if(disposed||!wrap.isConnected||sourceKey()!==mountedKey||!openedEpisodeNotes.has(mountedKey))return;body.hidden=false;toggle.setAttribute('aria-expanded','true');void load();});
      return wrap;
    }
    async function play(entry,scene){const intent=++playIntent;await actions.play(entry.program,entry.row,scene);if(disposed||intent!==playIntent)return false;paintQueue();return true;}
    function episode(entry,hero=false){const {row,program}=entry,card=node('article',hero?'pl-hero':'pl-episode');card.append(art(row,program));const copy=node('div','pl-episode-copy');copy.append(node('p','pl-eyebrow',hero?(continuing(row)?t('CONTINUE LISTENING','DİNLEMEYE DEVAM ET'):t('START LISTENING','DİNLEMEYE BAŞLA')):program.title),node(hero?'h2':'h3','',row.title));const metadata=[hero?program.title:'',entry.date,Number(row.duration)>0?Math.ceil(row.duration/60)+' '+t('min','dk'):''].filter(Boolean);if(metadata.length)copy.append(node('p','pl-meta',metadata.join(' · ')));if(hero&&row.description)copy.append(node('p','pl-description',descriptionText(row.description)));if(ready(row))copy.append(node('span','pl-ready',t('Saved translation','Kayıtlı çeviri')));if(continuing(row)){const progress=node('progress','pl-progress');progress.max=row.duration;progress.value=row.position;progress.setAttribute('aria-label',t('Listening progress','Dinleme ilerlemesi'));copy.append(progress);}
      const controls=node('div','pl-episode-actions');controls.append(button(hero?(continuing(row)?t('Continue','Devam et'):t('Listen','Dinle')):t('Listen','Dinle'),()=>play(entry,hero?'podcast':false),'mh-action '+(hero?'mh-primary':'')));if(hero)controls.append(button(t('Open scene','Sahneyi aç'),()=>play(entry,'podcast'),'mh-action'));controls.append(button(t('Bilingual study','Çift dilli çalış'),()=>play(entry,'bilingual'),'mh-text-button pl-study'),button(t('Add to queue','Kuyruğa ekle'),async()=>{await actions.enqueue(program,row);paintQueue();},'mh-text-button pl-enqueue'));copy.append(controls);const notes=episodeNotes(entry);if(notes)copy.append(notes);if(hero){const sleeve=node('div','pl-record'),art=card.firstChild,disc=node('i','pl-disc'),ripple=node('i','pl-ripple');disc.setAttribute('aria-hidden','true');ripple.setAttribute('aria-hidden','true');sleeve.append(ripple,disc,art);card.append(sleeve);copy.append(transcript(entry));}if(actions.episodeTools){const tools=node('div','pl-episode-tools');actions.episodeTools(tools,program,row);copy.append(tools);}card.append(copy);return card;}
    function paintQueue(){if(disposed)return;queue.replaceChildren();const q=actions.queue();const rows=q.rows||[];for(const [i,row]of rows.slice(0,8).entries()){const item=node('div','pl-queue-row');item.append(node('span','pl-queue-number',String(i+1)),art(row,{title:row.publisher||row.title}),button(row.title,()=>actions.playQueued(row.queueKey),'mh-text-button pl-queue-play'));if(i===q.index)item.setAttribute('aria-current','true');queue.append(item);}if(!rows.length)queue.append(node('p','pl-meta',t('Choose an episode to start your queue.','Kuyruğa başlamak için bir bölüm seç.')));if(rows.length>8)queue.append(button(t('View full queue','Tam kuyruğu gör'),actions.openQueue,'mh-text-button'));}
    function paintPrograms(){
      programs.replaceChildren();const all=button('',()=>{state.program='';state.selected=null;state.limit=60;paint();},'pl-program pl-all');all.dataset.program='';all.append(node('span','pl-all-art','☷'),node('span','pl-program-name',t('All shows','Tüm yayınlar')),node('small','',String((data.podcasts||[]).length)));all.setAttribute('aria-pressed',String(!state.program));programs.append(all);
      for(const p of data.podcasts||[]){const b=button('',()=>{state.program=p.id;state.selected=null;state.limit=60;paint();},'pl-program');b.dataset.program=p.id;b.append(art({},p),node('span','pl-program-name',p.title),node('small','',p.sourceKind==='spotify'?'Spotify':String((p.episodes||[]).length)));b.setAttribute('aria-pressed',String(state.program===p.id));programs.append(b);}
    }
    function paint(){
      if(disposed)return;
      syncMetadata();
      const focusedProgram=programs.contains(document.activeElement)?document.activeElement.dataset.program:null;
      filters.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===state.filter)));
      programs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.program===state.program)));
      const q=state.query.toLocaleLowerCase(),rows=(state.sort==='oldest'?oldest:newest).filter(({row,program,search})=>(!state.program||program.id===state.program)&&(!q||search.includes(q))&&(state.filter!=='ready'||ready(row))&&(state.filter!=='saved'||saved(row))&&(state.filter!=='continue'||continuing(row))&&(state.filter!=='local'||!!row.localSource));
      const resumed=rows.filter(({row})=>continuing(row)),featured=state.selected&&rows.includes(state.selected)?state.selected:resumed[0]||rows[0];
      const spotifyPrograms=(data.podcasts||[]).filter(p=>p.sourceKind==='spotify'&&state.filter==='all'&&(!state.program||state.program===p.id)&&(!q||p.title.toLocaleLowerCase().includes(q)));
      const spotifyKey=JSON.stringify([!!state.program,spotifyPrograms.map(p=>p.id)]);
      if(featured!==lastFeatured||featured?.revision!==lastFeaturedRevision||spotifyKey!==lastSpotify){
        lastFeatured=featured;lastFeaturedRevision=featured?.revision;lastSpotify=spotifyKey;content.replaceChildren();
      for(const program of spotifyPrograms){const card=node('article','pl-episode pl-spotify');card.append(art({},program));const copy=node('div','pl-episode-copy');copy.append(node('p','pl-eyebrow',t('SPOTIFY SOURCE','SPOTIFY KAYNAĞI')),node('h3','',program.title),node('p','pl-description',t('Listen in your existing browser. Live Whisper processes the system audio you hear in real time after your consent.','Mevcut tarayıcında dinle. Canlı Whisper, onayınla duyduğun sistem sesini gerçek zamanlı işler.')),button(t('Listen in Spotify','Spotify’da dinle'),()=>actions.openSpotify(program.url),'mh-action mh-primary'),node('p','pl-meta',t('Episode count unknown. Spotify and RSS keep separate source identities, transcripts and timelines.','Bölüm sayısı bilinmiyor. Spotify ve RSS ayrı kaynak kimliklerini, transkriptlerini ve zaman eksenlerini korur.')));card.append(copy);if(state.program){const stage=node('section','pl-stage');stage.append(card,side);content.append(stage);}else content.append(card);}

      if(featured){const stage=node('section','pl-stage');stage.append(episode(featured,true),side);content.prepend(stage);}
      }
      const section=node('section','pl-section'),title=node('div','pl-section-heading');title.append(node('h2','',state.query?t('Search results','Arama sonuçları'):t('Episodes','Bölümler')),node('span','pl-meta',String(rows.length)+' '+t('episodes','bölüm')));section.append(title);const program=(data.podcasts||[]).find(p=>p.id===state.program);if(program&&actions.refreshPodcast&&program.sourceKind!=='spotify')title.append(button(t('Refresh show','Yayını yenile'),()=>actions.refreshPodcast(program),'mh-text-button'));if(program?.state==='failed')section.append(node('p','pl-meta',t('This source did not answer. Saved episodes and transcripts are kept.','Bu kaynak yanıt vermedi. Kayıtlı bölümler ve transkriptler duruyor.')));const list=node('div','pl-episodes');for(const e of rows.slice(0,state.limit))list.append(episode(e));section.append(list);if(!rows.length&&!content.children.length)section.append(node('p','pl-empty',entries.length?t('No matching episodes. Try another search or filter.','Eşleşen bölüm yok. Aramayı veya filtreyi değiştir.'):t('Add a podcast RSS feed or open your own audio file to begin.','Başlamak için podcast RSS akışı ekle veya kendi ses dosyanı aç.')));if(rows.length>state.limit)section.append(button(t('Load more episodes','Daha fazla bölüm göster'),()=>{state.limit+=60;paint();},'mh-action pl-more'));listContent.replaceChildren(section);if(!content.contains(side))content.append(side);paintQueue();if(focusedProgram!==null)[...programs.querySelectorAll('button')].find(b=>b.dataset.program===focusedProgram)?.focus({preventScroll:true});
    }
    search.addEventListener('input',()=>{state.query=search.value;state.limit=60;paint();});paintPrograms();paint();
    window.PlayerUiKit?.enhanceControls(listControls);
    const unsubscribe=actions.subscribeQueue?.(paintQueue);
    return ()=>{disposed=true;if(ownsNoteDisclosures)openedEpisodeNotes.clear();playIntent++;unsubscribe?.();};
  }
  window.PodcastLibraryUI=Object.freeze({mount});
})();
