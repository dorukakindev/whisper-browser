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
    const transportButton = (action, glyph, label, cls = '') => `<button class="sh-tbtn ${cls}${['back','fwd'].includes(action)?' sh-skip':''}" type="button" data-a="${action}" aria-label="${label}" title="${label}">${icon(glyph)}${['back','fwd'].includes(action)?'<small class="sh-skip-amount" aria-hidden="true">10</small>':''}</button>`;
    return `<section class="sh sh-${mode === 'podcast' ? 'podcast' : 'study'} sh-browser-study" data-mode="${mode}" aria-label="${T('Medya ve transkript çalışma alanı', 'Media and transcript workspace')}">
      <header class="sh-top browser-study-toolbar">
        <div>${button('close', 'close', T('Kapat', 'Close'))}</div>
        <div class="sh-seg browser-study-modes" role="tablist" style="--n:${caps.cinema ? 3 : 2};--i:${modeIndex}" aria-label="${T('Medya görünümü', 'Media view')}">${modes}</div>
        <div class="sh-top-r">
          ${caps.queue ? button('listeningQueue', 'list', T('Dinleme kuyruğu', 'Listening queue'), 'aria-haspopup="dialog"') : ''}
          ${caps.dub ? button('dub', 'voice', T('Altyazıdan dublaj', 'Dub from subtitles'), 'aria-haspopup="dialog"') : ''}
          ${button('transcript', 'classic', T('Transkript', 'Transcript'), 'aria-expanded="false"', 'sh-transcript-toggle')}
          ${button('panel', 'tools', T('İşlemler', 'Tasks'), 'aria-pressed="false" aria-haspopup="dialog"')}
          <label class="browser-study-sleep">${icon('moon')}<select data-r="sleep" aria-label="${T('Uyku zamanlayıcısı','Sleep timer')}" title="${T('Uyku zamanlayıcısı','Sleep timer')}"></select></label>
          ${button('advanced', 'classic', T('İleri araçlar', 'Advanced tools'))}
        </div>
      </header>
      <div class="sh-job" data-r="job" hidden><span class="sh-job-t" data-r="jobt" role="status"></span><span class="sh-job-bar" data-r="jobbar" role="progressbar" aria-label="${T('İşlem ilerlemesi', 'Task progress')}"><i></i></span><span class="sh-job-percent" data-r="jobpercent" aria-hidden="true" hidden></span><button class="sh-chip" data-a="jobcancel" type="button" hidden>${T('İptal', 'Cancel')}</button><button class="sh-chip" data-a="jobretry" type="button" hidden>${T('Yeniden dene', 'Retry')}</button></div>
      <div class="sh-main browser-study-layout">
        <section class="sh-theater browser-study-media" aria-label="${T('Etkin medya', 'Active media')}">
          <div class="sh-audio-summary browser-study-identity"><div class="sh-cover"><div class="sh-cover-art" data-r="cover"></div></div><div class="sh-meta"><span class="sh-eyebrow" data-r="eyebrow"></span><h1 class="sh-title" data-r="title"></h1><p class="sh-program" data-r="program" dir="auto" hidden></p><p class="sh-sub" data-r="sub" dir="auto"></p><div class="sh-meta-next" data-r="upnext" hidden></div></div></div>
          <div class="sh-screenwrap"><div class="sh-screen"><div class="slot" data-r="slot"></div></div></div>
          <div class="sh-live-speech" data-r="liveSpeech" hidden><span>${T('Şu an konuşulan','Now speaking')}</span><p data-r="liveSource" dir="auto"></p><p data-r="liveTranslation" dir="auto"></p></div>
          <div class="sh-subs" data-r="subs" aria-live="off"><span class="lang l" data-r="ls"></span><span class="lang r" data-r="lt"></span><div class="s" data-r="s"></div><div class="t" data-r="t"></div></div>
          <div class="sh-dock browser-study-transport">
            <button class="sh-chapter-entry" data-a="chapters" type="button" hidden aria-pressed="false"><span>${T('Bölüm başlıkları','Chapters')}</span><strong class="sh-chapter-current"></strong>${icon('chev')}</button>
            <div class="sh-wave" data-r="wave" role="slider" tabindex="0" aria-label="${T('Oynatma konumu', 'Playback position')}"><div class="bars" data-r="bars"></div><div class="bars fill" data-r="fill"></div><span class="sh-loop-range" data-r="loopRange" aria-hidden="true" hidden></span><div class="head"></div><span class="tip" data-r="tip"></span></div>
            <div class="sh-times"><button type="button" data-a="jump" aria-expanded="false" title="${T('Zamana git','Go to time')}"><span data-r="t0">0:00</span></button><span data-r="t1">--:--</span></div>
            <form class="sh-jump-form" data-r="jumpForm" hidden>
              <label>${T('Zamana git','Go to time')}<input data-r="jumpTime" type="text" inputmode="text" placeholder="12:34" autocomplete="off" spellcheck="false"></label>
              <button class="sh-btn" type="submit">${T('Git','Go')}</button>
              <button class="sh-btn" type="button" data-a="jump">${T('Vazgeç','Cancel')}</button>
              <p data-r="jumpError" role="status" hidden></p>
            </form>
            <div class="browser-study-playback"><div class="sh-transport">
              <span class="sh-time-nav" data-group-label="${T('Oynatma','Playback')}" role="group" aria-label="${T('Oynatma','Playback')}">${transportButton('back', 'back', T('10 sn geri', 'Back 10 s'))}${transportButton('toggle', 'play', T('Oynat', 'Play'), 'play')}${transportButton('fwd', 'fwd', T('10 sn ileri', 'Forward 10 s'))}</span>
              <span class="sh-sentence-nav" data-group-label="${T('Cümle','Sentence')}" role="group" aria-label="${T('Cümle gezinmesi','Sentence navigation')}">${transportButton('prev', 'prev', T('Önceki cümle', 'Previous sentence'))}${transportButton('replay', 'replay', T('Cümleyi tekrar dinle', 'Replay sentence'))}${transportButton('next', 'next', T('Sonraki cümle', 'Next sentence'))}</span>
            </div><div class="browser-study-playback-options"><label class="browser-study-rate"><select data-r="rate" aria-label="${T('Oynatma hızı', 'Playback speed')}"></select>${icon('chev')}</label><span class="sh-rate-state" data-r="rateState" role="status" hidden>${T('Hız değişiyor…','Changing speed…')}</span>${loop}${button('fullscreen', 'focus', T('Tam ekran', 'Fullscreen'))}</div></div>
            <div class="sh-volume"><button class="sh-volume-icon" type="button" data-a="mute" data-r="volumeIcon" aria-label="${T('Sesi kapat','Mute')}" aria-pressed="false">${icon('volume')}</button><input class="sh-local-volume" type="range" min="0" max="1" step=".01" value="1" aria-label="${T('Ses düzeyi', 'Volume')}"><output>100%</output></div>
            ${mode === 'study' ? button('readCurrent', 'classic', T('Cümlenin tamamı', 'Full sentence'), 'disabled', 'sh-read-current') : ''}
            <p class="sh-transport-hint" data-r="transportHint" role="status" hidden></p>
          </div>
        </section>
        <aside class="sh-cardsbox bp-panel browser-study-panel" data-bp-tab="subs" aria-label="${T('Transkript ve araçlar', 'Transcript and tools')}">
          <header class="bp-head"><div class="bp-title"><span class="bp-eyebrow">${mode === 'podcast' ? T('DİNLEME ALANI', 'LISTENING SPACE') : T('ÇİFT DİLLİ SAHNE', 'BILINGUAL STAGE')}</span><h2 data-r="readingTitle">${T('Transkript', 'Transcript')}</h2></div><button class="sh-btn bp-button browser-study-transcript-close" type="button" data-a="transcript" aria-label="${T('Okuma panelini kapat', 'Close reading panel')}">${icon('close')}</button></header>
          <div class="sh-reading-nav" data-r="readingNav" role="group" aria-label="${T('Okuma görünümü','Reading view')}" hidden>
            <button type="button" data-a="reading" aria-pressed="true">${T('Transkript','Transcript')}</button>
            <button type="button" data-a="chapters" aria-pressed="false">${T('Başlıklar','Chapters')}</button>
          </div>
          <details class="browser-study sh-processing" data-r="processing" hidden><summary><span>${T('Transkripsiyon ve çeviri', 'Transcription and translation')}</span><small data-r="processingState" role="status"></small></summary><div class="sh-processing-body"><div class="sh-workbar browser-study-actions" data-r="workbar" hidden></div></div></details>
          <div class="bp-flow"><div class="bp-flow-head"><h3 class="bp-section-title">${T('CÜMLE AKIŞI', 'SENTENCE FLOW')}</h3><div class="browser-study-track-labels"><span class="sh-lang" data-r="lsb"></span><span class="sh-lang" data-r="ltb"></span></div></div>
            <div class="bp-search sh-search" role="search">${icon('search')}<input type="search" data-r="q" placeholder="${T('Cümlelerde ara', 'Search sentences')}" aria-label="${T('Cümlelerde ara', 'Search sentences')}" title="${T('Enter ile ilk eşleşmeye odaklan','Press Enter to focus the first match')}"><button type="button" data-a="clearSearch" data-r="clearSearch" aria-label="${T('Aramayı temizle','Clear search')}" hidden>${T('Temizle','Clear')}</button></div>
            <div class="sh-seg browser-study-display" data-r="disp" style="--n:3;--i:${['src', 'both', 'tr'].indexOf(display)}" role="group" aria-label="${T('Gösterilen altyazı ve transkript dili', 'Subtitle and transcript language')}">${[['src', T('Kaynak', 'Source')], ['both', T('İkisi', 'Both')], ['tr', T('Çeviri', 'Translation')]].map(([value, label]) => `<button type="button" data-d="${value}" aria-pressed="${display === value}">${esc(label)}</button>`).join('')}</div>
            <button class="sh-follow bp-follow" data-a="follow" type="button" aria-pressed="true">${icon('down')}<span>${T('Takip açık', 'Follow on')}</span></button>
            <div class="sh-search-navigation" data-r="searchNav" hidden>
              <p class="sh-search-count" data-r="searchCount" role="status" hidden></p>
              <button type="button" data-a="matchPrev" aria-label="${T('Önceki eşleşme','Previous match')}" title="${T('Önceki eşleşme','Previous match')}">↑</button>
              <button type="button" data-a="matchNext" aria-label="${T('Sonraki eşleşme','Next match')}" title="${T('Sonraki eşleşme','Next match')}">↓</button>
            </div>
            <section class="sh-assistant-selection" data-r="assistantSelection" hidden aria-label="${T('Asistan için seçili pasaj','Selected passage for assistant')}"><div><small>${T('Asistan için seçili pasaj','Selected passage for assistant')}</small><p data-r="assistantExcerpt" dir="auto"></p></div><button class="sh-btn" type="button" data-a="clearAssistantSelection" aria-label="${T('Asistan pasaj seçimini kaldır','Remove assistant passage selection')}">${T('Kaldır','Remove')}</button></section>
          </div>
          <div class="sh-cards-wrap"><p class="sh-search-empty" data-r="searchEmpty" hidden><strong></strong><span></span></p><div class="sh-cards bp-cue-list" data-r="scroll" tabindex="0" aria-label="${T('Bölüm transkripti', 'Episode transcript')}"></div></div>
          <div class="sh-chapter-tools" data-r="chapterTools" hidden>
            <input type="search" data-r="chapterSearch" aria-label="${T('Başlıklarda ara','Search chapters')}" placeholder="${T('Başlıklarda ara','Search chapters')}">
            <button class="sh-btn" type="button" data-a="currentChapter">${T('Şu anki başlık','Current chapter')}</button>
            <p data-r="chapterCount" role="status" hidden></p>
          </div>
          <div class="sh-chaps" data-r="chaps" tabindex="0" role="region" hidden></div>
          <footer class="bp-footer">
            ${button('assistant', 'chat', T('Asistana sor', 'Ask Assistant'))}
            ${button('focus', 'focus', T('Okuma odağı','Reading focus'), 'aria-pressed="false"')}
            <label class="sh-reading-size"><span>${T('Metin','Text')}</span><select data-r="readingSize" aria-label="${T('Transkript yazı boyutu','Transcript text size')}"><option value="small">${T('Küçük','Small')}</option><option value="normal" selected>${T('Normal','Default')}</option><option value="large">${T('Büyük','Large')}</option></select></label>
            <details class="sh-key-guide"><summary>${T('Kısayollar','Shortcuts')}</summary>
              <dl><div><dt><kbd>/</kbd></dt><dd>${T('Transkriptte ara','Search transcript')}</dd></div><div><dt><kbd>J</kbd> <kbd>K</kbd></dt><dd>${T('Önceki / sonraki cümle','Previous / next sentence')}</dd></div><div><dt><kbd>${T('Boşluk','Space')}</kbd></dt><dd>${T('Oynat / duraklat','Play / pause')}</dd></div><div><dt><kbd>F</kbd></dt><dd>${T('Okuma odağı','Reading focus')}</dd></div></dl>
            </details>
          </footer>
        </aside>
      </div>
      <aside class="sh-panel" data-r="panel" role="dialog" aria-label="${T('İşlemler', 'Tasks')}" hidden></aside>
      <div class="sh-toast" data-r="toast" role="status" aria-live="polite"></div>
    </section>`;
  }
  root.BrowserStudyView = Object.freeze({ markup });
})(typeof window !== 'undefined' ? window : globalThis);
