(() => {
  'use strict';
  const t = (en, tr) => (window.UiLocale?.get?.() === 'tr' ? tr : en);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const configError = code => ({
    CONFIG_UNAVAILABLE:()=>t('Addon settings are unavailable in this window.','Bu pencerede eklenti ayarları kullanılamıyor.'),
    CONFIG_LOAD:()=>t('The addon settings page could not load. Existing settings were kept.','Eklenti ayar sayfası yüklenemedi. Mevcut ayarlar korundu.'),
    NOT_CONFIGURABLE:()=>t('This addon does not provide a settings page.','Bu eklenti ayar sayfası sunmuyor.'),
    CONFIG_OPEN:()=>t('Could not open addon settings. Existing settings were kept.','Eklenti ayarları açılamadı. Mevcut ayarlar korundu.'),
    CONFIG_VALIDATION:()=>t('The configured addon could not be verified. Existing settings were kept.','Yapılandırılan eklenti doğrulanamadı. Mevcut ayarlar korundu.'),
    CONFIG_ORIGIN:()=>t('The settings page returned a different host. Existing settings were kept.','Ayar sayfası farklı bir sunucu döndürdü. Mevcut ayarlar korundu.'),
    CONFIG_ID:()=>t('The addon identity changed. Existing settings were kept.','Eklenti kimliği değişti. Mevcut ayarlar korundu.'),
    CONFIG_STALE:()=>t('The addon changed while settings were open. Reopen its settings.','Ayarlar açıkken eklenti değişti. Ayarlarını yeniden aç.'),
    CONFIG_CONFLICT:()=>t('That configured addon is already installed. Both entries were kept.','Bu yapılandırılmış eklenti zaten yüklü. İki kayıt da korundu.'),
  })[code]?.();
  const stremioError = code => ({
    NO_ADDONS:()=>t('No enabled addon provides sources for this title. Add or turn on a source addon such as Torrentio.','Bu yapım için kaynak veren etkin eklenti yok. Torrentio gibi bir kaynak eklentisi ekle veya aç.'),
    NO_META:()=>t('No enabled addon provides details for this title. Add a catalog addon such as Cinemeta.','Bu yapım için ayrıntı veren etkin eklenti yok. Cinemeta gibi bir katalog eklentisi ekle.'),
    EXPIRED:()=>t('This source list expired. Search the sources again.','Kaynak listesinin süresi doldu. Kaynakları yeniden ara.'),
    NOT_FOUND:()=>t('That item is no longer available. Refresh the list.','Bu öğe artık yok. Listeyi yenile.'),
    UNPLAYABLE:()=>t('This source cannot play in the app. Choose another source.','Bu kaynak uygulamada oynatılamıyor. Başka bir kaynak seç.'),
    NEEDS_TORRENT_ENGINE:()=>t('Raw torrent sources need the torrent engine. Install it once or choose a direct/debrid source.','Ham torrent kaynakları torrent motoru ister. Bir kez kur veya doğrudan/debrid kaynak seç.'),
    NO_VIDEO:()=>t('This torrent has no playable video for this title.','Bu torrentte bu yapım için oynatılabilir video yok.'),
    TIMEOUT:()=>t('did not answer in time','zamanında yanıt vermedi'),
    NETWORK:()=>t('could not be reached','erişilemedi'),
    HTTP:()=>t('returned a server error','sunucu hatası döndürdü'),
    TOO_LARGE:()=>t('sent an oversized reply','çok büyük yanıt gönderdi'),
    BAD_JSON:()=>t('sent an unreadable reply','okunamayan yanıt gönderdi'),
    REDIRECT:()=>t('redirected to an unsafe address','güvensiz bir adrese yönlendirdi'),
    EBROWSER_UNSAFE_URL:()=>t('address could not be verified as public (DNS or private network)','adresi genel bir adres olarak doğrulanamadı (DNS veya özel ağ)'),
    UNSAFE:()=>t('address could not be verified as public (DNS or private network)','adresi genel bir adres olarak doğrulanamadı (DNS veya özel ağ)'),
    REFRESH_ID:()=>t('This address now reports a different addon. The saved addon was kept.','Bu adres artık farklı bir eklenti bildiriyor. Kayıtlı eklenti korundu.'),
  })[code]?.();
  // Short, per-addon reason for source/subtitle fan-out notes; never the raw upstream text.
  const groupReason = error => stremioError(error?.code) || t('failed','başarısız oldu');
  const call = async (action, values = {}) => {
    const r = await window.api.stremio({ action, ...values });
    if (!r?.ok) { const e = new Error((configError(r?.code)||stremioError(r?.code)||(r?.code==='CAPACITY'?t('Storage capacity reached; your existing records were kept.','Kayıt kapasitesi doldu; mevcut kayıtların korundu.'):r?.code==='STORAGE_READ'?t('Saved data could not be read; the existing file was kept.','Kayıtlı veri okunamadı; mevcut dosya korundu.'):r?.error)) || t('Stremio action failed.', 'Stremio işlemi başarısız.')); e.code = r?.code; throw e; }
    return r;
  };
  const SUGGESTED = [
    { name: 'Cinemeta', url: 'https://v3-cinemeta.strem.io/manifest.json', note: () => t('Catalogs, posters, seasons and episodes', 'Katalog, afiş, sezon ve bölümler') },
    { name: 'OpenSubtitles v3', url: 'https://opensubtitles-v3.strem.io/manifest.json', note: () => t('Subtitles', 'Altyazılar') },
    { name: 'Torrentio', url: 'https://torrentio.strem.fun/manifest.json', note: () => t('Torrent sources. Configure providers and your debrid service from Settings.', 'Torrent kaynakları. Sağlayıcıları ve debrid hizmetini Ayarlar’dan yapılandır.') },
  ];
  const fmtTime = (s) => { s = Math.max(0, Math.round(Number(s) || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const fmtSize = (n) => { n = Number(n) || 0; return !n ? '' : n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : (n / 1048576).toFixed(0) + ' MB'; };
  const epLabel = (s, e) => (s != null && e != null ? `S${s}E${e}` : '');
  const flagEmoji = (code) => String(code || '').toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
  const dispatchChanged = () => document.dispatchEvent(new CustomEvent('stremio-addons-changed'));
  const occlusion = () => { try { if (typeof syncBrowserOcclusion === 'function') void syncBrowserOcclusion(); } catch (_) { /* native görünüm yoksa */ } };

  function dialogShell(cls, label, onClose) {
    const d = el('dialog', 'sx-dialog media-surface ' + cls), opener = document.activeElement;
    d.dataset.uiUntranslated = ''; d.setAttribute('aria-label', label);
    d.addEventListener('close', () => { try { onClose?.(); } finally { d.remove(); occlusion(); try { if (opener?.isConnected && typeof opener.focus === 'function') opener.focus(); } catch (_) { /* odak geri verilemezse sorun değil */ } } }, { once: true });
    document.body.append(d); d.showModal(); occlusion();
    return d;
  }
  function header(title, sub, onClose) {
    const h = el('header', 'sx-dialog-head'), copy = el('div');
    copy.append(el('small', '', sub), el('h1', '', title));
    const close = el('button', 'mh-action sx-close', '×'); close.type = 'button'; close.setAttribute('aria-label', t('Close', 'Kapat')); close.onclick = onClose;
    h.append(copy, close); return h;
  }
  function button(label, run, cls = 'mh-action') {
    const b = el('button', cls, label); b.type = 'button';
    b.onclick = async (event) => { b.disabled = true; try { await run(event); } catch (e) { b.dispatchEvent(new CustomEvent('sx-error', { bubbles: true, detail: e })); } finally { if (b.isConnected) b.disabled = false; } };
    return b;
  }
  const statusNode = () => { const n = el('p', 'sx-status'); n.setAttribute('role', 'status'); n.setAttribute('aria-live', 'polite'); return n; };
  const say = (node, message, error = false) => { node.textContent = message || ''; node.classList.toggle('is-error', !!error); };
  const hueOf = (text) => { let h = 0; for (const ch of String(text || '?')) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const initials = (name) => { const w = String(name || '?').trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : String(name || '?').slice(0, 2)).toUpperCase(); };
  const posterNode = (item, cls = 'sx-poster') => {
    const box = el('div', cls), hue = hueOf(item.name);
    box.style.setProperty('--sx-hue', String(hue));
    const fallback = () => box.append(el('span', 'sx-poster-fallback', initials(item.name)));
    if (item.poster) { const img = el('img'); img.src = item.poster; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.className = 'sx-fade'; img.onload = () => img.classList.add('is-in'); img.onerror = () => { img.remove(); fallback(); }; box.append(img); }
    else fallback();
    return box;
  };
  /* ---- Bildirim (toast) ve iskelet kartlar ---- */
  function toast(message, { action, label, ms = 5000 } = {}) {
    const host = document.getElementById('playerLayer') && !document.getElementById('playerLayer').classList.contains('hidden') ? document.getElementById('playerLayer') : document.body;
    let stack = host.querySelector(':scope > .sx-toasts'); if (!stack) { stack = el('div', 'sx-toasts'); stack.setAttribute('role', 'status'); stack.setAttribute('aria-live', 'polite'); stack.dataset.uiUntranslated = ''; host.append(stack); }
    const box = el('div', 'sx-toast'); box.append(el('span', '', message));
    if (action) { const b = el('button', 'sx-toast-btn', label || t('Undo', 'Geri al')); b.type = 'button'; b.onclick = () => { box.remove(); action(); }; box.append(b); }
    if(host.id==='playerLayer')box.setAttribute('data-pw-occludes-native','true');stack.append(box); while (stack.children.length > 3) stack.firstChild.remove();
    setTimeout(() => box.remove(), ms); return box;
  }
  const skeletonRail = (n = 8) => Array.from({ length: n }, () => { const c = el('div', 'sx-skel-card'); c.setAttribute('aria-hidden', 'true'); c.append(el('div', 'sx-skel-poster'), el('div', 'sx-skel-line'), el('div', 'sx-skel-line is-short')); return c; });
  const emptyState = (title, text, icon = '🎞') => { const box = el('div', 'sx-empty-state'); box.append(el('span', 'sx-empty-icon', icon), el('strong', '', title), el('p', '', text)); return box; };

  /* ================= Eklentiler ================= */
  function openAddons() {
    const dialog = dialogShell('sx-addons', t('Stremio addons', 'Stremio eklentileri'), dispatchChanged);
    const status = statusNode(), body = el('main', 'sx-body'), list = el('section', 'sx-addon-list');
    dialog.append(header(t('Addons', 'Eklentiler'), t('Stremio · sources, subtitles and catalogs', 'Stremio · kaynaklar, altyazılar ve kataloglar'), () => dialog.close()), status, body);
    const form = el('form', 'sx-add-form'), field = el('label', 'sx-field'), input = el('input'); input.type = 'url'; input.autocomplete = 'off'; input.maxLength = 2048; input.placeholder = 'https://… / stremio://…/manifest.json';
    field.append(el('span', '', t('Addon address', 'Eklenti adresi')), input);
    const previewBtn = el('button', 'mh-action mh-primary', t('Check addon', 'Eklentiyi kontrol et')); previewBtn.type = 'submit';
    form.append(field, previewBtn);
    const chips = el('div', 'sx-chips');
    for (const s of SUGGESTED) { const c = el('button', 'sx-chip'); c.type = 'button'; c.title = s.note(); c.append(el('strong', '', s.name), el('small', '', s.note())); c.onclick = () => { input.value = s.url; input.focus(); }; chips.append(c); }
    let previewRequest=0;
    const preview = el('section', 'sx-preview'); preview.hidden = true;
    body.append(form, el('p', 'sx-hint', t('Suggestions only fill the address box; nothing is added until you confirm.', 'Öneriler yalnız adres kutusunu doldurur; onaylamadan hiçbir şey eklenmez.')), chips, preview, el('h2', 'sx-h2', t('Installed', 'Yüklü eklentiler')), list);
    async function drawList(addons) {
      const rows = addons || (await call('status')).addons; list.replaceChildren();
      if (!rows.length) { list.append(el('p', 'sx-empty', t('No addons yet. Add a catalog addon (Cinemeta) and a source addon (Torrentio).', 'Henüz eklenti yok. Bir katalog eklentisi (Cinemeta) ve bir kaynak eklentisi (Torrentio) ekle.'))); return; }
      rows.forEach((a, i) => {
        const row = el('article', 'sx-addon' + (a.enabled ? '' : ' is-off')), copy = el('div', 'sx-addon-copy');
        if (a.logo) { const img = el('img', 'sx-addon-logo'); img.src = a.logo; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.onerror = () => img.remove(); row.append(img); } else row.append(el('span', 'sx-addon-logo sx-addon-mono', initials(a.name)));
        const badges = el('div', 'sx-badges');
        for (const [key, en, tr] of [['stream', 'Sources', 'Kaynak'], ['subtitles', 'Subtitles', 'Altyazı'], ['catalog', 'Catalog', 'Katalog'], ['meta', 'Details', 'Ayrıntı']]) if (a.resources.includes(key) || (key === 'catalog' && a.catalogs)) badges.append(el('span', 'sx-badge', t(en, tr)));
        if (!a.enabled) badges.append(el('span','sx-badge',t('Disabled','Kapalı')));
        if (a.p2p) badges.append(el('span', 'sx-badge is-warn', 'P2P'));
        copy.append(el('h3', '', `${a.name} `), el('small', '', `v${a.version} · ${a.label}`), el('p', '', a.description || ''), badges);
        copy.firstChild.append(el('span', 'sx-order', '#' + (i + 1)));
        const actions = el('div', 'sx-addon-actions');
        const toggle = button(a.enabled ? t('Turn off', 'Kapat') : t('Turn on', 'Aç'), async () => drawList((await call('addon-toggle', { key: a.key, enabled: !a.enabled })).addons), 'mh-action sx-act-toggle' + (a.enabled ? ' is-on' : ''));
        const up = button('↑', async () => drawList((await call('addon-move', { key: a.key, direction: 'up' })).addons), 'mh-action sx-act-move'); up.setAttribute('aria-label', t('Higher priority', 'Önceliği artır')); up.disabled = i === 0;
        const down = button('↓', async () => drawList((await call('addon-move', { key: a.key, direction: 'down' })).addons), 'mh-action sx-act-move'); down.setAttribute('aria-label', t('Lower priority', 'Önceliği azalt')); down.disabled = i === rows.length - 1;
        const refresh = button(t('Refresh', 'Yenile'), async () => { drawList((await call('addon-refresh', { key: a.key })).addons); say(status, t('Addon updated.', 'Eklenti güncellendi.')); });
        const remove = button(t('Remove', 'Kaldır'), async () => { const approved = typeof openAppDialog === 'function' ? await openAppDialog({ title: t('Remove addon', 'Eklentiyi kaldır'), description: t(`Remove ${a.name}? Its sources, subtitles and catalogs will stop appearing.`, `${a.name} kaldırılsın mı? Kaynakları, altyazıları ve katalogları görünmez olur.`), confirmLabel: t('Remove addon', 'Eklentiyi kaldır'), intent: 'danger' }) : false; if (!approved || !dialog.open || !dialog.isConnected) return; drawList((await call('addon-remove', { key: a.key })).addons); }, 'mh-action sx-act-danger');
        if(a.configurable||a.configurationRequired||a.configurationUnknown)actions.append(button(t('Settings','Ayarlar'),()=>configure({key:a.key}),'mh-action sx-addon-settings'));
        actions.append(toggle, up, down, refresh, remove); row.append(copy, actions); list.append(row);
      });
    }
    dialog.addEventListener('sx-error', (e) => say(status, e.detail?.message, true));
    const listHead = body.querySelector('.sx-h2'); if (listHead) { const refreshAll = button(t('Refresh all', 'Hepsini yenile'), async () => { let ok = 0, bad = 0; for (const a of (await call('status')).addons) { try { await call('addon-refresh', { key: a.key }); ok++; } catch (_) { bad++; } } await drawList(); say(status, t(`${ok} updated, ${bad} failed.`, `${ok} güncellendi, ${bad} başarısız.`), bad > 0); }); refreshAll.classList.add('sx-refresh-all'); const headRow = el('div', 'sx-list-head'); listHead.replaceWith(headRow); headRow.append(listHead, refreshAll); }
    async function configure(owner) {
      const request=++previewRequest;previewBtn.disabled=true;say(status,t('Opening addon settings… Save on the addon page, then review the returned addon here.','Eklenti ayarları açılıyor… Eklenti sayfasında kaydet, sonra dönen eklentiyi burada incele.'));
      try {
        const p=await call('addon-configure',owner);
        if(!dialog.isConnected||request!==previewRequest)return;
        if(p.cancelled){say(status,t('Settings closed. Existing addon was kept.','Ayarlar kapatıldı. Mevcut eklenti korundu.'));return;}
        input.value='';showPreview(p);say(status,t('Settings returned. Review and save to apply them.','Ayarlar döndü. Uygulamak için inceleyip kaydet.'));
      }catch(e){if(dialog.isConnected&&request===previewRequest)say(status,e.message,true);}
      finally{if(request===previewRequest)previewBtn.disabled=false;}
    }
    function showPreview(p) {
      preview.replaceChildren();preview.hidden=false;
      const head=el('div','sx-preview-head');head.append(el('h2','',`${p.name} v${p.version}`),el('small','',p.label));
      const provides=el('div','sx-badges');
      for(const [ok,en,tr]of[[p.provides.streams,'Sources','Kaynak'],[p.provides.subtitles,'Subtitles','Altyazı'],[p.provides.catalog,'Catalog','Katalog'],[p.provides.meta,'Details','Ayrıntı']])if(ok)provides.append(el('span','sx-badge',t(en,tr)));
      preview.append(head,el('p','',p.description||''),provides);
      if(p.replacing)preview.append(el('p','sx-hint',t('Saving replaces this addon’s settings in its current position. Enabled state and other addons are preserved.','Kaydetmek bu eklentinin ayarlarını mevcut sırasında değiştirir. Açık/kapalı durumu ve diğer eklentiler korunur.')));
      if(p.p2p||p.provides.streams)preview.append(el('p','sx-hint',t('Direct/debrid links play directly. Raw torrent sources need the torrent engine; addon settings can choose a debrid service.','Doğrudan/debrid bağlantıları doğrudan oynatılır. Ham torrent kaynakları torrent motoru ister; eklenti ayarlarından debrid hizmeti seçebilirsin.')));
      const actions=el('div','sx-actions');
      if(p.configurable||p.configurationRequired)actions.append(button(p.configured?t('Edit settings again','Ayarları yeniden düzenle'):t('Configure addon','Eklentiyi yapılandır'),()=>configure({token:p.token}),p.configured?'mh-action':'mh-action mh-primary'));
      if(p.configurationRequired)preview.append(el('p','sx-status is-error',t('Configure this addon before adding it. Its Install button will return the settings here.','Bu eklentiyi eklemeden önce yapılandır. Sayfasındaki Yükle düğmesi ayarları buraya geri getirecek.')));
      else actions.append(button(p.configured?t('Save settings','Ayarları kaydet'):p.alreadyInstalled?t('Update','Güncelle'):p.configurable?t('Add without settings','Ayarlamadan ekle'):t('Add addon','Eklentiyi ekle'),async()=>{
        const r=await call('addon-install',{token:p.token});input.value='';preview.hidden=true;say(status,p.configured?t('Addon settings saved.','Eklenti ayarları kaydedildi.'):t('Addon added.','Eklenti eklendi.'));await drawList(r.addons);dispatchChanged();
      },p.configured||!p.configurable?'mh-action mh-primary':'mh-action'));
      preview.append(actions);
    }
    form.onsubmit = async(event)=>{
      event.preventDefault();const request=++previewRequest;previewBtn.disabled=true;preview.hidden=true;say(status,t('Reading addon…','Eklenti okunuyor…'));
      try{const p=await call('addon-preview',{url:input.value.trim()});if(!dialog.isConnected||request!==previewRequest)return;showPreview(p);say(status,'');}
      catch(e){if(dialog.isConnected&&request===previewRequest)say(status,e.message,true);}finally{if(request===previewRequest)previewBtn.disabled=false;}
    };
    void drawList().catch((e) => say(status, e.message, true));
    return dialog;
  }

  /* ================= İlerleme / oturum ================= */
  let session = null, lastSave = 0, nextPrompt = null, playRequest = 0;
  const videoEl = () => document.getElementById('playerVideo');
  function nextOf(videos, season, episode) {
    const list = (videos || []).filter((v) => v.season != null && v.episode != null && v.season >= 0).sort((a, b) => a.season - b.season || a.episode - b.episode);
    const i = list.findIndex((v) => v.season === season && v.episode === episode);
    return i >= 0 && list[i + 1] ? { season: list[i + 1].season, episode: list[i + 1].episode, title: list[i + 1].title || '' } : null;
  }
  let progressFailure = null, progressNotice = null, progressAttempt = 0;
  function paintProgressFailure() {
    if(!progressFailure||!progressFailure.current()){
      progressFailure=null;if(progressNotice){progressNotice.remove();progressNotice=null;window.NativePlayerUI?.layout?.();}return;
    }
    const failure=progressFailure,host=document.getElementById('playerLayer');if(!host)return;
    if(!progressNotice?.isConnected){
      progressNotice=el('div','sx-progress-warning');progressNotice.dataset.uiUntranslated='';progressNotice.setAttribute('role','status');
      progressNotice.append(el('span'),el('button'));const head=host.querySelector('.player-head');if(head)head.after(progressNotice);else host.prepend(progressNotice);
    }
    const detail=failure.code==='CAPACITY'?t('History capacity reached; existing records were kept.','Geçmiş kapasitesi doldu; mevcut kayıtların korundu.'):failure.code==='STORAGE_READ'?t('Saved history could not be read; the existing file was kept.','Kayıtlı geçmiş okunamadı; mevcut dosya korundu.'):t('Playback continues; retry saving the current position.','Oynatma sürüyor; geçerli konumu kaydetmeyi yeniden deneyebilirsin.');
    const message=t('Progress was not saved. ','İlerleme kaydedilmedi. ')+detail,span=progressNotice.querySelector('span');if(span.textContent!==message)span.textContent=message;
    const retry=progressNotice.querySelector('button');retry.type='button';retry.className='sx-toast-btn';const label=failure.pending?t('Saving…','Kaydediliyor…'):t('Retry saving','Kaydetmeyi yeniden dene');if(retry.textContent!==label)retry.textContent=label;retry.disabled=!!failure.pending;
    retry.onclick=()=>{if(progressFailure===failure&&failure.current()&&!failure.pending)void saveProgress(true);};
    window.NativePlayerUI?.layout?.();
  }
  async function saveProgress(force = false) {
    paintProgressFailure();
    const v = videoEl(),owner=session;
    if (!owner || !v || typeof player === 'undefined' || player.mediaKey !== owner.key || player.workspaceMode==='browser') return false;
    if (!Number.isFinite(v.duration) || v.duration <= 0) return false;
    const n = Date.now(); if (!force && n - lastSave < 8000) return false; lastSave = n;
    const generation=player.generation,current=()=>session===owner&&player.mediaKey===owner.key&&player.generation===generation&&player.workspaceMode!=='browser',attempt=++progressAttempt,c=owner.ctx;
    if(progressFailure&&force){progressFailure.pending=true;paintProgressFailure();}
    try {
      await call('progress-save', { type: c.type, id: c.id, season: c.season, episode: c.episode, name: c.name, poster: c.poster, episodeTitle: c.episodeTitle, next: c.next, position: v.currentTime || 0, duration: v.duration, sourceLabel: owner.sourceLabel || '' });
      if(current()&&attempt===progressAttempt){progressFailure=null;paintProgressFailure();}return true;
    } catch(error) {
      if(current()&&attempt===progressAttempt){progressFailure={current,code:error?.code||'',pending:false};paintProgressFailure();}return false;
    }
  }
  function hookVideo() {
    const v = videoEl(); if (!v || v.dataset.sxHooked) return; v.dataset.sxHooked = '1';
    v.addEventListener('timeupdate', () => void saveProgress(false));
    v.addEventListener('loadstart',paintProgressFailure);v.addEventListener('emptied',paintProgressFailure);v.addEventListener('loadedmetadata',paintProgressFailure);
    const layer=document.getElementById('playerLayer');if(layer)new MutationObserver(paintProgressFailure).observe(layer,{attributes:true,attributeFilter:['class']});
    v.addEventListener('pause', () => void saveProgress(true));
    v.addEventListener('ended', async () => { await saveProgress(true); offerNext(); });
    v.addEventListener('error', () => { if (session && sessionActive()) void suggestNative(session, null, 'error'); });
    window.addEventListener('pagehide', () => void saveProgress(true));
  }
  const AUTO_KEY = 'stremio.autoNext';
  const autoNextOn = () => { try { const v = localStorage.getItem(AUTO_KEY); if (v === '0' || v === '1') return v === '1'; } catch (_) { /* profil varsayılanı */ } return PROFILES[session?.profile]?.autoNext !== false; };
  const setAutoNext = (on) => { try { localStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch (_) { /* tercih saklanamazsa oturumluk */ } };
  let nextTimer = null;
  function clearNext() { if (nextTimer) { clearInterval(nextTimer); nextTimer = null; } nextPrompt?.remove(); nextPrompt = null; }
  function offerNext() {
    clearNext();
    const c = session?.ctx; if (!c?.next || !c.meta) return;
    const layer = document.getElementById('playerLayer'); if (!layer) return;
    const owner = session, box = el('div', 'sx-next'); box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-label', t('Up next', 'Sıradaki'));
    const label = `${epLabel(c.next.season, c.next.episode)}${c.next.title ? ' · ' + c.next.title : ''}`;
    const note = el('small', 'sx-next-count'); note.setAttribute('aria-live', 'polite'); const bar = el('div', 'sx-next-bar'); bar.append(el('span'));
    box.append(el('small', '', t('Up next', 'Sıradaki')), el('strong', '', label), note);
    const play = async () => { clearNext(); if (session !== owner) return; await openStreams({ ...baseCtx(c.meta, c.next.season, c.next.episode), autoplayBest: true, prefer: { bingeGroup: session?.bingeGroup, addonKey: session?.addonKey, resolution: session?.resolution, torrent: session?.torrent } }); };
    const go = button(t('Play next', 'Sıradakini oynat'), play, 'mh-action mh-primary');
    const no = button(t('Not now', 'Şimdi değil'), () => clearNext());
    const auto = el('label', 'sx-check'), cb = el('input'); cb.type = 'checkbox'; cb.checked = autoNextOn(); cb.onchange = () => { setAutoNext(cb.checked); if (!cb.checked) { if (nextTimer) { clearInterval(nextTimer); nextTimer = null; } note.textContent = ''; bar.classList.remove('is-run'); } else startCountdown(); };
    auto.append(cb, el('span', '', t('Play next episode automatically', 'Sıradaki bölümü otomatik oynat')));
    box.append(bar, go, no, auto); layer.append(box); nextPrompt = box;
    let left = 10;
    function startCountdown() {
      if (nextTimer) clearInterval(nextTimer); left = 10; bar.classList.remove('is-run'); void bar.offsetWidth; bar.classList.add('is-run'); note.textContent = t(`Starting in ${left} s`, `${left} sn içinde başlıyor`);
      nextTimer = setInterval(() => { if (!box.isConnected || session !== owner || layer.classList.contains('hidden')) return clearNext(); left -= 1; if (left <= 0) { void play(); } else note.textContent = t(`Starting in ${left} s`, `${left} sn içinde başlıyor`); }, 1000);
    }
    if (cb.checked) startCountdown(); else setTimeout(() => { if (nextPrompt === box) clearNext(); }, 30000);
    try { go.focus({ preventScroll: true }); } catch (_) { /* odak verilemezse sorun değil */ }
  }
  /* ---- İçerik profilleri: dublaj/çeviri/oynatma varsayılanları (Browser tarafındaki üslup ve hazır ayarlarla eşleşir) ---- */
  const PROFILES = {
    film: { en: 'Film', tr: 'Film', register: 'drama', dub: 'Balanced', speed: 1, autoNext: false, note: () => t('Natural dialogue, balanced dub quality.', 'Doğal diyalog, dengeli dublaj kalitesi.') },
    series: { en: 'Series', tr: 'Dizi', register: 'drama', dub: 'Balanced', speed: 1, autoNext: true, note: () => t('Dialogue style, next episode starts on its own.', 'Diyalog üslubu, sıradaki bölüm kendiliğinden başlar.') },
    documentary: { en: 'Documentary', tr: 'Belgesel', register: 'documentary', dub: 'Careful', speed: 1, autoNext: true, note: () => t('Narration style, detailed text check before voicing.', 'Anlatım üslubu, seslendirmeden önce ayrıntılı metin kontrolü.') },
    anime: { en: 'Animation / anime', tr: 'Animasyon / anime', register: 'drama', dub: 'Balanced', speed: 1, autoNext: true, note: () => t('Expressive dialogue, balanced quality.', 'Duygulu diyalog, dengeli kalite.') },
    video: { en: 'Video / lecture', tr: 'Video / ders', register: 'general', dub: 'Fast', speed: 1.25, autoNext: false, note: () => t('Plain language and quick draft dub; playback speed follows your player preference.', 'Sade dil ve hızlı deneme dublajı; oynatma hızı kişisel tercihini izler.') },
  };
  const PRESET_LABEL = { Balanced: ['Balanced', 'Dengeli'], Fast: ['Quick draft', 'Hızlı deneme'], Careful: ['Detailed check', 'Ayrıntılı kontrol'] };
  function detectProfile(ctx) {
    const meta = ctx?.meta || {}, genres = (meta.genres || []).join(' ').toLowerCase(), type = ctx?.type || meta.type || '';
    try { const saved = localStorage.getItem('stremio.profile.' + type + ':' + (ctx?.id || '')); if (saved && PROFILES[saved]) return saved; } catch (_) { /* tercih okunamazsa otomatik */ }
    if (/documentary|belgesel/.test(genres)) return 'documentary';
    if (/animation|anime|animasyon|çizgi/.test(genres)) return 'anime';
    if (type === 'series') return 'series';
    if (type === 'movie') return 'film';
    return 'video';
  }
  const presetKey = (profile) => { try { const v = localStorage.getItem('stremio.dubPreset'); if (v && PRESET_LABEL[v]) return v; } catch (_) { /* varsayılan */ } return PROFILES[profile].dub; };
  const activeSubtitlePath = () => { if (typeof player === 'undefined') return ''; return (player.sub2Role === 'translation' && player.sub2Path ? player.sub2Path : player.subPath) || ''; };
  const baseName = (p) => String(p || '').split(/[\\/]/).pop();
  // Çeviri üslubunu ve dublaj hazır ayarını stüdyo açılınca uygular; kullanıcı stüdyoda yine değiştirebilir.
  async function openDubStudio(profileId, presetId) {
    const expected={key:player.mediaKey,generation:player.generation},current=()=>player.mediaKey===expected.key&&player.generation===expected.generation&&player.workspaceMode!=='browser';
    const open=document.getElementById('playerDubGenerate'),studio=window.DubGeneratorUI;
    if(!open||open.disabled||!studio?.prepareWithPreset){toast(t('Dubbing studio is not available for this source yet.','Dublaj stüdyosu bu kaynak için henüz kullanılamıyor.'));return false;}
    try {
      const result=await studio.prepareWithPreset({preset:presetId,isCurrent:current});
      if(!current())return false;
      if(!result?.ok){if(result?.code!=='cancelled')toast(t('Studio preparation did not complete; your settings were kept.','Stüdyo hazırlığı tamamlanmadı; ayarların korundu.'));return false;}
      const prof=PROFILES[profileId]||PROFILES.film,reg=document.getElementById('translateRegister');
      if(reg&&[...reg.options].some(o=>o.value===prof.register)){reg.value=prof.register;reg.dispatchEvent(new Event('change',{bubbles:true}));}
      return true;
    }catch(_){if(current())toast(t('Could not prepare the dubbing studio. No production was started.','Dublaj stüdyosu hazırlanamadı. Üretim başlatılmadı.'));return false;}
  }
  // Sıradaki bölümde aynı kaynak grubunu/eklentiyi/kaliteyi tercih et (binge).
  function pickPreferred(streams, prefer) {
    let ok = streams.filter((x) => x.playable); if (!ok.length) return null; if (!prefer) return ok[0];
    // Debrid/doğrudan izleyen kullanıcı otomatik geçişte ham torrente (IP açığa çıkar) düşürülmez.
    if (prefer.torrent === false) { ok = ok.filter((x) => x.kind !== 'torrent'); if (!ok.length) return null; }
    return (prefer.bingeGroup && ok.find((x) => x.bingeGroup === prefer.bingeGroup)) || ok.find((x) => x.addonKey === prefer.addonKey && x.resolution === prefer.resolution) || ok.find((x) => x.resolution === prefer.resolution) || ok[0];
  }
  async function goEpisode(delta) {
    const c = session?.ctx; if (!c?.meta || c.season == null) return false;
    const list = (c.meta.videos || []).filter((v) => v.season != null && v.episode != null && v.season >= 0).sort((a, b) => a.season - b.season || a.episode - b.episode);
    const i = list.findIndex((v) => v.season === c.season && v.episode === c.episode), target = list[i + delta]; if (!target) return false;
    await saveProgress(true);
    await openStreams({ ...baseCtx(c.meta, target.season, target.episode), autoplayBest: true, prefer: { bingeGroup: session.bingeGroup, addonKey: session.addonKey, resolution: session.resolution, torrent: session.torrent } });
    return true;
  }
  function setSleep(minutes) {return window.PlayerPlaybackControls?.setSleep(minutes)===true;}

  /* ---- Native oynatıcı önerisi ---- */
  const needsNative = (s) => !!s && (s.notWebReady || /\.(mkv|avi|wmv|ts|m2ts|flv)$/i.test(s.filename || '') || /hevc|x265|h\.?265/i.test(s.codec || '') || /^(dv|hdr)/i.test(s.hdr || ''));
  let hint = null;
  function clearHint() { hint?.remove(); hint = null; }
  async function suggestNative(sess, stream, reason = '') {
    clearHint();
    try {
      if (!sess || session !== sess || !window.NativePlayerUI?.start || window.NativePlayerUI.active?.()) return;
      const hevcPlays = (() => { try { return !!videoEl()?.canPlayType?.('video/mp4; codecs="hvc1.1.6.L93.B0"'); } catch (_) { return false; } })();
      const risky = reason || needsNative(stream) && !(hevcPlays && !stream.notWebReady && !/\.(mkv|avi|wmv|ts|m2ts|flv)$/i.test(stream.filename || ''));
      if (!risky) return;
      const layer = document.getElementById('playerLayer'); if (!layer) return;
      const box = el('div', 'sx-native-hint'); box.setAttribute('role', 'status'); box.dataset.uiUntranslated = '';
      const why = reason === 'error' ? t('The built-in player could not play this source.', 'Yerleşik oynatıcı bu kaynağı oynatamadı.')
        : t('This source (MKV/HEVC/HDR) may show no picture or miss audio in the built-in player.', 'Bu kaynak (MKV/HEVC/HDR) yerleşik oynatıcıda görüntüsüz veya sessiz kalabilir.');
      box.append(el('strong', '', t('Switch to the native player?', 'Native oynatıcıya geçilsin mi?')), el('small', '', why + ' ' + t('Native mpv plays more formats and lists every audio and subtitle track.', 'Native mpv daha çok biçimi oynatır ve tüm ses ve altyazı izlerini listeler.')));
      const row = el('div', 'sx-actions');
      row.append(button(t('Use native player', 'Native oynatıcıyı kullan'), async () => { const ok = await window.NativePlayerUI.start(); if (ok === false) { say(statusFor(box), t('Native player (mpv) is not available.', 'Native oynatıcı (mpv) kullanılamıyor.'), true); return; } clearHint(); }, 'mh-action mh-primary'), button(t('Keep built-in', 'Yerleşik kalsın'), () => clearHint()));
      box.append(row); layer.append(box); hint = box; setTimeout(() => { if (hint === box) clearHint(); }, 45000);
    } catch (_) { /* öneri isteğe bağlıdır */ }
  }
  const statusFor = (box) => { let n = box.querySelector('.sx-status'); if (!n) { n = statusNode(); box.append(n); } return n; };

  /* ---- Giriş / özet atlama (native mpv bölüm adlarından) ---- */
  const SKIP_WORDS = ['intro', 'opening', 'recap', 'previously', 'giriş', 'jenerik', 'özet', 'önceki bölüm', 'sigla', 'générique', 'vorspann'];
  const SKIP_RE = /(?:^|[^a-z])(?:op|ed)(?:[^a-z]|$)/i;
  let skipBtn = null, skipTimer = null;
  function skipTarget() {
    const chapters = window.NativePlayerUI?.state?.().chapters, v = videoEl(); if (!Array.isArray(chapters) || !v) return null;
    const now = v.currentTime || 0;
    for (let i = 0; i < chapters.length; i++) {
      const c = chapters[i], end = chapters[i + 1]?.time ?? Infinity, name = String(c.title || '').toLowerCase();
      if (!(now >= c.time && now < end - 2) || !(SKIP_WORDS.some((w) => name.includes(w)) || SKIP_RE.test(name)) || end - c.time > 360 || !Number.isFinite(end)) continue;
      return { end, label: /recap|previously|özet|önceki/.test(name) ? t('Skip recap', 'Özeti atla') : t('Skip intro', 'Girişi atla') };
    }
    return null;
  }
  function watchSkip(sess) {
    if (skipTimer) clearInterval(skipTimer);
    skipTimer = setInterval(() => {
      if (!sessionActive() || session !== sess) { skipBtn?.remove(); skipBtn = null; return; }
      const target = skipTarget();
      if (!target) { skipBtn?.remove(); skipBtn = null; return; }
      if (skipBtn?.isConnected && skipBtn.dataset.end === String(target.end)) return;
      skipBtn?.remove(); const layer = document.getElementById('playerLayer'); if (!layer) return;
      skipBtn = button(target.label, () => { const v = videoEl(); if (v) v.currentTime = target.end; skipBtn?.remove(); skipBtn = null; }, 'mh-action mh-primary sx-skip'); skipBtn.dataset.end = String(target.end); skipBtn.dataset.uiUntranslated = ''; layer.append(skipBtn);
    }, 700);
  }
  const seekBy = (delta) => { const v = videoEl(); if (!v) return; const d = Number.isFinite(v.duration) ? v.duration : Infinity; v.currentTime = Math.max(0, Math.min(d, (v.currentTime || 0) + delta)); };

  function baseCtx(meta, season, episode) {
    const video = season != null ? (meta.videos || []).find((v) => v.season === season && v.episode === episode) : null;
    return { type: meta.type, id: meta.id, name: meta.name, poster: meta.poster, season: season ?? null, episode: episode ?? null, episodeTitle: video?.title || '',
      next: season != null ? nextOf(meta.videos, season, episode) : null, meta };
  }

  /* ================= Kaynak seçici ================= */
  const RES_ORDER = ['2160p', '1440p', '1080p', '720p', '576p', '480p', '360p'];
  function streamRow(s, onPlay, current, compare) {
    const row = el('article', 'sx-stream' + (s.playable ? '' : ' is-off') + (current ? ' is-current' : ''));
    const left = el('div', 'sx-res sx-res-' + (s.resolution === '2160p' ? '4k' : s.resolution === '1080p' ? 'fhd' : s.resolution === '720p' ? 'hd' : 'other'), s.resolution ? (s.resolution === '2160p' ? '4K' : s.resolution) : s.kind === 'torrent' ? 'P2P' : '—');
    const copy = el('div', 'sx-stream-copy');
    copy.append(el('strong', '', s.filename || s.title || s.name));
    if (s.playable) { const why = el('small', 'sx-why'); why.dataset.kind = s.kind === 'torrent' ? 'torrent' : s.whisperAudio || 'none'; why.append(el('span', 'sx-why-text', playabilityText(s))); if (s.whisperAudio === 'ready') why.append(el('span', 'sx-badge sx-whisper-ok', t('Whisper ready', 'Whisper uygun'))); copy.append(why); }
    const meta = el('div', 'sx-meta');
    if (s.score != null && s.playable) { const ring = el('span', 'sx-score ' + (s.score >= 75 ? 'is-great' : s.score >= 55 ? 'is-good' : 'is-fair'), String(s.score)); ring.style.setProperty('--p', s.score + '%'); ring.title = t('Source score (resolution, seeders, source type, compatibility)', 'Kaynak puanı (çözünürlük, seeder, kaynak türü, uyumluluk)'); ring.setAttribute('aria-label', t('Score ', 'Puan ') + s.score); meta.append(ring); }
    for (const v of [s.addonName, s.provider, s.kind === 'torrent' ? 'Torrent' : s.kind === 'url' ? (s.host || t('Direct', 'Doğrudan')) : '', s.seeders != null ? '● ' + s.seeders : '', fmtSize(s.sizeBytes), s.codec, s.hdr, s.source]) if (v) meta.append(el('span', '', v));
    for (const f of s.flags || []) meta.append(el('span', 'sx-flag', flagEmoji(f)));
    if (s.seeders != null) row.dataset.health = s.seeders >= 100 ? 'great' : s.seeders >= 20 ? 'good' : s.seeders >= 5 ? 'low' : 'poor';
    for (const tg of s.tags || []) if (TAG_LABEL[tg]) meta.append(el('span', 'sx-badge sx-tag-' + tg, t(...TAG_LABEL[tg])));
    for (const w of s.warns || []) if (WARN_LABEL[w]) meta.append(el('span', 'sx-badge is-warn', t(...WARN_LABEL[w])));
    if (s.audio) meta.append(el('span', 'sx-badge', [String(s.audio).toUpperCase(), s.channels].filter(Boolean).join(' ')));
    if (s.multiAudio) meta.append(el('span', 'sx-badge', t('Multi audio', 'Çoklu ses')));
    if (s.embeddedSubtitles) meta.append(el('span', 'sx-badge', t('Subtitles included', 'Altyazı dahil')));
    if (s.notWebReady) meta.append(el('span', 'sx-badge is-warn', t('May need native player', 'Native oynatıcı gerekebilir')));
    copy.append(meta);
    if (compare) { const lab = el('label', 'sx-check sx-compare'), cb = el('input'); cb.type = 'checkbox'; cb.checked = compare.has(s.id); cb.onchange = () => compare.toggle(s, cb); lab.append(cb, el('span', '', t('Compare', 'Karşılaştır'))); copy.append(lab); }
    if (s.usesHeaders) meta.append(el('span', 'sx-badge', t('Sends addon headers', 'Eklenti başlıkları gönderir')));
    if (!s.playable) copy.append(el('small', 'sx-reason', ({ 'needs-headers': t('Needs request headers outside the safe list', 'Güvenli listede olmayan istek başlıkları gerektirir'), youtube: t('YouTube source (not playable here)', 'YouTube kaynağı (burada oynatılamaz)'), external: t('Opens on an external site', 'Dış bir sitede açılır') })[s.reason] || t('Not playable', 'Oynatılamaz')));
    const act = button(current ? t('Playing', 'Oynuyor') : t('Play', 'Oynat'), () => onPlay(s), 'mh-action' + (s.playable ? ' mh-primary' : '')); act.disabled = !s.playable || current;
    row.append(left, copy, act); return row;
  }
  // Plain-language reason a row can (or cannot directly) play; no URL or token is shown.
  function playabilityText(s) {
    if(s.availability==='download')return t('The addon reports a debrid download; readiness is not confirmed. Refresh after completion.','Eklenti debrid indirmesi bildiriyor; hazır olduğu doğrulanmadı. Tamamlanınca yenile.');
    if (s.kind === 'torrent') return t('Raw torrent · plays through the torrent engine; Whisper after the download finishes', 'Ham torrent · torrent motoruyla oynar; Whisper indirme bitince');
    if (s.whisperAudio === 'adaptive') return t('Adaptive stream (HLS/DASH) · plays now; Whisper needs a direct file', 'Uyarlamalı akış (HLS/DASH) · hemen oynar; Whisper doğrudan dosya ister');
    if (s.whisperAudio === 'insecure') return t('Local addon link · plays now; Whisper needs HTTPS', 'Yerel eklenti bağlantısı · hemen oynar; Whisper HTTPS ister');
    const where = s.notWebReady || /\.(mkv|avi|wmv|ts|m2ts|flv)$/i.test(s.filename || '') ? t('native player recommended', 'native oynatıcı önerilir') : t('built-in player', 'yerleşik oynatıcı');
    return t(`Direct link · plays now (${where})`, `Doğrudan bağlantı · hemen oynar (${where})`);
  }
  function streamSummary(streams) {
    const playable = streams.filter((s) => s.playable), direct = playable.filter((s) => s.kind === 'url').length, torrent = playable.filter((s) => s.kind === 'torrent').length, whisper = playable.filter((s) => s.whisperAudio === 'ready').length, off = streams.length - playable.length;
    return { playable: playable.length, direct, torrent, whisper, off };
  }
  function filterStreams(rows, f) {
    let out = rows.filter((s) => (!f.whisper || s.whisperAudio === 'ready') && (!f.res || (f.res === 'other' ? !RES_ORDER.slice(0, 4).includes(s.resolution) : s.resolution === f.res)) && (!f.addon || s.addonKey === f.addon)
      && (!f.q || (s.filename + ' ' + s.title + ' ' + s.name + ' ' + s.provider).toLowerCase().includes(f.q)) && (!f.playableOnly || s.playable) && (!f.multi || s.multiAudio) && (!f.subs || s.embeddedSubtitles > 0));
    if (f.sort === 'seeders') out = [...out].sort((a, b) => (b.seeders ?? -1) - (a.seeders ?? -1));
    if (f.sort === 'size') out = [...out].sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
    if (f.sort === 'score') out = [...out].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (f.sort === 'small') out = [...out].sort((a, b) => (a.sizeBytes ?? Infinity) - (b.sizeBytes ?? Infinity));
    return out;
  }
  function mountStreamList(host, data, { onPlay, currentId, status, onRetry, whisperOnly = false }) {
    const KEY = 'stremio.streamFilters'; let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { saved = {}; }
    const f = { res: ['2160p', '1080p', '720p', 'other'].includes(saved.res) ? saved.res : '', addon: '', q: '', sort: ['recommended', 'seeders', 'size', 'small', 'score'].includes(saved.sort) ? saved.sort : 'recommended', playableOnly: true, multi: !!saved.multi, subs: !!saved.subs, whisper: !!whisperOnly };
    const remember = () => { try { localStorage.setItem(KEY, JSON.stringify({ res: f.res, sort: f.sort, multi: f.multi, subs: f.subs })); } catch (_) { /* saklanamazsa atla */ } };
    const bar = el('div', 'sx-filters'), list = el('div', 'sx-stream-list'), notes = el('div', 'sx-notes'), cmpBox = el('section', 'sx-compare-box'); cmpBox.hidden = true; cmpBox.setAttribute('aria-label', t('Source comparison', 'Kaynak karşılaştırma'));
    const picked = new Map();
    const compare = { has: (id) => picked.has(id), toggle(s, cb) { if (cb.checked && picked.size >= 3) { cb.checked = false; return drawCompare(t('Compare up to 3 sources.', 'En fazla 3 kaynak karşılaştırılır.')); } if (cb.checked) picked.set(s.id, s); else picked.delete(s.id); drawCompare(); } };
    function drawCompare(note) {
      cmpBox.replaceChildren(); cmpBox.hidden = picked.size < 2 && !note; if (cmpBox.hidden) return;
      if (note) cmpBox.append(el('p', 'sx-hint', note)); if (picked.size < 2) return;
      const rows = [...picked.values()], table = el('table', 'sx-compare-table'), cap = el('caption', '', t('Selected sources side by side', 'Seçilen kaynaklar yan yana')), thead = el('thead'), hr = el('tr');
      hr.append(el('th', '', '')); for (const s of rows) { const th = el('th', '', s.addonName + (s.provider ? ' · ' + s.provider : '')); th.scope = 'col'; hr.append(th); } thead.append(hr);
      const tb = el('tbody'); const best = (fn, dir) => { const v = rows.map(fn); const ok = v.filter((x) => x != null); return ok.length > 1 ? (dir > 0 ? Math.max(...ok) : Math.min(...ok)) : null; };
      const topRes = best((s) => RES_ORDER.length - (RES_ORDER.indexOf(s.resolution) < 0 ? RES_ORDER.length : RES_ORDER.indexOf(s.resolution)), 1), topSeed = best((s) => s.seeders, 1);
      const spec = [
        [t('Score', 'Puan'), (s) => (s.score != null ? String(s.score) : '—'), (s) => s.score != null && s.score === Math.max(...rows.map((x) => x.score ?? 0))],
        [t('Quality', 'Kalite'), (s) => (s.resolution === '2160p' ? '4K' : s.resolution || '—'), (s) => RES_ORDER.length - (RES_ORDER.indexOf(s.resolution) < 0 ? RES_ORDER.length : RES_ORDER.indexOf(s.resolution)) === topRes],
        [t('Size', 'Boyut'), (s) => fmtSize(s.sizeBytes) || '—'], [t('Seeders', 'Seeder'), (s) => (s.seeders != null ? String(s.seeders) : '—'), (s) => s.seeders != null && s.seeders === topSeed],
        [t('Video', 'Video'), (s) => [s.codec, s.hdr].filter(Boolean).join(' ') || '—'], [t('Source', 'Kaynak'), (s) => s.source || '—'],
        [t('Audio', 'Ses'), (s) => (s.multiAudio ? t('Multi audio', 'Çoklu ses') : '—')], [t('Subtitles', 'Altyazı'), (s) => (s.embeddedSubtitles ? t(`${s.embeddedSubtitles} included`, `${s.embeddedSubtitles} dahil`) : '—')],
        [t('Delivery', 'Teslimat'), (s) => (s.kind === 'torrent' ? 'Torrent' : s.host || t('Direct', 'Doğrudan'))], [t('Web player', 'Yerleşik oynatıcı'), (s) => (s.notWebReady ? t('Native recommended', 'Native önerilir') : t('Should work', 'Uygun görünür'))],
      ];
      for (const [label, get, mark] of spec) { const tr = el('tr'), th = el('th', '', label); th.scope = 'row'; tr.append(th); for (const s of rows) { const td = el('td', mark?.(s) ? 'is-best' : '', get(s)); tr.append(td); } tb.append(tr); }
      const play = el('tr'); play.append(el('th', '', '')); for (const s of rows) { const td = el('td'); td.append(button(s.id === currentId ? t('Playing', 'Oynuyor') : t('Play', 'Oynat'), () => onPlay(s), 'mh-action' + (s.playable ? ' mh-primary' : ''))); td.firstChild.disabled = !s.playable || s.id === currentId; play.append(td); } tb.append(play);
      const wrap = el('div', 'sx-table-scroll'); table.append(cap, thead, tb); wrap.append(table);
      const clear = button(t('Clear comparison', 'Karşılaştırmayı temizle'), () => { picked.clear(); drawCompare(); draw(); }); cmpBox.append(wrap, clear);
    }
    const resSel = el('select'); resSel.setAttribute('aria-label', t('Quality', 'Kalite'));
    for (const [v, l] of [['', t('All qualities', 'Tüm kaliteler')], ['2160p', '4K'], ['1080p', '1080p'], ['720p', '720p'], ['other', t('Other', 'Diğer')]]) resSel.append(new Option(l, v));
    const addonSel = el('select'); addonSel.setAttribute('aria-label', t('Addon', 'Eklenti')); addonSel.append(new Option(t('All addons', 'Tüm eklentiler'), ''));
    for (const g of data.groups) addonSel.append(new Option(`${g.addonName} (${g.count})`, g.addonKey));
    const sortSel = el('select'); sortSel.setAttribute('aria-label', t('Sort', 'Sırala'));
    for (const [v, l] of [['recommended', t('Recommended', 'Önerilen')], ['seeders', t('Most seeders', 'En çok seeder')], ['size', t('Largest', 'En büyük')], ['small', t('Smallest', 'En küçük')], ['score', t('Best score', 'En yüksek puan')]]) sortSel.append(new Option(l, v));
    resSel.value = f.res; sortSel.value = f.sort;
    const q = el('input'); q.type = 'search'; q.placeholder = t('Filter sources…', 'Kaynaklarda filtrele…'); q.setAttribute('aria-label', q.placeholder);
    const only = el('label', 'sx-check'), cb = el('input'); cb.type = 'checkbox'; cb.checked = true; only.append(cb, el('span', '', t('Playable only', 'Yalnız oynatılabilenler')));
    const mkCheck = (label, key) => { const l = el('label', 'sx-check'), c = el('input'); c.type = 'checkbox'; c.checked = f[key]; c.onchange = () => { f[key] = c.checked; remember(); draw(); }; l.append(c, el('span', '', label)); return l; };
    const whisperCheck = mkCheck(t('Whisper ready', 'Whisper uygun'), 'whisper'); whisperCheck.title = t('Direct HTTPS files whose audio can be prepared for Whisper without downloading the whole film.', 'Filmin tamamı indirilmeden sesi Whisper için hazırlanabilen doğrudan HTTPS dosyaları.');
    bar.append(resSel, addonSel, sortSel, q, mkCheck(t('Multi audio', 'Çoklu ses'), 'multi'), mkCheck(t('Has subtitles', 'Altyazılı'), 'subs'), whisperCheck, only);
    const sum = streamSummary(data.streams), summary = el('p', 'sx-source-summary'); summary.setAttribute('role', 'note');
    if (data.streams.length) {
      const parts = [['playable', t(`${sum.playable} playable`, `${sum.playable} oynatılabilir`)]];
      if (sum.direct) parts.push(['direct', t(`${sum.direct} direct/debrid`, `${sum.direct} doğrudan/debrid`)]); if (sum.torrent) parts.push(['torrent', t(`${sum.torrent} raw torrent`, `${sum.torrent} ham torrent`)]);
      parts.push(['whisper', t(`${sum.whisper} Whisper ready`, `${sum.whisper} Whisper uygun`)]); if (sum.off) parts.push(['off', t(`${sum.off} not playable here`, `${sum.off} burada oynatılamaz`)]);
      parts.forEach(([kind, label], i) => { if (i) { const sep = el('span', 'sx-sum-sep', ' · '); sep.setAttribute('aria-hidden', 'true'); summary.append(sep); } const item = el('span', 'sx-sum-item', label); item.dataset.kind = kind; summary.append(item); });
    } else summary.hidden = true;
    const failed = data.groups.filter((g) => g.error);
    const emptyBox = (message) => { const box = el('div', 'sx-source-empty'); box.append(el('p', 'sx-empty', message)); const acts = el('div', 'sx-actions');
      if (f.playableOnly && data.streams.some((s) => !s.playable)) acts.append(button(t('Show sources that cannot play here', 'Burada oynatılamayanları göster'), () => { f.playableOnly = false; cb.checked = false; draw(); }));
      if (f.whisper) acts.append(button(t('Show all playable sources', 'Tüm oynatılabilirleri göster'), () => { f.whisper = false; whisperCheck.querySelector('input').checked = false; draw(); }));
      if (typeof onRetry === 'function' && (!data.streams.length || failed.length)) acts.append(button(t('Search sources again', 'Kaynakları yeniden ara'), onRetry, 'mh-action mh-primary sx-retry'));
      if (acts.children.length) box.append(acts); return box; };
    const draw = () => {
      list.replaceChildren(); const rows = filterStreams(data.streams, f);
      for (const s of rows.slice(0, 150)) list.append(streamRow(s, onPlay, s.id === currentId, compare));
      if (!rows.length) list.append(emptyBox(data.streams.length ? t('No source matches these filters.', 'Bu filtrelere uyan kaynak yok.') : failed.length && failed.length === data.groups.length ? t('No addon could return sources. Check your connection or addon settings, then search again.', 'Hiçbir eklenti kaynak döndüremedi. Bağlantını veya eklenti ayarlarını kontrol edip yeniden ara.') : t('No sources found. Try another addon or check again later.', 'Kaynak bulunamadı. Başka bir eklenti dene veya sonra yeniden bak.')));
      if (rows.length > 150) list.append(el('p', 'sx-hint', t(`Showing 150 of ${rows.length}. Filter to narrow the list.`, `${rows.length} kaynaktan 150'si gösteriliyor. Daralmak için filtrele.`)));
    };
    resSel.onchange = () => { f.res = resSel.value; remember(); draw(); }; addonSel.onchange = () => { f.addon = addonSel.value; draw(); }; sortSel.onchange = () => { f.sort = sortSel.value; remember(); draw(); };
    q.oninput = () => { f.q = q.value.trim().toLowerCase(); draw(); }; cb.onchange = () => { f.playableOnly = cb.checked; draw(); };
    for (const g of failed) notes.append(el('p', 'sx-note', `${g.addonName}: ${groupReason(g.error)}`));
    if (failed.length && data.streams.length && typeof onRetry === 'function') notes.append(button(t('Ask failed addons again', 'Başarısız eklentilere yeniden sor'), onRetry, 'mh-action sx-retry'));
    host.append(bar, summary, notes, cmpBox, list); draw(); void status; return { draw };
  }
  const SUBTITLE_LANGUAGE_KEY = 'stremio.subtitleLanguage';
  const subtitleLanguageCode = value => /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(String(value || '')) ? String(value).toLowerCase().split('-')[0] : '';
  function subtitleLanguage() {
    try { const saved=localStorage.getItem(SUBTITLE_LANGUAGE_KEY); if(saved!==null&&(saved===''||subtitleLanguageCode(saved)))return subtitleLanguageCode(saved); } catch (_) { /* session fallback */ }
    return subtitleLanguageCode(document.getElementById('translateTo')?.value) || 'en';
  }
  window.addEventListener('pagehide',()=>rememberWorkTracks());
  const workTextPreviews=new Map();
  const validWorkKey=key=>/^work:stremio:[a-f0-9]{64}$/.test(key||'');
  function readWorkTracks(key) {
    if(!validWorkKey(key))return [];
    const raw=localStorage.getItem('stremio.workTracks.'+key);
    if(!raw)return [];
    const data=JSON.parse(raw);
    if(data?.version!==1||!Array.isArray(data.rows)||data.rows.length>32||data.rows.some(r=>typeof r?.sourceKey!=='string'||!Array.isArray(r.tracks)||r.tracks.length>2||r.tracks.some(v=>!v||typeof v.file!=='string'||v.file.length>240||!['source','translation'].includes(v.role)||typeof v.language!=='string'||v.language.length>24||!Number.isSafeInteger(v.count)||v.count<0||!Number.isFinite(v.offset))))throw Error('Invalid work references');
    return data.rows;
  }
  function rememberWorkTracks() {
    if(!sessionActive()||!validWorkKey(session.workKey)||player.workKey!==session.workKey)return;
    const tracks=[];
    for(const secondary of [false,true]){
      const path=player[secondary?'sub2Path':'subPath'];if(!path)continue;
      const cues=player[secondary?'cues2':'cues']||[],role=player[secondary?'sub2Role':'subRole']||(secondary?'translation':'source');
      tracks.push({file:baseName(path).slice(0,240),role,language:String(player[secondary?'sub2Lang':'subLang']||'').slice(0,24),count:cues.length,offset:Number(player[secondary?'offset2':'offset'])||0});
      const previewKey=session.workKey+':'+session.key+':'+role;
      if(workTextPreviews.size<128||workTextPreviews.has(previewKey))workTextPreviews.set(previewKey,cues.slice(0,4).map(c=>String(c.text||'').slice(0,500)));
    }
    if(!tracks.length)return;
    try {
      const rows=readWorkTracks(session.workKey),row={sourceKey:session.key,tracks},i=rows.findIndex(r=>r.sourceKey===session.key);
      if(i<0&&rows.length>=32)throw Error('Capacity');
      if(i<0)rows.push(row);else rows[i]=row;
      localStorage.setItem('stremio.workTracks.'+session.workKey,JSON.stringify({version:1,rows}));
    }catch(_){toast(t('Subtitle references could not be saved; your files were kept.','Altyazı referansları kaydedilemedi; dosyaların korundu.'));}
  }
  function previousWorkTracks(body) {
    if(!validWorkKey(session?.workKey))return;
    let rows;try{rows=readWorkTracks(session.workKey).filter(r=>r.sourceKey!==session.key);}catch(_){body.append(el('p','sx-hint',t('Earlier subtitle references could not be read. Existing records were kept.','Önceki altyazı referansları okunamadı. Mevcut kayıtlar korundu.')));return;}
    if(!rows.length)return;
    const details=el('details','sx-work-tracks');details.append(el('summary','',t('Subtitles from earlier sources','Önceki kaynakların altyazıları')));
    details.append(el('p','sx-hint',t('Same work, different edition. These references are read-only: timing and audio match are unverified. No track, translation or offset was attached. Choose subtitles for this source below; use the existing sync tools to review timing.','Aynı yapıt, farklı sürüm. Bu referanslar salt okunur: zaman ve ses eşleşmesi doğrulanmadı. İz, çeviri veya ofset bağlanmadı. Aşağıdan bu kaynağın altyazısını seç; zamanlamayı mevcut senkron araçlarında incele.')));
    for(const row of rows)for(const track of row.tracks){
      const item=el('div','sx-work-track');item.append(el('strong','',String(track.file||'')),el('small','',[(track.role==='translation'?t('Translation','Çeviri'):t('Source text','Kaynak metin')),String(track.language||''),Number.isSafeInteger(track.count)?track.count+' '+t('lines','satır'):'',t('Not attached','Bağlı değil')].filter(Boolean).join(' · ')));
      const preview=workTextPreviews.get(session.workKey+':'+row.sourceKey+':'+track.role);
      if(preview?.length)item.append(el('p','',preview.join(' / ')));details.append(item);
    }
    body.append(details);
  }
  async function playStreamRow(ctxLike, data, s, { seconds, isCancelled = () => false } = {}) {
    if (isCancelled()) return false;
    rememberWorkTracks();
    const request = ++playRequest, owner = { key: player.mediaKey, generation: player.generation, intent: player.openIntent };
    const result = await call('play', { token: data.token, streamId: s.id, title: ctxLike.name + (ctxLike.season != null ? ` · ${epLabel(ctxLike.season, ctxLike.episode)}` : '') });
    const start = seconds != null ? seconds : (result.resume?.position || 0);
    if(request !== playRequest || isCancelled() || player.mediaKey !== owner.key || player.generation !== owner.generation || player.openIntent !== owner.intent)return false;
    const nextSession = { ctx: ctxLike, workKey:result.workKey, key: result.key, streamToken: data.token, streamId: s.id, sourceLabel: `${s.addonName}${s.resolution ? ' · ' + s.resolution : ''}`, torrent: !!result.hash, whisperAudio: result.whisperAudio || s.whisperAudio || 'none', filename: s.filename || '', notWebReady: !!result.notWebReady, bingeGroup: s.bingeGroup || '', addonKey: s.addonKey || '', resolution: s.resolution || '', profile: detectProfile(ctxLike) };
    const opened = await window.MediaHubUI.playStream(result, start, { isCancelled: () => request !== playRequest || isCancelled() });
    if(opened === false || request !== playRequest || isCancelled() || (typeof player !== 'undefined' && player.mediaKey !== result.key))return false;
    session = nextSession;
    if(typeof syncSubtitlePrimaryAction==='function')syncSubtitlePrimaryAction();
    if(typeof player!=='undefined'&&player.mediaKey===result.key){player.workKey=validWorkKey(result.workKey)?result.workKey:'';document.dispatchEvent(new CustomEvent('player-work-identity'));}
    hookVideo(); mountPlayerButton();
    if (window.MediaTitleUI?.close) window.MediaTitleUI.close();
    document.querySelector('.media-title-page')?.close?.();
    clearNext(); refreshPlayerButton(); if (start > 5 && seconds == null) toast(t(`Resuming from ${fmtTime(start)}`, `${fmtTime(start)} noktasından devam ediliyor`), { label: t('From the start', 'Baştan başla'), action: () => { const v = videoEl(); if (v) v.currentTime = 0; } }); else if (seconds != null && seconds > 5) toast(t('Source switched — position kept', 'Kaynak değişti — konum korundu')); void autoSubtitle(session); void suggestNative(session, s); watchSkip(session); return result;
  }
  // Altyazı yoksa tercih edilen dilde en iyi eşleşmeyi sessizce yükler (kullanıcı seçtiyse dokunmaz).
  async function autoSubtitle(s) {
    try {
      if (typeof player === 'undefined' || player.subPath) return;
      const selection=s.subtitleSelectionRevision||0;
      const mediaOwner={key:player.mediaKey,generation:player.generation},language=subtitleLanguage();
      const current=()=>!(player.job?.running&&player.job.mediaKey===mediaOwner.key)&&session===s&&(s.subtitleSelectionRevision||0)===selection&&player.mediaKey===mediaOwner.key&&player.generation===mediaOwner.generation&&!player.subPath&&subtitleLanguage()===language;
      const c = s.ctx, r = await call('subtitles', { type: c.type, id: c.id, season: c.season, episode: c.episode, filename: s.filename, title: c.name, language, streamToken: s.streamToken, streamId: s.streamId });
      const pick = r.subtitles.find((x) => x.preferred); if (!pick || !current()) return;
      const saved = await call('subtitle-save', { token: r.token, id: pick.id }); if (!current()) return;
      const targetLanguage = subtitleLanguageCode(document.getElementById('translateTo')?.value);
      const audioLanguage=subtitleLanguageCode(c.meta?.language)||subtitleLanguageCode(document.getElementById('language')?.value);
      const asTranslation = !!audioLanguage && audioLanguage!==targetLanguage && subtitleLanguageCode(saved.language) === targetLanguage;
      addSubtitleOption(saved.filePath, `${saved.label} · ${saved.addonName}`, { role: asTranslation ? 'translation' : 'source', language: saved.language });
      await loadSubtitle(saved.filePath, false, {select:true,isCancelled:()=>!current()}); if(session!==s||player.mediaKey!==mediaOwner.key||player.generation!==mediaOwner.generation||player.subPath!==saved.filePath)return;rememberWorkTracks(); toast(t('Subtitle added automatically', 'Altyazı otomatik eklendi') + ' · ' + (saved.language || '').toUpperCase());
    } catch (_) { /* otomatik altyazı isteğe bağlıdır */ }
  }
  // Expired lists and vanished rows are fixed by asking the addons again, not by clicking the same row.
  function offerRetry(host, error, retry) {
    if (!['EXPIRED', 'NOT_FOUND'].includes(error?.code) || !host.isConnected || host.querySelector(':scope > .sx-retry')) return;
    host.prepend(button(t('Search sources again', 'Kaynakları yeniden ara'), retry, 'mh-action mh-primary sx-retry'));
  }
  async function openStreams(ctxLike) {
    let dialog;
    const status = statusNode(), body = el('main', 'sx-body');
    dialog = dialogShell('sx-streams', t('Choose a source', 'Kaynak seç'), null);
    const title = ctxLike.name + (ctxLike.season != null ? ` · ${epLabel(ctxLike.season, ctxLike.episode)}${ctxLike.episodeTitle ? ' ' + ctxLike.episodeTitle : ''}` : '');
    dialog.append(header(title, t('Sources from your addons', 'Eklentilerinden gelen kaynaklar'), () => dialog.close()), status, body);
    let pendingRetry=null;
    const retryCurrent=()=>!!pendingRetry&&dialog.isConnected&&dialog.open&&player.mediaKey===pendingRetry.key&&player.generation===pendingRetry.generation&&playRequest===pendingRetry.request;
    dialog.addEventListener('sx-error',(e)=>{say(status,e.detail?.message,true);if(e.detail?.code==='NEEDS_TORRENT_ENGINE')showEngineHelp();});
    const showEngineHelp=(retry)=>{
      if(retry)pendingRetry={run:retry,key:player.mediaKey,generation:player.generation,request:playRequest};
      let box=body.querySelector('.sx-engine');if(box){const retryButton=box.querySelector('.sx-engine-retry');if(retry){box.dataset.engineReady='false';const setup=box.querySelector('.sx-engine-install');if(setup)setup.hidden=false;}if(retryButton)retryButton.disabled=!retryCurrent()||box.dataset.engineReady!=='true';return;}
      box=el('div','sx-engine');const message=el('p','',t('This is a raw torrent source. Install the torrent engine once, or configure the addon with your debrid service and choose its direct link. Installing alone does not download a film.','Bu ham torrent kaynağıdır. Torrent motorunu bir kez kur veya eklentide debrid hizmetini yapılandırıp doğrudan bağlantısını seç. Yalnız motoru kurmak film indirmez.'));
      const retryButton=button(t('Retry selected source','Seçilen kaynağı yeniden dene'),async()=>{if(!retryCurrent()||box.dataset.engineReady!=='true')return;await pendingRetry.run();},'mh-action sx-engine-retry');retryButton.disabled=true;
      const install=button(t('Install torrent support','Torrent motorunu kur'),async()=>{
        if(!retryCurrent()||!window.MediaHubUI?.installTorrentEngine)return;
        const current=pendingRetry,stillCurrent=()=>pendingRetry===current&&retryCurrent();
        say(status,t('Installing and verifying the torrent engine…','Torrent motoru kurulup doğrulanıyor…'));
        const result=await window.MediaHubUI.installTorrentEngine({isCurrent:stillCurrent});if(!stillCurrent()||!result?.ok)return;
        say(status,t('Torrent engine is ready. Retry the selected source when you want to start it.','Torrent motoru hazır. Başlatmak istediğinde seçilen kaynağı yeniden dene.'));box.dataset.engineReady='true';install.hidden=true;retryButton.disabled=false;
      },'mh-action mh-primary sx-engine-install');
      install.disabled=!window.MediaHubUI?.installTorrentEngine;
      box.append(message,install,retryButton,button(t('Addon / debrid settings','Eklenti / debrid ayarları'),()=>{dialog.close();openAddons();}),button(t('Open torrent setup','Torrent kurulumunu aç'),()=>{dialog.close();window.MediaHubUI?.open('torrents');}));body.prepend(box);
    };
    // Retry reopens the same title/episode context (never autoplays), replacing this picker.
    const retry = async () => {
      if (!dialog.isConnected||!dialog.open) return;
      if(ctxLike.metaId){try{await call('meta',{type:ctxLike.type,id:ctxLike.metaId,addonKey:ctxLike.addonKey});}catch(e){if(dialog.open)say(status,e.message,true);return;}if(!dialog.isConnected||!dialog.open)return;}
      dialog.close();return openStreams({ ...ctxLike, autoplayBest: false });
    };
    say(status, t('Asking your addons…', 'Eklentilere soruluyor…')); const skeleton = el('div', 'sx-skeleton'); body.append(skeleton);
    try {
      const data = await call('streams', { type: ctxLike.type, id: ctxLike.id, season: ctxLike.season, episode: ctxLike.episode,
        ...(ctxLike.metaId ? {metaId:ctxLike.metaId,addonKey:ctxLike.addonKey} : {}) });
      skeleton.remove(); say(status, '');
      // An explicit start (e.g. “From the beginning”) overrides the saved resume point.
      const explicitStart = { isCancelled: () => !dialog.isConnected || !dialog.open, ...(Number.isFinite(ctxLike.resumeSeconds) && ctxLike.resumeSeconds >= 0 ? { seconds: ctxLike.resumeSeconds } : {}) };
      const onPlay = async (s) => { say(status, t('Opening source…', 'Kaynak açılıyor…')); try { if(await playStreamRow(ctxLike, data, s, explicitStart))dialog.close(); } catch (e) { say(status, e.message, true); if (e.code === 'NEEDS_TORRENT_ENGINE') showEngineHelp(()=>onPlay(s)); else offerRetry(body, e, retry); } };
      const best = pickPreferred(data.streams, ctxLike.prefer) || (ctxLike.prefer?.torrent === false ? null : data.streams.find((s) => s.playable));
      if (best) {
        const top = el('div', 'sx-best'); const label = [best.addonName, best.resolution, best.provider, best.seeders != null ? '👤 ' + best.seeders : ''].filter(Boolean).join(' · ');
        top.append(button(t('Play best source', 'En iyi kaynakla oynat'), () => onPlay(best), 'mh-action mh-primary'), el('small', '', label + (best.score != null ? ' · ' + t('score ', 'puan ') + best.score : ''))); body.append(top);
        // The user may have closed this picker while addons were answering; never start playback then.
        if (ctxLike.autoplayBest && dialog.isConnected && dialog.open) void onPlay(best);
      }
      mountStreamList(body, data, { onPlay, status, onRetry: retry });
    } catch (e) { skeleton.remove(); say(status, e.message, true); if (e.code === 'NO_ADDONS') { body.append(button(t('Add an addon', 'Eklenti ekle'), () => { dialog.close(); openAddons(); }, 'mh-action mh-primary')); } else if (dialog.isConnected) body.append(button(t('Search sources again', 'Kaynakları yeniden ara'), retry, 'mh-action mh-primary sx-retry')); }
    return dialog;
  }

  /* ================= Başlık sayfası ================= */
  let titleRequest=0;
  async function openTitle(item, options = {}) {
    if(!window.MediaDiscoveryUI?.openDetail){toast(t('Film details are not available yet.', 'Yapım ayrıntıları henüz kullanılamıyor.'));return {ok:false};}
    const request=++titleRequest,trigger=document.activeElement,route=window.MediaHomeUI?.currentPage?.();
    let meta,error='';
    try{meta=(await call('meta',{type:item.type,id:item.id,...(item.addonKey?{addonKey:item.addonKey}:{})})).meta;if(!meta||meta.id!==item.id||meta.type!==item.type)throw Error(t('Title identity could not be verified.','Yapım kimliği doğrulanamadı.'));}catch(e){meta={...item,name:item.name||item.id,videos:[],genres:[],description:''};error=e.message;}
    if(request!==titleRequest||(route&&window.MediaHomeUI?.currentPage?.()!==route))return {ok:false,cancelled:true};
    const kind=meta.type==='series'?'series':'film',runtime=/^(\d+)\s*(?:min(?:ute)?s?|dk)?$/i.exec(meta.runtime||'');
    const fallbackDetail={item:{kind,providerId:meta.id,title:meta.name,year:meta.year,rating:meta.imdbRating,runtime:runtime?Number(runtime[1]):0,poster:meta.poster,backdrop:meta.background,synopsis:meta.description||'',genres:meta.genres||[],cast:meta.cast||[],castMembers:[],directors:meta.director||[],writers:meta.writer||[],director:(meta.director||[]).join(', '),writer:(meta.writer||[]).join(', '),country:meta.country||'',language:meta.language||'',awards:meta.awards||'',released:meta.released||''},catalogId:null};
    return window.MediaDiscoveryUI.openDetail({kind,providerId:meta.id,title:meta.name,year:meta.year,poster:meta.poster},{
      fallbackDetail,navigationPage:route==='stremio'?'stremio':undefined,backLabel:()=>route==='stremio'?t('← Back to Stremio','← Stremio’ya dön'):t('← Back','← Geri'),returnFocus:()=>trigger?.isConnected?trigger:null,
      ...options,onReady:({page,actions,sourceHost,status})=>{
        let disposed=false;
        const body=el('section','sx-source-tools'),sourceActions=el('div','sx-actions'),personal=el('details','sx-source-personal');
        body.append(el('h2','',t('Stremio sources & episodes','Stremio kaynakları ve bölümler')),sourceActions);
        personal.append(el('summary','',t('My Stremio list & review','Stremio listem ve değerlendirmem')),libraryButton(meta),ratingPanel(meta));body.append(personal);sourceHost.append(body);
        if(error)say(status,error,true);
        const current=()=>!disposed&&page.open&&request===titleRequest;
        void mountTitleSources(meta,page,actions,body,sourceActions,current,status).catch(e=>{if(current())say(status,e.message,true);});
        const externalDispose=options.onReady?.({page,actions,sourceHost,status});
        return ()=>{disposed=true;if(typeof externalDispose==='function')externalDispose();};
      }
    });
  }
  async function mountTitleSources(meta,page,heroActions,body,actions,current,status) {
    let entries = []; try { entries = (await call('progress-title', { type: meta.type, id: meta.id })).entries; } catch (_) { /* ilerleme okunamazsa sıfırdan */ }
    if(!current())return;
    const byKey = new Map(entries.map((e) => [e.season != null ? e.season + ':' + e.episode : 'movie', e]));
    const play = (season, episode, seconds) => openStreams({ ...baseCtx(meta, season, episode), resumeSeconds: seconds });
    const heroPlay=(label,run)=>{for(const previous of heroActions.querySelectorAll('[data-kind="primary"]'))previous.dataset.kind='secondary';const control=button(label,run,'cn-button');control.dataset.kind='primary';const icon=window.MediaVisual?.icon?.('play');if(icon)control.prepend(icon);heroActions.prepend(control);};

    if (meta.type === 'other' || (meta.videos || []).some(v=>v.hasInlineStreams)) {
      const files=el('section','sx-library-files');files.append(el('h3','sx-h3',t('Library files','Kütüphane dosyaları')));
      files.append(el('p','sx-hint',t('Choose a file to see its sources. This list does not start or add a download.','Kaynaklarını görmek için dosya seç. Bu liste indirme başlatmaz veya torrent eklemez.')));
      const videos=(meta.videos||[]).length?meta.videos:meta.defaultVideoId?[{id:meta.defaultVideoId,title:meta.name}]:[];
      for(const video of videos){
        const unavailable=video.available===false;
        const choose=button((video.title||meta.name)+(unavailable?' · '+t('Not available','Henüz kullanılamıyor'):''),()=>{
          if(!current())return;
          return openStreams({...baseCtx(meta),id:video.id,...(video.hasInlineStreams?{metaId:meta.id,addonKey:meta.addonKey}:{}),episodeTitle:video.title||'',resumeSeconds:undefined});
        },'mh-action sx-library-file');
        choose.disabled=unavailable;files.append(choose);
      }
      if(!videos.length)files.append(el('p','sx-hint',t('The addon did not report individual files.','Eklenti ayrı dosya bildirmedi.')));
      body.append(files);
      heroPlay(t('Choose library file','Kütüphane dosyası seç'),()=>files.scrollIntoView?.({block:'nearest',behavior:'auto'}));
      return;
    }
    if (meta.type !== 'series' || !(meta.videos || []).some((v) => v.season != null)) {
      const e = byKey.get('movie');
      if (e && !e.completed) actions.append(button(t(`Continue · ${fmtTime(e.position)}`, `Devam et · ${fmtTime(e.position)}`), () => play(null, null), 'mh-action mh-primary'), button(t('From the beginning', 'Baştan oynat'), () => play(null, null, 0)));
      else actions.append(button(e ? t('Watch again', 'Yeniden izle') : t('Play', 'Oynat'), () => play(null, null, 0), 'mh-action mh-primary'));
      if (e && !e.completed) body.append(progressBar(e));
      heroPlay(t('Choose a source', 'Kaynak seç ve oynat'), () => play(null,null));
      page.addEventListener('sx-error', (ev) => { if (status) say(status, ev.detail?.message, true); });
      return;
    }

    const eps = meta.videos.filter((v) => v.season != null && v.episode != null).sort((a, b) => a.season - b.season || a.episode - b.episode);
    const last = entries[0];
    let primary = eps.find((v) => v.season > 0) || eps[0], label = t('Play', 'Oynat'), seconds;
    if (last) {
      if (!last.completed) { primary = eps.find((v) => v.season === last.season && v.episode === last.episode) || primary; label = t(`Continue ${epLabel(last.season, last.episode)} · ${fmtTime(last.position)}`, `Devam et ${epLabel(last.season, last.episode)} · ${fmtTime(last.position)}`); }
      else { const n = last.next || nextOf(eps, last.season, last.episode); if (n) { primary = eps.find((v) => v.season === n.season && v.episode === n.episode) || primary; label = t(`Next ${epLabel(n.season, n.episode)}`, `Sıradaki ${epLabel(n.season, n.episode)}`); } else label = t('Watch again', 'Yeniden izle'); }
    }
    if (primary) { actions.append(button(label, () => play(primary.season, primary.episode, seconds), 'mh-action mh-primary'));heroPlay(label,()=>play(primary.season,primary.episode,seconds)); }
    const seasons = [...new Set(eps.map((v) => v.season))];
    const picker = el('select', 'sx-season'); picker.setAttribute('aria-label', t('Season', 'Sezon'));
    for (const s of seasons) picker.append(new Option(s === 0 ? t('Specials', 'Özel bölümler') : t(`Season ${s}`, `Sezon ${s}`), String(s)));
    picker.value = String(primary?.season ?? seasons[0]);
    const list = el('div', 'sx-episodes');
    const draw = () => {
      list.replaceChildren();
      for (const v of eps.filter((x) => String(x.season) === picker.value)) {
        const e = byKey.get(v.season + ':' + v.episode), row = el('article', 'sx-episode' + (e?.completed ? ' is-done' : ''));
        const thumb = el('div', 'sx-thumb'), tag = el('span', 'sx-thumb-tag', epLabel(v.season, v.episode)); thumb.append(tag); if (v.thumbnail) { const img = el('img'); img.src = v.thumbnail; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.onerror = () => img.remove(); img.onload = () => tag.remove(); thumb.append(img); }
        const info = el('div', 'sx-ep-copy'); info.append(el('strong', '', `${v.episode}. ${v.title || t('Episode', 'Bölüm')}`), el('small', '', [v.released ? new Date(v.released).toLocaleDateString(window.UiLocale?.get?.() === 'tr' ? 'tr-TR' : 'en-US') : '', e?.completed ? t('Watched', 'İzlendi') : e ? t(`Stopped at ${fmtTime(e.position)}`, `${fmtTime(e.position)} noktasında kaldı`) : ''].filter(Boolean).join(' · ')));
        if (v.overview) info.append(el('p', '', v.overview));
        if (e && !e.completed) info.append(progressBar(e));
        if (primary && v.season === primary.season && v.episode === primary.episode) info.prepend(el('span', 'sx-badge is-warn sx-next-badge', e && !e.completed ? t('Continue', 'Devam') : t('Up next', 'Sıradaki')));
        const mark = button(e?.completed ? '✓ ' + t('Watched', 'İzlendi') : t('Mark watched', 'İzlendi işaretle'), async () => {
          if (e?.completed) { await call('progress-clear', { type: meta.type, id: meta.id, season: v.season, episode: v.episode }); byKey.delete(v.season + ':' + v.episode); toast(t('Marked as not watched', 'İzlenmedi olarak işaretlendi')); }
          else { const r = await call('progress-save', { type: meta.type, id: meta.id, season: v.season, episode: v.episode, name: meta.name, poster: meta.poster, episodeTitle: v.title || '', next: nextOf(eps, v.season, v.episode), position: 3600, duration: 3600, completed: true, manualCompletion: true }); byKey.set(v.season + ':' + v.episode, r.saved); toast(t('Marked as watched', 'İzlendi olarak işaretlendi')); }
          draw(); document.dispatchEvent(new CustomEvent('stremio-progress-changed'));
        }, 'mh-action sx-mark'); mark.setAttribute('aria-pressed', String(!!e?.completed)); mark.setAttribute('aria-label', `${mark.textContent}: ${v.episode}. ${v.title || ''}`);
        const acts = el('div', 'sx-ep-actions'); if(e&&!e.completed)acts.append(button(t('From the beginning','Baştan oynat'),()=>play(v.season,v.episode,0),'mh-action')); acts.append(button(e && !e.completed ? t('Continue', 'Devam et') : t('Play', 'Oynat'), () => play(v.season, v.episode), 'mh-action mh-primary'), mark);
        row.append(thumb, info, acts);
        list.append(row);
      }
    };
    picker.onchange = () => { draw(); for (const b of pills.children) b.setAttribute('aria-pressed', String(b.dataset.s === picker.value)); };
    const pills = el('div', 'sx-seg sx-seasons'); pills.setAttribute('role', 'group'); pills.setAttribute('aria-label', t('Season', 'Sezon'));
    if (seasons.length > 1 && seasons.length <= 8) { for (const sn of seasons) { const b = el('button', 'sx-seg-btn', sn === 0 ? t('Specials', 'Özel') : t(`S${sn}`, `S${sn}`)); b.type = 'button'; b.dataset.s = String(sn); b.onclick = () => { picker.value = String(sn); picker.onchange(); }; pills.append(b); } picker.hidden = true; }
    for (const b of pills.children) { const sn = Number(b.dataset.s), total = eps.filter((x) => x.season === sn).length, done = eps.filter((x) => x.season === sn && byKey.get(sn + ':' + x.episode)?.completed).length; b.textContent = (sn === 0 ? t('Specials', 'Özel') : `S${sn}`) + (done ? ` · ${done}/${total}` : ''); }
    picker.onchange(); body.append(...(pills.children.length ? [pills] : []), picker, list);

    page.addEventListener('sx-error', (ev) => { if (status) say(status, ev.detail?.message, true); });
  }
  function progressBar(e) { const wrap = el('div', 'sx-progress'), bar = el('span'); bar.style.width = Math.min(100, Math.round((e.position / e.duration) * 100)) + '%'; wrap.append(bar); wrap.setAttribute('role', 'progressbar'); wrap.setAttribute('aria-valuenow', String(Math.round((e.position / e.duration) * 100))); return wrap; }

  /* ================= Stremio sayfası ================= */
  const reduceMotion = () => { try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  const typeLabel = (type, plural = false) => (type === 'series' ? (plural ? t('Series', 'Diziler') : t('Series', 'Dizi')) : type === 'movie' ? (plural ? t('Films', 'Filmler') : t('Film', 'Film')) : type === 'other' ? t('Addon library','Eklenti kütüphanesi') : type);
  const genreLabel = value => window.MediaVisual?.genre?.(value) ?? value;
  const metaLine = (m) => [m.year || m.releaseInfo, m.imdbRating ? '★ ' + m.imdbRating : '', (m.genres || []).slice(0, 3).map(genreLabel).join(' · ')].filter(Boolean).join('  ·  ');
  const playTitle = (m) => (m.type === 'series' ? openTitle(m) : openStreams({ type: m.type, id: m.id, name: m.name, poster: m.poster, season: null, episode: null, episodeTitle: '', next: null }));

  const ratingTier = (r) => (r >= 8 ? 'is-top' : r >= 7 ? 'is-good' : r >= 6 ? 'is-ok' : 'is-low');
  function mediaCard(item) {
    const wrap = el('div', 'sx-card-wrap'), b = el('button', 'sx-card'); b.type = 'button';
    const poster = posterNode(item);
    if (item.imdbRating) poster.append(el('span', 'sx-rating ' + ratingTier(item.imdbRating), '★ ' + item.imdbRating));
    if (item.type === 'series') poster.append(el('span', 'sx-type-badge', t('Series', 'Dizi')));
    b.append(poster, el('strong', '', item.name), el('small', '', [item.year, typeLabel(item.type)].filter(Boolean).join(' · ')));
    b.setAttribute('aria-label', [item.name, item.year, typeLabel(item.type), item.imdbRating ? 'IMDb ' + item.imdbRating : ''].filter(Boolean).join(', '));
    b.onclick = () => void openTitle(item);
    const heart = el('button', 'sx-quick-add', '♡'); heart.type = 'button'; let saved = item.saved === true ? true : null;
    const paint = () => { heart.textContent = saved ? '♥' : '♡'; heart.setAttribute('aria-pressed', String(!!saved)); heart.setAttribute('aria-label', (saved ? t('Remove from my list: ', 'Listemden çıkar: ') : t('Add to my list: ', 'Listeme ekle: ')) + item.name); heart.title = saved ? t('In my list', 'Listemde') : t('Add to my list', 'Listeme ekle'); };
    const learn = () => { if (saved !== null) return; saved = false; paint(); call('library-has', { type: item.type, id: item.id }).then((r) => { saved = !!r.saved; paint(); }).catch(() => {}); };
    wrap.addEventListener('mouseenter', learn); wrap.addEventListener('focusin', learn); paint();
    heart.onclick = async (e) => { e.stopPropagation(); try { const r = await call('library-toggle', { type: item.type, id: item.id, name: item.name, poster: item.poster, year: item.year, imdbRating: item.imdbRating }); saved = r.saved; paint(); dispatchLibrary(); toast(saved ? t('Added to my list', 'Listene eklendi') : t('Removed from my list', 'Listenden çıkarıldı')); } catch (err) { wrap.dispatchEvent(new CustomEvent('sx-error', { bubbles: true, detail: err })); } };
    wrap.append(b, heart); return wrap;
  }
  // Raf içinde ← → ile kartlar arasında gezinme; Home/End uçlara gider.
  function railKeys(rail) {
    rail.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const cards = [...rail.querySelectorAll('.sx-card')]; const i = cards.indexOf(document.activeElement); if (i < 0) return;
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
      e.preventDefault(); cards[j].focus(); cards[j].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  }
  function shelfHead(title, rail, id) {
    const head = el('div', 'sx-shelf-head'), h = el('h2', 'sx-h2', title); h.id = id;
    const nav = el('div', 'sx-rail-nav');
    for (const [dir, label, glyph] of [[-1, t('Scroll left', 'Sola kaydır'), '‹'], [1, t('Scroll right', 'Sağa kaydır'), '›']]) {
      const b = el('button', 'sx-rail-btn', glyph); b.type = 'button'; b.setAttribute('aria-label', label);
      b.onclick = () => rail.scrollBy?.({ left: dir * Math.max(240, rail.clientWidth * 0.8), behavior: reduceMotion() ? 'auto' : 'smooth' }); nav.append(b);
    }
    head.append(h, nav); return head;
  }

  const dispatchLibrary = () => document.dispatchEvent(new CustomEvent('stremio-library-changed'));
  /** Listem düğmesi: kayıtlı mı diye sorar, tıklayınca ekler/çıkarır. */
  function libraryButton(item, cls = 'mh-action') {
    const b = el('button', cls); b.type = 'button'; let saved = false;
    const paint = () => { b.textContent = saved ? '♥ ' + t('In my list', 'Listemde') : '♡ ' + t('Add to my list', 'Listeme ekle'); b.setAttribute('aria-pressed', String(saved)); };
    paint(); call('library-has', { type: item.type, id: item.id }).then((r) => { saved = !!r.saved; paint(); }).catch(() => {});
    b.onclick = async () => { b.disabled = true; try { const r = await call('library-toggle', { type: item.type, id: item.id, name: item.name, poster: item.poster, year: item.year, imdbRating: item.imdbRating }); saved = r.saved; paint(); dispatchLibrary(); } catch (e) { b.dispatchEvent(new CustomEvent('sx-error', { bubbles: true, detail: e })); } finally { b.disabled = false; } };
    return b;
  }

  /* ---- Puan, durum ve kaynak etiketleri ---- */
  const STATUS_LABEL = { '': () => t('No status', 'Durum yok'), planned: () => t('Plan to watch', 'İzlemeyi planlıyorum'), watching: () => t('Watching', 'İzliyorum'), watched: () => t('Watched', 'İzledim'), dropped: () => t('Dropped', 'Bıraktım') };
  const TAG_LABEL = { remux: ['Remux', 'Remux'], bluray: ['Blu-ray', 'Blu-ray'], webdl: ['WEB-DL', 'WEB-DL'], dv: ['Dolby Vision', 'Dolby Vision'], hdr: ['HDR', 'HDR'], atmos: ['Atmos', 'Atmos'], hdaudio: ['HD audio', 'HD ses'], '10bit': ['10-bit', '10-bit'], hevc: ['HEVC', 'HEVC'], av1: ['AV1', 'AV1'], fast: ['Well seeded', 'Çok seeder'], instant: ['Instant', 'Anında'] };
  const WARN_LABEL = { lowseed: ['Few seeders', 'Az seeder'], cam: ['Camera recording', 'Kamera kaydı'], huge: ['Very large', 'Çok büyük'] };
  const starText = (n) => '★'.repeat(n) + '☆'.repeat(10 - n);
  const dayLabel = (ts) => { const d = new Date(ts), n = new Date(), a = new Date(d.getFullYear(), d.getMonth(), d.getDate()), b = new Date(n.getFullYear(), n.getMonth(), n.getDate()), diff = Math.round((b - a) / 86400000); return diff <= 0 ? t('Today', 'Bugün') : diff === 1 ? t('Yesterday', 'Dün') : diff < 7 ? t('This week', 'Bu hafta') : diff < 31 ? t('This month', 'Bu ay') : t('Earlier', 'Daha önce'); };
  async function resumeEntry(e) {
    const season = e.completed && e.next ? e.next.season : e.season, episode = e.completed && e.next ? e.next.episode : e.episode;
    let meta = null; try { meta = (await call('meta', { type: e.type, id: e.id })).meta; } catch (_) { /* ayrıntı yoksa kayıttan */ }
    return openStreams(meta ? baseCtx(meta, season, episode) : { type: e.type, id: e.id, name: e.name, poster: e.poster, season, episode, episodeTitle: '', next: null });
  }

  /** Puanım / durum / not: yerel, kaynak eklentilerden bağımsız. */
  function ratingPanel(meta) {
    const box = el('section', 'sx-mine'); box.setAttribute('aria-label', t('My review', 'Benim değerlendirmem'));
    const head = el('div', 'sx-mine-head'); head.append(el('h2', 'sx-h2', t('My review', 'Benim değerlendirmem')), el('small', 'sx-mine-sub', t('Only stored on this computer.', 'Yalnız bu bilgisayarda saklanır.')));
    const stars = el('div', 'sx-stars'); stars.setAttribute('role', 'radiogroup'); stars.setAttribute('aria-label', t('Your score out of 10', '10 üzerinden puanın'));
    const out = el('output', 'sx-score-out'), status = statusNode();
    const sel = el('select'); sel.setAttribute('aria-label', t('Watch status', 'İzleme durumu'));
    for (const k of Object.keys(STATUS_LABEL)) sel.append(new Option(STATUS_LABEL[k](), k));
    const note = el('textarea'); note.rows = 3; note.maxLength = 2000; note.placeholder = t('Write a short note or review…', 'Kısa bir not veya yorum yaz…'); note.setAttribute('aria-label', t('Note', 'Not'));
    let cur = { score: 0, note: '', status: '' }, timer = null, savedNote = '',loaded=false,sequence=0,saveQueue=Promise.resolve();const enable=()=>{for(const node of [...stars.children,sel,note])node.disabled=!loaded;};
    const paint = () => { for (const b of stars.children) { const n = Number(b.dataset.n); b.setAttribute('aria-checked', String(cur.score === n)); b.classList.toggle('is-on', n <= cur.score); b.tabIndex = (cur.score === n || (!cur.score && n === 1)) ? 0 : -1; } out.textContent = cur.score ? `${cur.score}/10` : t('Not rated', 'Puanlanmadı'); };
    const persist = () => {if(!loaded)return;const value={...cur},ticket=++sequence;saveQueue=saveQueue.catch(()=>{}).then(async()=>{try{const r=await call('rating-set',{type:meta.type,id:meta.id,name:meta.name,poster:meta.poster,year:meta.year,...value});savedNote=value.note;if(ticket===sequence&&box.isConnected)say(status,r.rating?t('Saved.','Kaydedildi.'):t('Cleared.','Temizlendi.'));document.dispatchEvent(new CustomEvent('stremio-ratings-changed'));}catch(error){if(ticket===sequence&&box.isConnected)say(status,error.message,true);}});return saveQueue;};
    for (let n = 1; n <= 10; n++) { const b = el('button', 'sx-star', '★'); b.type = 'button'; b.dataset.n = String(n); b.setAttribute('role', 'radio'); b.setAttribute('aria-label', `${n}/10`); b.title = `${n}/10`; b.onclick = () => { cur.score = cur.score === n ? 0 : n; paint(); void persist(); }; stars.append(b); }
    stars.addEventListener('keydown', (e) => { if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) return; e.preventDefault(); cur.score = Math.max(0, Math.min(10, cur.score + (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1))); paint(); stars.querySelector(`[data-n="${cur.score || 1}"]`)?.focus(); clearTimeout(timer); timer = setTimeout(persist, 500); });
    sel.onchange = () => { cur.status = sel.value; void persist(); };
    note.oninput = () => { cur.note = note.value; clearTimeout(timer); timer = setTimeout(persist, 900); };
    note.onblur = () => { clearTimeout(timer); if (note.value !== savedNote) void persist(); };
    const row = el('div', 'sx-mine-row'); row.append(stars, out, sel); box.append(head, row, note, status);
    const load=async()=>{loaded=false;enable();say(status,t('Loading your saved review…','Kayıtlı değerlendirmen yükleniyor…'));try{const r=await call('rating-get',{type:meta.type,id:meta.id});if(!box.isConnected)return;if(r.rating)cur={score:r.rating.score,note:r.rating.note,status:r.rating.status};savedNote=cur.note;note.value=cur.note;sel.value=cur.status;loaded=true;paint();enable();say(status,'');}catch(error){if(box.isConnected){say(status,error.message,true);status.append(button(t('Retry saved review','Kayıtlı değerlendirmeyi yeniden yükle'),load));}}};paint();enable();void load();
    return box;
  }
  /** Kütüphane: izleme geçmişi + istatistik, Listem ve Puanlarım. */
  function createLibrary(onError) {
    const box = el('section', 'sx-lib'), seg = el('div', 'sx-seg'), view = el('div', 'sx-lib-view'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', t('Library views', 'Kütüphane görünümleri'));
    let which = 'history', ready = false;
    const views = [['history', t('History', 'Geçmiş')], ['list', t('My list', 'Listem')], ['rated', t('My ratings', 'Puanlarım')]];
    for (const [id, l] of views) { const b = el('button', 'sx-seg-btn', l); b.type = 'button'; b.dataset.v = id; b.onclick = () => { which = id; draw(); }; seg.append(b); }
    box.append(seg, view);
    const statCard = (label, value) => { const c = el('div', 'sx-stat'); c.append(el('strong', '', value), el('small', '', label)); return c; };
    async function drawHistory() {
      const r = await call('history-list'), st = r.stats; view.replaceChildren();
      const stats = el('div', 'sx-stats'); stats.append(statCard(t('Titles', 'Yapım'), st.titles), statCard(t('Finished', 'Biten'), st.episodes), statCard(t('Hours watched', 'İzlenen saat'), st.hours), statCard(t('This week', 'Bu hafta'), st.thisWeek), statCard(t('Day streak', 'Gün serisi'), st.streak));
      const find = el('input'); find.type = 'search'; find.placeholder = t('Filter history…', 'Geçmişte ara…'); find.setAttribute('aria-label', find.placeholder);
      const list = el('div', 'sx-history'); view.append(stats, find, list);
      const paint = () => {
        list.replaceChildren(); const q = find.value.trim().toLowerCase(); const rows = r.items.filter((e) => !q || (e.name + ' ' + (e.episodeTitle || '')).toLowerCase().includes(q));
        if (!rows.length) { list.append(emptyState(t('Nothing watched yet', 'Henüz izlenen yok'), t('Titles you play appear here with the point where you stopped.', 'Oynattığın yapımlar kaldığın noktayla burada görünür.'), '🕘')); return; }
        let last = ''; let group = null;
        for (const e of rows) {
          const label = dayLabel(e.lastWatched); if (label !== last) { last = label; group = el('section', 'sx-day'); group.append(el('h3', 'sx-h3', label)); list.append(group); }
          const row = el('article', 'sx-hist' + (e.completed ? ' is-done' : '')), info = el('div', 'sx-hist-copy');
          info.append(el('strong', '', e.name), el('small', '', [epLabel(e.season, e.episode), e.episodeTitle, e.completed ? t('Finished', 'Bitti') : fmtTime(e.position) + ' / ' + fmtTime(e.duration), new Date(e.lastWatched).toLocaleTimeString(window.UiLocale?.get?.() === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')));
          if (!e.completed) info.append(progressBar(e));
          const acts = el('div', 'sx-hist-actions');
          acts.append(button(e.completed ? (e.next ? t('Next episode', 'Sıradaki bölüm') : t('Watch again', 'Yeniden izle')) : t('Continue', 'Devam et'), () => resumeEntry(e.completed && !e.next ? { ...e, completed: false } : e), 'mh-action mh-primary'), button(t('Details', 'Ayrıntılar'), () => openTitle({ type: e.type, id: e.id, name: e.name, poster: e.poster })),
            button('×', async () => { await call('progress-clear', { type: e.type, id: e.id, season: e.season, episode: e.episode }); row.remove(); r.items.splice(r.items.indexOf(e), 1); toast(t('Removed from history', 'Geçmişten kaldırıldı')); document.dispatchEvent(new CustomEvent('stremio-progress-changed')); }, 'mh-action sx-drop-inline'));
          acts.lastChild.setAttribute('aria-label', t('Remove from history: ', 'Geçmişten kaldır: ') + e.name);
          row.append(posterNode(e, 'sx-poster sx-hist-poster'), info, acts); group.append(row);
        }
      };
      find.oninput = paint; paint();
    }
    async function drawList() { const r = await call('library-list'); view.replaceChildren(); if (!r.items?.length) { view.append(emptyState(t('Your list is empty', 'Listen boş'), t('Use ♡ on any poster to save it here.', 'Herhangi bir afişteki ♡ ile buraya kaydet.'), '♡')); return; } const g = el('div', 'sx-grid'); g.append(...r.items.map(item=>mediaCard({...item,saved:true}))); view.append(g); }
    async function drawRated() {
      const r = await call('rating-list'); view.replaceChildren(); let filter = '', sort = 'recent';
      if (!r.items?.length) { view.append(emptyState(t('No ratings yet', 'Henüz puan yok'), t('Open a title and give it a score, a status or a note.', 'Bir yapım aç; puan, durum veya not ekle.'), '★')); return; }
      const bar = el('div', 'sx-filters'), st = el('select'), so = el('select'); st.setAttribute('aria-label', t('Status', 'Durum')); so.setAttribute('aria-label', t('Sort', 'Sırala'));
      st.append(new Option(t('All statuses', 'Tüm durumlar'), '')); for (const k of Object.keys(STATUS_LABEL)) if (k) st.append(new Option(STATUS_LABEL[k](), k));
      for (const [v, l] of [['recent', t('Recently updated', 'Son güncellenen')], ['score', t('Highest score', 'En yüksek puan')], ['name', t('Name A–Z', 'Ad A–Z')]]) so.append(new Option(l, v)); bar.append(st, so);
      const grid = el('div', 'sx-rated-grid'); view.append(bar, grid);
      const paint = () => {
        grid.replaceChildren(); let rows = r.items.filter((x) => !filter || x.status === filter);
        rows = [...rows].sort((a, b) => sort === 'score' ? b.score - a.score : sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt);
        for (const x of rows) { const c = el('button', 'sx-rated'); c.type = 'button'; c.append(posterNode(x, 'sx-poster sx-rated-poster')); const cp = el('div', 'sx-rated-copy'); cp.append(el('strong', '', x.name), el('span', 'sx-rated-stars' + (x.score ? '' : ' is-none'), x.score ? `★ ${x.score}/10` : t('Not rated', 'Puanlanmadı'))); if (x.status) cp.append(el('span', 'sx-badge', STATUS_LABEL[x.status]())); if (x.note) cp.append(el('p', '', x.note)); c.append(cp); c.onclick = () => void openTitle(x); grid.append(c); }
        if (!rows.length) grid.append(el('p', 'sx-empty', t('Nothing matches.', 'Eşleşen yok.')));
      };
      st.onchange = () => { filter = st.value; paint(); }; so.onchange = () => { sort = so.value; paint(); }; paint();
    }
    async function draw() {
      for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.v === which));
      view.replaceChildren(el('div', 'sx-skel-poster sx-skel-wide'));
      try { await ({ history: drawHistory, list: drawList, rated: drawRated })[which](); } catch (e) { view.replaceChildren(); onError?.(e); }
    }
    return { node: box, activate() { void draw(); }, refresh() { if (box.isConnected && !box.closest('[hidden]')) void draw(); } };
  }

  /** Öne çıkanlar vitrini: arka plan, puan/tür özeti, açıklama ve doğrudan eylemler; elle ve (hareket tercihi izin verirse) otomatik döner. */
  function createHero() {
    const box = el('section', 'sx-feature'); box.hidden = true; box.setAttribute('role', 'group'); box.setAttribute('aria-roledescription', t('carousel', 'vitrin')); box.setAttribute('aria-label', t('Featured', 'Öne çıkanlar'));
    let slides = [], idx = 0, timer = null, held = false, dead = false, userPaused = false;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const go = (n) => { if (!slides.length) return; idx = (n + slides.length) % slides.length; render(); };
    const start = () => { stop(); if (slides.length > 1 && !reduceMotion() && !held && !userPaused) timer = setInterval(() => { if (dead || !box.isConnected) return stop(); go(idx + 1); }, 9000); };
    function render() {
      const m = slides[idx]; box.replaceChildren(); if (!m) { box.hidden = true; return; } box.hidden = false;
      if (m.background || m.poster) { const bg = el('img', 'sx-feature-bg'); bg.src = m.background || m.poster; bg.alt = ''; bg.referrerPolicy = 'no-referrer'; bg.onerror = () => bg.remove(); box.append(bg); }
      const copy = el('div', 'sx-feature-copy'); copy.setAttribute('aria-live', held || !timer ? 'polite' : 'off');
      const title = el('h2', 'sx-feature-title', m.name);
      // Addon logos may be dark or transparent. The readable text title is the
      // primary identity on every background, including successfully loaded logos.
      copy.append(el('small', '', t('Featured', 'Öne çıkan') + ' · ' + typeLabel(m.type)), title, el('p', 'sx-feature-meta', metaLine(m)));
      if (m.description) copy.append(el('p', 'sx-feature-desc', m.description));
      const actions = el('div', 'sx-actions');
      actions.append(button(m.type === 'series' ? t('Browse episodes', 'Bölümlere bak') : t('Play', 'Oynat'), () => playTitle(m), 'mh-action mh-primary'));
      if (m.type !== 'series') actions.append(button(t('Details', 'Ayrıntılar'), () => openTitle(m))); actions.append(libraryButton(m)); copy.append(actions); box.append(copy);
      if (slides.length > 1) {
        const dots = el('div', 'sx-feature-dots'); dots.setAttribute('role', 'group'); dots.setAttribute('aria-label', t('Choose featured title', 'Öne çıkan seç'));
        slides.forEach((s, i) => { const d = el('button', 'sx-dot'); d.type = 'button'; d.setAttribute('aria-label', `${i + 1}/${slides.length}: ${s.name}`); d.setAttribute('aria-current', String(i === idx)); d.onclick = () => go(i); dots.append(d); });
        const pp = el('button', 'sx-dot-pause'); pp.type = 'button'; pp.textContent = userPaused ? '▶' : '❚❚'; pp.setAttribute('aria-label', userPaused ? t('Resume rotation', 'Dönmeyi sürdür') : t('Pause rotation', 'Dönmeyi durdur'));
        pp.onclick = () => { userPaused = !userPaused; if (userPaused) stop(); else start(); render(); }; dots.prepend(pp); box.append(dots);
      }
    }
    box.addEventListener('mouseenter', () => { held = true; stop(); }); box.addEventListener('mouseleave', () => { held = false; start(); });
    box.addEventListener('focusin', () => { held = true; stop(); }); box.addEventListener('focusout', (e) => { if (!box.contains(e.relatedTarget)) { held = false; start(); } });
    return {
      node: box,
      add(items) { for (const m of items) if ((m.background || m.poster) && !slides.some((s) => s.id === m.id) && slides.length < 6) slides.push(m); if (slides.length) { render(); start(); } },
      dispose() { dead = true; stop(); },
    };
  }

  /** Keşfet: tür → katalog → kategori seçimi, puan/yıl/sıralama süzgeçleri ve "daha fazla" ile sayfalama (skip). */
  function createBrowse(getCatalogs, onError, {cloud=false}={}) {
    const box = el('section', 'sx-browse'), bar = el('div', 'sx-filters sx-browse-bar'), grid = el('div', 'sx-grid'), foot = el('div', 'sx-browse-foot'), info = el('p', 'sx-hint sx-browse-info');
    info.setAttribute('role', 'status'); info.setAttribute('aria-live', 'polite');
    const mk = (label) => { const s = el('select'); s.setAttribute('aria-label', label); return s; };
    const typeSel = mk(t('Type', 'Tür')), catSel = mk(t('Catalog', 'Katalog')), genreSel = mk(t('Category', 'Kategori')), ratingSel = mk(t('Minimum rating', 'En düşük puan')), yearSel = mk(t('Year', 'Yıl')), sortSel = mk(t('Sort', 'Sırala'));
    for (const [v, l] of [['0', t('Any rating', 'Tüm puanlar')], ['6', '★ 6+'], ['7', '★ 7+'], ['8', '★ 8+']]) ratingSel.append(new Option(l, v));
    for (const [v, l] of [['', t('Any year', 'Tüm yıllar')], ['2020', '2020+'], ['2010', '2010–2019'], ['2000', '2000–2009'], ['old', t('Before 2000', '2000 öncesi')]]) yearSel.append(new Option(l, v));
    for (const [v, l] of [['catalog', t('Catalog order', 'Katalog sırası')], ['rating', t('Highest rated', 'En yüksek puan')], ['year', t('Newest', 'En yeni')], ['name', t('Name A–Z', 'Ad A–Z')]]) sortSel.append(new Option(l, v));
    const reset = el('button', 'mh-action', t('Reset filters', 'Süzgeçleri sıfırla')); reset.type = 'button';
    const dens = el('div', 'sx-seg sx-density'); dens.setAttribute('role', 'group'); dens.setAttribute('aria-label', t('Grid size', 'Izgara boyutu'));
    let size = 'm'; try { size = localStorage.getItem('stremio.density') || 'm'; } catch (_) { /* varsayılan */ }
    const setSize = (v) => { size = v; grid.dataset.size = v; try { localStorage.setItem('stremio.density', v); } catch (_) { /* oturumluk */ } for (const b of dens.children) b.setAttribute('aria-pressed', String(b.dataset.v === v)); };
    for (const [v, label, tip] of [['s', '▪▪▪', t('Compact', 'Sıkı')], ['m', '▪▪', t('Medium', 'Orta')], ['l', '▪', t('Large', 'Geniş')]]) { const b = el('button', 'sx-seg-btn', label); b.type = 'button'; b.dataset.v = v; b.title = tip; b.setAttribute('aria-label', tip); b.onclick = () => setSize(v); dens.append(b); }
    const active = el('div', 'sx-active-filters'); active.setAttribute('aria-label', t('Active filters', 'Etkin süzgeçler'));
    const reload=button(t('Refresh','Yenile'),()=>load(true,{refresh:true}),'mh-action sx-catalog-refresh');
    bar.append(typeSel, catSel, genreSel, ...(cloud?[]:[ratingSel,yearSel]), sortSel, reset, reload, dens);
    const more = button(t('Load more', 'Daha fazla yükle'), () => load(false), 'mh-action mh-primary'); more.hidden = true; foot.append(more);
    box.append(bar, active, info, grid, foot); setSize(size);
    let list = [], current = null, items = [], seen = new Set(), raw = 0, hasMore = false, loading = false, gen = 0, ready = false;
    const rank = (v) => v ?? 0;
    function visible() {
      const min = Number(ratingSel.value) || 0, y = yearSel.value;
      let out = items.filter((m) => (!min || (m.imdbRating || 0) >= min) && (!y || (m.year != null && (y === 'old' ? m.year < 2000 : y === '2020' ? m.year >= 2020 : m.year >= Number(y) && m.year < Number(y) + 10))));
      if (sortSel.value === 'rating') out = [...out].sort((a, b) => rank(b.imdbRating) - rank(a.imdbRating));
      else if (sortSel.value === 'year') out = [...out].sort((a, b) => rank(b.year) - rank(a.year));
      else if (sortSel.value === 'name') out = [...out].sort((a, b) => a.name.localeCompare(b.name, window.UiLocale?.get?.() === 'tr' ? 'tr' : 'en'));
      return out;
    }
    function draw() {
      const out = visible(); grid.replaceChildren(...out.map(mediaCard));
      active.replaceChildren(); const chip = (label, clear) => { const c = el('button', 'sx-chip-genre is-active', label + ' ×'); c.type = 'button'; c.setAttribute('aria-label', t('Remove filter: ', 'Süzgeci kaldır: ') + label); c.onclick = clear; active.append(c); };
      if (genreSel.value) chip(genreLabel(genreSel.value), () => { genreSel.value = ''; void load(true); });
      if (ratingSel.value !== '0') chip('★ ' + ratingSel.value + '+', () => { ratingSel.value = '0'; draw(); });
      if (yearSel.value) chip(yearSel.options[yearSel.selectedIndex].text, () => { yearSel.value = ''; draw(); });
      active.hidden = !active.children.length;
      if (!out.length && items.length === 0 && !loading && current) grid.append(emptyState(t('Nothing here yet', 'Burada henüz bir şey yok'), t('Try another catalog or category.', 'Başka bir katalog veya kategori dene.'), '🎬'));
      const filtered = out.length !== items.length;
      info.textContent = !current ? (cloud?t('No addon library catalog. Enable the library catalog in your debrid addon settings.','Eklenti kütüphanesi kataloğu yok. Debrid eklentisinin ayarlarında kütüphane kataloğunu etkinleştir.'):t('No browsable catalog. Add Cinemeta under Addons.', 'Gezilebilir katalog yok. Eklentiler bölümünden Cinemeta ekle.'))
        : loading && !items.length ? t('Loading…', 'Yükleniyor…')
        : !items.length ? t('Nothing here.', 'Burada bir şey yok.')
        : !out.length ? t('No loaded title matches these filters. Loading more may help.', 'Yüklenenlerden hiçbiri bu süzgeçlere uymuyor. Daha fazla yüklemek yardımcı olabilir.')
        : filtered ? t(`${out.length} of ${items.length} loaded titles match`, `Yüklenen ${items.length} yapımdan ${out.length} tanesi uyuyor`) : t(`${items.length} titles`, `${items.length} yapım`);
      more.hidden = !hasMore; more.disabled = loading;
      reload.disabled=loading||!current;
    }
    async function load(fresh, {refresh=false}={}) {
      if (!current || loading && !fresh) return;
      const mine = ++gen; if (fresh) { items = []; seen = new Set(); raw = 0; hasMore = false; } loading = true; draw();
      try {
        const extra = {}; if (genreSel.value) extra.genre = genreSel.value; if (raw && current.paged) extra.skip = raw;
        const r = await call('catalog', { addonKey: current.addonKey, type: current.type, catalogId: current.id, extra, ...(refresh?{refresh:true}:{}) });
        if (mine !== gen) return;
        raw += r.items.length; let added = 0;
        for (const m of r.items) if (!seen.has(m.type + ':' + m.id)) { seen.add(m.type + ':' + m.id); items.push(m); added++; }
        hasMore = !!r.hasMore && current.paged && added > 0;
      } catch (e) { if (mine === gen) onError?.(e); }
      finally { if (mine === gen) { loading = false; draw(); } }
    }
    function fillCatalogs() {
      const types = [...new Set(list.map((c) => c.type))]; const prev = typeSel.value;
      typeSel.replaceChildren(...types.map((tp) => new Option(typeLabel(tp, true), tp))); if (types.includes(prev)) typeSel.value = prev;
      const rows = list.filter((c) => c.type === typeSel.value); const prevCat = catSel.value;
      catSel.replaceChildren(...rows.map((c) => new Option(`${c.name} · ${c.addonName}`, c.addonKey + '|' + c.id))); if (rows.some((c) => c.addonKey + '|' + c.id === prevCat)) catSel.value = prevCat;
      current = rows.find((c) => c.addonKey + '|' + c.id === catSel.value) || rows[0] || null;
      genreSel.replaceChildren(new Option(t('All categories', 'Tüm kategoriler'), ''), ...(current?.genres || []).map((g) => new Option(genreLabel(g), g))); genreSel.hidden = !(current?.genres || []).length;
      typeSel.hidden = types.length < 2;
    }
    typeSel.onchange = () => { catSel.value = ''; fillCatalogs(); void load(true); };
    catSel.onchange = () => { fillCatalogs(); void load(true); };
    genreSel.onchange = () => void load(true);
    for (const s of [ratingSel, yearSel, sortSel]) s.onchange = draw;
    reset.onclick = () => { ratingSel.value = '0'; yearSel.value = ''; sortSel.value = 'catalog'; genreSel.value = ''; void load(true); };
    return {
      node: box,
      activate(catalogs) { if (ready) return draw(); list = (catalogs || getCatalogs() || []).filter((c) => !c.searchOnly); ready = true; fillCatalogs(); void load(true); },
      invalidate() { ready = false; },
      preset(catalogs, { type, genre }) {
        list = (catalogs || getCatalogs() || []).filter((c) => !c.searchOnly); ready = true; if (type && list.some((c) => c.type === type)) typeSel.value = type;
        fillCatalogs(); if (genre && [...genreSel.options].some((o) => o.value === genre)) genreSel.value = genre; void load(true);
      },
    };
  }

  function mount(host) {
    const root = el('section', 'sx-page'); root.dataset.uiUntranslated = ''; host.append(root);
    let disposed = false, ticket = 0, mode = 'home', catalogsCache = null;
    const head = el('header', 'sx-page-head'), copy = el('div');
    const kicker = el('small', '', t('Whisper Browser · Stremio', 'Whisper Browser · Stremio')); kicker.lang = 'en'; kicker.dataset.uiUntranslated = '';
    copy.append(kicker, el('h1', '', t('Watch from your addons', 'Eklentilerinden izle')));
    const form = el('form', 'sx-search'); form.setAttribute('role', 'search');
    const input = el('input'); input.type = 'search'; input.maxLength = 120; input.placeholder = t('Search films and series…', 'Film ve dizi ara…'); input.setAttribute('aria-label', input.placeholder);
    const go = el('button', 'mh-action', t('Search', 'Ara')); go.type = 'submit'; form.append(input, go);
    const addons = button(t('Addons', 'Eklentiler'), () => openAddons()); const pool = [];
    const surprise = button('🎲 ' + t('Surprise me', 'Sürpriz seç'), () => { if (!pool.length) return say(status, t('Catalogs are still loading.', 'Kataloglar hâlâ yükleniyor.')); openTitle(pool[Math.floor(Math.random() * pool.length)]); });
    const tools = el('div', 'sx-head-tools'); tools.append(surprise, addons); head.append(copy, form, tools);
    const modes = el('div', 'sx-modes'); modes.setAttribute('role', 'tablist'); modes.setAttribute('aria-label', t('Stremio views', 'Stremio görünümleri'));
    const recent = el('div', 'sx-recent'); recent.setAttribute('aria-label', t('Recent searches', 'Son aramalar'));
    const RECENT_KEY = 'stremio.recent'; const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((x) => typeof x === 'string').slice(0, 6); } catch (_) { return []; } };
    const writeRecent = (q) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...readRecent().filter((x) => x !== q)].slice(0, 6))); } catch (_) { /* saklanamazsa atla */ } drawRecent(); };
    function drawRecent() { recent.replaceChildren(); const rows = readRecent(); recent.hidden = !rows.length; if (!rows.length) return; recent.append(el('small', '', t('Recent', 'Son aramalar') + ':')); for (const q of rows) { const c = el('button', 'sx-chip-genre', q); c.type = 'button'; c.onclick = () => { input.value = q; form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); }; recent.append(c); } const clr = el('button', 'sx-link', t('Clear', 'Temizle')); clr.type = 'button'; clr.onclick = () => { try { localStorage.removeItem(RECENT_KEY); } catch (_) { /* yok */ } drawRecent(); }; recent.append(clr); }
    const status = statusNode(), results = el('section', 'sx-results'), homeView = el('div', 'sx-home'), browseHost = el('div', 'sx-browse-host');
    const lib = createLibrary((e) => say(status, e.message, true)), libHost = el('div', 'sx-lib-host'); libHost.append(lib.node);
    const hero = createHero(), chips = el('nav', 'sx-genre-chips'), cont = el('section', 'sx-continue'), mine = el('section', 'sx-mylist'), shelves = el('section', 'sx-shelves');
    chips.setAttribute('aria-label', t('Browse by genre', 'Türe göre gez')); chips.hidden = true;
    homeView.append(hero.node, chips, cont, mine, shelves);
    const browse = createBrowse(() => catalogsCache?.catalogs, (e) => say(status, e.message, true)); browseHost.append(browse.node);
    const cloudHost=el('section','sx-cloud-host'),cloud=createBrowse(()=>catalogsCache?.catalogs?.filter(c=>c.type==='other'),e=>say(status,e.message,true),{cloud:true});
    cloudHost.append(el('h2','sx-h2',t('Cloud & addon library','Bulut ve eklenti kütüphanesi')),el('p','sx-hint',t('Files reported by your installed addons, including TorBox. Refresh after a download finishes. Availability comes from the addon; opening this page does not add a torrent.','TorBox dahil, kurulu eklentilerinin bildirdiği dosyalar. İndirme tamamlanınca yenile. Kullanılabilirlik eklentiden gelir; bu sayfayı açmak torrent eklemez.')),cloud.node);
    const tabBtns = {};
    for (const [id, en, tr] of [['home', 'Home', 'Ana sayfa'], ['browse', 'Discover', 'Keşfet'], ['cloud','Cloud library','Bulut kütüphanesi'], ['library', 'My list', 'Listem']]) {
      const b = el('button', 'sx-mode', t(en, tr)); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'sxMode-' + id; b.onclick = () => setMode(id); tabBtns[id] = b; modes.append(b);
    }
    modes.addEventListener('keydown', (e) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); const order = ['home', 'browse', 'cloud', 'library'], next = order[(order.indexOf(mode) + (e.key === 'ArrowRight' ? 1 : order.length-1)) % order.length]; setMode(next); tabBtns[next].focus(); });
    function setMode(next) {
      mode = next; homeView.hidden = mode !== 'home'; browseHost.hidden = mode !== 'browse'; libHost.hidden = mode !== 'library';cloudHost.hidden=mode!=='cloud';
      for (const [id, b] of Object.entries(tabBtns)) { b.setAttribute('aria-selected', String(id === mode)); b.tabIndex = id === mode ? 0 : -1; }
      homeView.setAttribute('role', 'tabpanel'); homeView.setAttribute('aria-labelledby', 'sxMode-home'); browseHost.setAttribute('role', 'tabpanel'); browseHost.setAttribute('aria-labelledby', 'sxMode-browse'); libHost.setAttribute('role', 'tabpanel'); libHost.setAttribute('aria-labelledby', 'sxMode-library');
      if (mode === 'library') lib.activate();
      if (mode === 'browse' && catalogsCache) browse.activate(catalogsCache.catalogs);
      cloudHost.setAttribute('role','tabpanel');cloudHost.setAttribute('aria-labelledby','sxMode-cloud');
      if(mode==='cloud'&&catalogsCache)cloud.activate(catalogsCache.catalogs.filter(c=>c.type==='other'));
    }
    root.append(head, recent, modes, status, results, homeView, browseHost, cloudHost, libHost); setMode('home'); drawRecent();
    const slash = (e) => { if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && root.isConnected && !document.querySelector('dialog[open]')) { e.preventDefault(); input.focus(); } };
    document.addEventListener('keydown', slash);
    root.addEventListener('sx-error', (e) => say(status, e.detail?.message, true));
    async function drawContinue() {
      cont.replaceChildren(); let items = []; try { items = (await call('continue-list')).items; } catch (_) { return; }
      if (disposed || !items.length) return; cont.append(el('h2', 'sx-h2', t('Continue watching', 'İzlemeye devam et')));
      const row = el('div', 'sx-rail sx-rail-wide');
      for (const e of items) {
        const b = el('article', 'sx-resume'); b.append(posterNode(e));
        const info = el('div', 'sx-resume-copy'); const sub = e.completed && e.next ? t(`Next: ${epLabel(e.next.season, e.next.episode)}`, `Sıradaki: ${epLabel(e.next.season, e.next.episode)}`) : [epLabel(e.season, e.episode), e.episodeTitle, fmtTime(e.position)].filter(Boolean).join(' · ');
        info.append(el('strong', '', e.name), el('small', '', sub)); if (!e.completed) { info.append(progressBar(e)); const left = Math.max(0, Math.round((e.duration - e.position) / 60)); if (left) info.append(el('small', 'sx-left', t(`${left} min left`, `${left} dk kaldı`))); }
        const resume = button(e.completed ? t('Next episode', 'Sıradaki bölüm') : t('Continue', 'Devam et'), async () => {
          const season = e.completed && e.next ? e.next.season : e.season, episode = e.completed && e.next ? e.next.episode : e.episode;
          let meta = null; try { meta = (await call('meta', { type: e.type, id: e.id })).meta; } catch (_) { /* ayrıntı yoksa kayıttan */ }
          await openStreams(meta ? baseCtx(meta, season, episode) : { type: e.type, id: e.id, name: e.name, poster: e.poster, season, episode, episodeTitle: '', next: null });
        }, 'mh-action mh-primary');
        resume.setAttribute('aria-label', `${resume.textContent}: ${e.name}`);
        const open = button(t('Details', 'Ayrıntılar'), () => openTitle({ type: e.type, id: e.id, name: e.name, poster: e.poster })); open.setAttribute('aria-label', `${open.textContent}: ${e.name}`);
        const drop = button('×', async () => { await call('progress-clear', { type: e.type, id: e.id }); b.remove(); toast(t('Removed from Continue watching', 'İzlemeye devam etten kaldırıldı')); if (!row.children.length) cont.replaceChildren(); }, 'mh-action sx-drop'); drop.setAttribute('aria-label', t('Remove from Continue watching: ', 'İzlemeye devam etten kaldır: ') + e.name); drop.title = t('Remove', 'Kaldır');
        b.append(info, el('div', 'sx-resume-actions'), drop); b.children[1].append(resume, open); row.append(b);
      }
      cont.append(row);
    }
    async function drawMine() {
      mine.replaceChildren(); let items = []; try { items = (await call('library-list')).items || []; } catch (_) { return; }
      if (disposed || !items.length) return;
      const rail = el('div', 'sx-rail'), hid = 'sxMine-' + Date.now(); rail.setAttribute('role', 'list'); railKeys(rail);
      mine.setAttribute('aria-labelledby', hid); mine.append(shelfHead(t('My list', 'Listem'), rail, hid), rail);
      rail.append(...items.map((m) => { const li = el('div', 'sx-rail-item'); li.setAttribute('role', 'listitem'); li.append(mediaCard(m)); return li; }));
    }
    async function drawShelves() {
      const mine = ++ticket; shelves.replaceChildren();
      let state; try { state = await call('catalogs'); } catch (e) { say(status, e.message, true); return; }
      if (disposed || mine !== ticket) return; catalogsCache = state; browse.invalidate();cloud.invalidate(); if (mode === 'browse') browse.activate(state.catalogs);if(mode==='cloud')cloud.activate(state.catalogs.filter(c=>c.type==='other'));
      chips.replaceChildren(); const gsrc = state.catalogs.find((c) => !c.searchOnly && c.genres?.length);
      if (gsrc) { for (const g of gsrc.genres.slice(0, 12)) { const b = el('button', 'sx-chip-genre', genreLabel(g)); b.type = 'button'; b.onclick = () => { setMode('browse'); browse.preset(state.catalogs, { type: gsrc.type, genre: g }); }; chips.append(b); } chips.hidden = false; } else chips.hidden = true;
      const addonList = (await call('status')).addons;
      if (!addonList.length) { hero.node.hidden = true; const empty = el('div', 'sx-onboard'); empty.append(el('h2', '', t('Add your first addons', 'İlk eklentilerini ekle')), el('p', '', t('Stremio addons bring catalogs, sources and subtitles. Add Cinemeta for catalogs and Torrentio (or another source addon) for streams.', 'Stremio eklentileri katalog, kaynak ve altyazı getirir. Katalog için Cinemeta, kaynak için Torrentio (veya başka bir kaynak eklentisi) ekle.')), button(t('Add addons', 'Eklenti ekle'), () => openAddons(), 'mh-action mh-primary')); shelves.append(empty); return; }
      const browsable = state.catalogs.filter((c) => !c.searchOnly).slice(0, 8);
      if (!browsable.length) shelves.append(el('p', 'sx-empty', t('Your addons do not offer browsable catalogs. You can still search, or add Cinemeta.', 'Eklentilerin gezilebilir katalog sunmuyor. Yine de arayabilir veya Cinemeta ekleyebilirsin.')));
      browsable.forEach((c, n) => {
        const shelf = el('section', 'sx-shelf'), rail = el('div', 'sx-rail'), hid = `sxShelf-${mine}-${n}`;
        shelf.setAttribute('aria-labelledby', hid); rail.setAttribute('role', 'list'); railKeys(rail);
        shelf.append(shelfHead(`${c.name} · ${typeLabel(c.type, true)}`, rail, hid), rail); shelves.append(shelf);
        rail.append(...skeletonRail());
        call('catalog', { addonKey: c.addonKey, type: c.type, catalogId: c.id }).then((r) => {
          if (disposed || mine !== ticket) return;
          rail.replaceChildren(...r.items.slice(0, 40).map((m) => { const li = el('div', 'sx-rail-item'); li.setAttribute('role', 'listitem'); li.append(mediaCard(m)); return li; })); if (!r.items.length) rail.append(el('p', 'sx-hint', t('Empty.', 'Boş.')));
          if (n < 3) hero.add(r.items.filter((m) => m.background && m.description).slice(0, 2)); for (const m of r.items) if (!pool.some((x) => x.id === m.id)) pool.push(m);
        }).catch((e) => { if (!disposed) { rail.replaceChildren(el('p', 'sx-note', `${c.addonName}: ${e.message}`)); } });
      });
    }
    form.onsubmit = async (event) => {
      event.preventDefault(); const q = input.value.trim(); results.replaceChildren(); if (!q) return; writeRecent(q);
      say(status, t('Searching your addons…', 'Eklentilerde aranıyor…')); go.disabled = true;
      try { const r = await call('search', { query: q }); say(status, ''); const rh = el('div', 'sx-shelf-head'); rh.append(el('h2', 'sx-h2', t(`Results for “${q}”`, `“${q}” için sonuçlar`)), button(t('Clear', 'Temizle'), () => { results.replaceChildren(); input.value = ''; input.focus(); }));
        results.append(rh);
        const kinds = [...new Set(r.items.map((m) => m.type))];
        if (kinds.length > 1) { const tabs = el('div', 'sx-seg'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', t('Result type', 'Sonuç türü')); const draw2 = (kind) => { grid.replaceChildren(...r.items.filter((m) => !kind || m.type === kind).map(mediaCard)); for (const b of tabs.children) b.setAttribute('aria-pressed', String((b.dataset.kind || '') === (kind || ''))); }; for (const k of ['', ...kinds]) { const b = el('button', 'sx-seg-btn', k ? typeLabel(k, true) : t('All', 'Tümü')); b.type = 'button'; b.dataset.kind = k; b.onclick = () => draw2(k); tabs.append(b); } results.append(tabs); var drawTabs = draw2; }
        const grid = el('div', 'sx-grid'); grid.append(...r.items.map(mediaCard)); results.append(grid); if (typeof drawTabs === 'function') drawTabs('');
        if (!r.items.length) results.append(emptyState(t('Nothing found', 'Sonuç yok'), t('Make sure a catalog addon with search (Cinemeta) is installed, or try another spelling.', 'Aramayı destekleyen bir katalog eklentisi (Cinemeta) kurulu olmalı; farklı bir yazım da deneyebilirsin.'), '🔍'));
        for (const er of r.errors) results.append(el('p', 'sx-note', `${er.addon}: ${er.message}`));
      } catch (e) { say(status, e.message, true); } finally { go.disabled = false; }
    };
    const refresh = () => { void drawContinue(); void drawMine(); void drawShelves(); };
    document.addEventListener('stremio-library-changed', drawMine);
    const onBrowse = (e) => { setMode('browse'); if (catalogsCache) browse.preset(catalogsCache.catalogs, e.detail || {}); };
    document.addEventListener('stremio-browse', onBrowse);
    const onLibChange = () => lib.refresh(); document.addEventListener('stremio-ratings-changed', onLibChange); document.addEventListener('stremio-progress-changed', onLibChange); document.addEventListener('stremio-library-changed', onLibChange);
    document.addEventListener('stremio-addons-changed', refresh);
    document.addEventListener('stremio-progress-changed', drawContinue);
    refresh();
    return { dispose() { disposed = true; ticket++; hero.dispose(); document.removeEventListener('stremio-addons-changed', refresh); document.removeEventListener('stremio-progress-changed', drawContinue); document.removeEventListener('stremio-library-changed', drawMine); document.removeEventListener('keydown', slash); document.removeEventListener('stremio-browse', onBrowse); for (const ev of ['stremio-ratings-changed', 'stremio-progress-changed', 'stremio-library-changed']) document.removeEventListener(ev, onLibChange); root.remove(); } };
  }

  /* ================= Oynatıcı alt menüsü paneli ================= */
  let panel = null, button$ = null, trackAccess = null, panelOwner = null;
  const sessionActive = () => !!session && typeof player !== 'undefined' && (player.mediaKey === session.key);
  function mountPlayerButton() {
    if (button$?.isConnected) return refreshPlayerButton();
    const more = document.getElementById('playerMore'); if (!more) return;
    button$ = el('button', 'btn-icon sx-player-btn'); button$.type = 'button'; button$.id = 'playerStremioBtn'; button$.dataset.uiUntranslated = '';
    button$.title = t('Sources, audio, subtitles & AI', 'Kaynaklar, ses, altyazı ve yapay zekâ'); button$.setAttribute('aria-label', button$.title); button$.setAttribute('aria-haspopup', 'dialog'); button$.setAttribute('aria-expanded', 'false');
    button$.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h16"/><circle cx="18" cy="12" r="2.2"/></svg>';
    button$.onclick = () => togglePanel(); more.before(button$);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel) closePanel();
      if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'N' || e.key === 'P') && sessionActive() && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && !document.querySelector('dialog[open]')) { e.preventDefault(); void goEpisode(e.key === 'N' ? 1 : -1); }
    });
    refreshPlayerButton();
  }
  const playerTrackOwner = body => {
    const owner=session,key=player.mediaKey,generation=player.generation;
    return () => session===owner && sessionActive() && player.mediaKey===key && player.generation===generation && body.isConnected;
  };
  function refreshPlayerButton() {
    const active=sessionActive()&&player.workspaceMode!=='browser';
    if(button$)button$.hidden=!active;
    if(panel&&!active)closePanel();
    const stage=active?document.getElementById('playerLayer')?.querySelector('.sh'):null;
    const anchor=stage?.querySelector('.sh-dock-tools')||stage?.querySelector('.sh-top-r');
    if(!anchor){trackAccess?.remove();trackAccess=null;return;}
    if(!trackAccess?.isConnected){
      trackAccess=el('div','sx-track-access');trackAccess.setAttribute('role','group');trackAccess.setAttribute('aria-label',t('Audio and subtitles','Ses ve altyazı'));
      for(const [tab,en,tr]of [['audio','Audio','Ses'],['subs','Subtitles','Altyazı']]){
        const item=button(t(en,tr),()=>{if(sessionActive())togglePanel(tab,{keepOpen:true});},'sx-track-access-btn');item.dataset.sxTrack=tab;item.setAttribute('aria-haspopup','dialog');trackAccess.append(item);
      }
    }
    if(trackAccess.parentElement!==anchor)anchor.append(trackAccess);
  }
  let trackAccessQueued=false;
  const refreshTrackAccess=()=>{if(trackAccessQueued)return;trackAccessQueued=true;queueMicrotask(()=>{trackAccessQueued=false;refreshPlayerButton();});};
  const trackLayer=document.getElementById('playerLayer');
  if(trackLayer)new MutationObserver(refreshTrackAccess).observe(trackLayer,{childList:true,subtree:true});
  document.addEventListener('native-player-state-changed',refreshTrackAccess);
  videoEl()?.addEventListener('loadedmetadata',refreshTrackAccess);
  videoEl()?.addEventListener('emptied',refreshTrackAccess);
  // Native mpv is a child window: reserve real image space, never freeze it for this menu.
  let nativeTools=null,htmlActions=null;
  function layoutNativeTools() {
    const stage=document.getElementById('playerStage'),layer=document.getElementById('playerLayer');
    if(!stage||!layer)return;
    if(window.NativePlayerUI?.active?.())clearHint();
    const nodes=[panel,nextPrompt,skipBtn,hint].filter(n=>n?.isConnected);
    if(window.NativePlayerUI?.active?.()&&nodes.length) {
      if(!nativeTools?.isConnected){nativeTools=el('div','sx-native-tools');nativeTools.dataset.uiUntranslated='';stage.append(nativeTools);}
      nativeTools.classList.toggle('is-actions',!panel?.isConnected);
      for(const n of nodes)if(n.parentElement!==nativeTools)nativeTools.append(n);
      htmlActions?.remove();htmlActions=null;
    } else {
      for(const n of nodes)if(n.parentElement===nativeTools)layer.append(n);
      nativeTools?.remove();nativeTools=null;
      if(skipBtn?.isConnected&&nextPrompt?.isConnected){
        if(!htmlActions?.isConnected){htmlActions=el('div','sx-html-actions');htmlActions.dataset.uiUntranslated='';layer.append(htmlActions);}
        for(const node of [skipBtn,nextPrompt])if(node.parentElement!==htmlActions)htmlActions.append(node);
      }else{
        for(const node of [skipBtn,nextPrompt])if(node?.parentElement===htmlActions)layer.append(node);
        htmlActions?.remove();htmlActions=null;
      }
    }
    window.NativePlayerUI?.layout?.();
  }
  const queueNativeTools=()=>queueMicrotask(layoutNativeTools);
  document.addEventListener('native-player-state-changed',queueNativeTools);
  document.addEventListener('fullscreenchange',queueNativeTools);
  window.addEventListener('resize',queueNativeTools);
  new MutationObserver(queueNativeTools).observe(document.getElementById('playerLayer')||document.body,{subtree:true,childList:true});
  function closePanel() { panel?.remove(); panel = null; panelOwner=null; button$?.setAttribute('aria-expanded', 'false'); }
  function togglePanel(tab = 'sources', options = {}) {
    if(!sessionActive()||player.workspaceMode==='browser')return;
    if (panel) { if (options.keepOpen&&panelOwner?.()) return drawPanel(tab, options); closePanel(); if(!options.keepOpen)return; }
    panel = el('div', 'sx-player-panel'); panel.dataset.uiUntranslated = ''; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', t('Stremio player menu', 'Stremio oynatıcı menüsü'));
    const layer=document.getElementById('playerLayer');(layer?.querySelector('.sh')||layer||document.body).append(panel);panelOwner=playerTrackOwner(panel); button$?.setAttribute('aria-expanded', 'true'); drawPanel(tab, options);queueNativeTools();
  }
  let panelTrackSignature='';
  function trackSignature(){
    const native=!!window.NativePlayerUI?.active?.(),v=videoEl(),hls=player.hls;
    return JSON.stringify([native,native?(window.NativePlayerUI.state?.().tracks||[]).map(r=>[r.id,r.type,r.title,r.lang,r.codec,r.selected]):[],hls?{audio:Array.from(hls.audioTracks||[],r=>[r.id,r.name,r.lang]),activeAudio:hls.audioTrack,subtitles:Array.from(hls.subtitleTracks||[],r=>[r.id,r.name,r.lang]),activeSubtitle:hls.subtitleTrack}:null,
      Array.from(v?.audioTracks||[],r=>[r.label,r.language,r.enabled]),Array.from(v?.textTracks||[]).filter(r=>r!==(typeof miniCaptionTrack==='undefined'?null:miniCaptionTrack)).map(r=>[r.kind,r.label,r.language,r.mode])]);
  }
  function refreshTrackPanel(){
    if(!panelOwner?.())return;const selected=panel?.querySelector('.sx-tab[aria-selected=true]')?.id;
    if(!['sxTab-subs','sxTab-audio'].includes(selected))return;const next=trackSignature();
    if(next!==panelTrackSignature)drawPanel(selected.slice(6));
  }
  videoEl()?.addEventListener('timeupdate',refreshTrackPanel);
  videoEl()?.addEventListener('loadedmetadata',refreshTrackPanel);
  function drawPanel(tab, options = {}) {
    if (!panel) return; panel.replaceChildren();
    panelTrackSignature=trackSignature();
    const tabs = el('div', 'sx-tabs'); tabs.setAttribute('role', 'tablist');
    for (const [id, en, tr] of [['sources', 'Sources', 'Kaynaklar'], ['subs', 'Subtitles', 'Altyazı'], ['audio', 'Audio', 'Ses'], ['play', 'Playback', 'Oynatma'], ['dub', 'Dubbing', 'Dublaj'], ['ai', 'AI tools', 'Yapay zekâ']]) {
      const b = el('button', 'sx-tab', t(en, tr)); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'sxTab-' + id; b.setAttribute('aria-selected', String(tab === id)); b.setAttribute('aria-controls', 'sxTabPanel'); b.tabIndex = tab === id ? 0 : -1; b.onclick = () => drawPanel(id); tabs.append(b);
    }
    tabs.addEventListener('keydown', (e) => {
      const order = ['sources', 'subs', 'audio', 'play', 'dub', 'ai']; const i = order.indexOf(tab); if (i < 0) return;
      const j = e.key === 'ArrowRight' ? (i + 1) % order.length : e.key === 'ArrowLeft' ? (i + order.length - 1) % order.length : e.key === 'Home' ? 0 : e.key === 'End' ? order.length - 1 : -1; if (j < 0) return;
      e.preventDefault(); drawPanel(order[j]); document.getElementById('sxTab-' + order[j])?.focus();
    });
    const close = el('button', 'sx-tab sx-tab-close', '×'); close.type = 'button'; close.setAttribute('aria-label', t('Close', 'Kapat')); close.onclick = closePanel; const head=el('div','sx-panel-head');head.append(tabs,close);
    const body = el('div', 'sx-panel-body'), status = statusNode(); body.id = 'sxTabPanel'; body.setAttribute('role', 'tabpanel'); body.setAttribute('aria-labelledby', 'sxTab-' + tab); panel.append(head, status, body);
    panel.addEventListener('sx-error', (e) => say(status, e.detail?.message, true));
    ({ sources: panelSources, subs: panelSubs, audio: panelAudio, play: panelPlay, dub: panelDub, ai: panelAi })[tab](body, status, options);
  }
  async function panelSources(body, status, options = {}) {
    say(status, t('Loading sources…', 'Kaynaklar yükleniyor…'));
    const owner = session, retry = () => { if (panel && session === owner) drawPanel('sources', options); };
    try {
      const c = owner.ctx, data = await call('streams', { type: c.type, id: c.id, season: c.season, episode: c.episode });
      if (!body.isConnected || session !== owner) return; say(status, '');
      const onPlay = async (s) => { if (!body.isConnected || session !== owner || !sessionActive()) return; const v = videoEl(), at = v?.currentTime || 0; say(status, t('Switching source…', 'Kaynak değiştiriliyor…')); try { if(await playStreamRow(c, data, s, { seconds: at, isCancelled: () => !body.isConnected || session !== owner }))closePanel(); } catch (e) { say(status, e.message, true); offerRetry(body, e, retry); } };
      mountStreamList(body, data, { onPlay, currentId: owner.streamId, status, onRetry: retry, whisperOnly: options.whisperOnly === true });
    } catch (e) { if (!body.isConnected) return; say(status, e.message, true); body.append(button(t('Search sources again', 'Kaynakları yeniden ara'), retry, 'mh-action mh-primary sx-retry')); }
  }
  const trackLabel = (r) => { const name = r.title || r.lang || '#' + r.id, extra = [r.title && r.lang ? r.lang : '', r.codec, r.external ? t('external', 'harici') : '', r.default ? t('default', 'varsayılan') : ''].filter(Boolean).join(' · '); return extra ? `${name} — ${extra}` : name; };
  async function panelSubs(body, status) {
    const owner=session, mediaOwner={key:player.mediaKey,generation:player.generation}, current=()=>session===owner&&player.mediaKey===mediaOwner.key&&player.generation===mediaOwner.generation&&body.isConnected;
    let searchSequence=0;
    // Native state updates redraw this body while a selection is still awaiting
    // its command/read. Keep that intent tied to the panel and media, not the body.
    const selectionPanel=panel;
    const claimSelection=()=>{const selection=owner.subtitleSelectionRevision=(owner.subtitleSelectionRevision||0)+1;return()=>session===owner&&player.mediaKey===mediaOwner.key&&player.generation===mediaOwner.generation&&panel===selectionPanel&&!!selectionPanel?.isConnected&&owner.subtitleSelectionRevision===selection;};
    const trackStatus=statusNode();trackStatus.classList.add('sx-track-status');body.append(trackStatus);
    previousWorkTracks(body);
    const loaded=document.getElementById('playerSubSelect');
    if(loaded&&Array.from(loaded.options).some(o=>o.value)){
      const select=el('select');select.setAttribute('aria-label',t('Loaded subtitle','Yüklü altyazı'));
      for(const option of loaded.options)select.append(new Option(option.textContent,option.value));select.value=loaded.value;
      select.onchange=async()=>{
        if(!current())return;
        const selected=claimSelection();
        if(window.NativePlayerUI?.active?.()){const result=await window.NativePlayerUI.command('sub','no');if(!selected())return;if(!result?.ok)return say(trackStatus,t('Embedded subtitles could not be disabled.','Gömülü altyazı kapatılamadı.'),true);}
        if(player.hls){player.hls.subtitleDisplay=false;player.hls.subtitleTrack=-1;}
        for(const row of Array.from(videoEl()?.textTracks||[]))if(['subtitles','captions'].includes(row.kind))row.mode='disabled';
        loaded.value=select.value;await loadSubtitle(select.value,false,{isCancelled:()=>!selected()});
      };
      body.append(el('h3','sx-h3',t('Loaded subtitles','Yüklü altyazılar')),select);
    }

    const c = owner.ctx, lang = el('select'); lang.setAttribute('aria-label', t('Subtitle language', 'Altyazı dili'));
    const prefer = subtitleLanguage();
    for (const [v, l] of [['tr', 'Türkçe'], ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pt', 'Português'], ['ru', 'Русский'], ['ar', 'العربية'], ['ja', '日本語'], ['ko', '한국어'], ['', t('Any language', 'Herhangi bir dil')]]) lang.append(new Option(l, v));
    if(prefer&&![...lang.options].some(o=>o.value===prefer))lang.append(new Option(prefer.toUpperCase(),prefer));
    lang.value = prefer; const list = el('div', 'sx-sub-list'), fetchBtn = button(t('Find subtitles', 'Altyazı bul'), load, 'mh-action mh-primary');
    const native = window.NativePlayerUI?.active?.() ? (window.NativePlayerUI.state?.().tracks || []).filter((r) => r.type === 'sub') : [];
    const selectNative=async value=>{if(!current()||!window.NativePlayerUI?.active?.())return;const selected=claimSelection();const result=await window.NativePlayerUI.command('sub',value);if(!selected())return;if(!result?.ok)return say(trackStatus,t('Subtitle track could not be changed.','Altyazı izi değiştirilemedi.'),true);if(value!=='no'&&typeof setSubtitleMode==='function')setSubtitleMode('off');drawPanel('subs');};
    if (native.length) {
      body.append(el('h3', 'sx-h3', t('Tracks inside the video', 'Videonun içindeki altyazılar')));
      for (const r of native) body.append(button(`${r.selected ? '✓ ' : ''}${trackLabel(r)}`, () => selectNative(r.id), 'mh-action sx-audio'));
      body.append(button(t('Hide embedded subtitles', 'Gömülü altyazıyı gizle'), () => selectNative('no'), 'mh-action sx-audio'), el('hr'));
    }
    if(!window.NativePlayerUI?.active?.()){
      const video=videoEl(),hls=player.hls,adaptive=Array.isArray(hls?.subtitleTracks)?hls.subtitleTracks:[],html=adaptive.length?[]:Array.from(video?.textTracks||[]).filter(r=>['subtitles','captions'].includes(r.kind)&&r!==(typeof miniCaptionTrack==='undefined'?null:miniCaptionTrack));
      if(adaptive.length){body.append(el('h3','sx-h3',t('Stream subtitles','Yayın altyazıları')));const choose=index=>{if(!current()||player.hls!==hls)return;claimSelection();hls.subtitleTrack=index;hls.subtitleDisplay=index>=0;if(index>=0&&typeof setSubtitleMode==='function')setSubtitleMode('off');drawPanel('subs');};for(const [i,row]of adaptive.entries())body.append(button((hls.subtitleTrack===i?'✓ ':'')+(row.name||row.lang||t('Subtitle ','Altyazı ')+(i+1)),()=>choose(i),'mh-action sx-audio'));body.append(button(t('Hide stream subtitles','Yayın altyazısını gizle'),()=>choose(-1),'mh-action sx-audio'));}
      if(html.length){body.append(el('h3','sx-h3',t('Tracks inside the video','Videonun içindeki altyazılar')));
        const choose=track=>{if(!current())return;claimSelection();for(const row of html)row.mode=row===track?'showing':'disabled';if(track&&typeof setSubtitleMode==='function')setSubtitleMode('off');drawPanel('subs');};
        for(const row of html)body.append(button((row.mode==='showing'?'✓ ':'')+(row.label||row.language||t('Subtitle','Altyazı')),()=>choose(row),'mh-action sx-audio'));
        body.append(button(t('Hide embedded subtitles','Gömülü altyazıyı gizle'),()=>choose(null),'mh-action sx-audio'));
      }
      const select=document.getElementById('playerEmbeddedSubSelect'),loadButton=document.getElementById('playerEmbeddedSubLoad');
      if(player.localPath&&select?.options.length&&loadButton){
        body.append(el('h3','sx-h3',t('Extract embedded text','Gömülü metni çıkar')));
        for(const option of select.options){const pick=button(option.textContent,()=>{if(!current()||loadButton.disabled||option.disabled)return;claimSelection();select.value=option.value;loadButton.click();},'mh-action sx-audio');pick.disabled=option.disabled;body.append(pick);}
      }else if(!html.length&&!adaptive.length)body.append(el('p','sx-hint',t('For embedded MKV tracks, use the native player. Addon subtitles are available below.','MKV içindeki altyazı izleri için native oynatıcıyı kullan. Eklenti altyazıları aşağıda.')));
    }
    body.append(el('p', 'sx-hint', t('Looks in your subtitle addons first, then OpenSubtitles.', 'Önce altyazı eklentilerine, bulunamazsa OpenSubtitles\'a bakar.')), lang, fetchBtn, list);
    lang.onchange = () => {claimSelection();try{localStorage.setItem(SUBTITLE_LANGUAGE_KEY,lang.value);}catch(_){}void load();};
    async function load() {
      const sequence=++searchSequence, language=lang.value;
      const valid=()=>current()&&sequence===searchSequence;
      say(status, t('Searching subtitles…', 'Altyazılar aranıyor…')); list.replaceChildren();
      try {
        const r = await call('subtitles', { type: c.type, id: c.id, season: c.season, episode: c.episode, filename: owner.filename, title: c.name, language, streamToken: owner.streamToken, streamId: owner.streamId });
        if(!valid())return;
        say(status, r.fallback ? (r.subtitles.length ? t('No addon subtitles in this language; showing OpenSubtitles results.', 'Eklentilerde bu dilde altyazı yok; OpenSubtitles sonuçları gösteriliyor.') : t('No subtitles found.', 'Altyazı bulunamadı.')) : '');
        for (const s of r.subtitles.slice(0, 60)) {
          const row = el('div', 'sx-sub' + (s.preferred ? ' is-preferred' : '')), copy = el('div'); copy.append(el('strong', '', s.label), el('small', '', [s.addonName, s.language.toUpperCase() || s.lang, s.hearingImpaired ? 'SDH' : ''].filter(Boolean).join(' · ')));
          row.append(copy, button(t('Use', 'Kullan'), async () => {
            if(!valid())return;
            const selected=claimSelection(),validChoice=()=>selected()&&sequence===searchSequence;
            say(status, t('Downloading subtitle…', 'Altyazı indiriliyor…'));
            const saved = await call('subtitle-save', { token: r.token, id: s.id });
            if(!validChoice())return;
            if(window.NativePlayerUI?.active?.()){const result=await window.NativePlayerUI.command('sub','no');if(!validChoice())return;if(!result?.ok)return say(status,t('Embedded subtitles could not be disabled.','Gömülü altyazı kapatılamadı.'),true);}
            if(player.hls){player.hls.subtitleDisplay=false;player.hls.subtitleTrack=-1;}
            for(const track of Array.from(videoEl()?.textTracks||[]))if(['subtitles','captions'].includes(track.kind))track.mode='disabled';
            addSubtitleOption(saved.filePath, `${saved.label} · ${saved.addonName}`, { role: 'source', language: saved.language });
            const result=await loadSubtitle(saved.filePath,false,{select:true,isCancelled:()=>!validChoice()});if(!validChoice()||!result?.loaded||player.subPath!==saved.filePath)return;if(typeof currentSubtitleMode==='function'&&currentSubtitleMode()==='off'&&typeof setSubtitleMode==='function')setSubtitleMode('source'); rememberWorkTracks(); say(status, t('Subtitle loaded.', 'Altyazı yüklendi.')); toast(t('Subtitle loaded: ', 'Altyazı yüklendi: ') + (saved.label || '')); if (!body.querySelector('.sx-dub-next')) body.prepend(button(t('Dub this subtitle →', 'Bu altyazıyla dublaj yap →'), () => drawPanel('dub'), 'mh-action mh-primary sx-dub-next'));
          })); list.append(row);
        }
      } catch (e) { if(valid())say(status, e.message, true); }
    }
    void load();
  }
  function panelAudio(body, status) {
    const current=playerTrackOwner(body),native=window.NativePlayerUI?.active?.(),v=videoEl(),hls=player.hls;
    const tracks=native?(window.NativePlayerUI.state?.().tracks||[]).filter(r=>r.type==='audio'):[];
    const adaptive=!native&&hls?.audioTracks?.length?Array.from(hls.audioTracks).map((r,i)=>({id:i,title:r.name||r.lang||t('Audio ','Ses ')+(i+1),selected:hls.audioTrack===i,hls:true})):[];
    const html=!native&&!adaptive.length&&v?.audioTracks?Array.from(v.audioTracks).map((r,i)=>({id:i,title:r.label||r.language||t('Audio ','Ses ')+(i+1),selected:r.enabled,html:true})):[];
    const rows=native?tracks:adaptive.length?adaptive:html;
    if(!rows.length){
      body.append(el('p','sx-hint',t('No selectable audio tracks reported by this player. Native mpv shows every track of MKV files.','Bu oynatıcı seçilebilir ses izi bildirmiyor. Native mpv, MKV dosyalarının tüm izlerini gösterir.')));
      if(!native)body.append(button(t('Use native player','Native oynatıcıyı kullan'),async()=>{if(!current())return;if(hls)return say(status,t('This HLS stream stays in the built-in player. Choose another source if no audio alternatives are provided.','Bu HLS akışı yerleşik oynatıcıda kalır. Başka ses izi sunulmuyorsa farklı kaynak seç.'),true);const ok=await window.NativePlayerUI?.start?.();if(!current())return;if(ok)drawPanel('audio');else say(status,t('Native player (mpv) is not available.','Native oynatıcı (mpv) kullanılamıyor.'),true);}));
    }
    for(const row of rows)body.append(button((row.selected?'✓ ':'')+(row.html||row.hls?row.title:trackLabel(row)),async()=>{
      if(!current())return;
      if(row.hls){
        if(player.hls!==hls)return;const select=document.getElementById('playerStreamAudio');
        if(!select||!Array.from(select.options).some(o=>o.value===String(row.id)))return say(status,t('Audio tracks are not ready yet. Reopen this menu.','Ses izleri henüz hazır değil. Bu menüyü yeniden aç.'),true);
        select.value=String(row.id);select.dispatchEvent(new Event('change',{bubbles:true}));
      }else if(row.html){if(v!==videoEl()||!v.audioTracks?.[row.id])return;Array.from(v.audioTracks).forEach((r,i)=>r.enabled=i===row.id);}
      else {if(!window.NativePlayerUI?.active?.())return;const result=await window.NativePlayerUI.command('audio',row.id);if(!current())return;if(!result?.ok)return say(status,t('Audio track could not be changed.','Ses izi değiştirilemedi.'),true);}
      if(current())drawPanel('audio');
    },'mh-action sx-audio'));
    body.append(el('hr'),button(t('Add an audio file (dub)…','Ses dosyası ekle (dublaj)…'),()=>{if(current())document.getElementById('playerDubAdd')?.click();}));
  }
  function panelPlay(body, status) {
    const v = videoEl(), c = session.ctx, prof = session.profile || 'film';
    const group = (label) => { const g = el('section', 'sx-group'); g.append(el('h3', 'sx-h3', label)); body.append(g); return g; };
    const gSpeed = group(t('Speed', 'Hız')), speeds = el('div', 'sx-quick');
    for (const sp of [0.75, 1, 1.25, 1.5, 1.75, 2]) { const b = button(sp + '×', async () => { if(await window.PlayerPlaybackControls?.setRate(sp)!==true)return; toast(t(`Speed ${sp}×`, `Hız ${sp}×`), { ms: 1800 }); drawPanel('play'); }); b.setAttribute('aria-pressed', String(!!v && Math.abs((v.playbackRate || 1) - sp) < 0.01)); speeds.append(b); }
    gSpeed.append(speeds);
    try{const saved=Number(localStorage.getItem('stremio.speed'));if(saved>=.25&&saved<=4&&Math.abs(saved-(window.PlayerPlaybackControls?.getRate()||1))>.001)gSpeed.append(button(t(`Use previously saved Stremio speed: ${saved}×`,`Önceki Stremio hızını kullan: ${saved}×`),async()=>{await window.PlayerPlaybackControls?.setRate(saved);drawPanel('play');}));}catch(_){}
    const gSeek = group(t('Skip', 'Atla')), seek = el('div', 'sx-quick'); seek.setAttribute('role', 'group');
    for (const [d, label] of [[-10, '−10 s'], [10, '+10 s'], [85, t('Skip +85 s', 'Atla +85 sn')]]) { const b = button(label, () => seekBy(d)); if (d === 85) b.title = t('Typical intro length; the native player also shows a skip button from chapter names.', 'Tipik giriş uzunluğu; native oynatıcı bölüm adlarından da atla düğmesi gösterir.'); seek.append(b); }
    gSeek.append(seek);
    if (c.meta && c.season != null) {
      const list = (c.meta.videos || []).filter((x) => x.season != null && x.episode != null && x.season >= 0).sort((a, b) => a.season - b.season || a.episode - b.episode), i = list.findIndex((x) => x.season === c.season && x.episode === c.episode);
      const gEp = group(t('Episodes', 'Bölümler')), nav = el('div', 'sx-quick');
      const prev = button('← ' + t('Previous', 'Önceki'), async () => { if (!(await goEpisode(-1))) say(status, t('No earlier episode.', 'Önceki bölüm yok.')); else closePanel(); }); prev.disabled = i <= 0;
      const next = button(t('Next', 'Sonraki') + ' →', async () => { if (!(await goEpisode(1))) say(status, t('No later episode.', 'Sonraki bölüm yok.')); else closePanel(); }); next.disabled = i < 0 || i >= list.length - 1;
      nav.append(prev, next); gEp.append(nav, el('p', 'sx-hint', t('The next episode picks the same source group and quality when it can. Shortcuts: Shift+N / Shift+P.', 'Sıradaki bölüm elinden geldiğince aynı kaynak grubunu ve kaliteyi seçer. Kısayol: Shift+N / Shift+P.')));
      const auto = el('label', 'sx-check'), cb = el('input'); cb.type = 'checkbox'; cb.checked = autoNextOn(); cb.onchange = () => setAutoNext(cb.checked); auto.append(cb, el('span', '', t('Play next episode automatically', 'Sıradaki bölümü otomatik oynat'))); gEp.append(auto);
    }
    if (window.PlayerPro) { const gPro = group(t('Picture & sync', 'Görüntü ve eşitleme')), pr = el('div', 'sx-quick'); pr.append(button(t('Picture settings…', 'Görüntü ayarları…'), () => { closePanel(); window.PlayerPro.open('video'); }), button(t('Subtitle / audio sync…', 'Altyazı / ses eşitleme…'), () => { closePanel(); window.PlayerPro.open('sync'); }), button(t('Info…', 'Bilgi…'), () => { closePanel(); window.PlayerPro.open('info'); })); gPro.append(pr); }
    const gSleep = group(t('Sleep timer', 'Uyku zamanlayıcı')), sleep = el('div', 'sx-quick');
    for (const m of [0, 15, 30, 60]) { const b = button(m ? t(`${m} min`, `${m} dk`) : t('Off', 'Kapalı'), () => { if(!setSleep(m))return; say(status, m ? t(`Playback will pause in ${m} min.`, `Oynatma ${m} dk sonra duraklayacak.`) : t('Sleep timer off.', 'Zamanlayıcı kapalı.')); }); sleep.append(b); }
    gSleep.append(sleep);
    const timer=window.PlayerPlaybackControls?.getSleep();if(timer?.at||timer?.mode==='end')gSleep.append(el('p','sx-hint',timer.mode==='end'?t('Pauses at the end of this episode.','Bölüm sonunda duraklatır.'):t(`Pauses at ${new Date(timer.at).toLocaleTimeString()}`,`${new Date(timer.at).toLocaleTimeString()} saatinde duraklatır.`)));
    const gProfile = group(t('Content profile', 'İçerik profili')), sel = el('select'); sel.setAttribute('aria-label', t('Content profile', 'İçerik profili'));
    for (const [id, p] of Object.entries(PROFILES)) sel.append(new Option(t(p.en, p.tr), id)); sel.value = prof;
    sel.onchange = () => { session.profile = sel.value; try { localStorage.setItem('stremio.profile.' + c.type + ':' + c.id, sel.value); } catch (_) { /* oturumluk */ } drawPanel('play'); };
    gProfile.append(sel, el('p', 'sx-hint', PROFILES[prof].note()));
  }
  function panelDub(body, status) {
    const owner=session,prof = session.profile || 'film', sub = activeSubtitlePath(), preset = presetKey(prof);
    body.append(el('p', 'sx-hint', t('Dubbing uses the subtitle that is active in the player. Pick or create one, then open the studio — settings below are applied for you.', 'Dublaj, oynatıcıda aktif olan altyazıyı kullanır. Bir altyazı seç veya üret, sonra stüdyoyu aç — aşağıdaki ayarlar senin için uygulanır.')));
    const card = el('div', 'sx-dub-card' + (sub ? ' is-ready' : ''));
    card.append(el('small', '', t('Active subtitle', 'Aktif altyazı')), el('strong', '', sub ? baseName(sub) : t('No subtitle selected yet', 'Henüz altyazı seçilmedi')));
    if (sub && !/\.srt$/i.test(sub)) card.append(el('small', 'sx-reason', t('Only .srt subtitles can be dubbed; pick another one.', 'Yalnız .srt altyazılar dublajlanabilir; başka bir altyazı seç.')));
    body.append(card);
    const row = el('div', 'sx-quick');
    row.append(button(t('Choose subtitle', 'Altyazı seç'), () => drawPanel('subs')), button(t('Transcribe with Whisper', 'Whisper ile çıkar'), () => { const x = document.getElementById('makeSubsBtn'); if (!x || x.disabled) return say(status, t('Not available for this source yet.', 'Bu kaynak için henüz kullanılamıyor.'), true); closePanel(); x.click(); }), button(t('Transcribe + translate', 'Çıkar + çevir'), () => { const x = document.getElementById('quickSubsBtn'); if (!x || x.disabled) return say(status, t('Not available for this source yet.', 'Bu kaynak için henüz kullanılamıyor.'), true); closePanel(); x.click(); }));
    body.append(row);
    const profSel = el('select'), presetSel = el('select'); profSel.setAttribute('aria-label', t('Content profile', 'İçerik profili')); presetSel.setAttribute('aria-label', t('Dub quality preset', 'Dublaj kalite ayarı'));
    for (const [id, p] of Object.entries(PROFILES)) profSel.append(new Option(t(p.en, p.tr), id)); profSel.value = prof;
    for (const [id, l] of Object.entries(PRESET_LABEL)) presetSel.append(new Option(t(l[0], l[1]), id)); presetSel.value = preset;
    profSel.onchange = () => { session.profile = profSel.value; try { localStorage.setItem('stremio.profile.' + session.ctx.type + ':' + session.ctx.id, profSel.value); localStorage.removeItem('stremio.dubPreset'); } catch (_) { /* oturumluk */ } drawPanel('dub'); };
    presetSel.onchange = () => { try { localStorage.setItem('stremio.dubPreset', presetSel.value); } catch (_) { /* oturumluk */ } drawPanel('dub'); };
    const lab = (text, node) => { const l = el('label', 'sx-field'); l.append(el('span', '', text), node); return l; };
    body.append(lab(t('Content profile', 'İçerik profili'), profSel), lab(t('Dub quality', 'Dublaj kalitesi'), presetSel));
    const reg = { documentary: t('narration', 'anlatım'), drama: t('drama dialogue', 'dram diyaloğu'), general: t('plain language', 'sade dil') }[PROFILES[prof].register] || PROFILES[prof].register;
    body.append(el('p', 'sx-hint', `${PROFILES[prof].note()} ${t('Translation style', 'Çeviri üslubu')}: ${reg}.`));
    const go = button(t('Open dubbing studio', 'Dublaj stüdyosunu aç'), async () => { if(session!==owner||!sessionActive())return; if (!sub) return say(status, t('Choose or create a subtitle first.', 'Önce bir altyazı seç veya üret.'), true); closePanel(); await openDubStudio(profSel.value, presetSel.value); }, 'mh-action mh-primary');
    body.append(go, button(t('Add a dub audio file…', 'Dublaj ses dosyası ekle…'), () => document.getElementById('playerDubAdd')?.click()));
    const w = whisperStatus();
    if (session.torrent && !(w && w.ok)) body.append(el('p', 'sx-hint', t('Torrent: Whisper and the dub timeline use the local file once the download finishes; an existing subtitle dubs right away.', 'Torrent: Whisper ve dublaj zaman çizelgesi, indirme bitince yerel dosyayı kullanır; var olan altyazı hemen dublajlanır.')));
    else if (w && !w.ok) body.append(el('p', 'sx-hint sx-whisper-blocked', w.message));
  }
  function panelAi(body, status) {
    const w = whisperStatus();
    body.append(el('p', 'sx-hint' + (w && !w.ok ? ' sx-whisper-blocked' : ''), w ? w.message : t('Whisper prepares audio from the current source, then creates subtitles.', 'Whisper mevcut kaynaktan sesi hazırlar, ardından altyazı oluşturur.')));
    if (w && !w.ok && w.action === 'sources') body.append(button(t('Choose a Whisper-ready source', 'Whisper’a uygun kaynak seç'), () => drawPanel('sources', { whisperOnly: true }), 'mh-action mh-primary sx-whisper-next'));
    const act = (label, id, desc) => { const b = button(label, () => { const target = document.getElementById(id); if (!target || target.disabled) { say(status, t('This action is not available for the current source yet.', 'Bu eylem şu anki kaynak için henüz kullanılamıyor.'), true); return; } closePanel(); target.click(); }, 'mh-action sx-ai'); const w = el('div', 'sx-ai-row'); w.append(b, el('small', '', desc)); body.append(w); };
    act(t('Translate subtitle', 'Altyazıyı çevir'), 'makeTransBtn', t('Translate the loaded source subtitle', 'Yüklü kaynak altyazıyı çevirir'));
    act(t('Transcribe with Whisper', 'Whisper ile altyazı çıkar'), 'makeSubsBtn', t('Create a subtitle from the audio', 'Sesten altyazı üretir'));
    act(t('One click: transcribe + translate', 'Tek tık: çıkar + çevir'), 'quickSubsBtn', t('Whisper, then translation', 'Whisper, ardından çeviri'));
    act(t('Create dub from subtitle', 'Altyazıdan dublaj üret'), 'playerDubGenerate', t('Generate a voice track', 'Ses izi üretir'));
  }

  document.addEventListener('ui-locale-change', () => { paintProgressFailure();if (button$) { button$.title = t('Sources, audio, subtitles & AI', 'Kaynaklar, ses, altyazı ve yapay zekâ'); button$.setAttribute('aria-label', button$.title); } });
  document.addEventListener('player-local-file-ready',e=>{if(!sessionActive()||e.detail?.key!==session.key)return;const tab=panel?.querySelector('.sx-tab[aria-selected="true"]')?.id;if(tab==='sxTab-ai'||tab==='sxTab-dub')drawPanel(tab.slice(6));});
  document.addEventListener('player-playback-preferences',()=>{if(panel?.querySelector('#sxTab-play[aria-selected="true"]'))drawPanel('play');});
  document.addEventListener('DOMContentLoaded', hookVideo);
  hookVideo();
  const whisperSource=()=>sessionActive()&&!session.torrent&&session.whisperAudio==='ready'&&typeof player!=='undefined'&&player.workspaceMode!=='browser'?{token:session.streamToken,streamId:session.streamId,key:session.key}:null;
  // Why the current Stremio source can or cannot feed Whisper, with the applicable next step.
  function whisperStatus() {
    if(!sessionActive()||typeof player==='undefined'||player.workspaceMode==='browser')return null;
    // A finished torrent download is attached as the player's local file: Whisper then uses it directly.
    if(session.torrent&&player.localPath)return {ok:true,kind:'local',message:t('The download finished. Whisper uses the completed local file; the full film is not downloaded again.','İndirme bitti. Whisper tamamlanmış yerel dosyayı kullanır; film yeniden indirilmez.')};
    const kind=session.torrent?'torrent':session.whisperAudio||'none';
    if(kind==='ready')return {ok:true,kind,message:t('Whisper prepares the first audio track of this direct HTTPS file, then creates subtitles. The full video is not saved.','Whisper bu doğrudan HTTPS dosyasının ilk ses izini hazırlar, ardından altyazı oluşturur. Videonun tamamı kaydedilmez.')};
    if(kind==='pending')return {ok:false,kind,action:'sources',message:t('The addon reports a pending debrid download. Refresh and select the source again when it is ready.','Eklenti debrid indirmesinin beklediğini bildiriyor. Hazır olunca kaynakları yenileyip yeniden seç.')};
    if(kind==='torrent')return {ok:false,kind,action:'sources',message:t('Raw torrent: Whisper becomes available when the download finishes (Media center → Torrents shows progress). For Whisper now, choose a direct/debrid source.','Ham torrent: Whisper indirme bitince kullanılabilir (ilerleme Medya merkezi → Torrentler’de). Hemen Whisper için doğrudan/debrid kaynak seç.')};
    if(kind==='adaptive')return {ok:false,kind,action:'sources',message:t('This source is an adaptive HLS/DASH stream; its audio cannot be prepared for Whisper. Choose a direct file source. Loaded subtitles can still be translated.','Bu kaynak uyarlamalı HLS/DASH akışı; sesi Whisper için hazırlanamaz. Doğrudan dosya kaynağı seç. Yüklü altyazılar yine çevrilebilir.')};
    if(kind==='insecure')return {ok:false,kind,action:'sources',message:t('This local addon link is not HTTPS, so Whisper audio preparation is unavailable. Choose an HTTPS direct source.','Bu yerel eklenti bağlantısı HTTPS değil; Whisper ses hazırlığı kullanılamaz. HTTPS doğrudan kaynak seç.')};
    return {ok:false,kind,action:'sources',message:t('This source cannot be prepared for Whisper. Choose a direct HTTPS source.','Bu kaynak Whisper için hazırlanamaz. Doğrudan HTTPS kaynak seç.')};
  }
  function assistantMetadata() {
    if(!sessionActive()||typeof player==='undefined'||player.workspaceMode==='browser'||!validWorkKey(session.workKey)||player.workKey!==session.workKey)return null;
    const c=session.ctx;if(!c||!['movie','series'].includes(c.type)||!/^tt\d{7,12}$/.test(c.id||''))return null;
    const kind=c.type==='movie'?'film':'series',year=Number(c.meta?.year);
    return {itemId:'discovery:'+kind+':'+c.id,title:String(c.name||'').replace(/\0/g,'').slice(0,300),...(Number.isInteger(year)&&year>=1870&&year<=2200?{year}:{}),...(kind==='series'?Object.fromEntries(['season','episode'].filter(key=>Number.isInteger(c[key])&&c[key]>=0&&c[key]<=10000).map(key=>[key,c[key]])):{})};
  }
  window.StremioUI = Object.freeze({ mount, openAddons, openTitle, openStreams, togglePanel, whisperSource, whisperStatus, assistantMetadata, rememberWorkTracks, _test: { nextOf, filterStreams, streamSummary, baseCtx, session: () => session } });
})();
