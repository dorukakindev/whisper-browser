(() => {
  'use strict';
  const english = () => window.UiLocale?.get?.() !== 'tr';
  const t = (en, tr) => english() ? en : tr;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  let view = null, generation = 0, snapshot = null, current = null, queue = [], queueIndex = 0, hls = null;
  const selected = new Set(),order=window.MusicQueue.create();let musicFilter='all',musicSort='title',queueDialog=null;const musicCovers=new Map();
  const playableMusic=row=>({...row,kind:'music'});
  const audio = el('audio'); audio.controls = true; audio.preload = 'metadata'; audio.id = 'mediaShelfAudio';
  const dock = el('section', 'ms-dock media-surface hidden'); dock.dataset.uiUntranslated = ''; dock.setAttribute('aria-label', t('Music player', 'Müzik oynatıcı'));
  const dockTitle = el('strong'), dockStatus = el('span', 'ms-status'); dockStatus.setAttribute('role', 'status');
  const btn = (label, callback, cls = 'mh-action') => {
    const node = el('button', cls, label); node.type = 'button';
    node.addEventListener('click', () => Promise.resolve().then(callback).catch(error => status(error.message, true))); return node;
  };
  const speed = el('select'); speed.setAttribute('aria-label', t('Playback speed', 'Oynatma hızı'));
  for (const rate of [.75, 1, 1.15, 1.25, 1.5, 2]) { const opt = el('option', '', `${rate}×`); opt.value = rate; speed.append(opt); } speed.value = '1';
  speed.addEventListener('change', () => { audio.playbackRate = Number(speed.value); });
  const sleep = el('select'); sleep.setAttribute('aria-label', t('Sleep timer', 'Uyku zamanlayıcısı'));
  let sleepTimer;
  for (const value of [0, 15, 30, 60]) { const opt = el('option', '', value ? `${value} ${t('min', 'dk')}` : t('Sleep timer off', 'Uyku zamanlayıcısı kapalı')); opt.value = value; sleep.append(opt); }
  sleep.addEventListener('change', () => { clearTimeout(sleepTimer); if (+sleep.value) sleepTimer = setTimeout(() => { audio.pause(); sleep.value = '0'; }, +sleep.value * 60000); });
  const paths={previous:'M6 5v14M19 5L8 12l11 7Z',next:'M18 5v14M5 5l11 7-11 7Z',play:'m8 5 11 7-11 7Z',pause:'M8 5v14M16 5v14',close:'m6 6 12 12M6 18 18 6',volume:'m11 5-6 5H2v4h3l6 5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',muted:'m11 5-6 5H2v4h3l6 5Zm5 4 6 6m-6 0 6-6',more:'M5 12h.01M12 12h.01M19 12h.01'};
  function glyph(button,name){button.replaceChildren();const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]);svg.append(path);button.append(svg);}
  function iconButton(label,name,action,cls=''){const b=btn('',action,'ms-icon-button '+cls);b.setAttribute('aria-label',label);b.title=label;glyph(b,name);return b;}
  const now=el('div','ms-now'),dockArt=el('div','ms-now-art'),dockCopy=el('div','ms-now-copy'),dockArtist=el('small');dockCopy.append(dockTitle,dockArtist);now.append(dockArt,dockCopy);
  const center=el('div','ms-playback-center'),keys=el('div','ms-playback-keys');
  const previousButton=iconButton(t('Previous track','Önceki parça'),'previous',()=>{if(audio.currentTime>4){audio.currentTime=0;return;}const row=order.previous();if(row)return playQueue(order.snapshot().index);});
  const toggleButton=iconButton(t('Play','Oynat'),'play',async()=>{if(audio.paused)await audio.play();else audio.pause();},'ms-play-toggle');
  audio.addEventListener('waiting',()=>{dock.classList.add('is-waiting');toggleButton.setAttribute('aria-busy','true');});for(const event of ['playing','pause','error','emptied'])audio.addEventListener(event,()=>{dock.classList.remove('is-waiting');toggleButton.removeAttribute('aria-busy');});
  const nextButton=iconButton(t('Next track','Sonraki parça'),'next',()=>advance(false));
  const transport=el('div','ms-transport'),shuffleButton=btn(t('Shuffle','Karıştır'),()=>{order.shuffle(!order.snapshot().shuffled);syncQueue();},'mh-text-button ms-shuffle'),repeatButton=btn(t('Repeat off','Tekrar kapalı'),()=>{const modes=['off','all','one'];order.setRepeat(modes[(modes.indexOf(order.snapshot().repeat)+1)%3]);syncQueue();},'mh-text-button ms-repeat'),queueButton=btn(t('Queue','Kuyruk'),openQueue,'mh-action ms-queue-open');
  shuffleButton.setAttribute('aria-pressed','false');keys.append(shuffleButton,previousButton,toggleButton,nextButton,repeatButton);
  const timeline=el('div','ms-timeline'),elapsed=el('span','', '0:00'),total=el('span','', '—'),seek=el('input','ms-seek');seek.type='range';seek.min=0;seek.max=1;seek.step=.1;seek.value=0;seek.disabled=true;seek.setAttribute('aria-label',t('Playback position','Oynatma konumu'));timeline.append(elapsed,seek,total);center.append(keys,timeline);
  const volumeWrap=el('div','ms-volume'),volume=el('input','ms-volume-range');volume.type='range';volume.min=0;volume.max=1;volume.step=.01;volume.value=1;volume.setAttribute('aria-label',t('Volume','Ses düzeyi'));
  const muteButton=iconButton(t('Mute','Sesi kapat'),'volume',()=>{audio.muted=!audio.muted;});volumeWrap.append(muteButton,volume);volume.addEventListener('input',()=>{audio.volume=Number(volume.value);audio.muted=false;});
  seek.addEventListener('input',()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=Math.min(audio.duration,Number(seek.value));});
  const timeLabel=n=>Number.isFinite(n)?Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0'):'—';
  function updateTransport(){const paused=audio.paused;glyph(toggleButton,paused?'play':'pause');toggleButton.setAttribute('aria-label',paused?t('Play','Oynat'):t('Pause','Duraklat'));toggleButton.title=toggleButton.getAttribute('aria-label');const finite=Number.isFinite(audio.duration)&&audio.duration>0;seek.disabled=!finite;seek.max=finite?audio.duration:1;seek.value=Number.isFinite(audio.currentTime)?audio.currentTime:0;elapsed.textContent=timeLabel(audio.currentTime);total.textContent=finite?timeLabel(audio.duration):t('Live','Canlı');seek.setAttribute('aria-valuetext',elapsed.textContent+' / '+total.textContent);seek.style.setProperty('--position',(finite?audio.currentTime/audio.duration*100:0)+'%');}
  for(const name of ['play','pause','timeupdate','loadedmetadata','durationchange','emptied'])audio.addEventListener(name,updateTransport);
  audio.addEventListener('volumechange',()=>{glyph(muteButton,audio.muted||audio.volume===0?'muted':'volume');muteButton.setAttribute('aria-label',audio.muted?t('Unmute','Sesi aç'):t('Mute','Sesi kapat'));muteButton.setAttribute('aria-pressed',String(audio.muted));volume.value=audio.muted?0:audio.volume;});
  const analyzeCurrent=btn(t('Analyze playing track','Çalan parçayı analiz et'),()=>{if(!current)return;if(current.kind==='music')window.MusicAnalysisUI.open(current.id);else if(current.kind==='spotify')window.MusicAnalysisUI.open({kind:'spotify',playlistId:current.playlistId,id:current.id});},'mh-action ms-current-analyze');analyzeCurrent.hidden=true;
  const options=el('details','ms-track-menu ms-player-options'),optionsLabel=el('summary');optionsLabel.setAttribute('aria-label',t('Playback settings','Oynatma ayarları'));glyph(optionsLabel,'more');const panel=el('div','ms-track-menu-panel');
  for(const [label,control] of [[t('Playback speed','Oynatma hızı'),speed],[t('Sleep timer','Uyku zamanlayıcısı'),sleep]]){const field=el('label','ms-player-field',label);field.append(control);panel.append(field);}panel.append(analyzeCurrent);options.append(optionsLabel,panel);
  const closeButton=iconButton(t('Close audio player','Ses oynatıcıyı kapat'),'close',async()=>{++playGeneration;void api('spotify-cancel');await flushPosition();audio.pause();if(hls){hls.destroy();hls=null;}audio.removeAttribute('src');audio.load();current=null;dock.classList.add('hidden');document.body.classList.remove('media-shelf-playing');clearTimeout(sleepTimer);},'ms-player-close');
  transport.append(volumeWrap,queueButton,options,closeButton);audio.controls=false;audio.hidden=true;dock.append(now,center,transport,dockStatus,audio);document.body.append(dock);

  function syncQueue(){const save=queueDialog?.querySelector('.ms-save-queue');if(save)save.disabled=!order.snapshot().rows.length||order.snapshot().rows.some(r=>!queueIdentity(r));const state=order.snapshot();queue=state.rows;queueIndex=state.index;shuffleButton.setAttribute('aria-pressed',String(state.shuffled));repeatButton.textContent=state.repeat==='one'?t('Repeat one','Tek parça tekrar'):state.repeat==='all'?t('Repeat all','Liste tekrarı'):t('Repeat off','Tekrar kapalı');repeatButton.dataset.mode=state.repeat;queueButton.textContent=t('Queue','Kuyruk')+' · '+queue.length;paintQueue();paintPlaying();}
  function paintPlaying(){document.querySelectorAll('.ms-track[data-music-id]').forEach(line=>{const playing=current?.id===line.dataset.musicId&&!audio.paused;line.classList.toggle('is-playing',playing);if(playing)line.setAttribute('aria-current','true');else line.removeAttribute('aria-current');});}
  function appendQueue(row,next=false){order.append([row],next);syncQueue();status(t('Added to queue','Kuyruğa eklendi')+' · '+row.title);}
  function queueIdentity(row){return row.kind==='music'?{kind:'music',id:row.id}:row.kind==='spotify'?{kind:'spotify',id:row.id,playlistId:row.playlistId}:null;}
  async function saveQueue(){
    const rows=order.snapshot().rows,entries=rows.map(queueIdentity);
    if(!entries.length||entries.some(r=>!r))throw Error(t('Only local and imported Spotify tracks can be saved.','Yalnız yerel ve aktarılan Spotify parçaları kaydedilebilir.'));
    const fields=await form(t('Save queue as playlist','Kuyruğu liste olarak kaydet'),[{key:'name',label:t('Playlist name','Çalma listesi adı'),value:''}],t('Order and repeated tracks are preserved; playback continues.','Sıra ve tekrarlanan parçalar korunur; çalma devam eder.'));
    if(!fields)return;
    const result=await api('queue-playlist-save',{name:fields.name,entries});
    const note=queueDialog?.querySelector('.ms-queue-note');if(note)note.textContent=t('Playlist saved: ','Liste kaydedildi: ')+result.name;
    await reload();
  }
  function openQueue(){if(queueDialog){queueDialog.focus();return;}queueDialog=el('dialog','ms-queue-dialog media-surface');queueDialog.dataset.uiUntranslated='';queueDialog.setAttribute('aria-labelledby','msQueueTitle');const head=el('header','ms-queue-head');const title=el('h2','',t('Your listening queue','Dinleme kuyruğun'));title.id='msQueueTitle';const close=btn('×',()=>queueDialog.close(),'sp-close');close.setAttribute('aria-label',t('Close queue','Kuyruğu kapat'));head.append(title,close);const query=el('input','ms-queue-query');query.placeholder=t('Search this queue','Kuyrukta ara');query.setAttribute('aria-label',query.placeholder);query.addEventListener('input',paintQueue);const save=btn(t('Save as playlist','Liste olarak kaydet'),saveQueue,'mh-action ms-save-queue');save.disabled=!queue.length||queue.some(r=>!queueIdentity(r));const note=el('p','ms-queue-note');note.setAttribute('role','status');queueDialog.append(head,query,save,note,el('div','ms-queue-rows'),btn(t('Clear upcoming','Sıradakileri temizle'),()=>{order.clearUpcoming();syncQueue();},'mh-action ms-queue-clear'));queueDialog.addEventListener('close',()=>{queueDialog.remove();queueDialog=null;if(typeof syncBrowserOcclusion==='function')syncBrowserOcclusion();},{once:true});document.body.append(queueDialog);paintQueue();queueDialog.showModal();if(typeof syncBrowserOcclusion==='function')syncBrowserOcclusion();}
  function paintQueue(){if(!queueDialog)return;const container=queueDialog.querySelector('.ms-queue-rows'),query=queueDialog.querySelector('input').value.toLocaleLowerCase();container.replaceChildren();const state=order.snapshot();let shown=0;state.rows.forEach((row,index)=>{if(![row.title,row.artist].join(' ').toLocaleLowerCase().includes(query))return;if(++shown>100)return;const line=el('div','ms-queue-row');line.dataset.queueKey=row.queueKey;if(index===state.index)line.classList.add('is-current');const play=btn(row.title,()=>playQueue(index),'mh-text-button ms-queue-play');if(index===state.index)play.setAttribute('aria-current','true');const info=el('div');info.append(play,el('small','',row.artist||row.kind));const actions=el('div','ms-queue-row-actions');for(const [operation,label] of [['up',t('Move up','Yukarı taşı')],['down',t('Move down','Aşağı taşı')],['remove',t('Remove','Kaldır')]]){const b=btn(label,()=>{order.edit(row.queueKey,operation);syncQueue();},'mh-text-button ms-queue-'+operation);b.setAttribute('aria-label',label+' · '+row.title);b.disabled=operation==='remove'?index===state.index:operation==='up'?index===0:index===state.rows.length-1;actions.append(b);}line.append(el('span','ms-queue-number',String(index+1)),info,actions);container.append(line);});if(!shown)container.append(el('p','ms-status',t('No queued tracks match.','Eşleşen kuyruk parçası yok.')));if(shown>100)container.append(el('p','ms-status',t('First 100 matches shown. Narrow the search.','İlk 100 eşleşme gösteriliyor. Aramayı daralt.')));}
  async function advance(auto){const row=order.next(auto);if(!row){audio.pause();return;}if(auto&&order.snapshot().repeat==='one'){audio.currentTime=0;await audio.play();return;}await playQueue(order.snapshot().index);}
  async function favorite(row,button){button.disabled=true;try{const result=await api('music-favorite',{kind:row.kind||'music',id:row.id,playlistId:row.playlistId,favorite:!row.favorite});row.favorite=result.favorite;const local=snapshot?.music?.find(r=>r.id===row.id);if(local)local.favorite=result.favorite;for(const p of snapshot?.linkedPlaylists||[]){const item=p.tracks.find(r=>r.id===row.id);if(item)item.favorite=result.favorite;}button.setAttribute('aria-pressed',String(result.favorite));button.textContent=result.favorite?t('Liked','Beğenildi'):t('Like','Beğen');if(musicFilter==='liked'&&view?.page==='music')draw();}finally{button.disabled=false;}}
  async function renamePlaylist(row,kind){const values=await form(t('Rename playlist','Çalma listesini yeniden adlandır'),[{key:'name',label:t('Playlist name','Çalma listesi adı'),value:row.name}],row.name);if(values)await task('playlist-rename',{id:row.id,kind,...values});}
  function trackMenu(row){const details=el('details','ms-track-menu'),summary=el('summary','','⋯');summary.setAttribute('aria-label',t('Actions for ','Parça işlemleri: ')+row.title);const panel=el('div','ms-track-menu-panel');panel.append(btn(t('Play next','Sıradaki çal'),()=>{appendQueue(row.kind==='spotify'?row:playableMusic(row),true);details.open=false;},'mh-text-button ms-play-next'),btn(t('Add to queue','Kuyruğa ekle'),()=>{appendQueue(row.kind==='spotify'?row:playableMusic(row));details.open=false;},'mh-text-button ms-enqueue'),btn(t('Open in video player','Video oynatıcısında aç'),async()=>{details.open=false;const result=await api('music-play',{id:row.id});await openLocalMedia(result.path,row.position||0);},'mh-text-button'),btn(t('Remove from library','Kütüphaneden kaldır'),()=>forget('music',row),'mh-text-button'));details.append(summary,panel);details.addEventListener('toggle',()=>{if(details.open)document.querySelectorAll('.ms-track-menu[open]').forEach(other=>{if(other!==details)other.open=false;});});return details;}
  function spotifyTrackMenu(row){const menu=el('details','ms-track-menu'),label=el('summary','', '⋯');label.setAttribute('aria-label',t('Track actions: ','Parça işlemleri: ')+row.title);const panel=el('div','ms-track-menu-panel');for(const [next,text] of [[true,t('Play next','Sıradaki çal')],[false,t('Add to queue','Kuyruğa ekle')]])panel.append(btn(text,()=>{appendQueue(row,next);menu.open=false;},'mh-text-button '+(next?'ms-spotify-next':'ms-spotify-enqueue')));menu.append(label,panel);menu.addEventListener('toggle',()=>{if(menu.open)document.querySelectorAll('.ms-track-menu[open]').forEach(other=>{if(other!==menu)other.open=false;});});return menu;}
  function favoriteButton(row){const b=btn(row.favorite?t('Liked','Beğenildi'):t('Like','Beğen'),()=>favorite(row,b),'mh-text-button ms-like');b.setAttribute('aria-pressed',String(!!row.favorite));b.setAttribute('aria-label',t('Like ','Beğen ')+row.title);return b;}

  function status(message = '', error = false) {
    const node = view?.root?.querySelector('.ms-status');
    if (node) { node.textContent = message; node.classList.toggle('mh-error', error); }
    else dockStatus.textContent = message;
  }
  async function api(action, payload = {}) {
    const result = await window.api.mediaShelf({ action, locale:window.UiLocale?.get?.(), ...payload });
    if (result?.canceled) return null;
    if (!result?.ok) throw Error(result?.error || t('Operation failed.', 'İşlem başarısız.'));
    return result;
  }
  async function reload() {
    if (!view?.root.isConnected) return;
    const mine = ++generation, target = view;
    status(t('Loading…', 'Yükleniyor…'));
    const data = await api('list');
    if (mine !== generation || target !== view || !target.root.isConnected) return;
    snapshot = data;const known=new Set(data.music.map(r=>r.id));for(const id of selected)if(!known.has(id))selected.delete(id);draw();
  }
  async function task(action, payload) {
    if (view?.busy) return;
    const target = view; if (!target) return;
    target.busy = true; status(t('Working…', 'İşleniyor…'));
    target.root.querySelectorAll('button').forEach(b => { b.disabled = !b.dataset.cancel;if(b.dataset.cancel)b.hidden=false; });
    try {
      const result = await api(action, payload);
      if (target !== view || !target.root.isConnected) return result;
      await reload();
      if (result?.warnings?.length) status(result.warnings.join('\n'), true);
      return result;
    } finally { target.busy = false; if (target === view) target.root.querySelectorAll('button').forEach(b => { b.disabled = false;if(b.dataset.cancel)b.hidden=true; }); }
  }
  async function forget(kind, row) {
    if (await form(t('Remove from library?', 'Kütüphaneden kaldırılsın mı?'), [], `${row.title || row.name}\n${t('The original file will remain on disk.', 'Asıl dosya diskte kalacak.')}`, t('Remove', 'Kaldır'))) await task('remove', { kind, id: row.id });
  }
  function form(title, fields, description = '', applyLabel = t('Save', 'Kaydet')) {
    return new Promise(resolve => {
      const dialog = el('dialog', 'ms-dialog media-surface'); dialog.dataset.uiUntranslated = '';
      const body = el('form'); body.method = 'dialog'; const heading = el('h2', '', title); heading.id = 'msFormTitle'; dialog.setAttribute('aria-labelledby', heading.id); body.append(heading);
      if (description) body.append(el('p', '', description));
      const controls = {};
      for (const field of fields) {
        const label = el('label', 'ms-field', field.label), input = el('input'); input.name = field.key; input.type = field.type || 'text'; input.maxLength = field.type === 'url' ? 4096 : 150; input.required = true; input.value = field.value || ''; input.autocomplete = 'off'; label.append(input); body.append(label); controls[field.key] = input;
      }
      const actions = el('div', 'mh-actions'); actions.append(btn(t('Cancel', 'Vazgeç'), () => dialog.close()));
      const apply = el('button', 'mh-action mh-primary', applyLabel); apply.type = 'submit'; actions.append(apply); body.append(actions); dialog.append(body); document.body.append(dialog);
      let result = null;
      body.addEventListener('submit', event => { event.preventDefault(); result = Object.fromEntries(Object.entries(controls).map(([key, input]) => [key, input.value.trim()])); dialog.close(); });
      dialog.addEventListener('close', () => { dialog.remove(); if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion(); resolve(result); }, { once: true });
      dialog.showModal(); if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion();
    });
  }
  let playGeneration = 0, lastSaved = 0;
  async function flushPosition() {
    if (!current || current.kind==='spotify' || !Number.isFinite(audio.currentTime)) return;
    const entry = current;
    try { await api('listen-progress', { kind: entry.kind, id: entry.id, url: entry.url, position: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 }); }
    catch (error) { dockStatus.textContent = error.message; }
  }
  async function playQueue(index) {
    if (!queue.length) return;
    const mine = ++playGeneration;
    await api('spotify-cancel');
    if(mine!==playGeneration)return;
    await flushPosition();
    if (mine !== playGeneration) return;
    const chosen=order.jump(index);if(!chosen)return;syncQueue();
    const row = chosen;audio.pause();let source = row.url;
    if (row.kind === 'music') { const result = await api('music-play', { id: row.id }); source = pathToFileUrl(result.path); }
    if(row.kind==='spotify'){dockStatus.textContent=t('Resolving YouTube audio…','YouTube sesi hazırlanıyor…');const result=await api('spotify-play',{playlistId:row.playlistId,id:row.id});source=result.url;}
    if (mine !== playGeneration) return;
    document.getElementById('playerVideo')?.pause();
    if (window.BrowserDubAudioUI?.pause) window.BrowserDubAudioUI.pause();
    audio.pause(); if (hls) { hls.destroy(); hls = null; }
    current = row;analyzeCurrent.hidden=!['music','spotify'].includes(row.kind); dockTitle.textContent = row.title;dockTitle.title=[row.title,row.artist].filter(Boolean).join(' · ');dockArtist.textContent=row.artist||row.album||'';dockArt.replaceChildren();const thumb=window.MediaHomeModel?.thumbnail({url:row.youtubeUrl});if(thumb){const img=el('img');img.alt='';img.width=48;img.height=48;img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();img.src=thumb;dockArt.append(img);}else if(row.kind==='music'){let result=musicCovers.get(row.id);if(!result)result=api('music-cover',{id:row.id}).then(r=>r.cover);void Promise.resolve(result).then(cover=>{if(current!==row||!cover)return;const img=el('img');img.alt='';img.src=cover;dockArt.append(img);}).catch(()=>{});} dockStatus.textContent = '';
    dock.classList.remove('hidden'); document.body.classList.add('media-shelf-playing');
    if (/\.m3u8(?:\?|$)/i.test(source) && window.Hls?.isSupported()) { hls = new window.Hls(); hls.loadSource(source); hls.attachMedia(audio); }
    else audio.src = source;
    audio.playbackRate = +speed.value;
    audio.addEventListener('loadedmetadata', () => { if (mine === playGeneration && row.position > 0 && row.position < audio.duration - 2) audio.currentTime = row.position; }, { once: true });
    await audio.play();if(mine!==playGeneration)return;
    if(['music','spotify'].includes(row.kind)){try{const played=await api('music-played',{kind:row.kind,id:row.id,playlistId:row.playlistId});Object.assign(row,played);const local=snapshot?.music?.find(r=>r.id===row.id);if(local)Object.assign(local,played);}catch(error){dockStatus.textContent=error.message;}}
  }
  function listen(rows, index = 0) {order.set(rows,index);syncQueue();return playQueue(index); }
  audio.addEventListener('pause', () => {paintPlaying();void flushPosition();});audio.addEventListener('play',paintPlaying);
  audio.addEventListener('timeupdate', () => { if (Date.now() - lastSaved > 10000) { lastSaved = Date.now(); void flushPosition(); } });
  audio.addEventListener('ended', () => { void flushPosition().then(() => { return advance(true); }).catch(error=>{dockStatus.textContent=error.message;}); });
  audio.addEventListener('error', () => { dockStatus.textContent = t('Audio could not be played. Check the file or stream address.', 'Ses oynatılamadı. Dosyayı veya yayın adresini kontrol edin.'); });
  document.addEventListener('play', event => { if (event.target !== audio) audio.pause(); }, true);
  new MutationObserver(() => {
    const open = !document.getElementById('playerLayer').classList.contains('hidden');
    document.body.classList.toggle('media-shelf-player-open', open); if (open) audio.pause();
  }).observe(document.getElementById('playerLayer'), { attributes: true, attributeFilter: ['class'] });
  function music(root) {
    const controls = el('div', 'mh-filterbar');
    controls.append(btn(t('Add audio', 'Ses ekle'), () => task('music-import')), btn(t('Add folder', 'Klasör ekle'), () => task('music-import', { folder: true })));
    controls.append(btn(t('Spotify link','Spotify bağlantısı'),()=>window.SpotifyImportUI.open({saved:reload}),'mh-action ms-spotify-open'));
    controls.append(btn(t('Analyze music', 'Müziği analiz et'), () => window.MusicAnalysisUI.open()),btn(t('Analysis history','Analiz geçmişi'),()=>window.MusicAnalysisUI.history()));
    const cancel = btn(t('Cancel import', 'İçe aktarmayı durdur'), () => api('cancel')); cancel.dataset.cancel = '1';cancel.hidden=true; controls.append(cancel);
    controls.append(btn(t('Save selected as playlist', 'Seçilenlerle çalma listesi oluştur'), async () => {
      const value = await form(t('New playlist', 'Yeni çalma listesi'), [{ key: 'name', label: t('Name', 'Ad') }]);
      if (value) await task('playlist-save', { ...value, ids: [...selected] });
    }));
    const filters=el('div','mh-filterbar ms-music-filters');const artist = el('select'), album = el('select');
    const filter=el('select','ms-music-filter'),sort=el('select','ms-music-sort');filter.setAttribute('aria-label',t('Music selection','Müzik seçimi'));sort.setAttribute('aria-label',t('Sort music','Müzik sırası'));
    for(const [value,en,tr] of [['all','All tracks','Tüm parçalar'],['liked','Liked tracks','Beğendiklerim'],['recent','Recently played','Son dinlenenler']]){const option=el('option','',t(en,tr));option.value=value;filter.append(option);}filter.value=musicFilter;
    for(const [value,en,tr] of [['title','Title','Parça adı'],['artist','Artist','Sanatçı'],['recent','Recently played first','Son dinlenen önce'],['plays','Most played','En çok dinlenen']]){const option=el('option','',t(en,tr));option.value=value;sort.append(option);}sort.value=musicSort;filters.append(filter,sort);

    for (const [control, key, title] of [[artist, 'artist', t('All artists', 'Tüm sanatçılar')], [album, 'album', t('All albums', 'Tüm albümler')]]) {
      control.setAttribute('aria-label', title); const all = el('option', '', title); all.value = ''; control.append(all);
      [...new Set(snapshot.music.map(row => row[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b)).forEach(value => { const option = el('option', '', value); option.value = value; control.append(option); }); filters.append(control);
    }
    filters.hidden=!snapshot.music.length;root.append(controls,filters);
    const albumRail=el('div','ms-album-rail');const albums=new Map();for(const row of snapshot.music){if(!row.album)continue;const key=JSON.stringify([row.artist||'',row.album]);const group=albums.get(key)||{name:row.album,artist:row.artist||'',rows:[]};group.rows.push(row);albums.set(key,group);}if(albums.size){const section=el('section','ms-albums');section.append(el('h2','',t('Your albums','Albümlerin')));for(const group of [...albums.values()].slice(0,24)){const card=el('article','ms-album-card'),mark=el('div','ms-album-art');mark.setAttribute('aria-hidden','true');mark.textContent=group.name.slice(0,1).toLocaleUpperCase();const sourceId=group.rows[0].id;const applyCover=cover=>{if(!cover||!mark.isConnected)return;const image=el('img');image.alt='';image.src=cover;mark.replaceChildren(image);mark.classList.add('has-cover');};if(musicCovers.has(sourceId))requestAnimationFrame(()=>applyCover(musicCovers.get(sourceId)));else void api('music-cover',{id:sourceId}).then(r=>{musicCovers.set(sourceId,r.cover);if(musicCovers.size>128)musicCovers.delete(musicCovers.keys().next().value);applyCover(r.cover);}).catch(()=>{});const select=btn(group.name,()=>{album.value=group.name;artist.value=group.artist;paint();},'mh-text-button ms-album-title');card.append(mark,select,el('small','',group.artist+' · '+group.rows.length),btn(t('Play album','Albümü oynat'),()=>listen(group.rows.slice().sort((a,b)=>(parseInt(a.track)||0)-(parseInt(b.track)||0)).map(playableMusic)),'mh-action'));albumRail.append(card);}section.append(albumRail);root.append(section);}
    const quick=el('div','ms-music-quick'),count=el('span','ms-music-count'),playAll=btn(t('Play selection','Seçimi oynat'),()=>listen(visibleMusic.map(playableMusic)),'mh-action mh-primary ms-play-selection'),shuffleAll=btn(t('Shuffle selection','Seçimi karıştır'),()=>{order.set(visibleMusic.map(playableMusic));order.shuffle(true);syncQueue();return playQueue(0);},'mh-action ms-shuffle-selection');let visibleMusic=[];quick.append(count,playAll,shuffleAll);quick.hidden=!snapshot.music.length;root.append(quick);
    const list = el('div', 'ms-track-list'); root.append(list);
    const paint = () => {
      list.replaceChildren();
      const fold = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('tr').replace(/ı/g, 'i');
      const rows = snapshot.music.filter(row => (filter.value!=='liked'||row.favorite)&&(filter.value!=='recent'||row.lastPlayedAt)&& (!artist.value || row.artist === artist.value) && (!album.value || row.album === album.value) && fold(`${row.title} ${row.artist} ${row.album}`).includes(fold(view.query)));
      rows.sort((a,b)=>sort.value==='plays'?(b.playCount||0)-(a.playCount||0):sort.value==='recent'||filter.value==='recent'?(b.lastPlayedAt||0)-(a.lastPlayedAt||0):String(a[sort.value]||a.title).localeCompare(String(b[sort.value]||b.title),english()?'en':'tr'));
      visibleMusic=rows;count.textContent=t(`${rows.length} tracks`,`${rows.length} parça`);playAll.disabled=shuffleAll.disabled=!rows.length;
      let shown = 0;
      const more = () => {
        const next = rows.slice(shown, shown + 60); shown += next.length;
        for (const row of next) {
          const line = el('div', 'ms-track'), check = el('input');line.dataset.musicId=row.id; check.type = 'checkbox'; check.checked = selected.has(row.id); check.setAttribute('aria-label', `${t('Select', 'Seç')}: ${row.title}`);
          check.addEventListener('change', () => { if (check.checked) selected.add(row.id); else selected.delete(row.id); });
          const title = el('div'); title.append(el('strong', '', row.title), el('small', '', [row.artist, row.album].filter(Boolean).join(' · ')));
          line.append(check, btn('▶', () => listen(rows.map(value => ({ ...value, kind: 'music' })), rows.indexOf(row))), title,
            el('span', 'ms-time', `${Math.floor(row.duration / 60)}:${String(Math.floor(row.duration % 60)).padStart(2, '0')}`),
            favoriteButton(row),btn(t('Analyze', 'Analiz et'), () => window.MusicAnalysisUI.open(row.id)),trackMenu(row));
          line.querySelector('button').setAttribute('aria-label', `${t('Play', 'Oynat')}: ${row.title}`); list.append(line);
        }
        moreButton.hidden = shown >= rows.length;
      };
      const moreButton = btn(t('Show more', 'Daha fazla göster'), more); more(); list.append(moreButton);
      if (!rows.length&&!snapshot.linkedPlaylists?.length) list.append(window.MediaHomeUI.emptyState(view.query?t('No matching tracks','Eşleşen parça yok'):t('Your music starts here','Müziğin burada başlasın'),view.query?t('Try another title or artist.','Başka bir parça veya sanatçı adı dene.'):t('Add local audio or bring a Spotify playlist. You can analyze its sound and discover similar tracks.','Yerel ses ekle veya Spotify listesi getir. Sesini analiz edip benzer parçalar keşfedebilirsin.'),[[t('Add audio','Ses ekle'),()=>task('music-import')],[t('Spotify link','Spotify bağlantısı'),()=>window.SpotifyImportUI.open({saved:reload})]]));
    };
    artist.addEventListener('change', paint); album.addEventListener('change', paint);filter.addEventListener('change',()=>{musicFilter=filter.value;paint();});sort.addEventListener('change',()=>{musicSort=sort.value;paint();});paint();paintPlaying();
    if (snapshot.linkedPlaylists?.length) {
      const section=el('section','mh-section ms-linked-playlists');const fold=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('tr').replace(/ı/g,'i');section.append(el('h2','',t('From Spotify','Spotify’dan aktarılanlar')),el('p','mh-subtitle',t('Reviewed YouTube matches. Spotify audio is not downloaded.','İncelenen YouTube eşleşmeleri. Spotify sesi indirilmez.')));
      for(const playlist of snapshot.linkedPlaylists){
        const shownTracks=playlist.tracks.filter(row=>fold([playlist.name,row.title,row.artist].join(' ')).includes(fold(view.query)));if(!shownTracks.length)continue;
        const details=el('details','ms-linked-playlist'),summary=el('summary'),name=el('span','ms-linked-name',playlist.name);
        summary.append(name,el('span','ms-linked-count',t(`${shownTracks.length} tracks`,`${shownTracks.length} parça`)));details.append(summary);
        const toolbar=el('div','ms-linked-toolbar');toolbar.append(btn(t('Play playlist','Listeyi oynat'),()=>listen(shownTracks.map(row=>({...row,kind:'spotify',playlistId:playlist.id}))),'mh-action mh-primary'),btn(t('Open on Spotify','Spotify’da aç'),()=>window.api.openExternal(playlist.sourceUrl),'mh-action'));
        const menu=el('details','ms-track-menu'),menuTitle=el('summary','', '⋯');menuTitle.setAttribute('aria-label',t('Playlist actions','Liste işlemleri'));const menuPanel=el('div','ms-track-menu-panel');menuPanel.append(btn(t('Rename','Yeniden adlandır'),()=>renamePlaylist(playlist,'spotify'),'mh-text-button'),btn(t('Remove playlist','Listeyi kaldır'),async()=>{if(await form(t('Remove playlist?','Liste kaldırılsın mı?'),[],playlist.name,t('Remove','Kaldır')))await task('spotify-remove',{id:playlist.id});},'mh-text-button'));menu.append(menuTitle,menuPanel);toolbar.append(menu);details.append(toolbar);
        const trackList=el('div','ms-linked-tracks');
        for(const [i,row] of shownTracks.entries()){
          const line=el('div','ms-track ms-linked-track'),play=btn('▶',()=>listen(shownTracks.map(r=>({...r,kind:'spotify',playlistId:playlist.id})),i),'mh-action ms-linked-play');play.setAttribute('aria-label',t('Play ','Oynat ')+row.title);
          const cover=el('div','ms-linked-cover');cover.setAttribute('aria-hidden','true');
          const thumb=window.MediaHomeModel?.thumbnail({url:row.youtubeUrl});
          if(thumb){const image=el('img');image.alt='';image.width=56;image.height=56;image.loading='lazy';image.referrerPolicy='no-referrer';let fallback=false;image.onerror=()=>{if(!fallback){fallback=true;image.src=thumb.replace('/hqdefault.jpg','/mqdefault.jpg');}else image.remove();};image.src=thumb;cover.append(image);}
          const copy=el('div','ms-linked-track-copy');copy.append(el('strong','',row.title),el('small','',row.artist));
          const actions=el('div','ms-linked-track-actions');actions.append(favoriteButton({...row,kind:'spotify',playlistId:playlist.id}),btn(t('Analysis & results','Analiz ve sonuçlar'),()=>window.MusicAnalysisUI.open({kind:'spotify',playlistId:playlist.id,id:row.id}),'mh-action ms-linked-analyze'),spotifyTrackMenu({...row,kind:'spotify',playlistId:playlist.id}));
          line.append(play,cover,copy,actions);trackList.append(line);
        }
        details.append(trackList);section.append(details);
      }
      if(section.querySelector('.ms-linked-playlist'))root.append(section);
    }
    if(snapshot.queuePlaylists?.length){
      const section=el('section','mh-section ms-saved-queues');section.append(el('h2','',t('Your saved queues','Kaydedilen kuyrukların')));
      for(const list of snapshot.queuePlaylists){
        if(view.query&&!list.name.toLocaleLowerCase().includes(view.query.toLocaleLowerCase()))continue;
        const rows=list.entries.map(e=>e.kind==='music'?snapshot.music.find(r=>r.id===e.id):snapshot.linkedPlaylists?.find(p=>p.id===e.playlistId)?.tracks.find(r=>r.id===e.id)).map((row,i)=>row?{...row,...list.entries[i]}:null).filter(Boolean);
        const card=el('article','ms-saved-queue'),copy=el('div');copy.append(el('h3','',list.name),el('small','',t(`${rows.length} available · ${list.entries.length} saved`,`${rows.length} kullanılabilir · ${list.entries.length} kayıtlı`)));const actions=el('div','ms-saved-queue-actions');
        const play=btn(t('Play','Oynat'),()=>listen(rows),'mh-action ms-play-saved-queue');play.disabled=!rows.length;
        actions.append(play,btn(t('Rename','Yeniden adlandır'),()=>renamePlaylist(list,'queue'),'mh-text-button'),btn(t('Remove','Kaldır'),async()=>{if(await form(t('Remove saved queue?','Kayıtlı kuyruk kaldırılsın mı?'),[],list.name,t('Remove','Kaldır')))await task('queue-playlist-remove',{id:list.id});},'mh-text-button'));card.append(copy,actions);section.append(card);
      }
      if(section.querySelector('.ms-saved-queue'))root.append(section);
    }
    if (snapshot.playlists.length) {
      const playlists = el('section', 'mh-section'); playlists.append(el('h2', '', t('Playlists', 'Çalma listeleri')));
      snapshot.playlists.forEach(row => { const line = el('div', 'ms-track'); line.append(btn(`${row.name} (${row.tracks.length})`, () => listen(row.tracks.map(id => snapshot.music.find(item => item.id === id)).filter(Boolean).map(row => ({ ...row, kind: 'music' })))), btn(t('Rename','Yeniden adlandır'),()=>renamePlaylist(row,'local'),'mh-text-button'),btn(t('Remove', 'Kaldır'), () => forget('playlists', row), 'mh-text-button')); playlists.append(line); }); root.append(playlists);
    }
  }
  async function openPdfPage(file, pageNumber = 1) {
    document.getElementById('playerLayer').classList.remove('hidden'); setWorkspaceMode('player');
    const previous = player.pdfReader;
    await openPdfReader(file);
    if (!player.pdfReader || player.pdfReader === previous || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > player.pdfReader.pdf.numPages) throw Error(t('The source page could not be opened.', 'Kaynak sayfa açılamadı.'));
    const input = document.getElementById('pdfReaderPage'); input.value = String(pageNumber); input.dispatchEvent(new Event('change'));
  }
  async function openBook(row, focus = null) {
    const book = await api('book-open', { id: row.id, ...(focus ? { expectedSource: focus } : {}) });
    if (book.format === 'pdf') { await openPdfPage(book.path, focus?.pageNumber || 1); return; }
    let focusIndex = null;
    if (focus) {
      focusIndex = focus.index;
      const c = book.chapters[focusIndex];
      if (!Number.isInteger(focusIndex) || !c || (focus.sourceId && (c.sourceId !== focus.sourceId || c.sourceSpineIndex !== focus.sourceSpineIndex))) throw Error(t('The source chapter could not be matched.', 'Kaynak bölüm eşleştirilemedi.'));
    }
    const dialog = el('dialog', 'ms-reader media-surface'); dialog.dataset.uiUntranslated = ''; dialog.setAttribute('aria-label', book.title);
    const header = el('header'), chapters = el('select'); chapters.setAttribute('aria-label', t('Chapter', 'Bölüm'));
    book.chapters.forEach((chapter, index) => { const opt = el('option', '', chapter.title || `${t('Chapter', 'Bölüm')} ${index + 1}`); opt.value = index; chapters.append(opt); });
    let index = focusIndex ?? Math.min(book.chapter || 0, book.chapters.length - 1), timer = null;
    const prose = el('article', 'ms-prose'); prose.tabIndex = 0;
    window.MediaExperience?.bindPassage(prose, ({ text, offset, selectedText }) => {
      if (!dialog.open) return;
      window.MediaExperience.setContext(dialog, { id: book.id+':'+index, type: 'book-chapter', title: book.title, chapter: book.chapters[index].title || String(index + 1), excerpt: text.slice(Math.max(0, offset - 1500), Math.max(0, offset - 1500) + 8000), selectedText });
    });
    const position = () => ({ chapter: index, scroll: prose.scrollHeight > prose.clientHeight ? prose.scrollTop / (prose.scrollHeight - prose.clientHeight) : 0 });
    const save = () => api('book-progress', { id: book.id, ...position() }).catch(error => { readerStatus.textContent = error.message; return false; });
    const readerStatus = el('p', 'ms-status'); readerStatus.setAttribute('role', 'status');
    function show(next, scroll = 0) {
      index = Math.max(0, Math.min(book.chapters.length - 1, next)); chapters.value = index; prose.replaceChildren();
      book.chapters[index].text.split(/\n\s*\n/).forEach(paragraph => prose.append(el('p', '', paragraph)));
      window.MediaExperience?.setContext(dialog, { id: book.id+':'+index, type: 'book-chapter', title: book.title, chapter: book.chapters[index].title || String(index + 1), excerpt: book.chapters[index].text.slice(0, 8000) });
      requestAnimationFrame(() => { prose.scrollTop = scroll * Math.max(0, prose.scrollHeight - prose.clientHeight); });
    }
    chapters.addEventListener('change', async () => { await save(); show(+chapters.value); });
    const font = el('input'); font.type = 'range'; font.min = '15'; font.max = '28'; font.value = '20'; font.setAttribute('aria-label', t('Font size', 'Yazı boyutu')); font.addEventListener('input', () => { prose.style.fontSize = `${font.value}px`; });
    const marks = el('select'); marks.setAttribute('aria-label', t('Saved bookmarks and quotes', 'Kaydedilmiş yer imleri ve alıntılar'));
    const noMark = el('option', '', t('Bookmarks & quotes', 'Yer imleri ve alıntılar')); noMark.value = ''; marks.append(noMark);
    (book.bookmarks || []).forEach((mark, at) => { const opt = el('option', '', mark.quote || `${t('Chapter', 'Bölüm')} ${mark.chapter + 1}`); opt.value = at; marks.append(opt); });
    marks.addEventListener('change', async () => { if (marks.value === '') return; const mark = book.bookmarks[+marks.value]; await save(); show(mark.chapter, mark.scroll); });
    const narrateChapter=async(args=null,stale=()=>false)=>{
      if(args&&(args.from!==index+1||args.to!==index+1||args.text==='translation'))throw Error(t('Prepare the current original chapter first; select other chapters in production.','Önce güncel özgün bölümü hazırla; diğer bölümleri üretim ekranında seç.'));
      const sourceIndex=index;
      if(await save()===false)return false;
      if(!dialog.open||index!==sourceIndex||stale())throw Error(t('The chapter changed; ask again from the current chapter.','Bölüm değişti; güncel bölümden yeniden iste.'));
      const c=book.chapters[sourceIndex];
      const result=await window.api.mediaWorkflows({action:'book-from-shelf',locale:window.UiLocale?.get?.(),shelfId:book.id,sourceChapter:{index:sourceIndex,sourceId:c.sourceId,sourceSpineIndex:c.sourceSpineIndex,text:c.text,sourceSize:book.sourceSize,sourceMtime:book.sourceMtime}});
      if(!result?.ok)throw Error(result?.error||t('Voice production could not be opened.','Sesli üretim açılamadı.'));
      if(!dialog.open||index!==sourceIndex||stale())throw Error(t('The chapter changed; the project was kept without opening another source.','Bölüm değişti; proje korundu, başka kaynak açılmadı.'));
      await window.MediaWorkflowsUI.openProject(result.project.id,{chapter:result.focusChapter,selectChapter:true});dialog.close();return true;
    };
    header.append(el('strong', '', book.title), chapters, font, marks, btn(t('Bookmark / quote', 'Yer imi / alıntı'), async () => {
      const selection = window.getSelection(), quote = selection && prose.contains(selection.anchorNode) ? selection.toString().slice(0, 2000) : '';
      const mark = { ...position(), quote }; await api('book-progress', { id: book.id, ...mark, bookmark: true });
      book.bookmarks.push(mark); const opt = el('option', '', quote || `${t('Chapter', 'Bölüm')} ${index + 1}`); opt.value = book.bookmarks.length - 1; marks.append(opt); readerStatus.textContent = t('Saved.', 'Kaydedildi.');
    }), btn(t('Copy chapter', 'Bölümü kopyala'), () => window.api.copyText(book.chapters[index].text)), btn(t('Open chapter in voice production', 'Bölümü sesli üretimde aç'), narrateChapter), btn(t('Voice studio', 'Ses stüdyosu'), () => window.api.openTextVoiceUI()), btn('×', async () => { if (await save() !== false) dialog.close(); }));
    header.lastChild.setAttribute('aria-label', t('Close reader', 'Okuyucuyu kapat'));
    header.lastChild.classList.add('ms-reader-close');
    const tools=el('details','ms-reader-tools'),summary=el('summary','mh-action',t('Reading tools','Okuma araçları')),toolPanel=el('div','ms-reader-tool-panel');
    for(const [control,label]of [[font,t('Text size','Yazı boyutu')],[marks,t('Bookmarks & quotes','Yer imleri ve alıntılar')]]){const wrap=el('label','',label);wrap.append(control);toolPanel.append(wrap);}
    for(const button of [...header.querySelectorAll('button')]){
      if([t('Bookmark / quote','Yer imi / alıntı'),t('Copy chapter','Bölümü kopyala'),t('Voice studio','Ses stüdyosu')].includes(button.textContent))toolPanel.append(button);
      else if(button.textContent===t('Open chapter in voice production','Bölümü sesli üretimde aç')){button.textContent=t('Narrate chapter','Bölümü seslendir');button.classList.add('mh-primary');}
    }
    tools.append(summary,toolPanel);header.insertBefore(tools,header.lastElementChild);toolPanel.addEventListener('click',e=>{if(e.target.closest('button'))tools.open=false;});
    dialog.addEventListener('toggle', event=>{const opened=event.target;if(opened.tagName==='DETAILS'&&opened.open)for(const menu of header.querySelectorAll('details[open]'))if(menu!==opened)menu.open=false;},true);
    dialog.addEventListener('pointerdown',event=>{for(const menu of header.querySelectorAll('details[open]'))if(!menu.contains(event.target))menu.open=false;});
    dialog.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const menu=header.querySelector('details[open]');if(menu){menu.open=false;menu.querySelector('summary')?.focus();event.preventDefault();event.stopPropagation();}},true);
    dialog.append(header);const disposeAssistant=window.BookAssistantUI?.mount(header,{t,compact:true,onNarrate:()=>narrateChapter(),onPrepare:async(args,stale)=>({ok:await narrateChapter(args,stale)}),isCurrent:()=>dialog.open&&dialog.isConnected,getSource:()=>{const base=window.MediaExperience.context(),id=book.id+':'+index;return {id,type:'book-chapter',chapterNumber:index+1,totalChapters:book.chapters.length,title:book.title,chapter:book.chapters[index].title||String(index+1),text:book.chapters[index].text,selectedText:base?.id===id?base.selectedText:'',selectedTextTruncated:base?.id===id&&base.selectedTextTruncated===true,excerpt:base?.id===id?base.excerpt:''};}});dialog.append(readerStatus, prose); document.body.append(dialog); dialog.showModal(); if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion(); show(index, book.scroll || 0);
    prose.addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(save, 900); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); void save().then(result => { if (result !== false) dialog.close(); }); });
    dialog.addEventListener('close', () => { disposeAssistant?.();clearTimeout(timer); dialog.remove(); if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion(); void reload(); });
  }
  function books(root) {
    root.append(btn(t('Add EPUB / PDF / TXT', 'EPUB / PDF / TXT ekle'), () => task('book-import')));
    if(!snapshot.books.length){root.append(window.MediaHomeUI.emptyState(t('A place for your books','Kitapların için bir yer'),t('Bring an EPUB, PDF or text file. Read, ask about a passage, or prepare an audiobook with your voice.','EPUB, PDF veya metin dosyanı getir. Oku, bir pasajı sor veya kendi sesinle sesli kitap hazırla.'),[[t('Add a book','Kitap ekle'),()=>task('book-import')]]));return;}
    const grid = el('div', 'mh-grid ms-book-grid'), audioSlots = new Map();
    const rows = snapshot.books.filter(row => `${row.title} ${row.author}`.toLocaleLowerCase().includes(view.query.toLocaleLowerCase()));
    rows.slice(0, 300).forEach(row => {
      const node = btn('', () => openBook(row), 'mh-card'), cover = el('div', 'mh-art');
      if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(row.cover || '')) { const img = el('img'); img.src = row.cover; img.alt = ''; img.loading = 'lazy'; cover.append(img); } else cover.append(el('span', 'ms-book-placeholder', row.format.toUpperCase()));
      node.append(cover, el('span', 'mh-card-title', row.title), el('span', 'mh-card-meta', row.author || row.format.toUpperCase()));
      const shell = el('div'), actions = el('div', 'ms-book-actions'), audioSlot = el('div', 'ms-book-audiobook');
      audioSlot.append(el('small','ms-status',t('No finished audiobook yet','Henüz hazır sesli kitap yok')));
      const read=btn(t('Read','Oku'),()=>openBook(row),'mh-action mh-primary');read.dataset.bookAction='read';
      const narrate=btn(t('Narrate','Seslendir'),async()=>{const r=await window.api.mediaWorkflows({action:'book-from-shelf',shelfId:row.id});if(!r.ok)throw Error(r.error);if(!shell.isConnected)return;await window.MediaWorkflowsUI.openProject(r.project.id);},'mh-action');narrate.dataset.bookAction='narrate';
      actions.append(read,narrate,audioSlot,btn(t('Remove', 'Kaldır'), () => forget('books', row), 'mh-text-button'));
      shell.append(node, actions); audioSlots.set(row.id, audioSlot); grid.append(shell);
    });
    root.append(grid); if (!rows.length) root.append(el('p', 'mh-empty', t('Add books to keep covers, reading position, bookmarks and quotes together. EPUB opens as a safe text reader; fixed-layout/DRM content is not supported.', 'Kapakları, okuma konumunu, yer imlerini ve alıntıları bir arada tutmak için kitap ekle. EPUB güvenli metin okuyucuda açılır; sabit düzen/DRM içeriği desteklenmez.')));
    if (audioSlots.size) void loadAudiobooks(audioSlots, generation);
  }
  async function loadAudiobooks(slots, mine) {
    try {
      const result = await window.api.mediaWorkflows({ action: 'book-audiobooks', shelfIds: [...slots.keys()] });
      if (mine !== generation || !result?.ok) return;
      for (const info of result.audiobooks) {
        const slot = slots.get(info.shelfId);
        if (!slot?.isConnected) continue;
        const play = btn(t('Listen to M4B', "M4B’yi dinle"), async () => {
          const opened = await window.api.mediaWorkflows({ action: 'book-audiobook', id: info.projectId, exportId: info.id });
          if (!opened?.ok) throw Error(opened?.error || t('Audiobook unavailable.', 'Sesli kitap kullanılamıyor.'));
          if (mine !== generation || !slot.isConnected) return;
          await openLocalMedia(opened.path, 0);
        }, 'mh-action mh-primary');
        play.disabled = !info.available;
        play.title = info.name;
        const meta = el('small', 'ms-status', t(`${info.chapters} chapters`, `${info.chapters} bölüm`));
        if (!info.available) meta.textContent += t(' · File moved or changed', ' · Dosya taşınmış veya değişmiş');
        else if (!info.current) meta.textContent += t(' · Earlier text version', ' · Önceki metin sürümü');
        if(!slot.querySelector('button'))slot.replaceChildren();
        play.dataset.bookAction='listen';slot.append(play, meta);
      }
    } catch (error) {
      if (mine === generation) status(error.message, true);
    }
  }
  function radio(root) {
    const controls = el('div', 'mh-filterbar');
    controls.append(btn(t('Add radio', 'Radyo ekle'), async () => { const value = await form(t('Add radio stream', 'Radyo yayını ekle'), [{ key: 'title', label: t('Name', 'Ad') }, { key: 'url', label: t('Direct audio URL', 'Doğrudan ses adresi'), type: 'url' }]); if (value) await task('radio-save', value); }),
      btn(t('Add / refresh podcast', 'Podcast ekle / yenile'), async () => { const value = await form(t('Podcast RSS', 'Podcast RSS'), [{ key: 'url', label: t('RSS / Atom feed URL', 'RSS / Atom besleme adresi'), type: 'url' }]); if (value) await task('podcast-add', value); }));
    root.append(controls);
    for (const row of snapshot.stations) { const line = el('div', 'ms-track'); line.append(el('strong', '', row.title), btn(t('Listen', 'Dinle'), () => listen([{ ...row, kind: 'stations' }])), btn(t('Remove', 'Kaldır'), () => forget('stations', row), 'mh-text-button')); root.append(line); }
    for (const podcast of snapshot.podcasts) {
      const details = el('details', 'ms-podcast'); details.append(el('summary', '', `${podcast.title} (${podcast.episodes.length})`));
      details.append(btn(t('Refresh', 'Yenile'), () => task('podcast-add', { url: podcast.url })));
      details.append(btn(t('Remove', 'Kaldır'), () => forget('podcasts', podcast), 'mh-text-button'));
      podcast.episodes.forEach((row, index) => {
        const line = el('div', 'ms-track'); line.append(el('strong', '', row.title), btn(t('Play', 'Oynat'), () => listen(podcast.episodes.map(row => ({ ...row, id: podcast.id, kind: 'podcasts' })), index))); details.append(line);
      }); root.append(details);
    }
    if (!snapshot.stations.length && !snapshot.podcasts.length) root.append(window.MediaHomeUI.emptyState(t('Find your next listen','Sıradaki dinleyeceğini bul'),t('Add a radio stream or podcast feed using the controls above. Episodes keep their listening position.','Yukarıdaki düğmelerden radyo yayını veya podcast akışı ekle. Bölümlerin dinleme konumu korunur.')));
  }
  function taste(root) {
    root.append(btn(t('Import Letterboxd CSV / ZIP', 'Letterboxd CSV / ZIP içe aktar'), async () => {
      const preview = await api('letterboxd-preview'); if (!preview) return;
      const description = t(`${preview.count} rows: ${preview.matches} existing matches, ${preview.newTitles} new titles, ${preview.ambiguous.length} ambiguous. ${preview.preserved} personal ratings will be preserved. No source files will change.`, `${preview.count} satır: ${preview.matches} mevcut eşleşme, ${preview.newTitles} yeni yapım, ${preview.ambiguous.length} belirsiz. ${preview.preserved} kişisel puan korunacak. Kaynak dosyalar değişmez.`);
      if (await form(t('Review import', 'İçe aktarmayı incele'), [], description, t('Apply import', 'İçe aktar'))) { await task('letterboxd-apply', { token: preview.token }); document.dispatchEvent(new CustomEvent('media-library-changed')); }
    }));
    if(window.MediaTasteUI){window.MediaTasteUI.mount(root,snapshot.taste);return;}
    const taste = snapshot.taste;
    root.append(el('p', 'mh-empty', t(`${taste.titles} imported titles; ${taste.rated} rated. Average: ${taste.average === null ? '—' : taste.average.toFixed(1)}/5.`, `${taste.titles} içe aktarılan yapım; ${taste.rated} puanlı. Ortalama: ${taste.average === null ? '—' : taste.average.toFixed(1)}/5.`)));
    if (taste.decades.length) root.append(el('p', '', t('Most rated decades: ', 'En çok puanlanan dönemler: ') + taste.decades.map(([year, count]) => `${year} (${count})`).join(', ')));
    root.append(el('p', 'mh-empty', t('This summary is calculated locally from your ratings, without an AI service or a Letterboxd login.', 'Bu özet puanlarından yerelde hesaplanır; AI servisi veya Letterboxd girişi gerekmez.')));
  }
  function draw() {
    if (!view?.root.isConnected || !snapshot) return;
    view.root.replaceChildren(); const statusNode = el('p', 'ms-status'); statusNode.setAttribute('role', 'status'); view.root.append(statusNode);
    ({ music, books, radio, taste })[view.page]?.(view.root);
  }
  document.addEventListener('ui-locale-change', () => {
    const first = sleep.options[0]; if (first) first.textContent = t('Sleep timer off', 'Uyku zamanlayıcısı kapalı');
    speed.setAttribute('aria-label', t('Playback speed', 'Oynatma hızı')); sleep.setAttribute('aria-label', t('Sleep timer', 'Uyku zamanlayıcısı'));shuffleButton.textContent=t('Shuffle','Karıştır');seek.setAttribute('aria-label',t('Playback position','Oynatma konumu'));volume.setAttribute('aria-label',t('Volume','Ses düzeyi'));previousButton.setAttribute('aria-label',t('Previous track','Önceki parça'));nextButton.setAttribute('aria-label',t('Next track','Sonraki parça'));closeButton.setAttribute('aria-label',t('Close audio player','Ses oynatıcıyı kapat'));optionsLabel.setAttribute('aria-label',t('Playback settings','Oynatma ayarları'));updateTransport();syncQueue();
  });
  window.MediaShelfUI = Object.freeze({ executeMusic:async args=>{const op=args.operation;if(op==='open_spotify_import')window.SpotifyImportUI.open({saved:reload});else if(op==='open_queue')openQueue();else {if(!order.current())throw Error('No active music queue / Etkin müzik kuyruğu yok.');if(op==='queue_next')await advance(false);else if(op==='queue_previous'){order.previous();await playQueue(order.snapshot().index);}else if(op==='set_queue_shuffle'){if(typeof args.selected!=='boolean')throw Error('Invalid shuffle');order.shuffle(args.selected);syncQueue();}else if(op==='set_queue_repeat'){order.setRepeat(args.repeat_mode);syncQueue();}else throw Error('Unknown music player action');}return window.MediaShelfUI.musicContext();},musicContext:()=>({playing:!!current&&!audio.paused,current:current?{id:current.id,title:current.title,artist:current.artist,kind:current.kind}:null,queue:order.snapshot().rows.slice(0,50).map(r=>({id:r.id,title:r.title,artist:r.artist,kind:r.kind})),queueCount:order.snapshot().rows.length,index:order.snapshot().index,repeat:order.snapshot().repeat,shuffle:order.snapshot().shuffled}), openBook:(id,focus)=>openBook({id},focus), openPdfPage, mount(root, page, query = '') {
    view = { root, page, query, busy: false }; ++generation;
    const loading = el('p', 'ms-status'); loading.setAttribute('role', 'status'); root.replaceChildren(loading);
    void reload().catch(error => status(error.message, true));
  } });
})();
