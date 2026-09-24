// SmartTube TV deneyimi (renderer.js'ten SONRA yüklenir):
//  A) YouTube TV modu — YouTube'un kendi TV web uygulaması ayrı pencerede,
//     YouTube'un kendi kod ekranıyla giriş (main.js: youtube-tv:*).
//  B) TV görünümü — uygulamanın SmartTube ızgarası için 10-foot düzen:
//     koyu TV paleti, büyük odaklı kartlar, kumanda/ok tuşu gezinmesi, tam ekran.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const t = (text) => window.UiLocale?.t?.(text) || text;
  const en = () => window.UiLocale?.get?.() === 'en';
  const LAYOUT_KEY = 'whisper.stTvLayout';
  const AGENT_KEY = 'whisper.youtubeTvAgent';
  const store = {
    get(key, fallback) { try { const value = localStorage.getItem(key); return value === null ? fallback : value; } catch (_) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (_) {} },
  };
  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

  // ---------------------------------------------------------------- B: TV görünümü
  const surface = () => $('smarttubeBrowser');

  function applyTvLayout(on) {
    surface()?.classList.toggle('st-tv', on);
    const toggle = $('stTvLayoutToggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
      toggle.classList.toggle('is-active', on);
    }
    store.set(LAYOUT_KEY, on ? '1' : '0');
  }

  function visibleGrid() {
    const results = $('stSearchResults');
    return results && !results.classList.contains('hidden') ? $('stSearchGrid') : $('stGrid');
  }

  function focusSidebar() {
    const item = surface()?.querySelector('.st-side-item.is-active:not(.hidden)')
      || surface()?.querySelector('.st-side-item:not(.hidden)');
    item?.focus();
    return !!item;
  }

  function focusFirstCard() {
    const card = visibleGrid()?.querySelector('.st-card');
    if (!card) return false;
    card.focus();
    card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return true;
  }

  // Kartın solunda aynı satırda başka kart yoksa en soldadır (bölüm başlıkları
  // ızgarayı böldüğü için sütun indeksi güvenilir değil; geometri kullanılır).
  function isLeftmostCard(card) {
    const rect = card.getBoundingClientRect();
    for (const other of card.parentElement?.querySelectorAll('.st-card') || []) {
      if (other === card) continue;
      const box = other.getBoundingClientRect();
      const sameRow = box.top < rect.bottom - 4 && box.bottom > rect.top + 4;
      if (sameRow && box.right <= rect.left + 1) return false;
    }
    return true;
  }

  function isTyping(target) {
    return !!target?.closest?.('input, textarea, select, [contenteditable="true"]');
  }

  function onSurfaceKeydown(event) {
    if (!surface()?.classList.contains('st-tv') || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (isTyping(target)) return;
    const sideItem = target?.closest?.('.st-side-item');
    const card = target?.closest?.('.st-card');
    if (sideItem) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const items = [...surface().querySelectorAll('.st-side-item:not(.hidden)')];
        const index = items.indexOf(sideItem);
        const next = items[index + (event.key === 'ArrowDown' ? 1 : -1)];
        if (next) { event.preventDefault(); event.stopPropagation(); next.focus(); }
      } else if (event.key === 'ArrowRight') {
        if (focusFirstCard()) { event.preventDefault(); event.stopPropagation(); }
      }
      return;
    }
    if (card) {
      if (event.key === 'ArrowLeft' && isLeftmostCard(card)) {
        if (focusSidebar()) { event.preventDefault(); event.stopPropagation(); }
      } else if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'BrowserBack') {
        // Kumandadaki "geri": aramadan çık, değilse kenar menüye dön.
        const results = $('stSearchResults');
        event.preventDefault(); event.stopPropagation();
        if (results && !results.classList.contains('hidden')) $('stBackFromSearch')?.click();
        else focusSidebar();
      }
    }
  }

  async function toggleFullscreen() {
    const root = surface();
    if (!root) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.requestFullscreen({ navigationUI: 'hide' });
    } catch (_) {}
  }

  // ---------------------------------------------------------------- A: YouTube TV modu
  let tvState = { open: false };
  let lastHandoff = 0;
  let agents = [];

  function watchUrlFor(videoId) {
    return VIDEO_ID.test(String(videoId || '')) ? `https://www.youtube.com/watch?v=${videoId}` : '';
  }

  async function openTvMode(agentId) {
    if (!window.api?.youtubeTvOpen) return;
    const result = await window.api.youtubeTvOpen(agentId || store.get(AGENT_KEY, 'cobalt')).catch((error) => ({ ok: false, error: error?.message }));
    if (!result?.ok) {
      setStatus(`${t('YouTube TV açılamadı')}: ${result?.error || ''}`.trim());
      return;
    }
    if (result.state) renderTvState(result.state);
  }

  // TV'de oynatılan videoyu altyazı yakalama/çeviri araçlarının bulunduğu
  // tarayıcı çalışma alanında açar (TV uygulamasına altyazı katmanı eklenmez).
  function openInTools(videoId) {
    const url = watchUrlFor(videoId);
    if (!url) return false;
    $('playerLayer')?.classList.remove('hidden');
    if (typeof setWorkspaceMode === 'function') setWorkspaceMode('browser');
    const address = $('browserAddress');
    if (address && typeof navigateBrowserFromAddress === 'function') {
      address.value = url;
      void navigateBrowserFromAddress();
    }
    return true;
  }

  function setStatus(message) {
    const line = $('stStatusLine');
    if (!line) return;
    line.textContent = message;
    line.classList.toggle('hidden', !message);
  }

  function renderTvState(state) {
    tvState = { ...tvState, ...(state || {}) };
    const banner = $('stTvBanner');
    const launch = $('stTvModeBtn');
    launch?.classList.toggle('is-active', !!tvState.open);
    if (!banner) return;
    banner.classList.toggle('hidden', !tvState.open);
    const title = $('stTvBannerTitle');
    const detail = $('stTvBannerDetail');
    const handoff = $('stTvHandoff');
    const nextAgent = $('stTvNextAgent');
    const hasVideo = VIDEO_ID.test(String(tvState.videoId || ''));
    if (title) {
      title.textContent = tvState.refused
        ? (en() ? 'YouTube refused this TV identity' : 'YouTube bu TV kimliğini reddetti')
        : hasVideo && tvState.title
          ? `${en() ? 'On TV' : 'TV\'de'}: ${tvState.title}`
          : (en() ? 'YouTube TV is open' : 'YouTube TV açık');
    }
    if (detail) {
      detail.textContent = tvState.error
        ? tvState.error
        : tvState.refused
          ? (en() ? 'The desktop site opened instead of the TV app. Try another TV identity.' : 'TV uygulaması yerine masaüstü sitesi açıldı. Başka bir TV kimliği deneyin.')
          : hasVideo
            ? (en() ? 'Ctrl+Shift+S in the TV window hands the video to the subtitle and translation tools.' : 'TV penceresinde Ctrl+Shift+S videoyu altyazı ve çeviri araçlarına devreder.')
            : (en() ? 'To sign in, enter the code on the TV screen at yt.be/activate on your phone.' : 'Giriş için TV ekranındaki kodu telefonda yt.be/activate adresine girin.');
    }
    handoff?.classList.toggle('hidden', !hasVideo);
    nextAgent?.classList.toggle('hidden', !tvState.refused);
    if (tvState.handoff && tvState.handoff !== lastHandoff) {
      lastHandoff = tvState.handoff;
      if (hasVideo) openInTools(tvState.videoId);
    }
  }

  function renderAgentChoices() {
    const select = $('stTvAgent');
    if (!select || !agents.length) return;
    const current = store.get(AGENT_KEY, agents[0].id);
    select.replaceChildren(...agents.map((agent) => {
      const option = document.createElement('option');
      option.value = agent.id;
      option.textContent = agent.label;
      option.selected = agent.id === current;
      return option;
    }));
  }

  function nextAgentId() {
    if (!agents.length) return 'cobalt';
    const current = store.get(AGENT_KEY, agents[0].id);
    const index = agents.findIndex((agent) => agent.id === current);
    return agents[(index + 1) % agents.length].id;
  }

  async function init() {
    applyTvLayout(store.get(LAYOUT_KEY, '1') === '1');
    $('stTvLayoutToggle')?.addEventListener('click', () => applyTvLayout(!surface()?.classList.contains('st-tv')));
    $('stFullscreen')?.addEventListener('click', toggleFullscreen);
    surface()?.addEventListener('keydown', onSurfaceKeydown, true);
    surface()?.addEventListener('keydown', (event) => {
      if (event.key === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(event.target)
        && surface()?.classList.contains('st-tv')) { event.preventDefault(); void toggleFullscreen(); }
    });

    $('stTvModeBtn')?.addEventListener('click', () => { void openTvMode(); });
    $('stTvClose')?.addEventListener('click', () => { window.api?.youtubeTvClose?.(); });
    $('stTvFocus')?.addEventListener('click', () => { void openTvMode(); });
    $('stTvHandoff')?.addEventListener('click', () => openInTools(tvState.videoId));
    $('stTvNextAgent')?.addEventListener('click', () => {
      const id = nextAgentId();
      store.set(AGENT_KEY, id);
      renderAgentChoices();
      void openTvMode(id);
    });
    $('stTvAgent')?.addEventListener('change', (event) => {
      store.set(AGENT_KEY, event.target.value);
      if (tvState.open) void openTvMode(event.target.value);
    });
    $('stTvSignOut')?.addEventListener('click', async () => {
      const result = await window.api?.youtubeTvSignOut?.().catch(() => null);
      setStatus(result?.ok ? t('YouTube TV oturumu kapatıldı.') : t('YouTube TV oturumu kapatılamadı.'));
    });
    $('ytTvModeLogin')?.addEventListener('click', () => {
      if (typeof closeYoutubeLogin === 'function') closeYoutubeLogin();
      void openTvMode();
    });

    window.api?.onYoutubeTvEvent?.((_event, state) => renderTvState(state));
    const snapshot = await window.api?.youtubeTvState?.().catch(() => null);
    if (snapshot?.ok) {
      agents = Array.isArray(snapshot.userAgents) ? snapshot.userAgents : [];
      renderAgentChoices();
      renderTvState(snapshot.state);
    }
  }

  window.SmartTubeTv = { applyTvLayout, openTvMode, openInTools, watchUrlFor, isLeftmostCard, renderTvState };
  void init();
})();
