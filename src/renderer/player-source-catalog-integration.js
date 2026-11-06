/* Read existing source owners; explicit user actions call the original playback, feed and folder services. */
(() => {
  'use strict';
  const layer=document.getElementById('playerLayer'),body=layer?.querySelector('.player-body');
  if(!body)return;
  const host=document.createElement('section');host.id='playerSourceCatalogV3';host.hidden=true;
  const header=document.createElement('header'),back=document.createElement('button'),view=document.createElement('div');
  back.type='button';header.append(back);host.append(header,view);body.append(host);
  let opened=false,epoch=0,kind='youtube',selected=null,query=PlayerSourceCatalog.normalizeQuery({sort:'newest'}),pins=[],sources=[],items=[],folders=[],feeds=[],feedRows=[],feedTotal=0,loading=false,drawer=false,filters=false,hero=false,toast=null;
  const remotePages=new Map(),fullChannels=new Set(),channelMetadata=new Map();
  const t=(tr,en)=>window.UiLocale?.get?.()==='tr'?tr:en;
  const api=async request=>{const r=await window.api.feedsRequest(request);if(!r?.ok)throw Error(r?.error||t('Akış işlemi başarısız.','Feed request failed.'));return r;};
  const safe=fn=>Promise.resolve().then(fn).catch(error=>{toast=error.message;draw();});
  function close(){epoch++;opened=false;host.hidden=true;layer.classList.remove('source-catalog-open');window.PlayerWorkspaceIntegration?.refresh(true);back.blur();document.getElementById('playerSourceCatalogEntry')?.focus();}
  back.onclick=close;
  function thumbnail(video){const rows=Array.isArray(video.videoThumbnails)?video.videoThumbnails:[];const best=rows.find(row=>String(row.quality).toLowerCase()==='medium')||rows[0];const value=best?.url||video.thumb||'';return typeof absThumb==='function'?absThumb(value):/^https?:\/\//i.test(value)?value:'';}
  function rebuild(){
    const subs=typeof stSubs!=='undefined'?stSubs:[];
    sources=subs.map(s=>({sourceId:'yt:'+stSubKey(s),kind:'youtube',title:s.author||s.handle||s.authorId,followed:true,itemCount:null,url:s.authorId?'https://www.youtube.com/channel/'+s.authorId:'',channel:s}));
    const cached=typeof stSubsFeedCache!=='undefined'?stSubsFeedCache.videos:[];
    const videos=new Map(cached.map(v=>[v.videoId,v]));for(const rows of remotePages.values())for(const v of rows)videos.set(v.videoId,v);
    items=[...videos.values()].filter(v=>v.videoId).map(v=>({itemId:'yt:'+v.videoId,sourceId:'yt:'+v.authorId,kind:'youtube',title:v.title||v.videoId,sourceTitle:v.author||'',thumbnail:thumbnail(v),durationSeconds:Number(v.lengthSeconds)>0?Number(v.lengthSeconds):null,language:v.defaultAudioLanguage||v.language||null,subtitleLanguages:Array.isArray(v.captions)?v.captions.map(c=>c.languageCode).filter(Boolean):null,subtitleOrigins:null,isLive:v.liveNow===true,publishedAt:Number(v.published)?new Date(Number(v.published)*1000).toISOString():null,description:v.description||'',personal:{},video:v}));
    for(const source of sources){
      const metadata=channelMetadata.get(source.channel.authorId),channelVideo=[...videos.values()].find(v=>v.authorId===source.channel.authorId&&v.authorThumbnails?.length);
      const artwork=(metadata?.authorThumbnails||source.channel.authorThumbnails||channelVideo?.authorThumbnails||[]).find(row=>row?.url)?.url||'';
      source.avatar=typeof absThumb==='function'?absThumb(artwork):/^https?:\/\//i.test(artwork)?artwork:'';
      source.itemCount=items.filter(item=>item.sourceId===source.sourceId).length;source.countComplete=fullChannels.has(source.channel.authorId);
      source.description=metadata?.description||source.channel.description||'';
    }
    for(const feed of feeds){const entries=feedRows.filter(r=>r.feedId===feed.id&&r.kind==='podcast');if(!entries.length)continue;sources.push({sourceId:'feed:'+feed.id,kind:'podcast',title:feed.title||feed.url,description:feed.description||'',language:feed.language||null,followed:feed.enabled,url:feed.url,itemCount:feedRows.length===feedTotal?entries.length:null,feed});}
    for(const entry of feedRows.filter(r=>r.kind==='podcast'))items.push({itemId:'feed:'+entry.id,sourceId:'feed:'+entry.feedId,kind:'podcast',title:entry.title,sourceTitle:entry.sourceFeed?.title||'',description:entry.summary,thumbnail:entry.imageUrl||'',language:entry.language||null,durationSeconds:entry.durationSeconds??null,publishedAt:entry.publishedAt?new Date(entry.publishedAt).toISOString():null,subtitleLanguages:PlayerSourceCatalog.podcastSubtitleLanguages(entry.transcriptDescriptors),personal:{saved:entry.saved===true,later:entry.later===true},transcriptDescriptors:entry.transcriptDescriptors||[],entry});
    for(const folder of folders){sources.push({sourceId:'folder:'+folder.id,kind:'local',followed:folder.enabled,title:folder.path.split(/[\\/]/).pop()||folder.path,description:folder.error||'',itemCount:folder.files?.length??null,folder});for(const file of folder.files||[])items.push({itemId:'file:'+file.id,sourceId:'folder:'+folder.id,kind:'local',title:file.name,fileMissing:file.fileMissing===true||file.missing===true,sourceTitle:folder.path.split(/[\\/]/).pop(),durationSeconds:file.durationSeconds??null,language:file.language||null,spokenLanguages:file.spokenLanguages||[],subtitleLanguages:null,isLive:false,personal:{},file,folder});}
  }
  async function load(){
    const request=++epoch;loading=true;draw();
    try{
      const results=await Promise.allSettled([api({action:'list'}),api({action:'entries',kind:'podcast',limit:200,offset:0}),window.api.mediaHub({action:'folders'}),api({action:'source-pins'})]);
      if(request!==epoch||!opened)return;
      const [list,entries,local,pinned]=results.map(result=>result.status==='fulfilled'?result.value:null);
      feeds=list?.feeds||[];feedRows=entries?.rows||[];feedTotal=entries?.total||0;folders=local?.ok?local.folders:[];pins=pinned?.pins||[];
      const failed=results.filter(result=>result.status==='rejected').length+(local&&!local.ok?1:0);toast=failed?t('Bazı kaynaklar okunamadı; önceki veriler korunur.','Some sources could not be read; existing data is preserved.'):null;
      rebuild();
    }finally{if(request===epoch){loading=false;draw();}}
  }
  async function loadRemote(cursor){
    if(loading)return;const request=epoch;loading=true;draw();
    try{
      if(kind==='podcast'){
        const result=await api({action:'entries',kind:'podcast',limit:200,offset:feedRows.length});if(request!==epoch||!opened)return;feedRows.push(...result.rows);feedTotal=result.total;
      }else if(kind==='youtube'){
        const source=sources.find(s=>s.sourceId===selected);if(!source)throw Error(t('Önce bir kanal seçin.','Select a channel first.'));
        const channel=source.channel.authorId;if(!channel)throw Error(t('Bu kaynağı mevcut kanal sayfasından açın.','Open this source from its existing channel page.'));
        const page=Number(String(cursor).split(':').at(-1))||1;const result=await loadInvidiousChannelTab(channel,{tab:'videos',page});if(request!==epoch||!opened)return;if(!result)throw Error(t('Kanal sayfası alınamadı.','Could not load the channel page.'));
        const videos=result.videos||result.latestVideos||[];remotePages.set(channel+':'+page,videos);channelMetadata.set(channel,{...(channelMetadata.get(channel)||{}),...result});
        if(result.hasMore===false||videos.length===0)fullChannels.add(channel);

      }
      rebuild();query=PlayerSourceCatalog.normalizeQuery({...query,cursor:null});
    }catch(error){toast=error.message;}finally{if(request===epoch){loading=false;draw();}}
  }
  async function play(item,mode,{isCancelled=()=>false}={}){
    const initialOwner={intent:player.openIntent,mediaKey:player.mediaKey,generation:player.generation};
    const ownerCurrent=()=>player.mediaKey===initialOwner.mediaKey&&player.generation===initialOwner.generation;
    const intentCurrent=()=>!isCancelled()&&ownerCurrent()&&player.openIntent===initialOwner.intent;
    await flushPodcastPosition();
    if(!intentCurrent())return;
    const request=epoch;
    if(mode==='detail'){
      if(item.entry){close();return window.MediaHomeUI.openFeedEntry(item.entry.id);}
      if(item.file){close();return window.MediaHubUI.open('folders');}
      close();player.pendingAutoOpen=null;return openYoutubePanelAndProbe('https://www.youtube.com/watch?v='+encodeURIComponent(item.video.videoId));
    }
    if(item.file){const result=await window.api.mediaHub({action:'folder-play',folderId:item.folder.id,id:item.file.id});if(!result?.ok){if(/ENOENT|not found|bulunamad/i.test(String(result?.error||''))){item.fileMissing=true;item.file.fileMissing=true;}throw Error(result?.error||t('Dosya açılamadı.','Could not open the file.'));}if(request!==epoch||isCancelled())return;close();return openLocalMedia(result.path);}
    if(item.video){close();return buildSmartTubeCard(item.video).click();}
    const current=await api({action:'entry',entryId:item.entry.id});if(request!==epoch||!intentCurrent())return;
    const entry=current.entry,enclosure=entry.enclosures?.find(e=>/^audio\//.test(e.type));if(!enclosure)throw Error(t('Ses kaynağı yok.','No audio enclosure.'));
    const stream=await window.api.mediaHub({action:'network',url:enclosure.url});if(!stream?.ok)throw Error(stream?.error||'Media unavailable');if(request!==epoch||!intentCurrent())return;
    close();stream.title=entry.title;await window.MediaHubUI.playStream(stream,0,{isCancelled:()=>isCancelled()||!ownerCurrent()});
    if(isCancelled()||player.mediaKey!==stream.key)return;
    const owner={mediaKey:player.mediaKey,generation:player.generation};
    const saved=await api({action:'podcast-workspace',entryId:entry.id});
    if(player.mediaKey!==owner.mediaKey||player.generation!==owner.generation)return;
    player.workspaceAudio={...owner,title:entry.title,publisher:entry.sourceFeed?.title||'',image:entry.imageUrl||'',entryId:entry.id,revision:entry.revision,sourceVersion:saved.sourceVersion,sourceBinding:saved.sourceBinding,episodeIdentity:saved.episodeIdentity||saved.sourceBinding?.episodeIdentity||entry.id,transcriptState:'none'};
    const valid=()=>!isCancelled()&&player.mediaKey===owner.mediaKey&&player.generation===owner.generation;
    const apply=async transcript=>{
      if(!valid())return;
      if(transcript.timed==='yes'||transcript.state==='timed'){
        const cues=parseSubtitles(transcript.text).filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.start>=0&&c.end>c.start);if(!cues.length||cues.length>50000)throw Error(t('Zamanlı metin çözülemedi.','Timed transcript could not be parsed.'));
        const materialized=await api({action:'podcast-materialize',entryId:entry.id,sourceVersion:saved.sourceVersion});if(!valid())return;
        await loadSubtitle(materialized.path,false,{silent:true,role:'source'});if(!valid())return;player.workspaceAudio.transcriptState='timed';
      }else{player.workspaceAudio.transcriptState='untimed';player.workspaceAudio.transcriptText=transcript.text;}
    };
    if(saved.workspace){videoRate(saved.workspace.rate,saved.workspace.position,owner);if(saved.workspace.transcript?.provenance==='asr'){await loadSavedPodcastResult('source');}else if(saved.workspace.transcript)await apply(saved.workspace.transcript);
      if(saved.workspace.translation?.state==='untimed'&&saved.workspace.transcript?.state==='untimed'){player.workspaceAudio.translationText=saved.workspace.translation.text;}
      else if(saved.workspace.translation&&saved.workspace.transcript?.provenance!=='asr'){const m=await api({action:'podcast-materialize',entryId:entry.id,sourceVersion:saved.sourceVersion,role:'translation'});if(valid())await loadSubtitle(m.path,true,{silent:true,role:'translation'});}}
    else if(saved.state==='needs-review')player.workspaceAudio.transcriptState='needs-review';
    const descriptors=entry.transcriptDescriptors||[];
    // Multiple languages/timing options require an explicit publisher choice.
    const chosen=descriptors.length===1?0:-1;
    if(saved.state!=='needs-review'&&!saved.workspace?.transcript&&descriptors.length>1)player.workspaceAudio.transcriptState='choice-required';
    if(saved.state!=='needs-review'&&!saved.workspace?.transcript&&chosen>=0){const transcript=await api({action:'podcast-transcript',entryId:entry.id,revision:entry.revision,descriptorIndex:chosen,requestId:'podcast-'+Date.now()});await apply(transcript);}
    if(valid())window.PlayerWorkspaceIntegration?.refresh(true);
  }
  function videoRate(rate,position,owner){const video=document.getElementById('playerVideo');video.playbackRate=rate||1;const seek=()=>{if(player.mediaKey===owner.mediaKey&&player.generation===owner.generation&&position>0)video.currentTime=position;};if(video.readyState>=1)seek();else video.addEventListener('loadedmetadata',seek,{once:true});}
  let podcastPositionAt=0;
  async function flushPodcastPosition(){const audio=player.workspaceAudio,video=document.getElementById('playerVideo');if(!audio||audio.mediaKey!==player.mediaKey||audio.generation!==player.generation||!Number.isFinite(video.currentTime))return;const request={action:'podcast-workspace',entryId:audio.entryId,sourceVersion:audio.sourceVersion,position:video.currentTime,rate:video.playbackRate};await api(request).catch(()=>{});}
  const podcastVideo=document.getElementById('playerVideo');
  podcastVideo.addEventListener('timeupdate',()=>{if(Date.now()-podcastPositionAt<10000)return;podcastPositionAt=Date.now();void flushPodcastPosition();});
  for(const event of ['pause','seeked','ratechange','ended'])podcastVideo.addEventListener(event,()=>void flushPodcastPosition());
  document.getElementById('playerBack')?.addEventListener('click',()=>void flushPodcastPosition(),true);
  function draw(){
    if(!opened)return;
    back.replaceChildren(window.PlayerUiKit.icon('arrow-right'),document.createTextNode(t('Oynatıcıya dön','Back to player')));
    const source=sources.find(s=>s.sourceId===selected);
    const channel=source?.channel?.authorId;
    const page=channel?[...remotePages.keys()].filter(k=>k.startsWith(channel+':')).length+1:1;
    const remote=kind==='podcast'&&feedRows.length<feedTotal?'podcast:'+feedRows.length:kind==='youtube'&&channel&&!fullChannels.has(channel)?'youtube:'+page:null;
    const result=PlayerSourceCatalog.queryPlayerItems({batch:{items,revision:String(items.length)+':'+epoch,remoteNextCursor:remote},query:{...query,kind,sourceIds:selected?[selected]:query.sourceIds}});
    PlayerSourceCatalogUI.renderCatalog(view,{locale:window.UiLocale?.get?.()||'en',kind,sources,pinned:pins,selectedSourceId:selected,query,result,shown:result.items.length,drawerOpen:drawer,filtersOpen:filters,heroOpen:hero,loading,now:Date.now(),toast,durationsAvailable:items.some(i=>i.kind===kind&&(!selected||i.sourceId===selected)&&Number.isFinite(i.durationSeconds)),metadataFailures:items.filter(i=>i.kind==='local'&&(!selected||i.sourceId===selected)&&i.file?.metadataError).length,subtitleLanguagesAvailable:[...new Set(items.filter(i=>i.kind===kind).flatMap(i=>i.subtitleLanguages||[]).map(PlayerSourceCatalog.normalizeLang).filter(Boolean))],speechLanguagesAvailable:[...new Set(items.filter(i=>i.kind===kind).flatMap(i=>i.spokenLanguages?.length?i.spokenLanguages:[i.language]).map(PlayerSourceCatalog.normalizeLang).filter(Boolean))]}, {
      onReadMetadata:(retry=false)=>safe(async()=>{
        if(loading)return;
        loading=true;draw();
        try{
          const source=sources.find(s=>s.sourceId===selected),folder=source?.folder;
          if(!folder)throw Error(t('Önce bir yerel klasör seçin.','Select a local folder first.'));
          const pending=(folder.files||[]).filter(file=>retry?!!file.metadataError:!file.metadataRead).slice(0,20);
          if(!pending.length){toast=t('Bu klasördeki dosya bilgileri okundu.','File metadata in this folder has been read.');return;}
          const result=await window.api.mediaHub({action:'folder-metadata',folderId:folder.id,ids:pending.map(file=>file.id),retry:retry===true});
          if(!result?.ok)throw Error(result?.error||t('Dosya bilgisi okunamadı.','Could not read file metadata.'));
          folders=folders.map(old=>old.id===folder.id?result.folder:old);rebuild();
          const failed=result.results.filter(row=>!row.ok).length;
          toast=t('Okunan dosya','Files read')+' · '+result.results.filter(row=>row.ok).length+(failed?' · '+t('Okunamadı','Failed')+' '+failed:'');
        }finally{loading=false;draw();}
      }),
      onSelectKind:value=>{kind=value;selected=null;query=PlayerSourceCatalog.normalizeQuery({sort:'newest'});draw();},
      onSelectSource:id=>{selected=id;drawer=false;query=PlayerSourceCatalog.normalizeQuery({...query,cursor:null});draw();},
      onQuery:patch=>{query=PlayerSourceCatalog.normalizeQuery({...query,...patch});draw();},onClearSearch:()=>{query=PlayerSourceCatalog.clearSearch(query);draw();},onClearFilters:()=>{query=PlayerSourceCatalog.clearFilters(query);draw();},
      onLoadMore:cursor=>{query=PlayerSourceCatalog.normalizeQuery({...query,cursor});draw();},onLoadRemote:cursor=>safe(()=>loadRemote(cursor)),
      onTogglePin:id=>safe(async()=>{const next=PlayerSourceCatalog.togglePin(pins,id);const result=await api({action:'source-pins',pins:next});pins=result.pins;draw();}),
      onToggleFilters:()=>{filters=!filters;draw();},onToggleHero:()=>{hero=!hero;draw();},onOpenDrawer:()=>{drawer=true;draw();view.querySelector('.pw-rail button')?.focus();},onCloseDrawer:()=>{drawer=false;draw();},
      onOpenFile:document.getElementById('playerPickVideo')?()=>{close();document.getElementById('playerPickVideo').click();}:undefined,
      onLocate:item=>{if(!item?.folder)return;close();void window.MediaHubUI.open('folders');},
      onOpenItem:(item,mode)=>safe(()=>play(item,mode)),onDismissToast:()=>{toast=null;draw();},
      onToggleFollow:id=>safe(async()=>{const source=sources.find(s=>s.sourceId===id);if(source?.channel)stSubToggle(source.channel);else if(source?.folder){const changed=await window.api.mediaHub({action:'folder-enabled',folderId:source.folder.id,enabled:!source.folder.enabled});if(!changed?.ok)throw Error(changed?.error||'Folder update failed.');}else if(source?.feed)await api({action:'feed-update',feedId:source.feed.id,enabled:!source.feed.enabled});await load();}),
      onAddSource:value=>{close();if(value==='local')void window.MediaHubUI.open('folders');else if(value==='podcast')void window.MediaHomeUI.navigate('feeds');else{document.getElementById('playerLayer').classList.remove('hidden');setWorkspaceMode('player',false);setSmartTubeVisible(true);}},
      onOpenSourceUrl:id=>{const source=sources.find(s=>s.sourceId===id);if(!source)return;if(source.feed){close();void window.MediaHomeUI.navigate('feeds');}else if(source.channel){close();void openInvidiousChannelPage(source.channel.authorId);}else if(source.folder){close();void window.MediaHubUI.open('folders');}},
      onRemoveChip:chip=>{const value=query[chip.field];query=PlayerSourceCatalog.normalizeQuery({...query,[chip.field]:Array.isArray(value)?value.filter(v=>v!==chip.value):false,cursor:null});draw();}
    });
  }
  function open(){setWorkspaceMode('player',false);opened=true;host.hidden=false;layer.classList.remove('hidden');layer.classList.add('source-catalog-open');void safe(load);}
  const entry=document.createElement('button');entry.id='playerSourceCatalogEntry';entry.type='button';entry.className='btn-icon player-head-button';entry.textContent=t('Kaynaklar','Sources');entry.title=t('Oynatıcı kaynak kataloğu','Player source catalog');entry.onclick=()=>{document.getElementById('playerHeadMore').open=false;open();};
  document.querySelector('#playerHeadMore .ph-more-body, #playerHeadMore [role=menu]')?.append(entry);
  if(!entry.isConnected)document.querySelector('.player-head-actions')?.append(entry);
  document.addEventListener('ui-locale-change',()=>{entry.textContent=t('Kaynaklar','Sources');if(opened)draw();});
  host.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();if(drawer){drawer=false;draw();}else close();}});
  new MutationObserver(()=>{if(opened&&(layer.classList.contains('hidden')||player.workspaceMode!=='player'))close();}).observe(layer,{attributes:true,attributeFilter:['class']});
  let podcastRequest=null;
  async function generatePodcast(config={}){
    const audio=player.workspaceAudio,isCancelled=config.isCancelled||(()=>false);
    const valid=()=>!isCancelled()&&player.workspaceMode==='player'&&player.workspaceAudio===audio&&audio?.mediaKey===player.mediaKey&&audio?.generation===player.generation;
    if(!valid())throw Error(t('Önce RSS podcast bölümünü açın.','Open an RSS podcast episode first.'));
    if(podcastRequest)throw Error(t('Podcast sesi hazırlanıyor.','Podcast audio is being prepared.'));
    const requestId='podcast-audio-'+Date.now();podcastRequest=requestId;let acquired;
    try{
      acquired=await api({action:'podcast-audio',entryId:audio.entryId,sourceVersion:audio.sourceVersion,requestId});
      if(!valid())throw Error(t('Bölüm değişti veya istek durduruldu.','Episode changed or request stopped.'));
      return await window.queuePodcastSource({...audio,...acquired,playbackOwner:'player',playbackSourceVersion:audio.sourceVersion},config);
    }catch(error){if(acquired?.downloadToken)await api({action:'podcast-audio-release',downloadToken:acquired.downloadToken});throw error;}
    finally{if(podcastRequest===requestId)podcastRequest=null;}
  }
  async function runPodcastTask({operation,expected=player.workspaceAudio,isCancelled=()=>false,...options}={}){
    if(!['transcribe','transcribe-translate','translate','retry-translation'].includes(operation))throw Error(t('Bilinmeyen podcast işlemi.','Unknown podcast operation.'));
    expected=expected?{...expected}:null;
    const valid=()=>{const now=player.workspaceAudio;return !isCancelled()&&player.workspaceMode==='player'&&!!expected&&!!now&&now.mediaKey===player.mediaKey&&now.generation===player.generation&&['mediaKey','generation','sourceVersion'].every(key=>expected[key]===now[key]);};
    if(!valid())throw Error(t('Podcast kaynağı değişti.','Podcast source changed.'));
    options.range=options.range==null?null:window.PodcastTaskScope.normalize(options.range,document.getElementById('playerVideo')?.duration);
    const config={...options,operation,isCancelled:()=>!valid()};
    if(operation==='translate'||operation==='retry-translation'){if(config.range)throw Error(t('Metin çevirisi yüklü dökümü kullanır; önce seçili aralığı yazıya dökün.','Transcript translation uses the loaded transcript; transcribe the interval first.'));return translatePodcastTranscript({...config,retryOnly:operation==='retry-translation'});}return generatePodcast(config);
  }
  async function loadPublisherTranscript(descriptorIndex){
    const audio=player.workspaceAudio;
    const valid=()=>!!audio&&player.workspaceAudio===audio&&audio.mediaKey===player.mediaKey&&audio.generation===player.generation;
    if(!valid())throw Error(t('Önce podcast açın.','Open a podcast first.'));
    const response=await api({action:'podcast-transcript',entryId:audio.entryId,revision:audio.revision,descriptorIndex,requestId:'publisher-'+Date.now()});if(!valid())return;
    const saved=await api({action:'podcast-workspace',entryId:audio.entryId,sourceVersion:audio.sourceVersion});if(!valid())return;
    const timed=response.timed==='yes',source=saved.workspace?.transcript;
    if(saved.sourceVersion!==audio.sourceVersion||source?.text!==response.text||source.state!==(timed?'timed':'untimed'))throw Error(t('Podcast dökümü değişti.','Podcast transcript changed.'));
    // Only the current registry can establish that a translation still belongs to this text.
    const translation=saved.workspace.translation,matchingTranslation=translation?.status!=='partial'&&translation?.state===source.state;
    let sourcePath,translationPath;
    if(timed){
      sourcePath=(await api({action:'podcast-materialize',entryId:audio.entryId,sourceVersion:audio.sourceVersion})).path;if(!valid())return;
      if(matchingTranslation){translationPath=(await api({action:'podcast-materialize',entryId:audio.entryId,sourceVersion:audio.sourceVersion,role:'translation'})).path;if(!valid())return;}
      await loadSubtitle(sourcePath,false,{silent:true,role:'source'});if(!valid())return;
      if(player.subPath!==sourcePath)throw Error(t('Yayıncı dökümü yüklenemedi.','Publisher transcript could not be loaded.'));
    }
    await loadSubtitle('',true,{silent:true});if(!valid())return;
    delete audio.transcriptText;delete audio.translationText;delete audio.transcriptCoverage;delete audio.transcriptTimingNotice;
    audio.translationRetry=saved.translationRetry||null;audio.transcriptState=timed?'timed':'untimed';
    if(!timed){audio.transcriptText=response.text;if(matchingTranslation)audio.translationText=translation.text;}
    else if(translationPath){await loadSubtitle(translationPath,true,{silent:true,role:'translation'});if(!valid())return;}
    window.PlayerWorkspaceIntegration?.refresh(true);
  }
  async function translatePodcastTranscript({isCancelled=()=>false,targetLanguage,retryOnly=false}={}){
    const audio=player.workspaceAudio;
    const valid=()=>!isCancelled()&&!!audio&&player.workspaceAudio===audio&&audio.mediaKey===player.mediaKey&&audio.generation===player.generation;
    if(!valid())throw Error(t('Önce RSS podcast bölümünü açın.','Open an RSS podcast episode first.'));
    const saved=await api({action:'podcast-workspace',entryId:audio.entryId});if(!valid())return;
    const track=saved.workspace?.transcript;
    if(!['timed','untimed'].includes(track?.state)||track.status==='partial'||!track.text)throw Error(t('Önce bu bölüm için tam bir kaynak dökümü üretin veya yükleyin.','Generate or load a complete source transcript for this episode first.'));
    if(retryOnly)return window.retryPodcastTranslation({...audio,playbackOwner:'player',playbackSourceVersion:audio.sourceVersion,sourceVersion:saved.sourceVersion,sourceTranscriptText:track.text},{isCancelled});
    if(track.state==='untimed')return window.translatePodcastTextSource({...audio,playbackOwner:'player',playbackSourceVersion:audio.sourceVersion,sourceVersion:saved.sourceVersion,sourceTranscriptText:track.text,track:{id:'podcast-source:'+audio.entryId,revision:saved.sourceVersion,timed:false,text:track.text}},{isCancelled,targetLanguage});
    const materialized=await api({action:'podcast-materialize',entryId:audio.entryId,sourceVersion:saved.sourceVersion});if(!valid())return;
    return window.translatePodcastSource({...audio,playbackOwner:'player',playbackSourceVersion:audio.sourceVersion,sourceVersion:saved.sourceVersion,materializedPath:materialized.path,sourceTranscriptText:track.text,transcriptProvenance:track.provenance,track:{id:'podcast-source:'+audio.entryId,revision:saved.sourceVersion,timed:true,text:track.text}},{isCancelled});
  }
  async function loadSavedPodcastResult(role='source'){
    const audio=player.workspaceAudio;
    const valid=()=>!!audio&&player.workspaceAudio===audio&&audio.mediaKey===player.mediaKey&&audio.generation===player.generation;
    if(!valid())throw Error(t('Önce podcast açın.','Open a podcast first.'));
    const saved=await api({action:'podcast-workspace',entryId:audio.entryId});if(!valid())return;
    audio.translationRetry=saved.translationRetry||null;
    const result=saved.workspace?.[role==='translation'?'translation':'transcript'];
    if(!result?.text)throw Error(t('Bu kaynak için kayıtlı sonuç yok.','No saved result is available for this source.'));
    if(saved.sourceVersion===audio.sourceVersion&&saved.workspace?.transcript?.provenance!=='asr'&&result.state==='timed'&&result.status!=='partial'){
      const materialized=await api({action:'podcast-materialize',entryId:audio.entryId,sourceVersion:saved.sourceVersion,role});if(!valid())return;
      await loadSubtitle(materialized.path,role==='translation',{silent:true,role});if(!valid())return;
      audio.transcriptState='timed';delete audio.transcriptTimingNotice;
    }else{
      const cues=result.state==='timed'?parseSubtitles(result.text):[];
      const text=cues.length?cues.map(cue=>String(cue.text||'')).join('\n\n'):String(result.text);
      if(role==='translation')audio.translationText=text;
      else {audio.transcriptText=text;delete audio.translationText;const translation=saved.workspace?.translation;if(translation?.text&&translation.status!=='partial')audio.translationText=translation.state==='timed'?parseSubtitles(translation.text).map(cue=>String(cue.text||'')).join('\n\n'):translation.text;}
      audio.transcriptState='untimed';audio.transcriptTimingNotice=t('Salt okunur sonuç: açık ses ile kaynak sürümü/zaman eşleşmesi doğrulanmadı veya çıktı kısmi. Metin konum atlamak ve bu ana kadar kapsamı için kullanılamaz.','Read-only result: the open audio source version/timing is unverified or the result is partial. Text cannot be used for seeking or evidence of what has been heard.');
    }
    if(result.state==='untimed'&&saved.workspace?.transcript?.state==='untimed')audio.transcriptTimingNotice=t('Yayıncı metni zamansızdır; özgün metin ve çeviri yalnızca okunur.','Publisher text has no timing; source and translation are read-only.');
    if(role!=='translation'){audio.transcriptCoverage=result.coverage||null;if(result.coverage)audio.transcriptTimingNotice=(audio.transcriptTimingNotice||'')+' '+t('Seçili aralık','Selected interval')+': '+window.PodcastTaskScope.stamp(result.coverage.start)+' – '+window.PodcastTaskScope.stamp(result.coverage.end)+'. '+t('Bölümün tamamı değildir.','This is not the whole episode.');}
    // Loading a track must not replace the presentation explicitly chosen by the user.
    window.PlayerWorkspaceIntegration?.refresh(true);
  }
  function podcastTools(initialMessage=''){
    const dialogOwner={mediaKey:player.mediaKey,generation:player.generation,workspaceMode:player.workspaceMode};
    const dialogSourceCurrent=()=>player.mediaKey===dialogOwner.mediaKey&&player.generation===dialogOwner.generation&&player.workspaceMode===dialogOwner.workspaceMode;
    const toolOwner=player.workspaceAudio;const ownerCurrent=()=>!!toolOwner&&player.workspaceAudio===toolOwner&&toolOwner.mediaKey===player.mediaKey&&toolOwner.generation===player.generation;
    const guardOwner=()=>{if(!ownerCurrent())throw Error(t('Podcast kaynağı değişti. Araçları yeni bölümde yeniden açın.','Podcast source changed. Reopen tools for the new episode.'));};
    const confidenceLabel=value=>({high:t('Yüksek benzerlik','High similarity'),medium:t('Orta benzerlik','Medium similarity'),low:t('Düşük benzerlik','Low similarity'),conflict:t('Kimlik çakışması','Identity conflict')}[value]||t('Doğrulanmadı','Unverified'));
    const dialog=document.createElement('dialog');dialog.className='ms-dialog mk-dialog media-surface';dialog.dataset.uiUntranslated='';dialog.setAttribute('aria-labelledby','podcastToolsTitle');const title=document.createElement('h2');title.id='podcastToolsTitle';title.textContent=t('Podcast araçları','Podcast tools');const note=document.createElement('p');note.textContent=t('RSS veya kendi ses dosyanız mevcut Whisper/çeviri akışını kullanır. Spotify bağlantısı yalnız bölüm adayını eşleştirir; sesi veya aynı zaman çizgisini sağlamaz.','RSS or your own audio uses the existing Whisper/translation workflow. A Spotify link only matches episode candidates; it supplies no audio or shared timeline.');const message=document.createElement('p');message.setAttribute('role','status');if(typeof initialMessage==='string')message.textContent=initialMessage;const controls=document.createElement('div');controls.className='mh-actions';
    const action=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='mh-action';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){message.textContent=e.message;}finally{b.disabled=false;}};controls.append(b);return b;};
    const active=ownerCurrent();
    if(active)void api({action:'entry',entryId:toolOwner.entryId}).then(({entry})=>{if(!dialog.isConnected||!dialog.open||!ownerCurrent())return;for(const [index,d]of (entry.transcriptDescriptors||[]).entries())action(t('Yayıncı dökümünü yükle','Load publisher transcript')+' · '+(d.language||t('dil bilinmiyor','language unknown'))+' · '+(d.timed==='yes'?t('zamanlı','timed'):t('zaman doğrulanmadı','timing unverified')),async()=>{guardOwner();await loadPublisherTranscript(index);if(!dialog.isConnected||!ownerCurrent())return;message.textContent=t('Yayıncı dökümü yüklendi.','Publisher transcript loaded.');});}).catch(e=>{if(dialog.isConnected&&dialog.open&&ownerCurrent())message.textContent=e.message;});
    action(t('Whisper kuyruğuna ekle','Generate with Whisper'),async()=>{guardOwner();await generatePodcast();if(!dialog.isConnected||!ownerCurrent())return;message.textContent=t('Mevcut kuyruğa eklendi; seçenekler donduruldu.','Added to the existing queue with frozen options.');}).disabled=!active;
    action(t('Kaynak dökümü çevir','Translate source transcript'),async()=>{guardOwner();await translatePodcastTranscript();if(dialog.isConnected&&ownerCurrent())message.textContent=t('Kayıtlı kaynak dökümü mevcut çeviri kuyruğuna eklendi.','The saved source transcript was added to the existing translation queue.');}).disabled=!active;
    for(const [role,tr,en]of [['source','Kayıtlı dökümü yükle','Load saved transcript'],['translation','Kayıtlı çeviriyi yükle','Load saved translation']])action(t(tr,en),async()=>{guardOwner();await loadSavedPodcastResult(role);if(!dialog.isConnected||!ownerCurrent())return;message.textContent=toolOwner.transcriptTimingNotice||t('Kayıtlı sonuç yüklendi.','Saved result loaded.');}).disabled=!active;
    action(t('İndirmeyi iptal et','Cancel acquisition'),async()=>{guardOwner();if(podcastRequest)await api({action:'cancel',requestId:podcastRequest});});
    const url=document.createElement('input');url.type='url';url.placeholder='https://open.spotify.com/episode/…';url.setAttribute('aria-label',t('Spotify bölüm bağlantısı','Spotify episode link'));const urlField=document.createElement('label');urlField.className='ms-field';urlField.append(document.createTextNode(t('Spotify bölüm bağlantısı','Spotify episode link')),url);const results=document.createElement('div');
    action(t('Spotify bölümünü RSS ile eşleştir','Match Spotify episode to RSS'),async()=>{const p=await api({action:'podcast-spotify-preview',url:url.value,requestId:'spotify-podcast-'+Date.now()});if(!dialog.isConnected||!dialog.open||!dialogSourceCurrent())return;results.replaceChildren();message.textContent=p.title+' · '+t('Adayı kendiniz doğrulayın; zaman çizgisi doğrulanmadı.','Confirm the candidate yourself; timeline is unverified.');if(!p.candidates.length)message.textContent+=' '+t('Yayıncının RSS akışını ekleyip tekrar deneyin.','Add the publisher RSS feed and try again.');for(const c of p.candidates){const b=document.createElement('button');b.type='button';b.className='mh-action';b.textContent=c.title+' · '+c.publisher+' · '+confidenceLabel(c.assessment.confidence);b.onclick=async()=>{try{if(!dialog.isConnected||!dialog.open||!dialogSourceCurrent())return;await api({action:'podcast-spotify-confirm',token:p.token,entryId:c.entryId});if(!dialog.isConnected||!dialog.open||!dialogSourceCurrent())return;message.textContent=t('Bağ kaydedildi. Eşleşen RSS bölümünü açarak Whisper kullanabilirsiniz; zaman eşleşmesi doğrulanmadı.','Binding saved. Open the matched RSS episode to use Whisper; timeline compatibility is unverified.');results.replaceChildren();const openMatched=document.createElement('button');openMatched.type='button';openMatched.className='mh-action';openMatched.textContent=t('Eşleşen RSS bölümünü aç','Open matched RSS episode');openMatched.onclick=async()=>{if(!dialog.isConnected||!dialog.open||!dialogSourceCurrent())return;openMatched.disabled=true;dialog.close();try{await play({entry:{id:c.entryId}},'play');if(player.workspaceAudio?.entryId===c.entryId&&player.workspaceAudio.mediaKey===player.mediaKey&&player.workspaceAudio.generation===player.generation)podcastTools();}catch(error){podcastTools(error.message);}};results.append(openMatched);}catch(e){message.textContent=e.message;}};results.append(b);}});
    action(t('Yayıncı RSS ekle','Add publisher RSS'),()=>{dialog.close();return window.MediaHomeUI.navigate('feeds');});action(t('Kapat','Close'),()=>dialog.close());dialog.append(title,note,urlField,controls,message,results);document.body.append(dialog);window.PlayerUiKit?.bindDialog?.(dialog);dialog.addEventListener('close',()=>{dialog.remove();if(typeof syncBrowserOcclusion==='function')void syncBrowserOcclusion();},{once:true});dialog.showModal();if(typeof syncBrowserOcclusion==='function')void syncBrowserOcclusion();
  }
  let podcastOpenIntent=0;
  async function openPodcastEntry(entryId,{view='podcast',restart=false,reload=false,isCancelled=()=>false,presentation}={}){
    if(typeof entryId!=='string'||!entryId||!['podcast','bilingual'].includes(view))throw Error(t('Geçerli bir RSS bölümü seçin.','Choose a valid RSS episode.'));
    if(isCancelled())return;
    const intent=++podcastOpenIntent,cancelled=isCancelled;
    isCancelled=()=>cancelled()||intent!==podcastOpenIntent;
    const active=player.workspaceAudio;
    if(reload||active?.entryId!==entryId||active.mediaKey!==player.mediaKey||active.generation!==player.generation)await play({entry:{id:entryId}},'play',{isCancelled});
    if(isCancelled())return;
    if(player.workspaceAudio?.entryId!==entryId||player.workspaceAudio.mediaKey!==player.mediaKey||player.workspaceAudio.generation!==player.generation)throw Error(t('Bölüm açılırken kaynak değişti. Yeniden deneyin.','Source changed while opening the episode. Try again.'));
    if(restart&&active===player.workspaceAudio){const video=document.getElementById('playerVideo');video.currentTime=0;await video.play();if(isCancelled())return;}
    if(presentation&&typeof presentation==='object'){
      if(typeof presentation.publisher==='string')player.workspaceAudio.publisher=presentation.publisher.slice(0,300);
      if(typeof presentation.image==='string'&&/^https:\/\//i.test(presentation.image)&&presentation.image.length<=4096)player.workspaceAudio.image=presentation.image;
    }
    window.PlayerWorkspaceIntegration.setPodcastMode(view==='podcast');
    window.PlayerWorkspaceIntegration.refresh(true);
    window.CinemaSahne?.open({mode:view==='podcast'?'podcast':'study'});
  }
  const podcastButton=document.createElement('button');podcastButton.type='button';podcastButton.className='mh-action';podcastButton.textContent=t('Podcast araçları','Podcast tools');podcastButton.onclick=podcastTools;header.append(podcastButton);
  const podcastMenuButton=podcastButton.cloneNode(true);podcastMenuButton.onclick=podcastTools;document.querySelector('#playerHeadMore .ph-more-body, #playerHeadMore [role=menu]')?.append(podcastMenuButton);
  window.PlayerSourceCatalogIntegration=Object.freeze({runPodcastTask,podcastTaskState:()=>({preparing:!!podcastRequest,hasSourceTranscript:!!player.workspaceAudio&&!!(player.subPath||player.workspaceAudio.transcriptText),translationRetry:player.workspaceAudio?.translationRetry||null,job:window.podcastQueueTaskState?.(player.workspaceAudio)}),open,close,reload:load,openPodcastEntry,podcastTools,generatePodcast,loadPublisherTranscript,loadSavedPodcastResult});
})();
