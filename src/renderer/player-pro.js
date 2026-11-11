(() => {
  'use strict';
  /* Oynatıcı Pro — yerel dosya, akış ve Stremio için ortak gelişmiş oynatıcı paneli.
     Görüntü (renk, gama, keskinlik, en-boy, yakınlaştırma, döndürme), Eşitleme (altyazı/ses gecikmesi, hız, uyku
     zamanlayıcı) ve canlı Bilgi sekmeleri. HTML5 oynatıcıda CSS/SVG filtreleri, native mpv'de mpv özellikleri kullanılır.
     Ayarlar içerik başına hatırlanır. Fikir kaynakları: mpv (video-zoom/panscan/audio-delay), Plyr (kısayol/önizleme tasarımı). */
  const video = document.getElementById('playerVideo');
  const layer = document.getElementById('playerLayer');
  if (!video || !layer) return;
  const t = (en, tr) => (window.UiLocale?.get?.() === 'tr' ? tr : en);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const osdSay = (m) => { try { if (typeof osd === 'function') osd(m); } catch (_) { /* OSD yoksa sessiz */ } };
  const native = () => !!window.NativePlayerUI?.active?.();
  const NATIVE_CMD = (name, value) => window.NativePlayerUI?.command?.('vprop', { name, value });

  /* ---------- Durum ---------- */
  const DEFAULTS = Object.freeze({ brightness: 0, contrast: 0, saturation: 0, hue: 0, gamma: 0, sharpen: 0, fit: 'contain', zoom: 0, panX: 0, panY: 0, rotate: 0, flip: false, audioDelay: 0 });
  let state = { ...DEFAULTS }, remember = true, panel = null, tab = 'video', btn = null, statTimer = null, sleep = null, lastKey = '';
  const storeKey = () => { try { return 'pp.v.' + String(player?.mediaKey || ''); } catch (_) { return ''; } };
  function load() {
    state = { ...DEFAULTS }; const k = storeKey(); if (!k || k === 'pp.v.') return;
    try { const raw = JSON.parse(localStorage.getItem(k) || 'null'); if (raw && typeof raw === 'object') for (const key of Object.keys(DEFAULTS)) if (typeof raw[key] === typeof DEFAULTS[key]) state[key] = raw[key]; state=normalize(state); } catch (_) { /* bozuk kayıt yok sayılır */ }
  }
  function normalize(input){const next={...DEFAULTS},ranges={brightness:[-100,100],contrast:[-100,100],saturation:[-100,100],hue:[-100,100],gamma:[-100,100],sharpen:[0,100],zoom:[-2,2],panX:[-1,1],panY:[-1,1],audioDelay:[-10,10]};for(const [key,[lo,hi]]of Object.entries(ranges))if(Number.isFinite(input[key]))next[key]=Math.min(hi,Math.max(lo,input[key]));if([0,90,180,270].includes(input.rotate))next.rotate=input.rotate;if(['contain','cover','fill','16:9','21:9','4:3','1:1'].includes(input.fit))next.fit=input.fit;next.flip=input.flip===true;return next;}
  function save() {
    const k = storeKey(); if (!k || k === 'pp.v.' || !remember) return;
    try {
      const dirty = Object.keys(DEFAULTS).some((key) => state[key] !== DEFAULTS[key]);
      if (!dirty) { localStorage.removeItem(k); return; }
      localStorage.setItem(k, JSON.stringify(state));
      const idx = JSON.parse(localStorage.getItem('pp.v.index') || '[]').filter((x) => x !== k); idx.unshift(k);
      for (const old of idx.splice(200)) localStorage.removeItem(old); localStorage.setItem('pp.v.index', JSON.stringify(idx));
    } catch (_) { /* depolama yoksa oturumluk */ }
  }

  /* ---------- Uygulama: HTML5 (CSS + SVG) ---------- */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const filterSvg = document.createElementNS(SVG_NS, 'svg'); filterSvg.setAttribute('width', '0'); filterSvg.setAttribute('height', '0'); filterSvg.setAttribute('aria-hidden', 'true'); filterSvg.style.position = 'absolute';
  filterSvg.innerHTML = '<defs><filter id="ppFx" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR id="ppGR" type="gamma" exponent="1"/><feFuncG id="ppGG" type="gamma" exponent="1"/><feFuncB id="ppGB" type="gamma" exponent="1"/></feComponentTransfer><feConvolveMatrix id="ppSharp" order="3" kernelMatrix="0 0 0 0 1 0 0 0 0" preserveAlpha="true"/></filter></defs>';
  document.body.append(filterSvg);
  function applyHtml() {
    const s = state, f = [];
    if (s.brightness) f.push(`brightness(${(1 + s.brightness / 100).toFixed(3)})`);
    if (s.contrast) f.push(`contrast(${(1 + s.contrast / 100).toFixed(3)})`);
    if (s.saturation) f.push(`saturate(${Math.max(0, 1 + s.saturation / 100).toFixed(3)})`);
    if (s.hue) f.push(`hue-rotate(${Math.round(s.hue * 1.8)}deg)`);
    const gamma = Math.pow(2, -s.gamma / 50), a = s.sharpen / 100 * 0.9;
    for (const id of ['ppGR', 'ppGG', 'ppGB']) filterSvg.querySelector('#' + id)?.setAttribute('exponent', gamma.toFixed(3));
    filterSvg.querySelector('#ppSharp')?.setAttribute('kernelMatrix', `0 ${-a} 0 ${-a} ${1 + 4 * a} ${-a} 0 ${-a} 0`);
    if (s.gamma || s.sharpen) f.push('url(#ppFx)');
    video.style.filter = f.join(' ');
    const rotated = s.rotate === 90 || s.rotate === 270, vw = video.videoWidth || 16, vh = video.videoHeight || 9;
    const fitScale = rotated ? Math.min(video.clientWidth / (vh || 1) * 1, video.clientHeight / (vw || 1)) / Math.max(1e-6, Math.min(video.clientWidth / vw, video.clientHeight / vh)) : 1;
    const zoom = Math.pow(2, s.zoom), tr = [];
    if (s.panX || s.panY) tr.push(`translate(${(s.panX * 50).toFixed(1)}%, ${(s.panY * 50).toFixed(1)}%)`);
    if (zoom !== 1) tr.push(`scale(${zoom.toFixed(3)})`);
    if (s.rotate) tr.push(`rotate(${s.rotate}deg)`);
    if (rotated && Number.isFinite(fitScale) && fitScale > 0) tr.push(`scale(${Math.min(fitScale, 4).toFixed(3)})`);
    const aspect = ({ '16:9': 16 / 9, '4:3': 4 / 3, '21:9': 21 / 9, '1:1': 1 })[s.fit];
    if (aspect && vw && vh) tr.push(`scaleX(${(aspect / (vw / vh)).toFixed(4)})`);
    if (s.flip) tr.push('scaleX(-1)');
    video.style.transform = tr.join(' ');
    video.style.objectFit = s.fit === 'cover' ? 'cover' : s.fit === 'fill' ? 'fill' : 'contain';
  }
  function clearHtml() { video.style.filter = ''; video.style.transform = ''; video.style.objectFit = ''; }
  /* ---------- Uygulama: native mpv ---------- */
  async function applyNative() {
    const s = {...state}, send = async(n,v)=>{const result=await NATIVE_CMD(n,v);if(!result?.ok)throw Error(result?.error||t('Native setting could not be applied','Native ayar uygulanamadı'));};
    await Promise.all([send('brightness', s.brightness), send('contrast', s.contrast), send('saturation', s.saturation), send('hue', s.hue), send('gamma', s.gamma), send('video-zoom', s.zoom), send('video-pan-x', s.panX / 2), send('video-pan-y', s.panY / 2), send('video-rotate', s.rotate), send('audio-delay',s.audioDelay), send('panscan', s.fit === 'cover' ? 1 : 0), send('video-aspect-override', ({ '16:9': 16 / 9, '4:3': 4 / 3, '21:9': 21 / 9, '1:1': 1 })[s.fit] ?? -1)]);
  }
  function apply() { if (native()) { clearHtml(); void applyNative().catch(error=>osdSay(error.message)); } else applyHtml(); save(); }
  function set(patch, silent = false) { state=normalize({...state,...patch}); apply(); if (!silent) drawPanel(); }

  /* ---------- Hazır görünümler ---------- */
  const PRESETS = [
    ['default', t('Default', 'Varsayılan'), {}],
    ['cinema', t('Cinema', 'Sinema'), { contrast: 12, saturation: 8, brightness: -3, gamma: -6 }],
    ['vivid', t('Vivid', 'Canlı'), { contrast: 10, saturation: 28, brightness: 2, sharpen: 25 }],
    ['night', t('Night', 'Gece'), { brightness: -12, contrast: -6, saturation: -10, gamma: 10 }],
    ['soft', t('Soft', 'Yumuşak'), { contrast: -8, saturation: -6, brightness: 4 }],
    ['bw', t('Black & white', 'Siyah-beyaz'), { saturation: -100, contrast: 12 }],
  ];

  /* ---------- Panel ---------- */
  const FIT = [['contain', t('Fit', 'Sığdır')], ['cover', t('Fill', 'Doldur')], ['fill', t('Stretch', 'Uzat')], ['16:9', '16:9'], ['21:9', '21:9'], ['4:3', '4:3'], ['1:1', '1:1']];
  function slider(label, key, min, max, step, fmt, onlyHtml = false) {
    const row = el('label', 'pp-row'); const name = el('span', 'pp-label', label), out = el('output', 'pp-value');
    const input = el('input'); input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(state[key]);
    const show = () => { out.textContent = fmt ? fmt(Number(input.value)) : String(input.value); }; show();
    input.oninput = () => { show(); set({ [key]: Number(input.value) }, true); };
    input.ondblclick = () => { input.value = String(DEFAULTS[key]); input.oninput(); };
    input.setAttribute('aria-label', label);
    if (onlyHtml && native()) { input.disabled = true; row.classList.add('is-off'); row.title = t('Only in the built-in player', 'Yalnız yerleşik oynatıcıda'); }
    row.append(name, input, out); return row;
  }
  const btnEl = (label, run, cls = 'pp-btn') => { const b = el('button', cls, label); b.type = 'button'; b.onclick = run; return b; };
  const seg = (items, current, pick) => { const wrap = el('div', 'pp-seg'); wrap.setAttribute('role', 'group'); for (const [v, l] of items) { const b = btnEl(l, () => pick(v), 'pp-seg-btn'); b.setAttribute('aria-pressed', String(v === current)); wrap.append(b); } return wrap; };
  const group = (title) => { const g = el('section', 'pp-group'); g.append(el('h3', 'pp-h', title)); return g; };

  function tabVideo(body) {
    const presets = group(t('Look', 'Görünüm')), chips = el('div', 'pp-chips');
    for (const [id, label, patch] of PRESETS) { const c = btnEl(label, () => set({ brightness: 0, contrast: 0, saturation: 0, hue: 0, gamma: 0, sharpen: 0, ...patch }), 'pp-chip'); c.dataset.preset = id; chips.append(c); }
    presets.append(chips, slider(t('Brightness', 'Parlaklık'), 'brightness', -100, 100, 1, (v) => (v > 0 ? '+' : '') + v), slider(t('Contrast', 'Kontrast'), 'contrast', -100, 100, 1, (v) => (v > 0 ? '+' : '') + v), slider(t('Saturation', 'Doygunluk'), 'saturation', -100, 100, 1, (v) => (v > 0 ? '+' : '') + v), slider(t('Hue', 'Ton'), 'hue', -100, 100, 1, (v) => (v > 0 ? '+' : '') + v), slider(t('Gamma', 'Gama'), 'gamma', -100, 100, 1, (v) => (v > 0 ? '+' : '') + v), slider(t('Sharpness', 'Keskinlik'), 'sharpen', 0, 100, 1, (v) => v + '%', true));
    const frame = group(t('Frame', 'Kadraj'));
    frame.append(seg(FIT, state.fit, (v) => set({ fit: v })), slider(t('Zoom', 'Yakınlaştırma'), 'zoom', 0, 2, 0.05, (v) => Math.round(Math.pow(2, v) * 100) + '%'), slider(t('Pan ←→', 'Kaydır ←→'), 'panX', -1, 1, 0.02, (v) => Math.round(v * 100) + '%'), slider(t('Pan ↑↓', 'Kaydır ↑↓'), 'panY', -1, 1, 0.02, (v) => Math.round(v * 100) + '%'));
    const turn = el('div', 'pp-actions');
    turn.append(btnEl('⟲ 90°', () => set({ rotate: (state.rotate + 270) % 360 })), btnEl('⟳ 90°', () => set({ rotate: (state.rotate + 90) % 360 })));
    const flip = btnEl(t('Mirror', 'Aynala'), () => set({ flip: !state.flip })); flip.setAttribute('aria-pressed', String(state.flip)); if (native()) { flip.disabled = true; flip.title = t('Only in the built-in player', 'Yalnız yerleşik oynatıcıda'); } turn.append(flip);
    frame.append(turn);
    const foot = el('div', 'pp-actions'), mem = el('label', 'pp-check'), cb = el('input'); cb.type = 'checkbox'; cb.checked = remember; cb.onchange = () => { remember = cb.checked; try { localStorage.setItem('pp.remember', remember ? '1' : '0'); } catch (_) { /* oturumluk */ } if (remember) save(); };
    mem.append(cb, el('span', '', t('Remember for this video', 'Bu video için hatırla')));
    foot.append(mem, btnEl(t('Reset', 'Sıfırla'), () => set({ ...DEFAULTS }), 'pp-btn pp-ghost'));
    body.append(presets, frame, foot);
    if (native()) body.append(el('p', 'pp-hint', t('Native player: colour, zoom, rotation and aspect use mpv; sharpness and mirror are for the built-in player.', 'Native oynatıcı: renk, yakınlaştırma, döndürme ve en-boy mpv ile uygulanır; keskinlik ve aynalama yerleşik oynatıcıya özeldir.')));
  }

  const fmtSec = (v) => (v > 0 ? '+' : '') + v.toFixed(2) + ' s';
  function tabSync(body) {
    const subs = group(t('Subtitle delay', 'Altyazı gecikmesi')), cur = el('div', 'pp-big', fmtSec(Number(player?.offset) || 0)); cur.setAttribute('aria-live', 'polite');
    const row = el('div', 'pp-actions');
    for (const [d, l] of [[-0.5, '−0.5'], [-0.1, '−0.1'], [0.1, '+0.1'], [0.5, '+0.5']]) row.append(btnEl(l, () => { try { nudgeOffset(d); } catch (_) { /* eski sürüm */ } cur.textContent = fmtSec(Number(player?.offset) || 0); }));
    row.append(btnEl(t('Reset', 'Sıfırla'), () => { try { nudgeOffset(-(Number(player?.offset) || 0)); } catch (_) { /* eski sürüm */ } cur.textContent = fmtSec(Number(player?.offset) || 0); }, 'pp-btn pp-ghost'));
    subs.append(cur, row, el('p', 'pp-hint', t('Keys: G earlier · H later (0.1 s).', 'Tuşlar: G erken · H geç (0,1 sn).')));
    const audio = group(t('Audio delay', 'Ses gecikmesi'));
    if (native()) {
      let delay = Number(state.audioDelay) || 0; const out = el('div', 'pp-big', fmtSec(delay)); const arow = el('div', 'pp-actions');
      const setDelay = (v) => { delay = Math.max(-10, Math.min(10, Math.round(v * 1000) / 1000)); out.textContent = fmtSec(delay); set({audioDelay:delay},true); };
      for (const [d, l] of [[-0.25, '−250 ms'], [-0.05, '−50 ms'], [0.05, '+50 ms'], [0.25, '+250 ms']]) arow.append(btnEl(l, () => setDelay(delay + d)));
      arow.append(btnEl(t('Reset', 'Sıfırla'), () => setDelay(0), 'pp-btn pp-ghost')); audio.append(out, arow);
    } else {
      audio.append(el('p', 'pp-hint', t('The built-in player cannot shift audio. Switch to the native player to fix lip-sync.', 'Yerleşik oynatıcı sesi kaydıramaz. Dudak senkronu için native oynatıcıya geç.')), btnEl(t('Use native player', 'Native oynatıcıyı kullan'), async () => { if (await window.NativePlayerUI?.start?.()) drawPanel(); else osdSay(t('Native player unavailable', 'Native oynatıcı kullanılamıyor')); }, 'pp-btn pp-primary'));
    }
    const speed = group(t('Speed', 'Hız')), sp = el('div', 'pp-chips');
    for (const v of [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]) { const c = btnEl(v + '×', () => { video.playbackRate = v; osdSay(`${v}×`); drawPanel(); }, 'pp-chip'); c.setAttribute('aria-pressed', String(Math.abs((video.playbackRate || 1) - v) < 0.01)); sp.append(c); }
    speed.append(sp);
    const sl = group(t('Sleep timer', 'Uyku zamanlayıcı')), sr = el('div', 'pp-chips');
    for (const m of [0, 15, 30, 45, 60, 90]) { const c = btnEl(m ? t(`${m} min`, `${m} dk`) : t('Off', 'Kapalı'), () => { if (sleep) clearTimeout(sleep.id); sleep = m ? { id: setTimeout(() => { sleep = null; try { video.pause(); } catch (_) { /* oynatıcı yok */ } osdSay(t('Sleep timer: paused', 'Uyku zamanlayıcı: duraklatıldı')); }, m * 60000), at: Date.now() + m * 60000 } : null; osdSay(m ? t(`Pausing in ${m} min`, `${m} dk sonra duraklayacak`) : t('Sleep timer off', 'Zamanlayıcı kapalı')); drawPanel(); }, 'pp-chip'); c.setAttribute('aria-pressed', String(m === 0 ? !sleep : false)); sr.append(c); }
    sl.append(sr); if (sleep) sl.append(el('p', 'pp-hint', t(`Pauses at ${new Date(sleep.at).toLocaleTimeString()}`, `${new Date(sleep.at).toLocaleTimeString()} saatinde duraklatır`)));
    body.append(subs, audio, speed, sl);
  }

  const fmtDur = (s) => { s = Math.max(0, Math.round(Number(s) || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  function collect() {
    const rows = [], isNative = native(), st = isNative ? (window.NativePlayerUI.state?.() || {}) : {};
    const q = (() => { try { return video.getVideoPlaybackQuality?.() || null; } catch (_) { return null; } })();
    const buffered = (() => { try { const b = video.buffered; for (let i = 0; i < b.length; i++) if (video.currentTime >= b.start(i) && video.currentTime <= b.end(i)) return b.end(i) - video.currentTime; } catch (_) { /* yok */ } return null; })();
    const session = window.StremioUI?._test?.session?.();
    rows.push([t('Engine', 'Motor'), isNative ? 'mpv (native)' : 'HTML5 · Chromium']);
    if (session) rows.push([t('Source', 'Kaynak'), session.sourceLabel || 'Stremio'], [t('Profile', 'Profil'), session.profile || '—']);
    else rows.push([t('Source', 'Kaynak'), /^(https?|whisper-media):/.test(video.currentSrc || '') ? t('Stream', 'Akış') : t('Local file', 'Yerel dosya')]);
    const name = session?.filename || (player?.localPath ? String(player.localPath).split(/[\\/]/).pop() : '') || ''; if (name) rows.push([t('File', 'Dosya'), name]);
    if (video.videoWidth) rows.push([t('Resolution', 'Çözünürlük'), `${video.videoWidth}×${video.videoHeight}`]);
    rows.push([t('Duration', 'Süre'), fmtDur(isNative ? st.duration : video.duration)], [t('Position', 'Konum'), fmtDur(isNative ? st.time : video.currentTime)], [t('Speed', 'Hız'), (video.playbackRate || 1) + '×']);
    if (q) rows.push([t('Frames shown / dropped', 'Gösterilen / atlanan kare'), `${q.totalVideoFrames - q.droppedVideoFrames} / ${q.droppedVideoFrames}`]);
    if (buffered != null) rows.push([t('Buffer ahead', 'İleri tampon'), buffered.toFixed(1) + ' s']);
    if (isNative && Array.isArray(st.tracks)) rows.push([t('Tracks', 'İzler'), `${st.tracks.filter((x) => x.type === 'audio').length} ${t('audio', 'ses')} · ${st.tracks.filter((x) => x.type === 'sub').length} ${t('subtitle', 'altyazı')}`]);
    else if (video.audioTracks?.length) rows.push([t('Audio tracks', 'Ses izleri'), String(video.audioTracks.length)]);
    rows.push([t('Volume', 'Ses'), video.muted ? t('muted', 'sessiz') : Math.round((video.volume ?? 1) * 100) + '%']);
    return rows;
  }
  function tabInfo(body) {
    const g = group(t('Live statistics', 'Canlı istatistikler')), table = el('dl', 'pp-stats'); g.append(table);
    const draw = () => { table.replaceChildren(); for (const [k, v] of collect()) { const dt = el('dt', '', k), dd = el('dd', '', v); table.append(dt, dd); } };
    draw(); clearInterval(statTimer); statTimer = setInterval(() => { if (!panel?.isConnected || tab !== 'info') return clearInterval(statTimer); draw(); }, 1000);
    const copy = btnEl(t('Copy info', 'Bilgiyi kopyala'), async () => { try { await navigator.clipboard.writeText(collect().map(([k, v]) => `${k}: ${v}`).join('\n')); osdSay(t('Copied', 'Kopyalandı')); } catch (_) { osdSay(t('Could not copy', 'Kopyalanamadı')); } });
    const stamp = btnEl(t('Copy timestamp', 'Zaman kodunu kopyala'), async () => { try { await navigator.clipboard.writeText(fmtDur(video.currentTime)); osdSay(t('Copied', 'Kopyalandı')); } catch (_) { /* pano yok */ } });
    const row = el('div', 'pp-actions'); row.append(copy, stamp); body.append(g, row);
  }

  function drawPanel() {
    if (!panel) return; clearInterval(statTimer); const prevScroll = panel.querySelector('.pp-body')?.scrollTop || 0; panel.replaceChildren();
    const tabs = el('div', 'pp-tabs'); tabs.setAttribute('role', 'tablist');
    for (const [id, l] of [['video', t('Picture', 'Görüntü')], ['sync', t('Sync & speed', 'Eşitleme ve hız')], ['info', t('Info', 'Bilgi')]]) { const b = btnEl(l, () => { tab = id; drawPanel(); }, 'pp-tab'); b.setAttribute('role', 'tab');b.setAttribute('aria-controls','ppPanelBody'); b.id = 'ppTab-' + id; b.setAttribute('aria-selected', String(tab === id)); b.tabIndex = tab === id ? 0 : -1; tabs.append(b); }
    tabs.addEventListener('keydown', (e) => { const order = ['video', 'sync', 'info'], i = order.indexOf(tab), j = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : e.key==='Home'?0:e.key==='End'?2:-1; if (j < 0) return; e.preventDefault(); tab = order[j]; drawPanel(); document.getElementById('ppTab-' + tab)?.focus(); });
    const close = btnEl('×', closePanel, 'pp-tab pp-close'); close.setAttribute('aria-label', t('Close', 'Kapat')); const panelHead=el('div','pp-head');panelHead.append(tabs,close);
    const body = el('div', 'pp-body'); body.id = 'ppPanelBody'; body.setAttribute('role', 'tabpanel'); body.setAttribute('aria-labelledby', 'ppTab-' + tab);
    panel.append(panelHead, body); ({ video: tabVideo, sync: tabSync, info: tabInfo })[tab](body); body.scrollTop = prevScroll;
  }
  function openPanel(which) {
    if(layer.classList.contains('hidden')||(typeof player==='object'&&player.workspaceMode==='browser'))return; if (which) tab = which; if (panel) { drawPanel(); return; }
    panel = el('div', 'pp-panel'); panel.dataset.uiUntranslated = ''; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', t('Player tools', 'Oynatıcı araçları')); panel.setAttribute('data-pw-occludes-native', 'true');
    layer.append(panel); panel.tabIndex=-1;panel.focus({preventScroll:true});window.NativePlayerUI?.layout?.(); btn?.setAttribute('aria-expanded', 'true'); drawPanel();
  }
  function closePanel() { clearInterval(statTimer); panel?.remove(); panel = null;window.NativePlayerUI?.layout?.();btn?.focus({preventScroll:true}); btn?.setAttribute('aria-expanded', 'false'); }
  const toggle = (which) => { if (panel && (!which || which === tab)) closePanel(); else openPanel(which); };

  /* ---------- Düğme ve kısayollar ---------- */
  function mountButton() {
    if (btn?.isConnected) return;
    const more = document.getElementById('playerMore'); if (!more) return;
    btn = el('button', 'btn-icon pp-btn-open'); btn.type = 'button'; btn.id = 'playerProBtn'; btn.dataset.uiUntranslated = '';
    btn.title = t('Player tools (X)', 'Oynatıcı araçları (X)'); btn.setAttribute('aria-label', btn.title); btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>';
    btn.onclick = () => {if(typeof player==='object'&&player.workspaceMode==='browser')return;toggle();}; more.before(btn);
  }
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
  document.addEventListener('keydown', (e) => {
    if (layer.classList.contains('hidden') || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || typing(e) || document.querySelector('dialog[open]')) return;
    if (typeof player === 'object' && player.workspaceMode === 'browser') return;
    const k = e.key.toLowerCase();
    if (k === 'x') { e.preventDefault(); toggle(); }
    else if (k === 'q') { e.preventDefault(); toggle('info'); }
    else if (k === 'z') { e.preventDefault(); const order = ['contain', 'cover', 'fill']; const next = order[(order.indexOf(state.fit) + 1) % order.length] || 'contain'; set({ fit: next }); osdSay(({ contain: t('Fit', 'Sığdır'), cover: t('Fill', 'Doldur'), fill: t('Stretch', 'Uzat') })[next]); }
    else if (e.key === 'Escape' && panel) { closePanel(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel && !document.querySelector('dialog[open]')) { e.stopImmediatePropagation(); closePanel(); } }, true);

  /* ---------- Yaşam döngüsü ---------- */
  function onMedia() {
    const key = storeKey(); mountButton();
    try { remember = localStorage.getItem('pp.remember') !== '0'; } catch (_) { remember = true; }
    if (key !== lastKey) { lastKey = key;if(remember)load();else state={...DEFAULTS}; }
    apply(); if (panel) drawPanel();
  }
  document.addEventListener('native-player-state-changed',event=>{try{if(event.detail?.key===player.mediaKey&&event.detail?.generation===player.generation)onMedia();}catch{}});
  video.addEventListener('ratechange',()=>{if(panel&&tab==='sync')drawPanel();});
  for (const ev of ['loadedmetadata', 'emptied']) video.addEventListener(ev, onMedia);
  window.addEventListener('resize', () => { if (!native() && (state.rotate === 90 || state.rotate === 270)) applyHtml(); });
  new MutationObserver(() => { if (layer.classList.contains('hidden')) { if (panel) closePanel(); } else mountButton(); }).observe(layer, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('DOMContentLoaded', mountButton); mountButton();
  function workspaceChanged(){const browser=typeof player==='object'&&player.workspaceMode==='browser';if(btn){btn.disabled=browser;btn.title=browser?t('Player tools apply to the local player; use Browser tools here.','Oynatıcı araçları yerel oynatıcı içindir; burada Browser araçlarını kullan.'):t('Player tools (X)','Oynatıcı araçları (X)');}if(browser&&panel)closePanel();}
  window.PlayerPro = Object.freeze({workspaceChanged, open: openPanel, close: closePanel, state: () => ({ ...state }), set, reset: () => set({ ...DEFAULTS }), _test: { DEFAULTS, apply, load, collect } });
})();
