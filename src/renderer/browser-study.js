/* Presentation over the existing browser video, captions and job owners. No new player. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const layer = byId('playerLayer'), entry = byId('browserStudyOpen');
  if (!layer || !entry) return;
  const sessions = new Map();
  const copy = (tr, en) => window.UiLocale?.get?.() === 'en' ? en : tr;
  const write = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };
  let box, status, controls, secondPickerHost;
  const key = () => player.workspaceMode === 'browser' ? player.browserActiveTabId : null;
  const active = () => !!key() && sessions.has(key());
  function open() {
    if (!key()) return;
    closeBrowserToolbarMenus();
    if (!sessions.has(key())) sessions.set(key(), { view: player.viewMode });
    setViewMode('study');
    setPlayerSidebarCollapsed(false);
    setBrowserSideRailPref('panel');
    setSideTab('subs');
    setSubtitleMode('both', false);
    window.BrowserPanel?.refresh();
    refresh();
    const openedKey = key();
    requestAnimationFrame(() => {
      if (openedKey === key() && box?.isConnected && !box.hidden) (controls.querySelector('button:not(:disabled)') || box).focus({ preventScroll: true });
    });
  }
  function close() {
    const previous = sessions.get(key());
    sessions.delete(key());
    if (previous && player.viewMode === 'study') setViewMode(previous.view);
    refresh();
    entry.focus();
  }
  function create() {
    box = document.createElement('section'); box.className = 'browser-study'; box.dataset.uiUntranslated = ''; box.tabIndex = -1;
    box.setAttribute('aria-label', copy('Çift dilli çalışma', 'Bilingual study'));
    const head = document.createElement('div'); head.className = 'browser-study-head';
    const title = document.createElement('h3'); title.className = 'browser-study-title';
    const exit = document.createElement('button'); exit.type = 'button'; exit.className = 'bp-button browser-study-exit'; exit.onclick = close;
    head.append(title, exit); status = document.createElement('p'); status.className = 'browser-study-status'; status.setAttribute('role', 'status');
    controls = document.createElement('div'); controls.className = 'browser-study-actions';
    for (const [id, tr, en] of [
      ['select', 'Altyazı seç', 'Choose captions'],
      ['browserTrackTranslate', 'Yükle ve çevir', 'Load and translate'],
      ['both', 'İki dili göster', 'Show both languages'],
      ['browserTrackLoadPair', 'İki hazır izi yükle', 'Load two existing tracks'],
      ['browserWhisperTranslate', 'Whisper + çeviri', 'Whisper + translation'],
      ['browserLiveAsr', 'Canlı Whisper', 'Live Whisper']
    ]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'bp-button';
      button.dataset.studyAction = id; button.__copy = [tr, en];
      button.onclick = () => {
        if (!active()) return;
        if (id === 'both') { setSubtitleMode('both'); return; }
        if (id === 'select') {
          const picker = byId('playerSide')?.querySelector('.bp-track-picker');
          if (player.cues.length && picker) { picker.open = true; picker.querySelector('summary')?.focus(); }
          else { const target = byId('browserPanelTrackScroll')?.querySelector('button:not(:disabled)'); target?.scrollIntoView?.({block:'nearest'}); target?.focus(); }
          return;
        }
        // The current controls own provider validation, queue/range options and consent.
        const target = byId(id);
        if (id === 'browserTrackLoadPair' && target && !target.disabled) {
          const primary = byId('browserTrackSelect')?.value;
          const second = byId('browserTrackSelect2')?.value;
          if (!second || second === primary) {
            const binding = { tab:key(), mediaKey:player.mediaKey, generation:player.generation, primary };
            const options = (player.browserTracks || []).filter(track => track.id !== primary && !track.sourceMismatch).map(track => ({
              value:track.id, label:track.label || window.PlayerUiKit?.languageName?.(track.language, window.UiLocale?.get?.()) || copy('Altyazı izi', 'Caption track')
            }));
            if (!primary || !options.length || !window.PlayerUiKit?.select) return;
            const picker = window.PlayerUiKit.select({ label:copy('İkinci altyazı dilini seç', 'Choose the second caption language'), value:'', options,
              onChange:value => {
                if (!active() || key() !== binding.tab || player.mediaKey !== binding.mediaKey || player.generation !== binding.generation || byId('browserTrackSelect')?.value !== binding.primary) return;
                if (!player.browserTracks.some(track => track.id === value && !track.sourceMismatch) || target.disabled) return;
                byId('browserTrackSelect2').value = value;
                secondPickerHost.replaceChildren();
                target.click();
              } });
            secondPickerHost.replaceChildren(picker); picker.trigger?.click(); return;
          }
        }
        if (target && !target.disabled) target.click();
        else {
          refresh();
          if (typeof setBrowserSignal === 'function') setBrowserSignal(target?.title || copy('Bu kaynak için kullanılamıyor.', 'Unavailable for this source.'), false);
        }
      };
      controls.append(button);
    }
    secondPickerHost = document.createElement('div'); secondPickerHost.className = 'browser-study-second';
    box.append(head, status, controls, secondPickerHost);
    return box;
  }
  function refresh() {
    const on = active();
    if (layer.classList.contains('browser-study-mode') !== on) layer.classList.toggle('browser-study-mode', on);
    write(entry, copy('Çift dilli çalış', 'Bilingual study'));
    entry.title = copy('Web videosunu değiştirmeden kaynak ve çeviriyle çalış', 'Study source and translation without moving the web video');
    entry.setAttribute('aria-pressed', String(on));
    const title = byId('playerSide')?.querySelector('.bp-title h2');
    write(title, on ? copy('Çift dilli çalışma', 'Bilingual study') : copy('Video araçları', 'Video tools'));
    if (!on) { if (box) box.hidden = true; return; }
    const parent = byId('playerSide')?.querySelector('.bp-subtitles');
    if (!parent) return;
    if (!box) create();
    box.setAttribute('aria-label', copy('Çift dilli çalışma', 'Bilingual study'));
    if (box.parentNode !== parent) parent.prepend(box);
    box.hidden = false;
    write(box.querySelector('h3'), copy('Video burada, iki dil yanında.', 'One video, both languages.'));
    write(box.querySelector('.browser-study-exit'), copy('Çık', 'Exit'));
    box.querySelector('.browser-study-exit').title = copy('Çalışma görünümünden çık', 'Exit study view');
    const roles = browserSubtitleRoleCues();
    const paired = !!roles.source?.length && !!roles.translation?.length;
    const tracks = player.browserTracks || [];
    const message = paired ? copy('Kaynak ve çeviri hazır. Cümleye tıklayarak atla; bir sözcük seçerek incele.', 'Source and translation ready. Click a sentence to seek; select a word to inspect.')
      : roles.source?.length ? copy('Kaynak hazır. Çeviri için bir altyazı izi seçip Yükle ve çevir’i kullan.', 'Source ready. Choose a caption track, then load and translate.')
      : tracks.length ? copy('Sayfada altyazı bulundu. İzi seçip yükle veya çevir; video aynı sayfada oynar.', 'Captions found. Choose and load or translate a track; video stays on this page.')
      : !player.browserMediaSeen ? copy('YouTube veya başka bir sitede video aç. Erişilebilir altyazılar burada görünür.', 'Open a video on YouTube or another site. Accessible captions appear here.')
      : copy('Erişilebilir altyazı henüz bulunamadı. YouTube’da Whisper + çeviri; diğer sitelerde onaylı Canlı Whisper kullanılabilir. Korunan veya erişilemeyen ses desteklenmeyebilir.', 'No accessible captions found yet. Use Whisper + translation on YouTube or consented Live Whisper elsewhere. Protected or inaccessible audio may be unsupported.');
    write(status, message);
    for (const button of controls.children) {
      const id = button.dataset.studyAction, target = byId(id);
      write(button, copy(...button.__copy));
      if (id === 'browserLiveAsr' && target?.getAttribute('aria-pressed') === 'true') write(button, copy('Canlı Whisper’ı durdur', 'Stop Live Whisper'));
      if (id === 'browserLiveAsr') button.setAttribute('aria-pressed', target?.getAttribute('aria-pressed') || 'false');
      const available = id === 'select' ? tracks.length > 0 : id === 'both' ? paired
        : id === 'browserTrackTranslate' ? tracks.length > 0 && !!target && !target.disabled
        : id === 'browserTrackLoadPair' ? tracks.length > 1 && !!target && !target.disabled
        : id === 'browserLiveAsr' ? !!player.browserMediaSeen && !!target && !target.disabled
        : !!target && !target.disabled;
      button.disabled = !available;
      button.title = available ? (target?.title || button.textContent)
        : id === 'both' ? copy('Önce kaynak ve çeviri yükleyin.', 'Load source and translation first.')
        : id === 'select' ? copy('Bu sayfada erişilebilir altyazı henüz bulunmadı.', 'No accessible captions found on this page yet.')
        : target?.title || copy('Bu kaynak veya geçerli iş durumu için kullanılamıyor.', 'Unavailable for this source or current job state.');
    }
    const primary = controls.querySelector('[data-study-action="browserTrackTranslate"]');
    primary.classList.toggle('browser-study-primary', !primary.disabled && !paired);
  }
  entry.addEventListener('click', open);
  new MutationObserver(refresh).observe(layer, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('browser-panel-layout', refresh);
  document.addEventListener('ui-locale-change', refresh);
  window.BrowserStudy = Object.freeze({ open, close, refresh, isActive: active });
  refresh();
})();
