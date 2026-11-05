/* Ortak DOM yardımcıları: h() (yalnız textContent/attribute — innerHTML YOK), tek simge seti, TR/EN metinler,
   kapak gradyanı, süre/tarih biçimi. Kullanıcı içeriği asla HTML olarak yorumlanmaz. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayerUiKit = api;
})(globalThis, () => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
    refresh: 'M20 7A9 9 0 1 0 21 16M20 2v6h-6',
    history: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
    upload: 'M12 3v12m-4-8 4-4 4 4M4 14v6h16v-6',
    play: 'M8 5.5v13l11-6.5z', pause: 'M9 6v12M15 6v12', search: 'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM16 16l4.5 4.5', close: 'M6 6l12 12M18 6L6 18',
    pin: 'M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z', filter: 'M4 6h16M7 12h10M10 18h4', 'chevron-down': 'M6 9l6 6 6-6', 'chevron-up': 'M6 15l6-6 6 6',
    'chevron-left': 'M15 6l-6 6 6 6', 'chevron-right': 'M9 6l6 6-6 6', 'skip-prev': 'M7 6v12M19 6l-9 6 9 6z', 'skip-next': 'M17 6v12M5 6l9 6-9 6z',
    replay: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4', volume: 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7', fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    tools: 'M4 7h9M17 7h3M4 17h3M11 17h9M13 5v4M7 15v4', external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
    copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15V6a1 1 0 0 1 1-1h9', bookmark: 'M7 4h10v16l-5-4-5 4z',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', transcript: 'M4 6h16M4 11h10M4 16h16M4 21h8', alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
    check: 'M5 12l5 5 9-10', rss: 'M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8M6 19h.01',
    film: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', activity: 'M3 12h4l3-8 4 16 3-8h4', 'arrow-right': 'M5 12h14M13 6l6 6-6 6',
    mic: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3', menu: 'M4 6h16M4 12h16M4 18h16', ab: 'M5 4v16M19 4v16M9 12h6',
    more: 'M5 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM19 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z', plus: 'M12 5v14M5 12h14', undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3', route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6',
    wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2',
  };

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    const p = props || {};
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'data') for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = String(dv);
      else if (k === 'vars') for (const [vk, vv] of Object.entries(v)) el.style.setProperty(vk, vv);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    const add = (c) => { if (c === null || c === undefined || c === false) return; if (Array.isArray(c)) return c.forEach(add); el.append(c instanceof Node ? c : document.createTextNode(String(c))); };
    children.forEach(add);
    return el;
  }
  function icon(name, cls) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'pw-icon' + (cls ? ' ' + cls : '')); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(SVG_NS, 'path'); path.setAttribute('d', ICONS[name] || ICONS.list); svg.appendChild(path);
    return svg;
  }

  const STR = {
    tr: {
      kinds: 'Kaynak türü', videos: 'Videolar', podcasts: 'Podcastler', local: 'Yerel medya', sources: 'Kaynaklar', pinned: 'Sabitlenenler', all: 'Tüm kaynaklar',
      search: 'Başlık veya kanalda ara', searchClear: 'Aramayı temizle', filters: 'Filtreler', sort: 'Sırala', follow: 'Takip et', following: 'Takip ediliyor', pin: 'Sabitle', unpin: 'Sabitlemeyi kaldır',
      openSource: 'Kaynağı aç', similar: 'Benzer kaynaklar', loadMore: 'Daha fazla yükle', loadSource: 'Kaynaktan daha fazla yükle', clearFilters: 'Filtreleri temizle', play: 'Oynat', resume: 'Devam et',
      sortNewest: 'En yeni', sortOldest: 'En eski', sortShortest: 'Süre: kısa', sortLongest: 'Süre: uzun', sortTitle: 'Başlık A–Z', readMore: 'Tamamını göster', readLess: 'Daha az göster',
      subtitleUnknown: 'Altyazı bilinmiyor', noSubtitle: 'Altyazı yok', watched: 'İzlendi', live: 'Canlı', offline: 'Çevrimdışı', transcriptTimed: 'Zamanlı transcript', transcriptUntimed: 'Metin transcript, zamansız', transcriptNone: 'Transcript yok',
      emptyTitle: 'Henüz kaynak eklemedin', emptyBody: 'Bir YouTube kanalı, podcast beslemesi veya klasör ekle; içerikleri burada listelenir. Eklemek hiçbir şeyi indirmez ya da oynatmaz.', addSource: 'Kaynak ekle',
      noResultTitle: 'Bu filtrelerle sonuç yok', noResultBody: 'Filtreleri gevşetmeyi dene.', needMoreTitle: 'Yüklü içeriklerde eşleşme yok', needMoreBody: 'Kaynakta henüz yüklenmemiş sayfalar var. Kaynaktan bir sayfa daha yüklenir.',
      loaded: (n) => `${n} içerik gösteriliyor`, ofTotal: (n, t) => `${n} / ${t}`, items: (n) => `${n} içerik`, itemsUnknown: 'İçerik sayısı bilinmiyor', refreshed: (d) => `Son yenileme ${d}`, filtersN: (n) => (n ? `Filtreler (${n})` : 'Filtreler'),
      findFile: 'Dosyayı bul', fileMissing: 'Dosya bulunamadı', speech: 'Konuşma dili', subtitleLang: 'Altyazı dili', duration: 'Süre', personal: 'Kişisel durum', availability: 'Altyazı durumu',
      dur_under10: '0–10 dk', dur_10to30: '10–30 dk', dur_30to60: '30–60 dk', dur_60plus: '60 dk üstü', dur_unknown: 'Süresi bilinmeyen', p_watched: 'İzlenenler', p_unwatched: 'İzlenmeyenler', p_saved: 'Kaydedilenler', p_later: 'Sonra izle', p_liked: 'Beğenilenler',
      av_present: 'Altyazısı var', av_absent: 'Altyazısı yok', av_unknown: 'Bilinmiyor', av_all: 'Hepsi', liveOnly: 'Canlı yayınlar', vodOnly: 'Kayıtlar', searchDesc: 'Açıklamada da ara',
      transcript: 'Transkript', assistant: 'Asistan', queue: 'Sıra', findInTranscript: 'Transkriptte ara', followNow: 'Aktif satıra dön', playHere: 'Buradan oynat', save: 'Kaydet', copy: 'Kopyala', dictionary: 'Sözlük (dış site)', dictionaryShort: 'Sözlük', askAssistant: 'Asistana sor',
      scopeUpTo: 'Bu konuma kadar', scopeSelection: 'Seçili aralık', scopeWhole: 'Tamamı', textOnly: 'Yalnız metin', cuesN: (n) => `${n} satır`, uncertain: 'Belirsiz eşleşme', noTranslation: 'Çeviri yok', switchScope: 'Seçili aralık kapsamına geç',
      prevCue: 'Önceki satır', nextCue: 'Sonraki satır', replayCue: 'Satırı tekrarla', abLoop: 'A–B döngüsü', tools: 'Araçlar', volume: 'Ses düzeyi', speed: 'Hız', subtitleMode: 'Altyazı', modeSource: 'Kaynak', modeSecondary: 'Çeviri', modeBoth: 'İkisi', modeOff: 'Kapalı',
      pause: 'Duraklat', fullscreen: 'Tam ekran', timeline: 'Zaman çizgisi', back: 'Kataloğa dön', explainScene: 'Bu sahneyi açıkla', explainPhrase: 'Bu ifade ne demek?', summarizeRange: 'Seçili aralığı özetle', explainTranslation: 'Çeviriyi açıkla',
      answerBasis: 'Bu cevap yalnızca altyazı metnine dayanıyor; görüntü gönderilmedi.', closeToast: 'Kapat', dismiss: 'Kapat',
    },
    en: {
      kinds: 'Source type', videos: 'Videos', podcasts: 'Podcasts', local: 'Local media', sources: 'Sources', pinned: 'Pinned', all: 'All sources',
      search: 'Search titles or channels', searchClear: 'Clear search', filters: 'Filters', sort: 'Sort', follow: 'Follow', following: 'Following', pin: 'Pin', unpin: 'Unpin',
      openSource: 'Open source', similar: 'Similar sources', loadMore: 'Load more', loadSource: 'Load more from source', clearFilters: 'Clear filters', play: 'Play', resume: 'Resume',
      sortNewest: 'Newest', sortOldest: 'Oldest', sortShortest: 'Duration: short', sortLongest: 'Duration: long', sortTitle: 'Title A–Z', readMore: 'Show all', readLess: 'Show less',
      subtitleUnknown: 'Subtitles unknown', noSubtitle: 'No subtitles', watched: 'Watched', live: 'Live', offline: 'Offline', transcriptTimed: 'Timed transcript', transcriptUntimed: 'Text transcript, untimed', transcriptNone: 'No transcript',
      emptyTitle: 'No sources yet', emptyBody: 'Add a YouTube channel, podcast feed or folder and its items will be listed here. Adding never downloads or plays anything.', addSource: 'Add source',
      noResultTitle: 'No results for these filters', noResultBody: 'Try loosening the filters.', needMoreTitle: 'No match among loaded items', needMoreBody: 'The source has pages that are not loaded yet. One more page will be loaded from the source.',
      loaded: (n) => `${n} loaded`, ofTotal: (n, t) => `${n} / ${t}`, items: (n) => `${n} items`, itemsUnknown: 'Item count unknown', refreshed: (d) => `Last refreshed ${d}`, filtersN: (n) => (n ? `Filters (${n})` : 'Filters'),
      findFile: 'Locate file', fileMissing: 'File not found', speech: 'Spoken language', subtitleLang: 'Subtitle language', duration: 'Duration', personal: 'Personal state', availability: 'Subtitle status',
      dur_under10: '0–10 min', dur_10to30: '10–30 min', dur_30to60: '30–60 min', dur_60plus: '60+ min', dur_unknown: 'Unknown length', p_watched: 'Watched', p_unwatched: 'Unwatched', p_saved: 'Saved', p_later: 'Watch later', p_liked: 'Liked',
      av_present: 'Has subtitles', av_absent: 'No subtitles', av_unknown: 'Unknown', av_all: 'Any', liveOnly: 'Live streams', vodOnly: 'Recordings', searchDesc: 'Search descriptions too',
      transcript: 'Transcript', assistant: 'Assistant', queue: 'Queue', findInTranscript: 'Search transcript', followNow: 'Jump to active line', playHere: 'Play from here', save: 'Save', copy: 'Copy', dictionary: 'Dictionary (external site)', dictionaryShort: 'Dictionary', askAssistant: 'Ask assistant',
      scopeUpTo: 'Up to this point', scopeSelection: 'Selected range', scopeWhole: 'Whole transcript', textOnly: 'Text only', cuesN: (n) => `${n} lines`, uncertain: 'Uncertain pairing', noTranslation: 'No translation', switchScope: 'Switch to selected range',
      prevCue: 'Previous line', nextCue: 'Next line', replayCue: 'Replay line', abLoop: 'A–B loop', tools: 'Tools', volume: 'Volume', speed: 'Speed', subtitleMode: 'Subtitles', modeSource: 'Source', modeSecondary: 'Translation', modeBoth: 'Both', modeOff: 'Off',
      pause: 'Pause', fullscreen: 'Fullscreen', timeline: 'Timeline', back: 'Back to catalog', explainScene: 'Explain this scene', explainPhrase: 'What does this phrase mean?', summarizeRange: 'Summarize selected range', explainTranslation: 'Explain the translation',
      answerBasis: 'This answer is based on subtitle text only; no video frame was sent.', closeToast: 'Close', dismiss: 'Dismiss',
    },
  };
  function t(locale, key, ...args) {
    const dict = STR[String(locale || 'tr').toLowerCase().startsWith('tr') ? 'tr' : 'en'];
    const v = dict[key] !== undefined ? dict[key] : STR.tr[key];
    return typeof v === 'function' ? v(...args) : (v === undefined ? key : v);
  }

  const hashStr = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return x; };
  // Sıcak gradyan ailesi: amber/bakır ağırlıklı, birkaç sönük soğuk ton — grafit yüzeylerle uyumlu.
  const HUES = [24, 32, 38, 44, 18, 12, 200, 168, 276];
  function coverVars(seed) {
    const n = hashStr(String(seed || ''));
    const hue = HUES[n % HUES.length]; const warm = hue < 60 || hue > 340;
    const sat = warm ? 46 + (n >> 4) % 18 : 22 + (n >> 4) % 10;
    return { '--pw-c1': `hsl(${hue} ${sat}% ${warm ? 34 : 30}%)`, '--pw-c2': `hsl(${(hue + 340) % 360} ${Math.max(14, sat - 22)}% ${warm ? 13 : 12}%)` };
  }
  /** Dosya adından temiz sunum başlığı: uzantı, nokta/alt çizgi, çözünürlük gürültüsü atılır. */
  function cleanTitle(name) {
    return String(name == null ? '' : name).replace(/[\\/]/g, ' ').replace(/\.[A-Za-z0-9]{2,4}$/, '').replace(/[._]+/g, ' ')
      .replace(/\b(2160p|1080p|720p|480p|x26[45]|h\.?26[45]|hevc|bluray|web-?dl|webrip|dvdrip|aac|ac3|dts)\b/gi, ' ').replace(/\s{2,}/g, ' ').trim();
  }
  /** Presentation only: callers retain the original path/name as source identity. */
  function displayTitle(name) {
    return String(name ?? '').split(/[\\/]/).pop().replace(/\.[A-Za-z0-9]{2,5}$/, '')
      .replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/(^|\s)(\p{L})/gu, (_, space, letter) => space + letter.toLocaleUpperCase('tr'));
  }
  function languageName(code, locale = 'tr') {
    if (!code || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(code)) return '';
    try { return new Intl.DisplayNames([locale], { type: 'language' }).of(code) || ''; } catch { return ''; }
  }
  function initials(title) {
    const words = cleanTitle(title).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
    const pick = words.slice(0, 2).map((w) => Array.from(w.replace(/^[^\p{L}\p{N}]+/u, ''))[0] || '');
    return (pick.join('') || '?').toLocaleUpperCase('tr-TR');
  }
  function cover(title, seed, cls) {
    return h('div', { class: 'pw-cover' + (cls ? ' ' + cls : ''), vars: coverVars(seed || title), 'aria-hidden': 'true' }, h('span', { text: initials(title) }));
  }
  function formatClock(seconds) {
    if (!(typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0)) return '–:––';
    const s = Math.floor(seconds); const hh = Math.floor(s / 3600); const mm = Math.floor((s % 3600) / 60); const ss = s % 60;
    return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
  }
  function formatDate(iso, locale) {
    const ms = typeof iso === 'number' ? iso : Date.parse(iso); if (!Number.isFinite(ms)) return '';
    return new Intl.DateTimeFormat(String(locale || 'tr').startsWith('tr') ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
  }
  function formatRelative(iso, locale, now) {
    const ms = typeof iso === 'number' ? iso : Date.parse(iso); if (!Number.isFinite(ms)) return '';
    const diff = (ms - (typeof now === 'number' ? now : Date.now())) / 1000; const abs = Math.abs(diff);
    const rtf = new Intl.RelativeTimeFormat(String(locale || 'tr').startsWith('tr') ? 'tr' : 'en', { numeric: 'auto' });
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute'); if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day'); return formatDate(iso, locale);
  }
  // Shared controls keep privileged operations in their existing owners. No HTML from
  // a source, answer or menu label is interpreted here.
  function iconButton({ icon: name, label, onClick, disabled = false }) {
    return h('button', { type: 'button', class: 'pw-btn pw-iconbtn mk-icon-button', title: label,
      'aria-label': label, disabled, on: { click: onClick || (() => {}) } }, icon(name));
  }
  function chip(text, kind = '') { return h('span', { class: 'mk-chip' + (kind ? ' mk-chip-' + kind : ''), text }); }
  function motionAllowed() {
    return !document.hidden && document.hasFocus() && !['off', 'reduced'].includes(document.documentElement.dataset.cinemaMotion) && !['off', 'reduced'].includes(document.getElementById('uiMotion')?.value) &&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }
  function reveal(node, { duration = 320, x = 0, y = 12, scale = 1, delay = 0 } = {}) {
    if (!motionAllowed() || !node?.animate) return;
    return node.animate([{ opacity: 0, transform: `translate(${x}px,${y}px) scale(${scale})` },
      { opacity: 1, transform: 'none' }], { duration, delay, easing: 'cubic-bezier(.16,1,.3,1)' });
  }
  function popupControl({ label, icon: name, searchable, getItems, choose, role = 'menu' }) {
    const wrap = h('div', { class: 'mk-picker' });
    const valueLabel = h('span', { class: 'mk-picker-label', text: label });
    const trigger = h('button', { type: 'button', class: 'pw-btn mk-picker-trigger', 'aria-label': label,
      'aria-haspopup': role, 'aria-expanded': 'false' }, name ? icon(name) : null, valueLabel, icon('chevron-down'));
    const panel = h('div', { class: 'pw-root mk-popup', popover: 'auto', role });
    const list = h('div', { class: 'mk-popup-list' });
    const search = searchable ? h('input', { class: 'mk-menu-search', type: 'search', placeholder: label, 'aria-label': label }) : null;
    panel.append(...(search ? [search] : []), list);wrap.append(trigger, panel);
    let opened = false;
    function position() {
      const r = trigger.getBoundingClientRect();
      panel.style.width = Math.min(Math.max(r.width, searchable ? 280 : 210), window.innerWidth - 32) + 'px';
      panel.style.left = Math.max(16, Math.min(r.left, window.innerWidth - panel.offsetWidth - 16)) + 'px';
      panel.style.top = Math.max(16, Math.min(r.bottom + 8, window.innerHeight - Math.min(panel.scrollHeight, 380) - 16)) + 'px';
    }
    function close(restore = false) { if (opened) panel.hidePopover(); if (restore && trigger.isConnected) trigger.focus(); }
    function render() {
      const query = (search?.value || '').toLocaleLowerCase();
      const rows = getItems().filter(row => !query || [row.label, row.description].join(' ').toLocaleLowerCase().includes(query));
      list.replaceChildren(...rows.map(row => {
        const item = h('button', { type: 'button', class: 'mk-menu-item', role: role === 'listbox' ? 'option' : 'menuitem',
          'aria-selected': role === 'listbox' ? !!row.selected : undefined, disabled: row.disabled,
          title: row.hint || row.description || row.label,
          on: { click: () => { close(true); choose(row); } } },
          row.image ? h('img', { class: 'mk-menu-avatar', src: row.image, alt: '', loading: 'lazy' }) : null,
          h('span', { class: 'mk-menu-copy' }, h('span', { text: row.label }), row.description ? h('small', { text: row.description }) : null),
          row.selected ? icon('check') : null);
        return item;
      }));
      if (!rows.length) list.append(h('p', { class: 'mk-menu-empty', text: t(window.UiLocale?.get?.(), 'noResultTitle') }));
    }
    function open() { render();panel.showPopover();opened = true;trigger.setAttribute('aria-expanded', 'true');position();reveal(panel, { duration: 200, y: 4, scale: .96 });(search || list.querySelector('button:not(:disabled)'))?.focus(); }
    trigger.addEventListener('click', () => opened ? close() : open());
    trigger.addEventListener('keydown', event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault();open(); } });
    search?.addEventListener('input', render);
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault();event.stopPropagation();close(true);return; }
      const nodes = [...list.querySelectorAll('button:not(:disabled)')];const index = nodes.indexOf(document.activeElement);
      let next;
      if (event.key === 'ArrowDown') next = (index + 1) % nodes.length;
      if (event.key === 'ArrowUp') next = (index - 1 + nodes.length) % nodes.length;
      if (event.key === 'Home') next = 0;if (event.key === 'End') next = nodes.length - 1;
      if (next !== undefined && nodes.length) { event.preventDefault();nodes[next].focus(); }
    });
    panel.addEventListener('toggle', event => { opened = event.newState === 'open';trigger.setAttribute('aria-expanded', String(opened)); });
    return { wrap, trigger, valueLabel, panel, render, close };
  }
  function select({ label, value, options = [], onChange = () => {}, searchable = false }) {
    let rows = options, current = String(value ?? options[0]?.value ?? '');
    const control = popupControl({ label, searchable, role: 'listbox',
      getItems: () => rows.map(row => ({ ...row, label: row.label ?? row.text ?? String(row.value), selected: String(row.value) === current })),
      choose: row => { current = String(row.value);sync();onChange(current);control.wrap.dispatchEvent(new document.defaultView.Event('change', { bubbles: true })); } });
    const sync = () => { control.valueLabel.textContent = rows.find(row => String(row.value) === current)?.label ?? rows.find(row => String(row.value) === current)?.text ?? label; };
    Object.defineProperty(control.wrap, 'value', { get: () => current, set: v => { current = String(v);sync(); } });
    control.wrap.setValue = v => { control.wrap.value = v; };
    control.wrap.setOptions = next => { rows = next;sync(); };
    control.wrap.trigger = control.trigger;sync();return control.wrap;
  }
  function menuButton({ label, icon: name, items }) {
    return popupControl({ label, icon: name, getItems: () => typeof items === 'function' ? items() : items,
      choose: row => row.onSelect?.() }).wrap;
  }
  function accordion({ title, children = [], open = false, hint = '' }) {
    const content = h('div', { class: 'mk-accordion-content', hidden: !open }, children);
    const control = h('button', { type: 'button', class: 'mk-accordion-toggle', 'aria-expanded': String(open) },
      icon('list'), h('span', { text: title }), h('small', { text: hint }), icon('chevron-down'));
    const section = h('section', { class: 'mk-accordion' }, control, content);
    control.addEventListener('click', () => { open = !open;control.setAttribute('aria-expanded', String(open));content.hidden = !open;if (open) reveal(content, { duration: 200, y: 4 }); });
    return section;
  }
  function enhanceControls(container) {
    for (const source of container.querySelectorAll('select:not([data-mk-proxy])')) {
      source.dataset.mkProxy = '';source.hidden = true;source.tabIndex = -1;
      const label = source.getAttribute('aria-label') || source.closest('label')?.firstChild?.textContent?.trim() || '';
      const choices = () => [...source.options].map(row => ({ value: row.value, label: row.textContent, disabled: row.disabled }));
      const proxy = select({ label, value: source.value, options: choices(), searchable: source.options.length > 7,
        onChange: value => { source.value = value;source.dispatchEvent(new document.defaultView.Event('change', { bubbles: true })); } });
      source.after(proxy);proxy.trigger.disabled = source.disabled;
      const sync = () => { proxy.setOptions(choices());proxy.value = source.value;proxy.trigger.disabled = source.disabled; };
      source.addEventListener('change', sync);
      const observer = new window.MutationObserver(() => { if (!source.isConnected) { observer.disconnect();return; } sync(); });
      observer.observe(source, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected', 'label'] });
    }
    for (const source of container.querySelectorAll('input[type=checkbox]:not([data-mk-proxy]),input[type=radio]:not([data-mk-proxy])')) {
      source.dataset.mkProxy = '';source.hidden = true;source.tabIndex = -1;
      const label = source.getAttribute('aria-label') || source.closest('label')?.textContent?.trim() || '';
      const proxy = h('button', { type: 'button', class: 'mk-toggle', 'aria-label': label, 'aria-pressed': String(source.checked),
        disabled: source.disabled, title: label }, icon('check'));
      const sync = () => { proxy.setAttribute('aria-pressed', String(source.checked));proxy.disabled = source.disabled; };
      source.after(proxy);source.addEventListener('change', sync);
      proxy.addEventListener('click', event => { event.preventDefault();source.click();sync();
        if (source.type === 'radio') container.querySelectorAll('input[type=radio][data-mk-proxy]').forEach(node => node.dispatchEvent(new document.defaultView.Event('change')));
      });
    }
    for (const source of container.querySelectorAll('details')) {
      const summary = source.querySelector(':scope > summary');if (!summary) continue;
      const content = [...source.childNodes].filter(node => node !== summary);
      const proxy = accordion({ title: summary.textContent, children: content, open: source.open });
      proxy.classList.add(...source.classList);if (source.id) proxy.id = source.id;source.replaceWith(proxy);
    }
  }
  function bindDialog(dialog) {
    dialog.classList.add('mk-dialog');dialog.tabIndex = -1;
    // Native showModal supplies focus containment and background inertness. Move
    // initial focus to its container, leaving Close free of a permanent ring.
    window.requestAnimationFrame(() => { if (dialog.open) { dialog.focus({ preventScroll: true });reveal(dialog, { scale: .98 }); } });
  }
  function richText(text, { citations = new Map() } = {}) {
    const fragment = document.createDocumentFragment();
    // A bounded inline subset deliberately creates DOM nodes rather than trusting
    // AI/source HTML. Links retain their literal text; only known evidence gets a button.
    const pattern = /(\*\*([^*\n]+)\*\*|`([^`\n]+)`|\*([^*\n]+)\*|\[([^\]\n]{1,80})\])/g;
    let end = 0;
    for (const match of String(text).matchAll(pattern)) {
      fragment.append(document.createTextNode(text.slice(end, match.index)));
      if (match[2]) fragment.append(h('strong', { text: match[2] }));
      else if (match[3]) fragment.append(h('code', { text: match[3] }));
      else if (match[4]) fragment.append(h('em', { text: match[4] }));
      else fragment.append(citations.get(match[5])?.() || document.createTextNode(match[0]));
      end = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(String(text).slice(end)));return fragment;
  }
  if (typeof document !== 'undefined') {
    const settle = () => { if (!motionAllowed()) document.querySelectorAll('.mk-dialog,.mk-popup').forEach(node => node.getAnimations({ subtree: true }).forEach(animation => { try { animation.finish(); } catch { animation.cancel(); } })); };
    document.getElementById('uiMotion')?.addEventListener('change', settle);
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', settle);
    if(window.MutationObserver) new window.MutationObserver(settle).observe(document.documentElement,{attributes:true,attributeFilter:['data-cinema-motion']});
    const windowMotion = () => {
      const inactive = document.hidden || !document.hasFocus();
      document.documentElement.dataset.mediaWindowInactive = String(inactive);
      const animations = new Set();
      document.querySelectorAll('.mk-dialog,.mk-popup,#whisperV3Dialog,#playerWorkspaceV3,#playerSourceCatalogV3,#mediaCatalogRoot,#assistantArtifactDialog').forEach(node => node.getAnimations?.({ subtree: true }).forEach(animation => animations.add(animation)));
      for (const animation of animations) {
        if (inactive) animation.pause();
        else if (motionAllowed()) animation.play();
        else { try { animation.finish(); } catch { animation.cancel(); } }
      }
    };
    document.addEventListener('visibilitychange', windowMotion);
    window.addEventListener('blur', windowMotion);window.addEventListener('focus', windowMotion);windowMotion();
  }
  return Object.freeze({ h, icon, t, cover, coverVars, initials, cleanTitle, displayTitle, languageName, formatClock, formatDate, formatRelative, ICONS,
    select, menuButton, accordion, iconButton, chip, reveal, motionAllowed, enhanceControls, bindDialog, richText });
});
