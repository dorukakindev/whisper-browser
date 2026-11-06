/* Shared browser-style study composition. The Sahne runtime supplies all state,
   commands and the original media slot; this view never creates a media owner. */
(function (root) {
  'use strict';
  function markup({ mode, caps, display, T, esc, icon }) {
    const button = (action, glyph, label, extra = '', cls = '') => `<button class="sh-btn bp-button ${cls}" type="button" data-a="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${icon(glyph)}<span>${label}</span></button>`;
    const modeButton = (value, label) => `<button type="button" role="tab" data-mode="${value}" aria-selected="${mode === value}">${label}</button>`;
    const modes = `${caps.cinema ? modeButton('cinema', T('Oynatıcı', 'Player')) : ''}${modeButton('podcast', T('Podcast', 'Podcast'))}${modeButton('study', T('Çift dilli', 'Bilingual'))}`;
    const modeIndex = caps.cinema ? ['cinema', 'podcast', 'study'].indexOf(mode) : mode === 'study' ? 1 : 0;
    const loop = caps.loop ? button('loop', 'loop', T('Cümle döngüsü', 'Loop sentence'), 'aria-pressed="false"') : '';
    const transportButton = (action, glyph, label, cls = '') => `<button class="sh-tbtn ${cls}" type="button" data-a="${action}" aria-label="${label}" title="${label}">${icon(glyph)}</button>`;
    return `<section class="sh sh-${mode === 'podcast' ? 'podcast' : 'study'} sh-browser-study" data-mode="${mode}" aria-label="${T('Medya ve transkript çalışma alanı', 'Media and transcript workspace')}">
      <header class="sh-top browser-study-toolbar">
        <div>${button('close', 'close', T('Kapat', 'Close'))}</div>
        <div class="sh-seg browser-study-modes" role="tablist" style="--n:${caps.cinema ? 3 : 2};--i:${modeIndex}" aria-label="${T('Medya görünümü', 'Media view')}">${modes}</div>
        <div class="sh-top-r">
          ${caps.dub ? button('dub', 'voice', T('Altyazıdan dublaj', 'Dub from subtitles'), 'aria-haspopup="dialog"') : ''}
          ${button('transcript', 'classic', T('Transkript', 'Transcript'), 'aria-expanded="false"', 'sh-transcript-toggle')}
          ${button('panel', 'tools', T('İşlemler', 'Tasks'), 'aria-pressed="false" aria-haspopup="dialog"')}
          <button class="sh-btn bp-button" data-a="sleep" type="button" aria-pressed="false" aria-label="${T('Uyku zamanlayıcısı', 'Sleep timer')}" title="${T('Uyku zamanlayıcısı', 'Sleep timer')}">${icon('moon')}<span data-r="sleeplbl">${T('Uyku', 'Sleep')}</span></button>
          ${button('advanced', 'classic', T('İleri araçlar', 'Advanced tools'))}
        </div>
      </header>
      <div class="sh-job" data-r="job" role="status" hidden><span class="sh-job-t" data-r="jobt"></span><span class="sh-job-bar" data-r="jobbar"><i></i></span><button class="sh-chip" data-a="jobcancel" type="button" hidden>${T('İptal', 'Cancel')}</button><button class="sh-chip" data-a="jobretry" type="button" hidden>${T('Yeniden dene', 'Retry')}</button></div>
      <div class="sh-main browser-study-layout">
        <section class="sh-theater browser-study-media" aria-label="${T('Etkin medya', 'Active media')}">
          <div class="sh-audio-summary browser-study-identity"><div class="sh-cover"><div class="sh-cover-art" data-r="cover"></div></div><div class="sh-meta"><span class="sh-eyebrow" data-r="eyebrow"></span><h1 class="sh-title" data-r="title"></h1><p class="sh-sub" data-r="sub"></p><div class="sh-chaps" data-r="chaps"></div></div></div>
          <div class="sh-screenwrap"><div class="sh-screen"><div class="slot" data-r="slot"></div></div></div>
          <div class="sh-subs" data-r="subs" aria-live="off"><span class="lang l" data-r="ls"></span><span class="lang r" data-r="lt"></span><div class="s" data-r="s"></div><div class="t" data-r="t"></div></div>
          <div class="sh-dock browser-study-transport">
            <div class="sh-wave" data-r="wave" role="slider" tabindex="0" aria-label="${T('Oynatma konumu', 'Playback position')}"><div class="bars" data-r="bars"></div><div class="bars fill" data-r="fill"></div><div class="head"></div><span class="tip" data-r="tip"></span></div>
            <div class="sh-times"><span data-r="t0">0:00</span><span data-r="t1">--:--</span></div>
            <div class="browser-study-playback"><div class="sh-transport">
              ${transportButton('prev', 'prev', T('Önceki cümle', 'Previous sentence'))}${transportButton('back', 'back', T('10 sn geri', 'Back 10 s'))}${transportButton('toggle', 'play', T('Oynat', 'Play'), 'play')}${transportButton('fwd', 'fwd', T('10 sn ileri', 'Forward 10 s'))}${transportButton('next', 'next', T('Sonraki cümle', 'Next sentence'))}${transportButton('replay', 'replay', T('Cümleyi tekrar dinle', 'Replay sentence'))}
            </div><div class="browser-study-playback-options"><button class="sh-chip bp-button" data-a="rate" type="button" aria-label="${T('Oynatma hızı', 'Playback speed')}">1×</button>${loop}${button('fullscreen', 'focus', T('Tam ekran', 'Fullscreen'))}</div></div>
            <label class="sh-volume">${icon('volume')}<span>${T('Ses', 'Volume')}</span><input class="sh-local-volume" type="range" min="0" max="1" step=".01" value="1" aria-label="${T('Ses düzeyi', 'Volume')}"><output>100%</output></label>
          </div>
        </section>
        <aside class="sh-cardsbox bp-panel browser-study-panel" data-bp-tab="subs" aria-label="${T('Transkript ve araçlar', 'Transcript and tools')}">
          <header class="bp-head"><div class="bp-title"><span class="bp-eyebrow">${mode === 'podcast' ? T('DİNLEME ALANI', 'LISTENING SPACE') : T('ÇİFT DİLLİ SAHNE', 'BILINGUAL STAGE')}</span><h2>${T('Transkript', 'Transcript')}</h2></div><button class="sh-btn bp-button browser-study-transcript-close" type="button" data-a="transcript" aria-label="${T('Transkripti kapat', 'Close transcript')}">${icon('close')}</button></header>
          <details class="browser-study sh-processing" data-r="processing" hidden><summary>${T('Transkripsiyon ve çeviri', 'Transcription and translation')}</summary><div class="sh-processing-body"><div class="sh-workbar browser-study-actions" data-r="workbar" hidden></div></div></details>
          <div class="bp-flow"><div class="bp-flow-head"><h3 class="bp-section-title">${T('CÜMLE AKIŞI', 'SENTENCE FLOW')}</h3><div class="browser-study-track-labels"><span class="sh-lang" data-r="lsb"></span><span class="sh-lang" data-r="ltb"></span></div></div>
            <label class="bp-search sh-search">${icon('search')}<input type="search" data-r="q" placeholder="${T('Cümlelerde ara', 'Search sentences')}" aria-label="${T('Cümlelerde ara', 'Search sentences')}"></label>
            <div class="sh-seg browser-study-display" data-r="disp" style="--n:3;--i:${['src', 'both', 'tr'].indexOf(display)}" role="group" aria-label="${T('Gösterilen metin', 'Shown text')}">${[['src', T('Kaynak', 'Source')], ['both', T('İkisi', 'Both')], ['tr', T('Çeviri', 'Translation')]].map(([value, label]) => `<button type="button" data-d="${value}" aria-pressed="${display === value}">${esc(label)}</button>`).join('')}</div>
            <button class="sh-follow bp-follow" data-a="follow" type="button" aria-pressed="true">${icon('down')}<span>${T('Takip açık', 'Follow on')}</span></button>
          </div>
          <div class="sh-cards-wrap"><div class="sh-cards bp-cue-list" data-r="scroll" tabindex="0" aria-label="${T('Bölüm transkripti', 'Episode transcript')}"></div></div>
          <footer class="bp-footer">
            ${button('assistant', 'chat', T('Asistana sor', 'Ask Assistant'))}
          </footer>
        </aside>
      </div>
      <aside class="sh-panel" data-r="panel" role="dialog" aria-label="${T('İşlemler', 'Tasks')}" hidden></aside>
      <div class="sh-toast" data-r="toast" role="status" aria-live="polite"></div>
    </section>`;
  }
  root.BrowserStudyView = Object.freeze({ markup });
})(typeof window !== 'undefined' ? window : globalThis);
