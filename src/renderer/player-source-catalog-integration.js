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
  async function play(item,mode){
    const request=epoch;
    if(mode==='detail'){
      if(item.entry){close();return window.MediaHomeUI.openFeedEntry(item.entry.id);}
      if(item.file){close();return window.MediaHubUI.open('folders');}
      close();player.pendingAutoOpen=null;return openYoutubePanelAndProbe('https://www.youtube.com/watch?v='+encodeURIComponent(item.video.videoId));
    }
    if(item.file){const result=await window.api.mediaHub({action:'folder-play',folderId:item.folder.id,id:item.file.id});if(!result?.ok){if(/ENOENT|not found|bulunamad/i.test(String(result?.error||''))){item.fileMissing=true;item.file.fileMissing=true;}throw Error(result?.error||t('Dosya açılamadı.','Could not open the file.'));}if(request!==epoch)return;close();return openLocalMedia(result.path);}
    if(item.video){close();return buildSmartTubeCard(item.video).click();}
    const current=await api({action:'entry',entryId:item.entry.id});if(request!==epoch)return;
    const entry=current.entry,enclosure=entry.enclosures?.find(e=>/^audio\//.test(e.type));if(!enclosure)throw Error(t('Ses kaynağı yok.','No audio enclosure.'));
    const stream=await window.api.mediaHub({action:'network',url:enclosure.url});if(!stream?.ok)throw Error(stream?.error||'Media unavailable');if(request!==epoch)return;
    close();stream.title=entry.title;await window.MediaHubUI.playStream(stream);
    if(player.mediaKey!==stream.key)return;
    const owner={mediaKey:player.mediaKey,generation:player.generation};
    player.workspaceAudio={...owner,title:entry.title,entryId:entry.id,revision:entry.revision,transcriptState:'none'};
    window.PlayerWorkspaceIntegration?.refresh(true);
    const index=entry.transcriptDescriptors?.findIndex(d=>d.timed==='yes');const chosen=index>=0?index:entry.transcriptDescriptors?.length?0:-1;
    if(chosen<0)return;
    const transcript=await api({action:'podcast-transcript',entryId:entry.id,revision:entry.revision,descriptorIndex:chosen,requestId:'podcast-'+Date.now()});
    if(player.mediaKey!==owner.mediaKey||player.generation!==owner.generation)return;
    if(transcript.timed==='yes'){
      const cues=parseSubtitles(transcript.text);if(!cues.length)throw Error(t('Zamanlı metin çözülemedi.','Timed transcript could not be parsed.'));
      player.cues=cues;player.cuesRaw=cues.slice();player.cues2=[];player.subRole='source';player.subPath='publisher:'+entry.id+':'+entry.revision;player.offset=0;renderCueList();player.workspaceAudio.transcriptState='timed';
    }else{player.workspaceAudio.transcriptState='untimed';player.workspaceAudio.transcriptText=transcript.text;}
    window.PlayerWorkspaceIntegration?.refresh(true);
  }
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
  window.PlayerSourceCatalogIntegration=Object.freeze({open,close,reload:load});
})();
