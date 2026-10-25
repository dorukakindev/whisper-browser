(() => {
  'use strict';
  const english = () => window.UiLocale?.get?.() !== 'tr';
  const t = (en, tr) => english() ? en : tr;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  let view = null, generation = 0, snapshot = null, current = null, queue = [], queueIndex = 0, hls = null;
  const selected = new Set();
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
  dock.append(btn('‹', () => playQueue(queueIndex - 1)), dockTitle, audio, btn('›', () => playQueue(queueIndex + 1)), speed, sleep, dockStatus, btn('×', async () => { await flushPosition(); audio.pause(); if (hls) { hls.destroy(); hls = null; } audio.removeAttribute('src'); audio.load(); current = null; dock.classList.add('hidden'); document.body.classList.remove('media-shelf-playing'); clearTimeout(sleepTimer); }));
  dock.querySelector('button').setAttribute('aria-label', t('Previous track', 'Önceki parça'));
  dock.querySelectorAll('button')[1].setAttribute('aria-label', t('Next track', 'Sonraki parça'));
  dock.querySelectorAll('button')[2].setAttribute('aria-label', t('Close audio player', 'Ses oynatıcıyı kapat'));
  document.body.append(dock);
  dock.append(dockStatus);
  function status(message = '', error = false) {
    const node = view?.root?.querySelector('.ms-status');
    if (node) { node.textContent = message; node.classList.toggle('mh-error', error); }
    else dockStatus.textContent = message;
  }
  async function api(action, payload = {}) {
    const result = await window.api.mediaShelf({ action, ...payload });
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
    snapshot = data; draw();
  }
  async function task(action, payload) {
    if (view?.busy) return;
    const target = view; if (!target) return;
    target.busy = true; status(t('Working…', 'İşleniyor…'));
    target.root.querySelectorAll('button').forEach(b => { b.disabled = !b.dataset.cancel; });
    try {
      const result = await api(action, payload);
      if (target !== view || !target.root.isConnected) return result;
      await reload();
      if (result?.warnings?.length) status(result.warnings.join('\n'), true);
      return result;
    } finally { target.busy = false; if (target === view) target.root.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
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
    if (!current || !Number.isFinite(audio.currentTime)) return;
    const entry = current;
    try { await api('listen-progress', { kind: entry.kind, id: entry.id, url: entry.url, position: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 }); }
    catch (error) { dockStatus.textContent = error.message; }
  }
  async function playQueue(index) {
    if (!queue.length) return;
    const mine = ++playGeneration;
    await flushPosition();
    if (mine !== playGeneration) return;
    queueIndex = (index + queue.length) % queue.length;
    const row = queue[queueIndex]; let source = row.url;
    if (row.kind === 'music') { const result = await api('music-play', { id: row.id }); source = pathToFileUrl(result.path); }
    if (mine !== playGeneration) return;
    document.getElementById('playerVideo')?.pause();
    if (window.BrowserDubAudioUI?.pause) window.BrowserDubAudioUI.pause();
    audio.pause(); if (hls) { hls.destroy(); hls = null; }
    current = row; dockTitle.textContent = row.title; dockStatus.textContent = '';
    dock.classList.remove('hidden'); document.body.classList.add('media-shelf-playing');
    if (/\.m3u8(?:\?|$)/i.test(source) && window.Hls?.isSupported()) { hls = new window.Hls(); hls.loadSource(source); hls.attachMedia(audio); }
    else audio.src = source;
    audio.playbackRate = +speed.value;
    audio.addEventListener('loadedmetadata', () => { if (mine === playGeneration && row.position > 0 && row.position < audio.duration - 2) audio.currentTime = row.position; }, { once: true });
    await audio.play();
  }
  function listen(rows, index = 0) { queue = rows; return playQueue(index); }
  audio.addEventListener('pause', () => { void flushPosition(); });
  audio.addEventListener('timeupdate', () => { if (Date.now() - lastSaved > 10000) { lastSaved = Date.now(); void flushPosition(); } });
  audio.addEventListener('ended', () => { void flushPosition().then(() => { if (queueIndex + 1 < queue.length) return playQueue(queueIndex + 1); }); });
  audio.addEventListener('error', () => { dockStatus.textContent = t('Audio could not be played. Check the file or stream address.', 'Ses oynatılamadı. Dosyayı veya yayın adresini kontrol edin.'); });
  document.addEventListener('play', event => { if (event.target !== audio) audio.pause(); }, true);
  new MutationObserver(() => {
    const open = !document.getElementById('playerLayer').classList.contains('hidden');
    document.body.classList.toggle('media-shelf-player-open', open); if (open) audio.pause();
  }).observe(document.getElementById('playerLayer'), { attributes: true, attributeFilter: ['class'] });
  function music(root) {
    const controls = el('div', 'mh-filterbar');
    controls.append(btn(t('Add audio', 'Ses ekle'), () => task('music-import')), btn(t('Add folder', 'Klasör ekle'), () => task('music-import', { folder: true })));
    const cancel = btn(t('Cancel import', 'İçe aktarmayı durdur'), () => api('cancel')); cancel.dataset.cancel = '1'; controls.append(cancel);
    controls.append(btn(t('Save selected as playlist', 'Seçilenlerle çalma listesi oluştur'), async () => {
      const value = await form(t('New playlist', 'Yeni çalma listesi'), [{ key: 'name', label: t('Name', 'Ad') }]);
      if (value) await task('playlist-save', { ...value, ids: [...selected] });
    }));
    const artist = el('select'), album = el('select');
    for (const [control, key, title] of [[artist, 'artist', t('All artists', 'Tüm sanatçılar')], [album, 'album', t('All albums', 'Tüm albümler')]]) {
      control.setAttribute('aria-label', title); const all = el('option', '', title); all.value = ''; control.append(all);
      [...new Set(snapshot.music.map(row => row[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b)).forEach(value => { const option = el('option', '', value); option.value = value; control.append(option); }); controls.append(control);
    }
    root.append(controls);
    const list = el('div', 'ms-track-list'); root.append(list);
    const paint = () => {
      list.replaceChildren();
      const fold = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('tr').replace(/ı/g, 'i');
      const rows = snapshot.music.filter(row => (!artist.value || row.artist === artist.value) && (!album.value || row.album === album.value) && fold(`${row.title} ${row.artist} ${row.album}`).includes(fold(view.query)));
      let shown = 0;
      const more = () => {
        const next = rows.slice(shown, shown + 60); shown += next.length;
        for (const row of next) {
          const line = el('div', 'ms-track'), check = el('input'); check.type = 'checkbox'; check.checked = selected.has(row.id); check.setAttribute('aria-label', `${t('Select', 'Seç')}: ${row.title}`);
          check.addEventListener('change', () => { if (check.checked) selected.add(row.id); else selected.delete(row.id); });
          const title = el('div'); title.append(el('strong', '', row.title), el('small', '', [row.artist, row.album].filter(Boolean).join(' · ')));
          line.append(check, btn('▶', () => listen(rows.map(value => ({ ...value, kind: 'music' })), rows.indexOf(row))), title,
            el('span', 'ms-time', `${Math.floor(row.duration / 60)}:${String(Math.floor(row.duration % 60)).padStart(2, '0')}`),
            btn(t('Player', 'Oynatıcı'), async () => { const result = await api('music-play', { id: row.id }); await openLocalMedia(result.path, row.position || 0); }), btn(t('Remove', 'Kaldır'), () => forget('music', row), 'mh-text-button'));
          line.querySelector('button').setAttribute('aria-label', `${t('Play', 'Oynat')}: ${row.title}`); list.append(line);
        }
        moreButton.hidden = shown >= rows.length;
      };
      const moreButton = btn(t('Show more', 'Daha fazla göster'), more); more(); list.append(moreButton);
      if (!rows.length) list.append(el('p', 'mh-empty', t('Add audio files or a music folder to see albums, artists and playlists.', 'Albüm, sanatçı ve çalma listeleri için ses dosyaları veya müzik klasörü ekle.')));
    };
    artist.addEventListener('change', paint); album.addEventListener('change', paint); paint();
    if (snapshot.playlists.length) {
      const playlists = el('section', 'mh-section'); playlists.append(el('h2', '', t('Playlists', 'Çalma listeleri')));
      snapshot.playlists.forEach(row => { const line = el('div', 'ms-track'); line.append(btn(`${row.name} (${row.tracks.length})`, () => listen(row.tracks.map(id => snapshot.music.find(item => item.id === id)).filter(Boolean).map(row => ({ ...row, kind: 'music' })))), btn(t('Remove', 'Kaldır'), () => forget('playlists', row), 'mh-text-button')); playlists.append(line); }); root.append(playlists);
    }
  }
  async function openBook(row) {
    const book = await api('book-open', { id: row.id });
    if (book.format === 'pdf') { document.getElementById('playerLayer').classList.remove('hidden'); setWorkspaceMode('player'); await openPdfReader(book.path); return; }
    const dialog = el('dialog', 'ms-reader media-surface'); dialog.dataset.uiUntranslated = ''; dialog.setAttribute('aria-label', book.title);
    const header = el('header'), chapters = el('select'); chapters.setAttribute('aria-label', t('Chapter', 'Bölüm'));
    book.chapters.forEach((chapter, index) => { const opt = el('option', '', chapter.title || `${t('Chapter', 'Bölüm')} ${index + 1}`); opt.value = index; chapters.append(opt); });
    let index = Math.min(book.chapter || 0, book.chapters.length - 1), timer = null;
    const prose = el('article', 'ms-prose'); prose.tabIndex = 0;
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
    header.append(el('strong', '', book.title), chapters, font, marks, btn(t('Bookmark / quote', 'Yer imi / alıntı'), async () => {
      const selection = window.getSelection(), quote = selection && prose.contains(selection.anchorNode) ? selection.toString().slice(0, 2000) : '';
      const mark = { ...position(), quote }; await api('book-progress', { id: book.id, ...mark, bookmark: true });
      book.bookmarks.push(mark); const opt = el('option', '', quote || `${t('Chapter', 'Bölüm')} ${index + 1}`); opt.value = book.bookmarks.length - 1; marks.append(opt); readerStatus.textContent = t('Saved.', 'Kaydedildi.');
    }), btn(t('Copy chapter', 'Bölümü kopyala'), () => window.api.copyText(book.chapters[index].text)), btn(t('Voice studio', 'Ses stüdyosu'), () => window.api.openTextVoiceUI()), btn('×', async () => { if (await save() !== false) dialog.close(); }));
    header.lastChild.setAttribute('aria-label', t('Close reader', 'Okuyucuyu kapat'));
    dialog.append(header, readerStatus, prose); document.body.append(dialog); dialog.showModal(); if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion(); show(index, book.scroll || 0);
    prose.addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(save, 900); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); void save().then(result => { if (result !== false) dialog.close(); }); });
    dialog.addEventListener('close', () => { clearTimeout(timer); dialog.remove(); if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion(); void reload(); });
  }
  function books(root) {
    root.append(btn(t('Add EPUB / PDF / TXT', 'EPUB / PDF / TXT ekle'), () => task('book-import')));
    const grid = el('div', 'mh-grid ms-book-grid'), audioSlots = new Map();
    const rows = snapshot.books.filter(row => `${row.title} ${row.author}`.toLocaleLowerCase().includes(view.query.toLocaleLowerCase()));
    rows.slice(0, 300).forEach(row => {
      const node = btn('', () => openBook(row), 'mh-card'), cover = el('div', 'mh-art');
      if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(row.cover || '')) { const img = el('img'); img.src = row.cover; img.alt = ''; img.loading = 'lazy'; cover.append(img); } else cover.append(el('span', 'ms-book-placeholder', row.format.toUpperCase()));
      node.append(cover, el('span', 'mh-card-title', row.title), el('span', 'mh-card-meta', row.author || row.format.toUpperCase()));
      const shell = el('div'), actions = el('div', 'ms-book-actions'), audioSlot = el('div', 'ms-book-audiobook');
      actions.append(audioSlot,btn(t('Voice production','Sesli üretim'),async()=>{const r=await window.api.mediaWorkflows({action:'book-from-shelf',shelfId:row.id});if(!r.ok)throw Error(r.error);await window.MediaWorkflowsUI.openProject(r.project.id);}),btn(t('Remove', 'Kaldır'), () => forget('books', row), 'mh-text-button'));
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
        slot.append(play, meta);
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
    if (!snapshot.stations.length && !snapshot.podcasts.length) root.append(el('p', 'mh-empty', t('Add a direct radio stream or a podcast feed. Episodes keep their listening position.', 'Doğrudan radyo yayını veya podcast beslemesi ekle. Bölümlerin dinleme konumu korunur.')));
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
    speed.setAttribute('aria-label', t('Playback speed', 'Oynatma hızı')); sleep.setAttribute('aria-label', t('Sleep timer', 'Uyku zamanlayıcısı'));
  });
  window.MediaShelfUI = Object.freeze({ mount(root, page, query = '') {
    view = { root, page, query, busy: false }; ++generation;
    const loading = el('p', 'ms-status'); loading.setAttribute('role', 'status'); root.replaceChildren(loading);
    void reload().catch(error => status(error.message, true));
  } });
})();
