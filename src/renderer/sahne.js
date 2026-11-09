/* SAHNE motoru v2 — podcast sahnesi ve çift dilli çalışma sahnesi.
   Arayüz tek yerde: maketlerde sahte oynatıcıyla, uygulamada mevcut ortak oynatma arayüzünün adaptörüyle çalışır.
   adapter = { identity(), info(), state(), cmd(type,value), panel?(), slot?(), releaseSlot?(), caps }
   state().rows[i] = { id, start, end, timed, src, trs:[metin], unc:[metin], words:[{s,e,t0,t1}]|null }
   Gerçek olmayan bilgi göstermez: dil kodu yoksa rozet yok, kelime doldurma yalnız gerçek kelime zamanı varsa. */
(function (root) {
  'use strict';
  const P = {
    voice: 'M4 9v6M8 5v14M12 8v8M16 3v18M20 9v6',
    play: 'M8 5.2v13.6a.6.6 0 0 0 .92.5l10.6-6.8a.6.6 0 0 0 0-1L8.92 4.7A.6.6 0 0 0 8 5.2Z', pause: 'M6.5 5h4v14h-4z|M13.5 5h4v14h-4z',
    prev: 'M6.5 5.5v13|M18 6.2v11.6a.5.5 0 0 1-.8.4l-8-5.8a.5.5 0 0 1 0-.8l8-5.8a.5.5 0 0 1 .8.4Z', next: 'M17.5 5.5v13|M6 6.2v11.6a.5.5 0 0 0 .8.4l8-5.8a.5.5 0 0 0 0-.8l-8-5.8a.5.5 0 0 0-.8.4Z',
    back: 'M11 5 5 10l6 5|M5 10h8a6 6 0 0 1 0 12h-2', fwd: 'M13 5l6 5-6 5|M19 10h-8a6 6 0 0 0 0 12h2', replay: 'M4 12a8 8 0 1 0 2.6-5.9|M4 4v5h5',
    loop: 'M17 2l4 4-4 4|M3 11V9a3 3 0 0 1 3-3h15|M7 22l-4-4 4-4|M21 13v2a3 3 0 0 1-3 3H3', moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5Z',
    focus: 'M4 9V5h4|M20 9V5h-4|M4 15v4h4|M20 15v4h-4', close: 'M6 6l12 12|M18 6 6 18', copy: 'M9 9h10v10H9z|M5 15V5h10', star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8Z',
    classic: 'M4 5h16v14H4z|M15 5v14', chat: 'M20 11a8 8 0 0 1-8 8H4l1.8-4A8 8 0 1 1 20 11Z|M9 9h6|M9 13h4', search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z|m15.5 15.5 4 4', swap: 'M7 7h13l-3-3|M17 17H4l3 3', chev: 'm15 5-7 7 7 7',
    volume: 'M11 5 6 9H3v6h3l5 4V5Z|M15 8a6 6 0 0 1 0 8|M18 5a10 10 0 0 1 0 14', mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 6 0Z|M6 11a6 6 0 0 0 12 0|M12 17v4', tools: 'M4 7h10|M18 7h2|M4 17h2|M10 17h10|M14 4v6|M6 14v6', down: 'M12 5v14|m6 13 6 6 6-6'
  };
  P.volumeZero = 'M11 5 6 9H3v6h3l5 4V5Z|m15 10 5 5|m20 10-5 5';
  P.clock = 'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0Z|M12 7v5l3 2';
  const FILLED = new Set(['play', 'pause']);
  const ic = (n) => `<svg class="i${FILLED.has(n) ? ' f' : ''}" viewBox="0 0 24 24" aria-hidden="true">${P[n].split('|').map((d) => `<path d="${d}"/>`).join('')}</svg>`;
  const fmt = (v) => { const s = Math.max(0, Math.floor((Number(v) || 0)+.001)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  function captionStamp(time, precise) {
    const position = Math.max(0, Math.round(time * 1000));
    const milliseconds = position % 1000;
    return fmt(Math.floor(position / 1000)) + (precise && milliseconds
      ? T(',', '.') + String(milliseconds).padStart(3, '0').replace(/0+$/, '') : '');
  }
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const T = (tr, en) => ((root.UiLocale && root.UiLocale.get && root.UiLocale.get() === 'en') || root.__SAHNE_LANG === 'en') ? en : tr;
  const RATES = [1, 1.25, 1.5, 1.75, 2, .75], SLEEP = [0, 15, 30, 60], BARS = 84;
  const rgb2hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
  function artSVG(title, tint) {
    let h = 0; for (const c of String(title)) h = (h * 31 + c.charCodeAt(0)) >>> 0; const r = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
    const [hu] = rgb2hsl(tint || [213, 163, 92]); const c1 = `hsl(${hu} 55% 22%)`, c2 = `hsl(${hu} 62% 52%)`, c3 = `hsl(${(hu + 28) % 360} 85% 74%)`;
    let sil = '', x = 0; while (x < 400) { const w = 14 + r() * 40, ht = 30 + r() * 130; sil += `<rect x="${x.toFixed(1)}" y="${(300 - ht).toFixed(1)}" width="${w.toFixed(1)}" height="${(100 + ht).toFixed(1)}" fill="#07080a" opacity=".93"/>`; x += w * .96; }
    return `<svg class="art" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="g${h}" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset=".6" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient><radialGradient id="s${h}"><stop offset="0" stop-color="${c3}" stop-opacity=".95"/><stop offset="1" stop-color="${c3}" stop-opacity="0"/></radialGradient></defs><rect width="400" height="400" fill="url(#g${h})"/><circle cx="${140 + r() * 120}" cy="${120 + r() * 50}" r="130" fill="url(#s${h})"/><circle cx="${150 + r() * 100}" cy="${130 + r() * 40}" r="26" fill="${c3}" opacity=".9"/>${sil}</svg>`;
  }
  const lang = (code, fallback) => code ? `<b>${esc(String(code).slice(0, 3).toUpperCase())}</b>` : '';

  class Sahne {
    constructor(host, adapter, opts = {}) {
      this.host = host; this.a = adapter; this.o = Object.assign({ mode: 'podcast', intro: true }, opts); this.caps = adapter.caps || {};
      const prefs = opts.prefs || {};
      this.readingSize = ['small','large'].includes(prefs.readingSize) ? prefs.readingSize : 'normal';
      const reading = prefs.reading?.identity && prefs.reading.identity === adapter.identity?.() ? prefs.reading : null;
      const panelWork=reading?.panelWork;
      this.panelWork=Object.prototype.toString.call(panelWork?.pending)==='[object Set]'&&Array.isArray(panelWork?.notices)?panelWork:{pending:new Set(),notices:[]};
      this.panelPending=this.panelWork.pending;
      if(Object.prototype.toString.call(this.panelWork.statusActions)!=='[object Map]')this.panelWork.statusActions=new Map();
      this.volumeWork=this.panelWork.volume??={pending:false,next:null,requested:null};
      Object.defineProperty(this.volumeWork,'owner',{value:this,writable:true,configurable:true});
      Object.defineProperties(this,{volumePending:{get:()=>this.volumeWork.pending,set:value=>this.volumeWork.pending=value},nextVolume:{get:()=>this.volumeWork.next,set:value=>this.volumeWork.next=value}});
      this.loopWork=this.panelWork.sentenceLoop??={pending:false};
      Object.defineProperty(this.loopWork,'owner',{value:this,writable:true,configurable:true});
      Object.defineProperty(this,'loopPending',{get:()=>this.loopWork.pending});
      this.jumpWork=this.panelWork.exactSeek??={pending:false};
      Object.defineProperty(this.jumpWork,'owner',{value:this,writable:true,configurable:true});
      Object.defineProperty(this,'jumpPending',{get:()=>this.jumpWork.pending});
      this.sleepWork=this.panelWork.sleep??={revision:0,pending:null,notice:null};
      Object.defineProperty(this.sleepWork,'owner',{value:this,writable:true,configurable:true});
      this.lastAudibleVolume = reading?.lastAudibleVolume;
      this.s = {
        focus: !!prefs.focus, disp: prefs.disp || 'both', follow: reading?.follow ?? true,
        sleep: reading?.sleep || 0, sleepAt: reading?.sleepAt || 0, transcript: !!reading?.transcript,
        loop: false, loopRow: -1, idx: -2, key: '', panel: false, psig: ''
      };
      this.lines = []; this.rows = []; this.dead = false; this.id0 = undefined;
      this.build();
      if(reading?.processingScope&&this.scopeBox){
        const scope=reading.processingScope;
        for(const name of ['start','end'])if(typeof scope[name]==='string')this.scopeBox.querySelector(`[data-scope-time="${name}"]`).value=scope[name];
        this.scopeBox.querySelector(`[data-scope="${scope.mode==='range'?'range':'full'}"]`).click();
        this.scopeBox.querySelector('.sh-scope-fields').hidden=scope.mode!=='range'||!scope.open;
      }
      const search = this.q('[data-r=q]');
      if (reading && search) search.value = reading.query;
      const chapters = this.q('[data-r=chapterSearch]');
      if (reading && chapters) chapters.value = reading.chapterQuery || '';
      this.readingScroll = reading && !reading.follow ? reading : null;
      this.tick();
      if(reading?.searchMatch&&reading.searchMatch.rev===this.st?.rev&&search?.value){
        const match=reading.searchMatch,index=this.rows.findIndex(row=>row.id===match.id&&row.trackId===match.trackId&&!!row.standaloneTranslation===!!match.standaloneTranslation);
        if(index>=0&&!this.lines[index].hidden){this.matchLine=this.lines[index];this.paintMatches();}
      }
      if(reading?.searchAnchor&&reading.searchAnchor.rev===this.st?.rev)this.searchReadingAnchor={...reading.searchAnchor};
      if(reading?.assistantChoice){this.assistantChoice={...reading.assistantChoice,identity:this.id0};if(!this.assistantPassage())this.assistantChoice=null;}
      if(reading?.noteDraft?.identity===this.id0){this.noteDraft=reading.noteDraft;if(this.noteDraft.open)this.renderNote(this.noteDraft);}
      if (reading?.chapters && !this.q('.sh-chapter-entry')?.hidden) {
        this.showReading(true);
        this.transcriptReading={scrollTop:reading.scrollTop,viewportAnchor:reading.viewportAnchor};
        this.transcriptScroll=reading.scrollTop;
      }
      this.paintAssistantSelection();
      this.timer = setInterval(() => this.tick(), 120); this.raf = 0;
    }
    el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
    q(sel) { return this.root.querySelector(sel); }
    prefs(preserveReading = false) {
      if(preserveReading&&this.s.note)this.captureNoteView(this.s.note);
      const { focus, disp, follow, sleep, sleepAt } = this.s;
      const prefs = { focus, disp, readingSize: this.readingSize };
      if (preserveReading && this.id0) {
        const match=this.matchLine&&!this.matchLine.hidden?this.rows[Number(this.matchLine.dataset.i)]:null;
        prefs.reading = {
          identity: this.id0, follow, sleep, sleepAt, lastAudibleVolume: this.lastAudibleVolume, panelWork:this.panelWork,
          assistantChoice:this.assistantPassage()?{...this.assistantChoice}:null,noteDraft:this.noteDraft||null,
          transcript: !!this.s.transcript, chapters: this.root.classList.contains('sh-chapters-open'),
          query: this.q('[data-r=q]')?.value || '',
          searchAnchor:this.searchReadingAnchor?{...this.searchReadingAnchor}:null,
          searchMatch:match?{rev:this.st?.rev,id:match.id,trackId:match.trackId,standaloneTranslation:!!match.standaloneTranslation}:null,
          processingScope:this.scopeBox?{mode:this.scopeMode,start:this.scopeBox.querySelector('[data-scope-time=start]').value,end:this.scopeBox.querySelector('[data-scope-time=end]').value,open:!this.scopeBox.querySelector('.sh-scope-fields').hidden}:null,
          chapterQuery: this.q('[data-r=chapterSearch]')?.value || '',
          viewportAnchor: this.readingScroll?.viewportAnchor ?? (this.root.classList.contains('sh-chapters-open')
            ? this.transcriptReading?.viewportAnchor : this.readingPosition().viewportAnchor),
          scrollTop: this.readingScroll?.scrollTop ?? (this.root.classList.contains('sh-chapters-open')
            ? this.transcriptScroll : this.q('[data-r=scroll]')?.scrollTop) ?? 0
        };
      }
      return prefs;
    }
    buildStudy() {
      this.root = this.el(root.BrowserStudyView.markup({ mode: this.o.mode, caps: this.caps, display: this.s.disp, T, esc, icon: ic }));
      this.root.classList.toggle('sh-audio', !!this.a.info().audio);
      this.root.classList.toggle('sh-web-video', !!this.a.info().webVideo);
      this.root.classList.toggle('sh-web-source', !!this.a.info().webSource);
      this.host.append(this.root);
      const job = this.q('[data-r=job]'), statusRow = this.el('<div class="sh-status-row"></div>');
      job.before(statusRow);
      statusRow.append(job, this.recoveryMarkup());
      if(this.a.processing)this.buildScope();
      const slot = this.q('[data-r=slot]'), media = this.a.slot?.(this.o.mode);
      if (slot && media) slot.append(media);
      this.root.append(this.el(`<aside class="sh-word-card" hidden role="dialog" aria-label="${T('Sözcük ve bağlam','Word and context')}"></aside>`));
      this.root.append(this.el(`<aside class="sh-word-card sh-note-card" hidden role="dialog" aria-label="${T('Cümle ve not','Sentence and note')}"></aside>`));
      this.applyDisp(); this.bind();
    }
    build() {
      if (this.o.mode !== 'cinema') { this.buildStudy(); return; }
      const m = this.o.mode, study = m !== 'podcast', cinema=m==='cinema';
      const root = this.root = this.el(`<section class="sh sh-${study ? 'study' : 'podcast'} ${cinema?'sh-local':''} ${this.o.intro ? 'sh-enter' : ''}" aria-label="${cinema?T('Yerel sinema oynatıcısı','Local cinema player'):study ? T('Çift dilli çalışma sahnesi', 'Bilingual study stage') : T('Podcast sahnesi', 'Podcast stage')}" data-mode="${m}">
        <div class="sh-bg" aria-hidden="true"><div class="sh-aurora"></div><div class="sh-aurora b"></div><div class="sh-grain"></div><div class="sh-vignette"></div></div>
        <header class="sh-top">
          <div><button class="sh-btn" data-a="close" type="button">${ic('close')}<span>${T('Kapat', 'Close')}</span></button></div>
          <div class="sh-seg" role="tablist" style="--n:${this.caps.cinema?3:2};--i:${this.caps.cinema?['cinema','podcast','study'].indexOf(m):(study?1:0)}" aria-label="${T('Sahne türü', 'Stage type')}">${this.caps.cinema?`<button role="tab" type="button" data-mode="cinema" aria-selected="${cinema}">${ic('play')}${T('Oynatıcı','Player')}</button>`:''}<button role="tab" type="button" data-mode="podcast" aria-selected="${m==='podcast'}">${ic('mic')}${T('Podcast', 'Podcast')}</button><button role="tab" type="button" data-mode="study" ${this.caps.study===false?`disabled title="${T('Ses kaynağında iki dil alttaki dil seçicisinden okunur.','Read both languages with the language selector below.')}"`:""} aria-selected="${m==='study'}">${ic('classic')}${T('Çift dilli', 'Bilingual')}</button></div>
          <div class="sh-top-r"><button class="sh-btn" data-a="panel" type="button" aria-pressed="false" aria-haspopup="dialog">${ic('tools')}<span>${T('İşlemler', 'Tasks')}</span></button><button class="sh-btn" data-a="sleep" type="button" aria-pressed="false">${ic('moon')}<span data-r="sleeplbl">${T('Uyku', 'Sleep')}</span></button><button class="sh-btn" data-a="classic" type="button" title="${T('Klasik panele dön', 'Back to classic panel')}">${ic('classic')}<span>${T('Klasik panel', 'Classic panel')}</span></button></div>
        </header>
        <div class="sh-job" data-r="job" role="status" hidden><span class="sh-job-t" data-r="jobt"></span><span class="sh-job-bar" data-r="jobbar"><i></i></span><button class="sh-chip" data-a="jobcancel" type="button" hidden>${T('İptal', 'Cancel')}</button><button class="sh-chip" data-a="jobretry" type="button" hidden>${T('Yeniden dene', 'Retry')}</button></div>
        <div class="sh-workbar" data-r="workbar" hidden></div><div class="sh-main"></div>
        <aside class="sh-panel" data-r="panel" role="dialog" aria-label="${T('İşlemler', 'Tasks')}" hidden></aside>
        <div class="sh-toast" data-r="toast" role="status" aria-live="polite"></div>
        <div class="sh-kbd" aria-hidden="true"><span><kbd>${T('Boşluk', 'Space')}</kbd>${T('oynat', 'play')}</span><span><kbd>J</kbd><kbd>K</kbd>${T('cümle', 'sentence')}</span>${this.caps.loop ? `<span><kbd>L</kbd>${T('döngü', 'loop')}</span>` : ''}<span><kbd>F</kbd>${T('odak', 'focus')}</span></div>
        ${this.o.intro ? '<div class="sh-bars" aria-hidden="true"></div>' : ''}</section>`);
      this.q('[data-r=job]').after(this.recoveryMarkup());
      const main = this.q('.sh-main');
      const seg = () => `<div class="sh-seg" data-r="disp" style="--n:3;--i:${['src', 'both', 'tr'].indexOf(this.s.disp)}" role="group" aria-label="${T('Gösterilen metin', 'Shown text')}"><button type="button" data-d="src" aria-selected="${this.s.disp === 'src'}">${T('Kaynak', 'Source')}</button><button type="button" data-d="both" aria-selected="${this.s.disp === 'both'}">${T('İkisi', 'Both')}</button><button type="button" data-d="tr" aria-selected="${this.s.disp === 'tr'}">${T('Çeviri', 'Translation')}</button></div>`;
      const wave = () => `<div class="sh-wave" data-r="wave" role="slider" tabindex="0" aria-label="${T('Bölüm konumu', 'Episode position')}" title="${T('Çubuklar ses dalgası değil; transkriptteki konuşma yoğunluğudur.', 'Bars are not an audio waveform; they show speech density from the transcript.')}"><div class="bars" data-r="bars"></div><div class="bars fill" data-r="fill"></div><div class="head"></div><span class="tip" data-r="tip"></span></div>`;
      const loopChip = this.caps.loop ? `<button class="sh-chip" data-a="loop" type="button" aria-pressed="false">${ic('loop')}${T('Cümle döngüsü', 'Loop sentence')}</button>` : '';
      const follow = `<button class="sh-follow" data-a="follow" type="button" hidden>${ic('down')}${T('Konuşmaya dön', 'Back to speech')}</button>`;
      if (study) {
        main.append(this.el(`<div class="sh-theater"><div class="sh-audio-summary"><div class="sh-cover"><div class="sh-cover-art" data-r="cover"></div></div><div class="sh-meta"><span class="sh-eyebrow" data-r="eyebrow"></span><h1 class="sh-title" data-r="title"></h1><p class="sh-sub" data-r="sub"></p><div class="sh-meta-next" data-r="upnext" hidden></div><div data-r="chaps" class="sh-chaps"></div></div></div><div class="sh-screenwrap"><div class="sh-ambi" aria-hidden="true"></div><div class="sh-screen"><div class="slot" data-r="slot"></div><div class="frame"></div></div></div>
          <div class="sh-subs" data-r="subs" role="status" aria-live="off"><span class="lang l" data-r="ls"></span><span class="lang r" data-r="lt"></span><div class="s" data-r="s"></div><div class="t" data-r="t"></div></div>
          <div class="sh-dock"><div class="group"><button class="sh-tbtn" data-a="prev" type="button" aria-label="${T('Önceki cümle', 'Previous sentence')}">${ic('prev')}</button><button class="sh-tbtn play" data-a="toggle" type="button" aria-label="${T('Oynat', 'Play')}">${ic('play')}</button><button class="sh-tbtn" data-a="next" type="button" aria-label="${T('Sonraki cümle', 'Next sentence')}">${ic('next')}</button><button class="sh-tbtn" data-a="replay" type="button" aria-label="${T('Cümleyi tekrar dinle', 'Replay sentence')}">${ic('replay')}</button></div>${wave()}<div class="group"><button class="sh-chip" data-a="rate" type="button">1×</button>${loopChip}</div></div></div>`));
        main.append(this.el(`<aside class="sh-cardsbox"><div class="sh-cards-h"><span class="sh-lang" data-r="lsb"></span>${ic('swap')}<span class="sh-lang" data-r="ltb"></span><label class="sh-search">${ic('search')}<input data-r="q" placeholder="${T('Cümlelerde ara', 'Search sentences')}" aria-label="${T('Cümlelerde ara', 'Search sentences')}"></label>${seg()}</div><div class="sh-cards-wrap"><div class="sh-cards" data-r="scroll"></div>${follow}</div></aside>`));
      }
      this.host.append(root);
      if(study){const toggle=this.el(`<button class="sh-btn sh-transcript-toggle" type="button" data-a="transcript" aria-expanded="false">${ic('classic')}${T('Transkript','Transcript')}</button>`);this.q('.sh-top-r').prepend(toggle);}
      if (this.o.intro) requestAnimationFrame(() => requestAnimationFrame(() => { root.classList.add('go'); setTimeout(() => { root.classList.remove('sh-enter', 'go'); root.querySelector('.sh-bars')?.remove(); }, 1900); }));
      const slot = this.q('[data-r=slot]'), el = this.a.slot?.(m); if (slot && el) { slot.textContent = ''; slot.append(el); const mini = this.q('[data-r=mini]'); if (mini) mini.hidden = false; }
      if(cinema){
        const title=this.el(`<div class="sh-cinema-meta"><h1></h1><p></p></div>`);this.q('.sh-top>div').append(title);
        this.q('.sh-main').append(this.el('<div class="sh-up-next"></div>'));
        this.q('.sh-dock').append(this.el(`<div class="sh-local-extra"><span class="sh-local-clock"></span><button class="sh-chip" type="button" data-a="display">${T('İki dil','Both languages')}</button><label>${T('Ses','Volume')}<input class="sh-local-volume" type="range" min="0" max="1" step=".01" value="1" aria-label="${T('Ses düzeyi','Volume')}"></label></div>`));
        this.q('.sh-dock').prepend(this.el('<div class="sh-cinema-chapters"></div>'));
        this.q('.sh-top-r').append(this.el(`<button class="sh-btn" type="button" data-a="fullscreen" title="${T('Tam ekran','Fullscreen')}">${ic('focus')}</button>`));
      }
      this.root.append(this.el(`<aside class="sh-word-card" hidden role="dialog" aria-label="${T('Sözcük ve bağlam','Word and context')}"></aside>`));
      this.root.append(this.el(`<aside class="sh-word-card sh-note-card" hidden role="dialog" aria-label="${T('Cümle ve not','Sentence and note')}"></aside>`));
      this.applyDisp(); this.bind();
    }
    toast(msg) { const t = this.q('[data-r=toast]'); t.textContent = msg; t.classList.add('on'); clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('on'), 3200); }
    run(type, v, revision=this.st?.rev) {
      const copyVersion=type==='copy'?this.panelWork.copyVersion:undefined;
      const identity=this.a.identity?.()??'',current=()=>!this.dead&&(this.a.identity?.()??'')===identity&&(this.id0===undefined||this.id0===identity)&&(type!=='copy'||copyVersion===this.panelWork.copyVersion);
      const stale=()=>({ok:false,code:'stale-source'});if(!current())return Promise.resolve(stale());
      const seeking=['seek','seekBy','seekCue','seekTranslation','prevCue','nextCue','replay'].includes(type);
      const actionKey=seeking?'seek':type==='loop'?'loop':null;
      const receipt=actionKey?{identity,owner:undefined,pending:true}:null;
      if(receipt)this.panelWork.statusActions.set(actionKey,receipt);
      const report=message=>{
        if(!receipt){if(current())this.toast(message);return;}
        if(this.panelWork.statusActions.get(actionKey)!==receipt)return;
        receipt.pending=false;
        if(current()){this.toast(message);this.panelWork.statusActions.delete(actionKey);}
        else if(this.dead)receipt.error=message;
        else this.panelWork.statusActions.delete(actionKey);
      };
      const finish=()=>{if(receipt){receipt.pending=false;if(!receipt.error&&this.panelWork.statusActions.get(actionKey)===receipt)this.panelWork.statusActions.delete(actionKey);}};
      const failed = error => {
        const result={ok:false,code:'command-failed',message:error?.message||T('Komut uygulanamadı.','Command could not be applied.')};
        report(result.message);finish();return current()?result:stale();
      };
      let r;try{r=this.a.cmd(type,v,revision);}catch(error){return Promise.resolve(failed(error));}
      return Promise.resolve(r).then(res=>{
        if(res?.ok===false)report(res.code==='stale-source'||res.code==='source-changed'?T('Kaynak değişti; komut uygulanmadı.','The source changed; command not applied.'):res.code==='unsupported'?T('Bu kaynakta bu komut desteklenmiyor.','This source does not support that command.'):(res.message||T('Komut uygulanamadı.','Command could not be applied.')));
        finish();return current()?res:stale();
      }).catch(failed);
    }

    bind() {
      const r = this.root, a = this.a;
      r.addEventListener('error', event => {
        if (!this.dead&&event.target.matches?.('[data-r=cover] img')) event.target.replaceWith(this.coverInitials());
      }, true);
      const jumpForm = this.q('[data-r=jumpForm]');
      this.q('[data-r=jumpTime]')?.addEventListener('input', () => {
        this.jumpEditVersion=(this.jumpEditVersion||0)+1;
        this.q('[data-r=jumpTime]').removeAttribute('aria-invalid');
        this.q('[data-r=jumpError]').hidden=true;
      });
      jumpForm?.addEventListener('submit', event => {
        event.preventDefault();
        void this.seekTypedTime();
      });
      this.fullscreenChanged = () => this.paintFullscreen();
      document.addEventListener('fullscreenchange', this.fullscreenChanged);
      const chapterSearch = this.q('[data-r=chapterSearch]');
      chapterSearch?.addEventListener('input', () => this.filterChapters());
      const size = this.q('[data-r=readingSize]');
      if (size) {
        size.value = this.readingSize;
        r.dataset.readingSize = size.value;
        size.onchange = () => {
          const reading=!this.s.follow&&!this.root.classList.contains('sh-chapters-open')?this.readingPosition():null;
          this.readingSize = size.value;
          r.dataset.readingSize = size.value;
          if(reading)this.applyReadingPosition(reading);
          this.followAfterLayout();
        };
      }
      const sleep = this.q('[data-r=sleep]');
      if (sleep) {
        sleep.append(...SLEEP.map(minutes => new Option(minutes ? `${minutes} ${T('dk','min')}` : T('Uyku','Sleep'), minutes)));
        sleep.onchange = () => this.setSleep(Number(sleep.value));
      }
      const rate = this.q('[data-r=rate]');
      if (rate) {
        const format = new Intl.NumberFormat(T('tr', 'en'), { maximumFractionDigits: 3 });
        const option = value => new Option(format.format(value) + '×', value);
        rate.append(...[...RATES].sort((a,b) => a-b).map(option));
        rate.onchange = async () => {
          const value = Number(rate.value);
          if (rate.disabled || this.a.state()?.canRate===false || rate.hasAttribute('aria-busy') || !RATES.includes(value)) {
            this.syncRate();
            return;
          }
          await this.runStatusAction(rate,()=>this.a.cmd('rate',value,this.st?.rev),'rate');
        };
        this.rateOption = option;
      }
      r.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a],[role="tab"][data-mode],[data-d],.sh-chap,[data-i],[data-act],[data-task]'); if (!b || !r.contains(b)) return;
        if (b.dataset.task) { this.startTask(b.dataset.task); return; }
        if (b.dataset.act) { e.stopPropagation(); this.act(b.dataset.act, +b.closest('[data-i]').dataset.i,b); return; }
        if (b.dataset.i !== undefined && !b.dataset.a) { const row = this.rows[+b.dataset.i]; if (this.o.mode === 'cinema' && row?.timed && this.canSeek) this.run('seekCue', +b.dataset.i); return; }
        if (b.classList.contains('sh-chap')) { if(this.canSeek&&b.dataset.t!==undefined)this.run('seek', Number(b.dataset.t)); return; }
        if (b.dataset.mode) { if (b.dataset.mode !== this.o.mode) this.o.onMode?.(b.dataset.mode, this.prefs(true)); return; }
        if (b.dataset.d) {
          cancelAnimationFrame(this.readingLayoutRaf);
          this.s.disp = b.dataset.d; this.applyDisp(); this.filterRows();
          this.matchLine?.scrollIntoView?.({block:'nearest'});
          const display = this.displayMode();
          if (this.a.info().webVideo) this.lastDisplay = display;
          this.run('display', display);
          if (this.o.mode !== 'cinema') this.tick();
          if(this.s.follow)this.scrollToActive(true);
          return;
        }
        switch (b.dataset.a) {
          case 'jump': this.toggleJump(); break;
          case 'mute': {
            const input = this.q('.sh-local-volume');
            if (!input || !Number.isFinite(this.st?.volume)) break;
            const selected=Number(input.value);
            if(selected>0)this.lastAudibleVolume=selected;
            input.value = selected > 0 ? 0 : (this.lastAudibleVolume || 1);
            input.oninput();
            break;
          }
          case 'matchPrev': this.moveMatch(-1); break;
          case 'matchNext': this.moveMatch(1); break;
          case 'currentChapter': {
            if (!this.q('[data-r=chaps] [aria-current=true]')) break;
            chapterSearch.value = '';
            this.filterChapters();
            this.q('[data-r=chaps] [aria-current=true]').focus();
            break;
          }
          case 'cueSeek': {
            const index = Number(b.closest('[data-i]').dataset.i);
            if (this.canSeek && this.rows[index]?.timed) this.run(this.usesTranslationTime(this.rows[index]) ? 'seekTranslation' : 'seekCue', index);
            break;
          }
          case 'translationSeek': {
            const row = Number(b.closest('[data-i]').dataset.i);
            if (this.canSeek) this.run('seekTranslation', { row, part: Number(b.dataset.part) });
            break;
          }
          case 'clearSearch': {
            const query=this.q('[data-r=q]');if(query){query.value='';this.filterRows(true);query.focus({preventScroll:true});}break;
          }
          case 'close': this.o.onClose?.(); break; case 'classic': this.o.onClassic?.(); break;
          case 'fullscreen':this.run('fullscreen');break;
          case 'clearAssistantSelection':this.clearAssistantSelection();break;
          case 'assistant':this.captureAssistantPassage();if(this.assistantSelectionError){this.toast(this.assistantSelectionError);break;}this.run('assistant');break;
          case 'dub':this.run('dub');break;
          case 'noteClose':this.closeNote();break;
          case 'noteSave':void this.saveNote();break;
          case 'noteDiscard':this.closeNote();this.noteDraft=null;this.paint();break;
          case 'noteRebind':{const draft=this.s.note,row=this.noteRowIndex(draft);if(draft&&!draft.pending&&row>=0){const text=draft.text;this.closeNote();this.noteDraft=null;this.openNote(row);this.s.note.text=text;this.q('[data-note-text]').value=text;}break;}
          case 'noteSeek':if(this.s.note&&!this.s.note.stale && this.canSeek)this.run('seekCue',this.s.note.row,this.s.note.rev);break;
          case 'advanced':this.run('advanced');break;
          case 'display':{const modes=['both','src','tr'];this.s.disp=modes[(modes.indexOf(this.s.disp)+1)%3];this.applyDisp();break;}
          case 'queue':this.run('openQueued',b.dataset.queueKey ? {index:Number(b.dataset.index),queueKey:b.dataset.queueKey} : Number(b.dataset.index));break;
          case 'wordClose':this.closeWord();break;
          case 'wordLookup': case 'wordSave': void this.runWordAction(b); break;
          case 'toggle': this.run('toggle'); break; case 'prev': this.navigateSentence('prevCue'); break; case 'next': this.navigateSentence('nextCue'); break; case 'replay': this.navigateSentence('replay'); break;
          case 'back': this.run('seekBy', -10); break; case 'fwd': this.run('seekBy', 10); break;
          case 'rate': { const cur = Number(a.state().rate) || 1, i = RATES.indexOf(cur); this.run('rate', RATES[(i + 1) % RATES.length]); break; }
          case 'loop': this.toggleLoop(); break;
          case 'focus': this.s.focus = !this.s.focus; this.paint(); break;
          case 'sleep': this.setSleep(SLEEP[(SLEEP.indexOf(this.s.sleep) + 1) % SLEEP.length]); break;
          case 'follow': {
            this.followBeforeFullSentence = undefined;
            if (this.o.mode !== 'cinema' && this.s.follow) { this.s.follow = false; this.paint(); break; }
            const query = this.q('[data-r=q]'); if (query) query.value = '';
            this.filterRows();
            this.s.follow = true;
            this.tick();
            this.scrollToActive(true);
            break;
          }
          case 'transcript':
            if (b.classList.contains('sh-transcript-toggle')) this.showReading(false);
            this.toggleTranscript(b);
            break;
          case 'readCurrent': this.readCurrentSentence(b); break;
          case 'retryCaptions': void this.runStatusAction(b, () => this.run('retryCaptions')); break;
          case 'reading': this.showReading(false); break;
          case 'chapters': {
            this.showReading(true);
            if (!b.classList.contains('sh-chapter-entry')) break;
            if (this.usesTranscriptDrawer() && !this.s.transcript) this.toggleTranscript(b);
            else this.chapterFocusTarget().focus();
            break;
          }
          case 'panel': this.togglePanel(b); break;
          case 'jobcancel': void this.runStatusAction(b, this.a.panel?.().job?.cancel); break;
          case 'jobretry': void this.runStatusAction(b, this.a.panel?.().job?.retry); break;
          case 'playbackRetry': void this.runStatusAction(b, this.a.recovery?.()?.run); break;
        }
      });
      const wave = this.q('[data-r=wave]');
      const ratio = (e) => { const b = wave.getBoundingClientRect(); return b.width ? Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)) : 0; };
      const preview = (e) => {
        const position = ratio(e), duration = Number(this.st?.duration) || 0;
        if (this.drag) this.dragR = position;
        const time = position * duration;
        const row = this.rows[this.cueAt(time)];
        const tracks = this.st?.captionTracks;
        const translation = tracks ? this.liveCueAt(tracks[1], time)?.text : row?.trs.join(' ');
        const display = this.displayMode();
        const excerpt = display === 'tr' ? translation : display === 'src' ? row?.src : row?.src || translation;
        const tip = this.q('[data-r=tip]');
        tip.textContent = duration ? [fmt(time), excerpt].filter(Boolean).join(' · ') : '';
        const percent = position * 100;
        tip.style.setProperty('--tx', (this.o.mode === 'cinema' ? Math.max(12, Math.min(88, percent)) : percent) + '%');
      };
      wave.addEventListener('pointerdown', (e) => {
        const identity = a.identity?.();
        if (e.button !== 0 || this.drag || !this.canSeek || (identity ?? '') !== this.id0 || e.target.closest?.('.sh-chap')) return;
        wave.setPointerCapture(e.pointerId);
        this.drag = { pointer: e.pointerId, identity };
        wave.classList.add('drag');
        preview(e);
        this.tick();
      });
      wave.addEventListener('pointermove', (e) => {
        if (!this.drag || this.drag.pointer === e.pointerId) preview(e);
      });
      const end = (e) => {
        const drag = this.drag;
        if (!drag || drag.pointer !== e.pointerId) return;
        this.drag = null;
        wave.classList.remove('drag');
        const latest = a.state(), duration = Number(latest.duration) || 0;
        if (e.type === 'pointerup' && duration > 0 && latest.canSeek !== false && drag.identity === a.identity?.()) {
          this.run('seek', ratio(e) * duration);
        }
        this.tick();
      };
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) wave.addEventListener(event, end);
      wave.addEventListener('keydown', (e) => {
        if (!this.canSeek) return;
        const delta = { ArrowRight: 5, ArrowLeft: -5, ArrowUp: 5, ArrowDown: -5 }[e.key];
        if (delta) this.run('seekBy', e.shiftKey ? delta * 6 : delta);
        else if (e.key === 'Home' || e.key === 'End') this.run('seek', e.key === 'Home' ? 0 : Number(a.state().duration));
        else return;
        e.preventDefault();
      });
      const sc = this.q('[data-r=scroll]');
      const manual = () => {
        cancelAnimationFrame(this.readingLayoutRaf);
        if (!this.s.follow) return;
        this.s.follow = false;
        cancelAnimationFrame(this.followRaf);
        sc.scrollTo({ top: sc.scrollTop, behavior: 'instant' });
        this.paint();
      };
      sc.addEventListener('wheel', manual, { passive: true }); sc.addEventListener('touchmove', manual, { passive: true });
      // Keyboard users can inspect a sentence without pressing a scroll key.
      // Treat focus entering the transcript as manual reading, just like wheel/touch,
      // so the follow control never claims it is following while focus suppresses it.
      if(this.o.mode!=='cinema')sc.addEventListener('focusin', manual);
      sc.addEventListener('pointerdown', (e) => {
        // Selecting a passage is manual reading too. Do not preventDefault:
        // the browser must retain its native text selection and context menu.
        if (e.target === sc || (e.button === 0 && e.target.closest?.('.src, .tr') && !e.target.closest('button, a, input, textarea, select'))) manual();
      });
      sc.addEventListener('keydown', (e) => {
        if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(e.key)) manual();
        if (!['cueSeek', 'translationSeek'].includes(e.target.dataset.a) || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
        const step = e.key === 'ArrowUp' ? -1 : 1;
        const controls = this.lines.flatMap(line => line.hidden ? [] : this.sentenceSeekControls(line));
        const target = controls[controls.indexOf(e.target) + step];
        if (target && controls.includes(e.target)) {
          e.preventDefault();
          target.focus();
        }
      });
      const cover = this.q('.sh-cover'); if (cover) { cover.addEventListener('pointermove', (e) => { const b = cover.getBoundingClientRect(), x = (e.clientX - b.left) / b.width - .5, y = (e.clientY - b.top) / b.height - .5; cover.style.setProperty('--ry', (x * 14) + 'deg'); cover.style.setProperty('--rx', (-y * 14) + 'deg'); }); cover.addEventListener('pointerleave', () => { cover.style.setProperty('--ry', '0deg'); cover.style.setProperty('--rx', '0deg'); }); }
      const q = this.q('[data-r=q]');
      if (q) {
        q.addEventListener('input', () => { this.s.follow = false; this.filterRows(true); this.paint(); });
        q.addEventListener('keydown', event => {
          if (this.o.mode === 'cinema' || event.key !== 'Enter' || event.isComposing || !q.value.trim()) return;
          if (this.moveMatch(event.shiftKey ? -1 : 1, true)) event.preventDefault();
        });
      }
      this.keys = e => {
        if(e.defaultPrevented||e.isComposing||document.querySelector('dialog[open]')||!r.isConnected||e.ctrlKey||e.metaKey||e.altKey)return;
        const within=r.contains(e.target);
        if(!within&&e.target!==document.body)return;
        const target=e.target,k=e.key.toLowerCase();
        // Let the nested picker own its keyboard flow before the Stage capture handler.
        if(target.closest?.('.mk-popup[popover]'))return;
        if(k==='escape'){
          if(target.closest?.('select'))return;
          if ((target === q || target === chapterSearch) && target.value) {
            target.value = '';
            if (target === q) this.filterRows(true);
            else this.filterChapters();
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
          // The open interval editor owns Escape from its trigger as well as its fields.
          if(target.closest?.('.sh-scope-fields') || (target.closest?.('.sh-scope') && this.scopeBox?.querySelector('.sh-scope-fields')?.hidden===false))return;
          const shortcuts = target.closest?.('.sh-key-guide[open]');
          if (shortcuts) {
            shortcuts.open = false;
            shortcuts.querySelector('summary').focus();
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
          if(jumpForm && !jumpForm.hidden) this.toggleJump();
          else if(this.s.note)this.closeNote();
          else if(this.s.word)this.closeWord();
          else if(this.s.panel)this.togglePanel();
          else if(this.s.transcript && (this.o.mode === 'cinema' || this.usesTranscriptDrawer()))this.toggleTranscript();
          else if(document.fullscreenElement)void this.run('fullscreen');
          else this.o.onClose?.();
        }else{
          if(target.isContentEditable||target.closest?.('input,textarea,select,button,a,summary,[data-i],.sh-note-excerpt,.sh-word-body,[contenteditable]:not([contenteditable=false]),[role=button]'))return;
          if (e.repeat && [' ','l','f'].includes(k)) return;
          if(k===' ')this.run('toggle');
          else if(k==='j'){if(!this.q('[data-a=prev]')?.disabled)this.navigateSentence('prevCue');}
          else if(k==='k'){if(!this.q('[data-a=next]')?.disabled)this.navigateSentence('nextCue');}
          else if(k==='l'&&this.caps.loop){if(!this.q('[data-a=loop]')?.disabled)this.toggleLoop();}
          else if(k==='f'){this.s.focus=!this.s.focus;this.paint();}
          else if(k==='/' && q && !q.closest('.bp-flow[hidden]')){
            this.showReading(false);
            if(this.usesTranscriptDrawer() && !this.s.transcript) this.toggleTranscript(this.q('.sh-transcript-toggle'));
            q.focus();
          }
          else return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      r.addEventListener('keydown',event=>{
        const tab=event.target.closest?.('[role=tab][data-mode]');
        if(event.defaultPrevented||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        const tabs=[...tab.closest('[role=tablist]').querySelectorAll('button:not(:disabled)')];
        const i=tabs.indexOf(tab);
        const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;
        event.preventDefault();event.stopPropagation();
        tabs[next]?.focus();
        tabs[next]?.click();
      });
      document.addEventListener('keydown', this.keys, true);
      this.followResize = () => {
        this.paint();
        this.followAfterLayout();
      };
      root.addEventListener('resize', this.followResize);
      r.addEventListener('dblclick',e=>{if(!(this.caps.cinema||this.caps.word)||!e.target.closest('.src,[data-r=s]'))return;const word=String(root.getSelection?.()||'').trim();const row=e.target.closest('[data-i]');if(word)this.openWord(row?Number(row.dataset.i):this.cur,word);});
      this.reveal=()=>{r.classList.remove('controls-idle');clearTimeout(this.idleTimer);if(this.o.mode==='cinema'&&!this.st?.paused&&!this.a.info().native)this.idleTimer=setTimeout(()=>{if(!this.dead&&!this.s.panel&&!this.s.transcript&&!this.s.word&&!r.contains(document.activeElement))r.classList.add('controls-idle');},2400);};
      r.addEventListener('pointermove',this.reveal);r.addEventListener('pointerdown',this.reveal);r.addEventListener('focusin',this.reveal);
      const volume = this.q('.sh-local-volume');
      if (volume) volume.oninput = () => {
        if(this.dead||!volume.isConnected||(this.a.identity?.()??'')!==this.id0)return;
        this.volumeWork.owner=this;
        const value = Number(volume.value);
        if(value>0)this.lastAudibleVolume=value;
        this.paintVolume(volume, value);
        this.volumeWork.requested=value;
        this.nextVolume = value;
        if (!this.volumePending) void this.flushVolume();
      };
    }
    buildScope(){
      const bar=this.q('[data-r=workbar]');if(!bar||!root.PodcastTaskScope)return;
      this.scopeMode='full';this.scopeBox=this.el(`<section class="sh-scope"><div class="sh-scope-head"><span>${T('Whisper kapsamı','Whisper scope')}</span><div class="sh-seg" role="group" aria-label="${T('İşleme kapsamı','Processing scope')}"><button type="button" data-scope="full" aria-pressed="true" aria-selected="true">${T('Bölümün tamamı','Whole episode')}</button><button type="button" data-scope="range" aria-pressed="false" aria-selected="false">${T('Seçili aralık','Selected interval')}</button></div></div><div class="sh-scope-fields" hidden><label>${T('Başlangıç','Start')}<input data-scope-time="start" inputmode="decimal" placeholder="0:30" aria-label="${T('Aralık başlangıcı','Interval start')}"></label><label>${T('Bitiş','End')}<input data-scope-time="end" inputmode="decimal" placeholder="0:42" aria-label="${T('Aralık bitişi','Interval end')}"></label><button type="button" class="sh-btn" data-scope-apply>${T('Aralığı uygula','Apply interval')}</button></div><p class="sh-scope-summary" aria-live="polite"></p></section>`);
      bar.before(this.scopeBox);
      const now=Math.max(0,Math.floor(this.a.state()?.time||0)),duration=Number(this.a.processing()?.duration);
      this.scopeBox.querySelector('[data-scope-time=start]').value=root.PodcastTaskScope.stamp(now);
      this.scopeBox.querySelector('[data-scope-time=end]').value=root.PodcastTaskScope.stamp(duration>now?Math.min(duration,now+60):now+60);
      for(const button of this.scopeBox.querySelectorAll('[data-scope]'))button.onclick=()=>{this.scopeMode=button.dataset.scope;this.scopeBox.querySelector('.sh-scope-fields').hidden=this.scopeMode!=='range';this.scopeBox.querySelector('.sh-seg').style.setProperty('--i',this.scopeMode==='range'?1:0);for(const b of this.scopeBox.querySelectorAll('[data-scope]')){b.setAttribute('aria-pressed',String(b===button));b.setAttribute('aria-selected',String(b===button));}this.updateScope();};
      this.scopeBox.querySelector('[data-scope-apply]').onclick=()=>{try{this.scopeRange();this.scopeBox.querySelector('.sh-scope-fields').hidden=true;this.scopeBox.querySelector('[data-scope=range]').focus({preventScroll:true});}catch{this.updateScope();this.scopeBox.querySelector('[aria-invalid=true]')?.focus({preventScroll:true});}};
      this.scopeBox.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing&&event.target.matches('input')){event.preventDefault();event.stopPropagation();this.scopeBox.querySelector('[data-scope-apply]').click();return;}if(event.key==='Escape'&&!this.scopeBox.querySelector('.sh-scope-fields').hidden){event.preventDefault();event.stopPropagation();this.scopeBox.querySelector('.sh-scope-fields').hidden=true;this.scopeBox.querySelector('[data-scope=range]').focus();}};
      this.root.addEventListener('pointerdown',event=>{if(!this.scopeBox.contains(event.target))this.scopeBox.querySelector('.sh-scope-fields').hidden=true;});
      for(const input of this.scopeBox.querySelectorAll('input'))input.oninput=()=>this.updateScope();this.updateScope();
    }
    scopeRange(){return !this.scopeBox||this.scopeMode!=='range'?null:root.PodcastTaskScope.normalize({start:this.scopeBox.querySelector('[data-scope-time=start]').value,end:this.scopeBox.querySelector('[data-scope-time=end]').value},this.a.processing()?.duration);}
    updateScope(){
      if(!this.scopeBox)return;const text=this.scopeBox.querySelector('.sh-scope-summary');
      let message,invalid=false;
      try{const range=this.scopeRange(),duration=Number(this.a.processing()?.duration);message=range?`${root.PodcastTaskScope.stamp(range.start)} – ${root.PodcastTaskScope.stamp(range.end)} · ${T('İşlenecek süre','Processing duration')}: ${root.PodcastTaskScope.stamp(range.end-range.start)}`:duration>0?`${T('İşlenecek süre','Processing duration')}: ${root.PodcastTaskScope.stamp(duration)}`:T('Bölümün tamamı · süre bilinmiyor','Whole episode · duration unknown');}
      catch{message=T('Geçerli başlangıç ve bitiş girin. Bölümün tamamı başlatılmayacak.','Enter valid start and end times. The whole episode will not start.');invalid=true;}
      if(text.textContent!==message)text.textContent=message;
      if(text.dataset.invalid!==String(invalid))text.dataset.invalid=String(invalid);
      const start=this.scopeBox.querySelector('[data-scope-time=start]'),end=this.scopeBox.querySelector('[data-scope-time=end]');
      const startTime=root.PodcastTaskScope.seconds(start.value);
      for(const input of [start,end]){
        const bad=invalid&&(input===start?!Number.isFinite(startTime):Number.isFinite(startTime));
        if(bad){if(input.getAttribute('aria-invalid')!=='true')input.setAttribute('aria-invalid','true');}
        else if(input.hasAttribute('aria-invalid'))input.removeAttribute('aria-invalid');
      }
    }
    taskButtons() {
      return (this.a.actions?.() || []).map(action => `<button class="sh-btn${action.primary ? ' sh-primary' : ''}" type="button" data-task="${esc(action.id)}" ${action.disabled || this.taskPending ? 'disabled' : ''} aria-busy="${!!this.taskPending&&this.pendingTaskId===action.id}" title="${esc(action.hint || action.label)}">${ic(action.id === 'retry-translation'?'replay':action.id === 'translate'||action.id==='translate-existing' ? 'swap' : action.id==='whisper-scope'?'clock':'mic')}<span>${esc(action.label)}${this.taskPending&&this.pendingTaskId===action.id?' · '+T('Hazırlanıyor…','Preparing…'):''}</span></button>`).join('');
    }
    drawTasks() {
      const bar = this.q('[data-r=workbar]'), html = this.taskButtons();
      if(this.scopeBox)for(const control of this.scopeBox.querySelectorAll('input,button'))if(control.disabled!==!!this.taskPending)control.disabled=!!this.taskPending;
      const processing = this.q('[data-r=processing]');
      if (processing) {
        processing.hidden = !html;
        const state=this.q('[data-r=processingState]');
        if(state){
          const label=this.taskPending?T('Hazırlanıyor…','Preparing…'):this.st?.untimed?T('Okuma metni hazır','Reading text ready'):this.st?.rows.length?T('Zamanlı metin hazır','Timed text ready'):this.captionTrackCount?T('Altyazı izi mevcut','Caption track available'):T('Transkript yok','No transcript');
          if(state.textContent!==label)state.textContent=label;
          state.dataset.state=this.taskPending?'busy':this.st?.rows.length?'ready':'empty';
        }
        if (html && !this.processingInitialized && this.st) {
          processing.open = !this.st.rows.length && !this.captionTrackCount;
          this.processingStartedEmpty = processing.open;
          this.processingInitialized = true;
        }
        if (this.processingStartedEmpty && (this.st?.rows.length || this.captionTrackCount)) {
          this.processingStartedEmpty = false;
          if (!processing.contains(document.activeElement)) processing.open = false;
        }
      }
      if (html !== this.taskHTML) {
        const focused = bar.contains(document.activeElement) ? document.activeElement.dataset.task : null;
        const summary = processing?.querySelector('summary');
        if (focused && this.taskPending) this.taskReturnFocus = focused;
        const returning = !this.taskPending && document.activeElement === summary ? this.taskReturnFocus : null;
        this.taskHTML = html;
        bar.innerHTML = html;
        bar.hidden = !html;
        if (!this.taskPending) this.taskReturnFocus = null;
        if (focused || returning) {
          const next = [...bar.querySelectorAll('button:not(:disabled)')].find(button => button.dataset.task === (focused || returning));
          (next || (html && summary) || this.q('.sh-top [data-a=panel]'))?.focus({preventScroll:true});
        }
      }
    }
    async startTask(id) {
      if (this.taskPending) return;
      const identity = this.a.identity?.();
      if ((identity ?? '') !== this.id0) return;
      const action = (this.a.actions?.() || []).find(item => item.id === id);
      if (!action || action.disabled) return;
      if (id === 'whisper-scope') return action.run();
      this.taskPending = true;this.pendingTaskId=id; this.drawTasks();
      try {
        const range = ['transcribe','transcribe-translate'].includes(id) ? this.scopeRange() : null;
        if(this.scopeBox)this.scopeBox.querySelector('.sh-scope-fields').hidden=true;
        const result = await action.run({range});
        if (result?.ok === false) throw new Error(result.message || T('İşlem başlatılamadı.', 'Could not start task.'));
        if (!this.dead && identity === this.a.identity?.() && result?.queued) {
          this.toast(T('İşlem kuyruğa eklendi. İlerlemeyi İşlemler’den izleyebilirsiniz.', 'Task queued. Follow progress in Tasks.'));
        }
      }
      catch (error) { if (!this.dead && identity === this.a.identity?.()) this.toast(error?.message || T('İşlem başlatılamadı.', 'Could not start task.')); }
      finally { this.taskPending = false;this.pendingTaskId=''; if (!this.dead) this.drawTasks(); }
    }
    toggleLoop() {
      if (!this.caps.loop) return; const on = !this.s.loop, idx = this.playbackIndex ?? this.cur;
      if (on && !(idx >= 0 && this.rows[idx]?.timed)) { this.toast(T('Döngü için önce zamanlı bir cümle çalmalı.', 'Play a timed sentence first to loop it.')); return; }
      void this.setSentenceLoop(on, idx);
    }
    async setSentenceLoop(on, row, jump = false) {
      if (this.loopPending) return;
      const cue=this.rows[row];
      if(on&&(!cue?.timed||!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.end<=cue.start||cue.end<=0||cue.start>=this.st?.duration))return;
      const revision = this.st?.rev, identity = this.a.identity?.();
      const work=this.loopWork;work.pending=true;this.paintLoopPending();
      try {
        const result = await this.run('loop', on ? { on, row } : { on }, revision);
        if (!result?.ok || this.dead || identity !== this.a.identity?.() || revision !== this.a.state().rev) return;
        this.s.loop = on;
        this.s.loopRow = on ? row : -1;
        this.paint();
        if (on && jump) await this.run('seekCue', row, revision);
      } finally {
        work.pending=false;const owner=work.owner;if(owner&&!owner.dead)owner.tick();
      }
    }
    paintLoopPending() {
      const busy=!!this.loopPending;
      const focused=document.activeElement;
      if(busy&&this.root.contains(focused)&&focused.matches?.('[data-a=loop],[data-act=loop]')){
        const target=focused.closest('[data-i]')||this.q('[data-a=toggle]');
        if(target?.matches('[data-i]'))target.tabIndex=-1;
        target?.focus({preventScroll:true});
      }
      for(const button of this.root.querySelectorAll('[data-a=loop],[data-act=loop]')){
        const index=Number(button.closest('[data-i]')?.dataset.i),cue=this.rows[index];
        if(button.dataset.act==='loop')button.disabled=busy||!this.canSeek||!cue?.timed||!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.end<=cue.start||cue.end<=0||cue.start>=this.st?.duration;
        else if(busy)button.disabled=true;
        if(busy)button.setAttribute('aria-busy','true');else button.removeAttribute('aria-busy');
        if(busy&&button.dataset.a==='loop')button.lastChild.textContent=' '+T('Döngü ayarlanıyor…','Updating loop…');
      }
    }
    act(kind, i, opener) {
      const c = this.rows[i]; if (!c) return;
      if (kind === 'loop') {
        if (!c.timed || !this.caps.loop || !this.canSeek) return;
        void this.setSentenceLoop(!(this.s.loop && this.s.loopRow === i), i, true);
      }
      else if (kind === 'copy') {
        const display = this.o.mode === 'cinema' ? 'both' : this.displayMode();
        const parts = display === 'tr' ? [] : [c.src];
        if (display !== 'src') {
          parts.push(...c.trs);
          if (this.o.mode !== 'cinema' && c.unc?.length) {
            parts.push(T('Eşleşme belirsiz', 'Match uncertain'), ...c.unc);
          }
        }
        const text = parts.filter(part => part?.trim()).join('\n');
        if (!text) return;
        const copyVersion=this.panelWork.copyVersion=(this.panelWork.copyVersion||0)+1;
        this.run('copy', text).then(result => {
          if(this.dead||copyVersion!==this.panelWork.copyVersion)return;
          if(result?.ok===true)this.toast(T('Metin kopyalandı.', 'Text copied.'));
          else if(result?.ok!==false)this.toast(T('Kopyalama doğrulanamadı; yeniden deneyin.','Copying could not be confirmed; try again.'));
        });
      }
      else if (kind === 'save') this.openNote(i,opener);
    }
    filterRows(resetScroll = false) {
      const normalize = text => text.normalize('NFC').trim().replace(/\s+/g, ' ');
      const query = normalize(this.q('[data-r=q]')?.value || '');
      const readingScroll=this.q('[data-r=scroll]');
      if(query&&!this.searchReadingAnchor)this.searchReadingAnchor={rev:this.st?.rev,...this.readingPosition()};
      const folded = query.toLowerCase(), turkish = query.toLocaleLowerCase('tr');
      const display = this.displayMode();
      let visible=0;
      this.lines.forEach((line, index) => {
        const row = this.rows[index], translations = [...row.trs, ...(row.unc || [])];
        const shown = display === 'src' ? [row.src] : display === 'tr' ? translations : [row.src, ...translations];
        line.hidden = !shown.some(text => {
          const value = normalize(text);
          return value && (!query || value.toLowerCase().includes(folded) || value.toLocaleLowerCase('tr').includes(turkish));
        });
        if(!line.hidden)visible++;
      });
      if (resetScroll && this.o.mode !== 'cinema') this.q('[data-r=scroll]').scrollTop = 0;
      const count=this.q('[data-r=searchCount]'),empty=this.q('[data-r=searchEmpty]'),clear=this.q('[data-r=clearSearch]');
      if (resetScroll || !query || this.matchLine?.hidden || !this.matchLine?.isConnected) this.matchLine = null;
      const navigation = this.q('[data-r=searchNav]');
      if (navigation) {
        navigation.hidden = !query || !this.rows.length;
        this.paintMatches();
      }
      if(clear)clear.hidden=!query;
      if(count)count.hidden=!query||!this.rows.length;
      if (empty) {
        empty.hidden = !this.rows.length || visible > 0;
        empty.querySelector('strong').textContent = query ? T('Eşleşme yok', 'No matches') : T('Görünür metin yok', 'No visible text');
        empty.querySelector('span').textContent = query
          ? (this.rows.some(row=>row.src.trim())&&this.rows.some(row=>row.trs.some(text=>text.trim()))
            ? T('Başka bir ifade deneyin veya transkript dilini değiştirin.', 'Try a different phrase or change the transcript language.')
            : T('Başka bir ifade deneyin veya aramayı temizleyerek metne dönün.', 'Try a different phrase, or clear the search to return to the text.'))
          : T('Diğer transkript dilini seçin.', 'Select the other transcript language.');
      }
      if(!query&&this.searchReadingAnchor){const anchor=this.searchReadingAnchor;this.searchReadingAnchor=null;if(!this.s.follow&&anchor.rev===this.st?.rev)this.applyReadingPosition(anchor);}
    }
    paintMatches() {
      const visible = this.lines.filter(line => !line.hidden);
      const index = visible.indexOf(this.matchLine);
      const count = this.q('[data-r=searchCount]');
      const text = index >= 0 ? `${index + 1} / ${visible.length}`
        : T(`${visible.length} satır`, visible.length === 1 ? '1 row' : `${visible.length} rows`);
      if (count.textContent !== text) count.textContent = text;
      this.q('[data-a=matchPrev]').setAttribute('aria-disabled', String(!visible.length || index === 0));
      this.q('[data-a=matchNext]').setAttribute('aria-disabled', String(!visible.length || index === visible.length - 1));
      this.lines.forEach(line => {
        const selected=line===this.matchLine&&index>=0;
        line.classList.toggle('sh-query-match',selected);
        let label=line.querySelector('.sh-query-position');
        if(!selected){label?.remove();return;}
        if(!label){label=document.createElement('small');label.className='sh-query-position';line.append(label);}
        const text=T('Aramada seçili','Selected search result')+' · '+(index+1)+' / '+visible.length;
        if(label.textContent!==text)label.textContent=text;
      });
    }
    moveMatch(direction, focus = false) {
      const visible = this.lines.filter(line => !line.hidden);
      const index = visible.indexOf(this.matchLine);
      const line = visible[index < 0 ? (direction > 0 ? 0 : visible.length - 1) : index + direction];
      if (!line) return false;
      cancelAnimationFrame(this.readingLayoutRaf);
      this.matchLine = line;
      this.s.follow = false;
      this.paintMatches();
      this.paint();
      line.scrollIntoView?.({block:'nearest'});
      if (focus) (this.sentenceSeekControls(line)[0] || line.querySelector('[data-act=copy]'))?.focus();
      return true;
    }
    sentenceSeekControls(line) {
      const display = this.displayMode();
      const parts = [...line.querySelectorAll('[data-a=translationSeek]')];
      const original = line.querySelector('[data-a=cueSeek]');
      const controls = display === 'src' ? [original] : display === 'tr' && parts.length ? parts : [original, ...parts];
      return controls.filter(button => button && !button.disabled);
    }
    displayMode() {
      if (this.root.classList.contains('sh-translation-only')) return 'tr';
      if (this.root.classList.contains('sh-source-only')) return 'src';
      return this.s.disp;
    }
    applyDisp() { const d = this.displayMode(), seg = this.q('[data-r=disp]'); if (!seg) return; seg.style.setProperty('--i', ['src', 'both', 'tr'].indexOf(d)); seg.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.d === d)); if (this.o.mode !== 'cinema') b.setAttribute('aria-pressed', String(b.dataset.d === d)); }); this.root.classList.toggle('hide-src', d === 'tr'); this.root.classList.toggle('hide-tr', d === 'src'); }
    syncRate() {
      const select = this.q('[data-r=rate]');
      if (!select || !this.rateOption) return;
      const unavailable=this.st?.canRate===false;
      const pending=this.panelWork.statusActions.get('rate'),busy=!!pending?.pending&&pending.identity===this.a.identity?.();
      if(busy)select.setAttribute('aria-busy','true');else select.removeAttribute('aria-busy');
      const notice=this.q('[data-r=rateState]');if(notice)notice.hidden=!busy;
      if(select.disabled!==unavailable)select.disabled=unavailable;
      const title=unavailable?T('Bu kaynakta hız ayarı henüz kullanılamıyor.','Playback speed is not currently available for this source.'):'';
      if(select.title!==title)select.title=title;
      const value = Number(this.st?.rate) || 1;
      if (!RATES.includes(value) && select.lastElementChild?.value !== String(value)) {
        select.querySelector('[data-current-rate]')?.remove();
        const option = this.rateOption(value);
        option.dataset.currentRate = '';
        option.disabled = true;
        select.append(option);
      } else if (RATES.includes(value)) {
        select.querySelector('[data-current-rate]')?.remove();
      }
      if (select.value !== String(value)) select.value = String(value);
    }
    setSleep(minutes) {
      if (!SLEEP.includes(minutes)||this.dead||this.id0!==(this.a.identity?.()??'')) return;
      this.sleepWork.revision++;
      this.sleepWork.pending=null;
      this.sleepWork.notice=null;
      this.s.sleep = minutes;
      this.s.sleepAt = minutes ? Date.now() + minutes * 60000 : 0;
      this.paint();
    }
    expireSleep() {
      const work=this.sleepWork,identity=this.id0,revision=work.revision;
      this.s.sleep=0;this.s.sleepAt=0;
      if(work.pending)return;
      const pending=work.pending={identity,revision};
      // This source-bound receipt survives a view rebuild; it never retries pause.
      const finish=result=>{
        if(work.pending!==pending||work.revision!==revision)return;
        work.pending=null;
        work.notice={identity,revision,message:result?.ok===true
          ?T('Uyku süresi doldu; oynatma duraklatıldı.','Sleep timer finished; playback paused.')
          :result?.message||T('Uyku süresi doldu; duraklatma doğrulanamadı. Oynatma kontrolünden yeniden deneyin.','Sleep timer finished; pause was not confirmed. Retry using the playback control.')};
        const owner=work.owner;
        if(owner&&!owner.dead)owner.tick();
      };
      try{Promise.resolve(this.a.cmd('pause',undefined,this.st?.rev)).then(finish,error=>finish({ok:false,message:error?.message}));}
      catch(error){finish({ok:false,message:error?.message});}
    }
    toggleJump(restoreFocus=true) {
      const form = this.q('[data-r=jumpForm]');
      const opener = this.q('.sh-times [data-a=jump]');
      if (form.hidden && !this.canSeek) return;
      this.jumpGeneration = (this.jumpGeneration || 0) + 1;
      form.hidden = !form.hidden;
      opener.setAttribute('aria-expanded', String(!form.hidden));
      const input = this.q('[data-r=jumpTime]');
      this.q('[data-r=jumpError]').hidden = true;
      input.removeAttribute('aria-invalid');
      this.paintJump();
      if (form.hidden) { if(restoreFocus)opener.focus({preventScroll:true}); }
      else {
        input.value = fmt(this.st.time);
        input.focus();
        input.select();
      }
    }
    async seekTypedTime() {
      const form = this.q('[data-r=jumpForm]'), input = this.q('[data-r=jumpTime]');
      if (form.hidden || this.jumpPending) return;
      const value = input.value.trim();
      const parts = value.split(':');
      const valid = /^\d+(?::[0-5]\d){0,2}$/.test(value);
      const time = parts.reduce((seconds, part) => seconds * 60 + Number(part), 0);
      const error = this.q('[data-r=jumpError]');
      const latest = this.a.state();
      if ((this.a.identity?.() ?? '') !== this.id0) return;
      if (!valid || !Number.isSafeInteger(time) || !this.canSeek || latest.canSeek === false || !(time <= latest.duration)) {
        error.textContent = T('Saniye, dd:ss veya ss:dd:ss biçiminde medya süresi içinde bir zaman girin.', 'Enter seconds, mm:ss, or hh:mm:ss within the media duration.');
        error.hidden = false;
        input.setAttribute('aria-invalid','true');
        input.focus();
        return;
      }
      const identity = this.a.identity?.(), generation = this.jumpGeneration, editVersion=this.jumpEditVersion||0;
      input.removeAttribute('aria-invalid');error.hidden=true;
      const work=this.jumpWork;work.pending=true;
      this.paintJump();
      try {
        const result = await this.run('seek', time);
        if (!this.dead && !form.hidden && generation === this.jumpGeneration && editVersion===(this.jumpEditVersion||0) && input.value.trim()===value && identity === this.a.identity?.() && result?.ok !== false) this.toggleJump(form.contains(document.activeElement));
      } finally {
        work.pending=false;
        const owner=work.owner;if(owner&&!owner.dead)owner.paintJump();
      }
    }
    paintJump() {
      const form=this.q('[data-r=jumpForm]');if(!form)return;
      const busy=!!this.jumpPending,submit=form.querySelector('[type=submit]');
      form.toggleAttribute('aria-busy',busy);if(busy)form.setAttribute('aria-busy','true');
      if(submit){if(busy&&document.activeElement===submit)this.q('[data-r=jumpTime]').focus({preventScroll:true});submit.disabled=busy;submit.textContent=busy?T('Atlanıyor…','Seeking…'):T('Git','Go');}
    }
    paintFullscreen() {
      const button = this.q('.browser-study-transport [data-a=fullscreen]');
      if (!button) return;
      const active = !!document.fullscreenElement?.contains(this.root);
      const label = active ? T('Tam ekrandan çık','Exit fullscreen') : T('Tam ekran','Fullscreen');
      if (button.title === label && button.hasAttribute('aria-pressed')) return;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(active));
      button.querySelector('span').textContent = label;
    }
    paint() {
      this.paintAssistantSelection();
      const r = this.root, s = this.s, st = this.st || this.a.state();
      const draft=this.noteDraft?.identity===this.id0?this.noteDraft:null;
      const marker=draft?JSON.stringify([draft.rowId,!!draft.standaloneTranslation]):null;
      if(this.noteMarker!==marker||this.noteMarkerLines!==this.lines){
        this.noteMarker=marker;this.noteMarkerLines=this.lines;const rowIndex=this.noteRowIndex(draft);
        this.lines.forEach((line,index)=>{const button=line.querySelector('[data-act=save]');if(!button)return;const kept=index===rowIndex;button.toggleAttribute('data-note-draft',kept);if(kept)button.dataset.noteDraft='true';const label=kept?T('Not taslağını aç','Open note draft'):T('Cümleyi veya seçili metni kaydet','Save sentence or selected text');button.title=label;button.setAttribute('aria-label',label);});
      }
      r.classList.toggle('sh-focus', s.focus); r.classList.toggle('sh-playing', !st.paused);if(st.paused)r.classList.remove('controls-idle');
      const sourceLoop = this.displayMode() === 'tr' && !!this.st?.translationTargets && this.rows.some(row => row.timed && row.src);
      for (const b of r.querySelectorAll('[data-a=loop]')) {
        b.setAttribute('aria-pressed', String(s.loop));
        const label = sourceLoop ? T('Özgün döngü', 'Original loop') : T('Cümle döngüsü', 'Loop sentence');
        b.setAttribute('aria-label', label);
        b.title = label;
        b.lastChild.textContent = this.loopPending ? ' '+T('Döngü ayarlanıyor…','Updating loop…') : s.loop && s.loopRow >= 0 && this.rows[s.loopRow]
          ? ` ${sourceLoop ? label : T('Döngü', 'Loop')} · ${fmt(this.rows[s.loopRow].start)}` : label;
      }
      const range = this.q('[data-r=loopRange]'), loopCue = s.loop ? this.rows[s.loopRow] : null;
      if (range) {
        const start = Math.max(0, loopCue?.start ?? 0);
        const end = Math.min(Number(st.duration) || 0, loopCue?.end ?? 0);
        range.hidden = !loopCue?.timed || !(end > start);
        if (!range.hidden) {
          range.style.left = start / st.duration * 100 + '%';
          range.style.width = (end - start) / st.duration * 100 + '%';
        }
      }
      const loopButton = s.loop ? this.lines[s.loopRow]?.querySelector('[data-act=loop]') : null;
      if (this.activeLoopButton !== loopButton) {
        this.activeLoopButton?.setAttribute('aria-pressed', 'false');
        loopButton?.setAttribute('aria-pressed', 'true');
        this.activeLoopButton = loopButton;
      }
      for (const b of r.querySelectorAll('[data-a=focus]')) b.setAttribute('aria-pressed', String(s.focus));
      const sleepPending=!!this.sleepWork.pending&&this.sleepWork.pending.identity===this.id0;
      const sl = r.querySelector('[data-a=sleep]'); if (sl) { sl.setAttribute('aria-pressed', String(!!s.sleep)); const label = sleepPending?T('Duraklatılıyor…','Pausing…'):s.sleep ? `${Math.max(0, Math.ceil((s.sleepAt - Date.now()) / 60000))} ${T('dk', 'min')}` : T('Uyku', 'Sleep'); r.querySelector('[data-r=sleeplbl]').textContent = label; sl.setAttribute('aria-label', s.sleep||sleepPending ? T('Uyku zamanlayıcısı', 'Sleep timer') + ' · ' + label : T('Uyku zamanlayıcısı', 'Sleep timer'));if(sleepPending)sl.setAttribute('aria-busy','true');else sl.removeAttribute('aria-busy'); }
      const sleep = this.q('[data-r=sleep]');
      if (sleep) {
        const active = Math.max(0, Math.ceil((s.sleepAt - Date.now()) / 60000));
        const deadline=s.sleep?new Date(s.sleepAt).toLocaleTimeString(T('tr','en'),{hour:'2-digit',minute:'2-digit'}):'';
        const description=sleepPending?T('Uyku süresi doldu; duraklatma doğrulanıyor.','Sleep timer finished; confirming pause.')
          :s.sleep?T(`${active} dk kaldı · ${deadline} saatinde duraklat. Kapat ile zamanlayıcıyı iptal edin.`,`${active} min left · Pause at ${deadline}. Choose Turn off to cancel the timer.`)
          :T('Seçtiğiniz süre sonunda bu medyayı duraklatır.','Pauses this media after the selected duration.');
        if(sleep.title!==description)sleep.title=description;
        const accessible=T('Uyku zamanlayıcısı','Sleep timer')+' · '+description;
        if(sleep.getAttribute('aria-label')!==accessible)sleep.setAttribute('aria-label',accessible);
        for (const option of sleep.options) {
          const minutes = Number(option.value);
          const text = minutes === 0 ? (sleepPending?T('Duraklatılıyor…','Pausing…'):s.sleep ? T('Kapat','Turn off') : T('Uyku','Sleep'))
            : minutes === s.sleep ? `${active} ${T('dk kaldı','min left')}`
            : `${minutes} ${T('dk','min')}`;
          if (option.textContent !== text) option.textContent = text;
        }
        if (sleep.value !== String(s.sleep)) sleep.value = String(s.sleep);
        sleep.parentElement.classList.toggle('active', !!s.sleep||sleepPending);
        if(sleepPending)sleep.setAttribute('aria-busy','true');else sleep.removeAttribute('aria-busy');
      }
      for (const b of r.querySelectorAll('[data-a=rate]')) b.textContent = (Number(st.rate) || 1) + '×';
      this.syncRate();
      this.paintFullscreen();
      for (const b of r.querySelectorAll('[data-a=toggle]')) { const want = st.paused ? 'play' : 'pause'; if (b.dataset.ic !== want) { b.dataset.ic = want; b.innerHTML = ic(want); b.title = st.paused ? T('Oynat', 'Play') : T('Duraklat', 'Pause'); b.setAttribute('aria-label', b.title); } }
      r.classList.toggle('transcript-open',!!s.transcript);r.querySelectorAll('[data-a=transcript]').forEach(button=>button.setAttribute('aria-expanded',String(!!s.transcript)));
      const compactReading = s.transcript && this.usesTranscriptDrawer() && window.innerWidth < 780;
      const overlay = this.o.mode==='podcast' || !!s.panel || !!s.word || !!s.note || !!compactReading;
      if(r.hasAttribute('data-pw-occludes-native')!==overlay){if(overlay)r.setAttribute('data-pw-occludes-native','true');else r.removeAttribute('data-pw-occludes-native');root.syncBrowserOcclusion?.();}
      const f = r.querySelector('[data-a=follow]'); if (f) {
        if (this.o.mode === 'cinema') f.hidden = s.follow || this.cur < 0 || !this.rows[this.cur]?.timed;
        else { const timed=this.rows.some(row=>row.timed);f.hidden=false;f.disabled=!timed;f.setAttribute('aria-pressed',String(timed&&s.follow));f.title=!timed?T('Zamansız metinde otomatik takip yoktur.','Automatic follow is unavailable for untimed text.'):s.follow?T('Konuşulan satır izleniyor. Metni okurken takip durur.','Following the spoken sentence. Reading the transcript pauses follow.'):T('Oynatma konumunu değiştirmeden konuşulan satıra dön.','Return to the spoken sentence without changing playback position.');f.querySelector('span').textContent=!timed?T('Salt okunur','Read-only'):s.follow?T('Takip açık','Follow on'):T('Konuşmaya dön','Back to speech'); }
      }
      r.querySelectorAll('[data-a=panel]').forEach(button=>button.setAttribute('aria-pressed', String(s.panel)));
    }
    setTint(rgb) { const c = rgb || [213, 163, 92]; const [h] = rgb2hsl(c); this.root.style.setProperty('--sh-tint', `rgb(${c.map(Math.round).join(' ')})`); this.root.style.setProperty('--sh-tint2', `hsl(${(h + 150) % 360} 55% 58%)`); }
    rowHTML(c, i, study) {
      let src = esc(c.src);
      if (c.words && c.words.length) { let out = '', at = 0; const text = String(c.src); c.words.forEach((w, k) => { out += esc(text.slice(at, w.s)) + `<span class="w" data-k="${k}">${esc(text.slice(w.s, w.e))}</span>`; at = w.e; }); out += esc(text.slice(at)); src = out; }
      const shared = this.o.mode !== 'cinema';
      const trs = c.trs.map((t, part) => {
        const start = c.translationRanges?.[part]?.start;
        const time = Number.isFinite(start) ? captionStamp(start, true) : '';
        const button = shared && c.timed && c.trs.length > 1 && time
          ? `<button class="cue-card-time sh-part-time" type="button" data-a="translationSeek" data-part="${part}" aria-label="${time} · ${T('Çeviri cümlesine git', 'Go to translation sentence')}">${time}</button>` : '';
        return `<span class="tr${shared ? ' cue-card-tr' : ''}" data-translation-part="${part}">${button}<span dir="auto">${esc(t)}</span></span>`;
      }).join('');
      const unc = c.unc && c.unc.length ? `<span class="tr unc"><em>${T('Eşleşme belirsiz', 'Match uncertain')}</em>${c.unc.map((t) => `<span>${esc(t)}</span>`).join('')}</span>` : '';
      const copyLabel = shared ? T('Görünen metni kopyala', 'Copy visible text') : T('Kopyala', 'Copy');
      const acts = study && !shared ? '' : `<span class="acts">${this.caps.loop && c.timed ? `<button type="button" class="act" data-act="loop" aria-pressed="false" title="${T('Cümle döngüsü', 'Loop sentence')}" aria-label="${T('Cümle döngüsü', 'Loop sentence')}">${ic('loop')}</button>` : ''}<button type="button" class="act" data-act="copy" title="${copyLabel}" aria-label="${copyLabel}">${ic('copy')}</button>${this.caps.save ? `<button type="button" class="act" data-act="save" title="${T('Cümleyi veya seçili metni kaydet', 'Save sentence or selected text')}" aria-label="${T('Cümleyi veya seçili metni kaydet', 'Save sentence or selected text')}">${ic('star')}</button>` : ''}</span>`;
      const review=c.translationReview?`<small class="sh-translation-review">${T('Çeviriyi kontrol edin · kaynakla aynı metin veya kalite uyarısı','Review translation · matches source or has a quality warning')}</small>`:'';
      const standalone = c.standaloneTranslation
        ? `<small class="sh-translation-origin">${T('Bağımsız çeviri satırı', 'Standalone translation line')}</small>` : '';
      const time = fmt(c.start);
      const stamp = !c.timed ? '' : shared
        ? `<button class="at cue-card-time" type="button" data-a="cueSeek" aria-label="${time} · ${T('Cümleye git', 'Go to sentence')}">${ic('play')}<span>${time}</span></button>`
        : `<span class="at">${time}</span>`;
      return `${stamp}<span class="src${shared ? ' cue-card-src' : ''}" dir="auto">${src}</span>${trs}${unc}${standalone}${review}${acts}`;
    }
    rebuild(st, info) {
      const scroll=this.q('[data-r=scroll]'),study=this.o.mode!=='podcast';
      const previousScroll = scroll.scrollTop;
      const viewport=scroll.getBoundingClientRect();
      const anchorLine=!this.s.follow&&scroll.clientHeight>0?this.lines.find(line=>{if(line.hidden)return false;const rect=line.getBoundingClientRect();return rect.bottom>viewport.top&&rect.top<viewport.bottom;}):null;
      const anchor=anchorLine?{row:this.rows[Number(anchorLine.dataset.i)],offset:anchorLine.getBoundingClientRect().top-viewport.top}:null;
      const matchRow = this.matchLine && this.rows[Number(this.matchLine.dataset.i)];
      const focused=document.activeElement,oldRow=scroll.contains(focused)?focused.closest('[data-i]'):null;
      const focusedRow=oldRow?this.rows[Number(oldRow.dataset.i)]:null;
      const focusedAction=focused?.dataset.act;
      const focusedSeek=focused?.dataset.a === 'cueSeek';
      const focusedTranslation=focused?.dataset.a === 'translationSeek'
        ? focusedRow?.translationCueIds?.[Number(focused.dataset.part)] : undefined;
      const sameRow=(a,b)=>a && b && a.id===b.id && a.trackId===b.trackId && !!a.standaloneTranslation===!!b.standaloneTranslation;
      this.rows=st.rows;scroll.textContent='';this.lines=[];
      this.translationRowByCue = new Map();
      this.rows.forEach((row, index) => {
        for (const id of row.translationCueIds || (!row.src && row.trs.length ? [row.id] : [])) {
          if (!this.translationRowByCue.has(id)) this.translationRowByCue.set(id, []);
          this.translationRowByCue.get(id).push(index);
        }
      });
      this.root.classList.toggle('sh-translation-only', this.rows.some(row => row.trs.length || row.unc?.length) && !this.rows.some(row => row.src.trim()));
      this.root.classList.toggle('sh-source-only', this.rows.some(row => row.src.trim()) && !this.rows.some(row => row.trs.length || row.unc?.length));
      const display = this.q('.browser-study-display');
      if (display) display.hidden = this.root.classList.contains('sh-translation-only') || this.root.classList.contains('sh-source-only');
      this.applyDisp();
      const frag = document.createDocumentFragment();
      if (!st.rows.length) {
        const available = this.o.mode !== 'cinema' && info.captionTrackCount > 0;
        const youtube = info.youtubeCaptions && !available;
        const title = available ? T('Bu videoda altyazı var','Captions are available for this video') : T('Transkript henüz açık değil','No transcript is open yet');
        const hint = available
          ? T(`${info.captionTrackCount} iz hazır. Okumaya başlamak için kaynak veya ikinci dili seçin.`, `${info.captionTrackCount} tracks available. Choose the source or second language to start reading.`)
          : youtube ? T('YouTube henüz bir altyazı izi vermediyse Browser’da CC’yi açın ve videoyu oynatın. İz gelince Sahne’den seçebilirsiniz.', 'If no caption track has arrived yet, turn on CC in the browser and play the YouTube video. Choose the track in Stage when it arrives.')
          : T('İşlemler’den mevcut metni açabilir veya Whisper ile döküm oluşturabilirsiniz.','Open an existing transcript or create one with Whisper in Tasks.');
        const action = available ? T('Altyazı izi seç','Choose caption track') : T('İşlemleri aç','Open tasks');
        const browser = youtube ? `<button class="sh-btn" type="button" data-a="retryCaptions" title="${T('Videoyu kaldığınız konumda yeniden yükler; kayıtlı altyazılar korunur.', 'Reloads the video at your position and keeps saved captions.')}">${T('Altyazıyı yeniden dene','Retry captions')}</button><button class="sh-btn" type="button" data-a="close">${T('Browser’da CC’yi aç','Open CC in browser')}</button>` : '';
        frag.append(this.el(`<div class="sh-empty">${ic(available || youtube ? 'classic' : 'mic')}<h2>${title}</h2><p>${hint}</p>${browser}<button class="sh-btn" type="button" data-a="panel" ${available ? 'data-caption-entry' : ''}>${action}</button></div>`));
      }
      if (st.untimed) { const n = document.createElement('p'); n.className = 'sh-note'; n.textContent = st.timingNotice || T('Bu transkript zamansız: satırlar yalnızca okunur; atlama ve etkin satır yoktur.', 'This transcript has no timing: lines are read-only; no seeking or active line.'); frag.append(n); }
      st.rows.forEach((c, i) => {
        const row = document.createElement('div'); row.className = (this.o.mode !== 'cinema' ? 'sh-card cue-card' : 'sh-card') + (c.timed ? '' : ' is-untimed'); row.dataset.i = i;
        if (c.timed && this.o.mode === 'cinema') { row.tabIndex = 0; row.setAttribute('role', 'button'); row.addEventListener('keydown', (e) => { if (this.canSeek && ['Enter',' '].includes(e.key) && e.target === row) {e.preventDefault();e.stopPropagation();this.run('seekCue', i);} }); }
        row.innerHTML = this.rowHTML(c, i, study); frag.append(row); this.lines.push(row);
      });
      scroll.append(frag);
      if (matchRow) this.matchLine = this.lines[this.rows.findIndex(row => sameRow(row,matchRow))];
      this.filterRows();
      if(focusedRow){
        const index=this.rows.findIndex(row=>sameRow(row,focusedRow)),line=this.lines[index];
        const part=focusedTranslation===undefined?-1:this.rows[index]?.translationCueIds?.indexOf(focusedTranslation);
        const action=part>=0 ? line?.querySelector('[data-a=translationSeek][data-part="'+part+'"]')
          : focusedSeek ? line?.querySelector('[data-a=cueSeek]') : focusedAction&&line?.querySelector('[data-act="'+focusedAction+'"]');
        ((!line?.hidden&&(action||line?.matches('[tabindex]')&&line))||this.q('[data-r=q]'))?.focus({preventScroll:true});
      } this.s.idx = -2; this.drawWave(st, info); this.words = this.lines.map((l, i) => this.rows[i].words ? [...l.querySelectorAll('.w')] : null);
      const li = info.langs || {}; for (const [k, v, label] of [['ls', li.src], ['lt', li.tr], ['lsb', li.src, T('Kaynak', 'Source')], ['ltb', li.tr, T('Çeviri', 'Translation')]]) { const n = this.q(`[data-r=${k}]`); if (!n) continue; if (label) n.innerHTML = `${v ? lang(v) : ''}${label}`; else n.textContent = v ? String(v).slice(0, 3).toUpperCase() : ''; n.title = v ? String(v).toUpperCase() : T('Dil bilinmiyor','Language unknown'); }
      // Restore after language/display controls have their final layout. Following
      // uses explicit smooth scrolling; a reading anchor must move immediately.
      if (!this.s.follow){scroll.scrollTop=previousScroll;if(anchor){const index=this.rows.findIndex(row=>sameRow(row,anchor.row)),line=this.lines[index];if(line&&!line.hidden)scroll.scrollTop+=line.getBoundingClientRect().top-scroll.getBoundingClientRect().top-anchor.offset;}}
    }
    async flushVolume() {
      const identity = this.a.identity?.(),work=this.volumeWork;
      this.volumePending = true;
      try {
        const current=()=>work.owner&&!work.owner.dead&&(identity??'')===work.owner.id0&&identity===work.owner.a.identity?.();
        while (current() && this.nextVolume != null) {
          const value = this.nextVolume;
          this.nextVolume = null;
          let result;try{result=await work.owner.a.cmd('volume',value,work.owner.st?.rev);}catch(error){result={ok:false,message:error?.message};}
          if(current()&&result?.ok===false)work.owner.toast(result.message||T('Ses düzeyi uygulanamadı.','Volume could not be changed.'));
        }
      } finally {
        this.nextVolume = null;
        this.volumePending = false;
        work.requested=null;
        if(work.owner&&!work.owner.dead)work.owner.tick();
      }
    }
    paintVolume(input, value) {
      if (Number(input.value) !== value) input.value = value;
      const percent = Math.round(value * 100) + '%';
      input.setAttribute('aria-valuetext', percent);
      const output = input.parentElement.querySelector('output');
      if (output && output.textContent !== percent) output.textContent = percent;
      const icon = this.q('[data-r=volumeIcon]');
      const glyph = value === 0 ? 'volumeZero' : 'volume';
      if (icon && icon.dataset.glyph !== glyph) {
        icon.dataset.glyph = glyph;
        icon.innerHTML = ic(glyph);
        icon.setAttribute('aria-pressed', String(value === 0));
        icon.setAttribute('aria-label', value === 0 ? T('Sesi geri aç','Restore sound') : T('Sesi kapat','Mute'));
      }
    }
    cueAt(time) {
      let index = -1;
      this.rows.forEach((cue, i) => {
        if (cue.timed && !cue.standaloneTranslation && cue.start <= time && time < cue.end && (index < 0 || cue.start >= this.rows[index].start)) index = i;
      });
      return index;
    }
    drawWave(st, info) {
      const dur = Number(st.duration) || 0, d = new Array(BARS).fill(0); let any = false;
      if (dur > 0) for (const c of st.rows) { if (!c.timed) continue; any = true; const len = (c.src || '').length, s0 = Math.max(0, c.start), e0 = Math.min(dur, c.end); if (!(e0 > s0)) continue; const a = Math.min(BARS - 1, Math.floor(s0 / dur * BARS)), b = Math.min(BARS - 1, Math.floor((e0 - 1e-6) / dur * BARS)); for (let i = a; i <= b; i++) d[i] += len / (b - a + 1); }
      const mx = Math.max(...d, 1), hs = d.map((v) => v ? .24 + .76 * Math.sqrt(v / mx) : .1);
      for (const n of [this.q('[data-r=bars]'), this.q('[data-r=fill]')]) n.replaceChildren(...hs.map((h) => { const i = document.createElement('i'); i.style.setProperty('--h', h.toFixed(3)); return i; }));
      const lg = this.q('[data-r=legend]'); if (lg) lg.textContent = any ? T('konuşma yoğunluğu · metinden', 'speech density · from text') : '';
      this.q('[data-r=wave]').dataset.density=String(any);this.drawWaveMarks(dur,info.chapters||[]);
    }
    drawWaveMarks(duration,chapters) {
      const signature=JSON.stringify([duration,chapters.map(chapter=>chapter.t)]);if(signature===this.waveMarksKey)return;this.waveMarksKey=signature;
      const wave=this.q('[data-r=wave]');wave.querySelectorAll('.mark').forEach(mark=>mark.remove());
      if(duration>0)for(const chapter of chapters)if(chapter.t>0){const mark=document.createElement('i');mark.className='mark';mark.style.left=(chapter.t/duration*100)+'%';wave.append(mark);}
    }
    drawChapters(chapters) {
      const host=this.q('[data-r=chaps]');
      if(!host)return;
      const stamp=JSON.stringify(chapters);
      if(stamp===this.chapterStamp)return;
      const hiddenChapterFocus=this.q('[data-r=chapterTools]')?.contains(document.activeElement)||this.q('.sh-chapter-entry')?.contains(document.activeElement);
      const oldButtons=[...host.querySelectorAll('button.sh-chap')];
      const focused=oldButtons.indexOf(document.activeElement);
      const focusKey=focused>=0?{time:oldButtons[focused].dataset.t,label:oldButtons[focused].querySelector('span')?.textContent}:null;
      const previousScroll=host.scrollTop;
      this.chapterStamp=stamp;
      const navigation = this.q('[data-r=readingNav]');
      if (navigation) {
        navigation.hidden = !chapters.length;
        this.q('.sh-chapter-entry').hidden = !chapters.length;
        if (!chapters.length) this.showReading(false);
      } else host.hidden = !chapters.length;
      host.setAttribute('aria-label',T('Bölüm başlıkları','Episode chapters'));
      host.replaceChildren();
      if (!navigation && chapters.length) host.append(this.el('<strong class="sh-chapter-current"></strong>'));
      const hasUntimed=chapters.some(chapter=>!Number.isFinite(chapter.t));
      for(const chapter of chapters){
        const timed=Number.isFinite(chapter.t);
        const item=document.createElement(timed?'button':'span');
        item.className='sh-chap';
        if(timed){
          item.type='button';
          item.dataset.t=String(chapter.t);
          const stamp = document.createElement('time');
          stamp.textContent = fmt(chapter.t) + (navigation ? '' : ' · ');
          item.append(stamp);
        }
        const label = document.createElement('span');
        label.textContent = chapter.label;
        item.append(label);
        host.append(item);
      }
      if(hasUntimed){
        const note=document.createElement('small');
        note.className='sh-chap-note';
        note.textContent=T('Zamanı doğrulanmayan başlıklar salt okunur.','Chapters without verified timing are read-only.');
        host.append(note);
      }
      if (navigation) { this.filterChapters(); host.scrollTop=previousScroll; }
      if(focusKey){
        const available=[...host.querySelectorAll('button.sh-chap')].filter(button=>!button.hidden&&!button.disabled);
        const target=available.find(button=>button.dataset.t===focusKey.time&&button.querySelector('span')?.textContent===focusKey.label)
          || available[Math.min(focused,available.length-1)]
          || (navigation ? this.q(chapters.length?'[data-r=chapterSearch]':'[data-r=q]') : this.q('[data-a=toggle]'));
        target?.focus({preventScroll:true});
      }else if(navigation&&!chapters.length&&hiddenChapterFocus){
        this.q('[data-r=q]')?.focus({preventScroll:true});
      }
    }
    filterChapters() {
      const search = this.q('[data-r=chapterSearch]');
      if (!search) return;
      const query = search.value.trim().normalize('NFC').toLocaleLowerCase(T('tr','en'));
      const list = this.q('[data-r=chaps]');
      let matches = 0;
      for (const item of list.querySelectorAll('.sh-chap')) {
        item.hidden = !item.textContent.normalize('NFC').toLocaleLowerCase(T('tr','en')).includes(query);
        if (!item.hidden) matches++;
      }
      const count = this.q('[data-r=chapterCount]');
      count.hidden = !query;
      count.textContent = matches ? T(`${matches} başlık`, `${matches} chapters`) : T('Eşleşen başlık yok','No matching chapters');
      list.scrollTop = 0;
    }
    focusPassage(time, {role} = {}) {
      this.tick();
      const translation = role === 'translation' ? this.liveCueAt(this.st?.captionTracks?.[1], time) : null;
      const index = role === 'translation'
        ? this.translationRowByCue.get(translation?.id)?.[0] ?? -1 : this.cueAt(time);
      this.lines.forEach((line,i)=>line.classList.toggle('sh-search-match',i===index));
      const line = this.lines[index];
      if (!line) return;
      if (this.o.mode !== 'cinema') {
        this.s.follow = false;
        this.showReading(false);
        if (line.hidden) {
          this.q('[data-r=q]').value = '';
          this.filterRows();
          if (line.hidden) this.q('[data-d=both]')?.click();
        }
        if (this.usesTranscriptDrawer() && !this.s.transcript) this.toggleTranscript(this.q('.sh-transcript-toggle'));
      }
      this.paint();
      cancelAnimationFrame(this.readingLayoutRaf);
      line.scrollIntoView?.({block:'center',inline:'nearest'});
    }
    readCurrentSentence(opener) {
      const part = this.livePart;
      const line = part?.closest('[data-i]') || this.activeLine;
      if (!line) return;
      if (this.usesTranscriptDrawer() && !this.s.transcript) this.followBeforeFullSentence = this.s.follow;
      this.s.follow = false;
      if (line.hidden) {
        this.q('[data-r=q]').value = '';
        this.filterRows();
      }
      this.showReading(false);
      if (this.usesTranscriptDrawer() && !this.s.transcript) this.toggleTranscript(opener);
      this.paint();
      line.tabIndex = -1;
      line.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        if (!line.isConnected || document.activeElement !== line) return;
        const scroll = this.q('[data-r=scroll]');
        const target = line.offsetHeight > scroll.clientHeight && line.contains(part) ? part : line;
        const top = target.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
        const inset = Math.max(0, (scroll.clientHeight - target.offsetHeight) / 2);
        scroll.scrollTo({ top: Math.max(0, top - inset), behavior: 'instant' });
      });
    }
    tick() {
      if (this.dead) return;
      const a = this.a, s = this.s;
      const id = a.identity ? a.identity() : ''; if (this.id0 === undefined) this.id0 = id; else if (id !== this.id0) { if (!this.gone) { this.gone = true; this.o.onSource?.(id, this.prefs()); } return; }
      if(this.panelWork.notices.length)this.toast(this.panelWork.notices.splice(0).join('\n'));
      for(const [action,receipt]of this.panelWork.statusActions){if(receipt.pending)continue;if(receipt.error&&receipt.identity===id&&receipt.owner===this.statusOwner(action))this.toast(receipt.error);this.panelWork.statusActions.delete(action);}
      const sleepNotice=this.sleepWork.notice;
      if(sleepNotice){this.sleepWork.notice=null;if(sleepNotice.identity===id&&sleepNotice.revision===this.sleepWork.revision)this.toast(sleepNotice.message);}
      if (s.sleep && Date.now() >= s.sleepAt) this.expireSleep();
      if (document.hidden) return;
      const st = this.st = a.state(), info = a.info();if(this.assistantChoice&&this.assistantChoice.rev!==st.rev){this.assistantChoice=null;document.dispatchEvent(new Event('media-context-changed'));}if(this.s.word&&this.s.word.rev!==st.rev)this.closeWord();if(this.s.note&&this.s.note.rev!==st.rev&&!this.s.note.stale){this.s.note.stale=true;this.renderNote(this.s.note,false);}if(this.noteDraft?.result)this.finishNote(this.noteDraft);
      this.captionTrackCount = info.captionTrackCount || 0;
      this.root.classList.toggle('sh-web-video', !!info.webVideo);
      this.root.classList.toggle('sh-web-source', !!info.webSource);
      const flow = this.q('.bp-flow');
      if (flow) flow.hidden = !st.rows.length;
      if (Number.isInteger(st.loopRow)) { s.loop = st.loopRow >= 0; s.loopRow = st.loopRow; }
      this.canSeek = st.canSeek !== false && Number(st.duration) > 0;
      const key = `${st.rev}:${st.timingNotice||''}:${st.rows.length}:${st.rows.length ? '' : info.captionTrackCount || 0}:${!!info.youtubeCaptions}:${Math.round(st.duration || 0)}:${(info.langs || {}).src}:${(info.langs || {}).tr}`;
      if (key !== s.key) {
        s.key = key; this.rebuild(st, info);
      }
      this.drawIdentity(info);
      const chaptersKey=JSON.stringify([info.chapters||[],Math.round(st.duration||0)]);
      if(chaptersKey!==this.chaptersKey){this.chaptersKey=chaptersKey;this.drawChapters(info.chapters||[]);this.drawWaveMarks(st.duration,info.chapters||[]);}
      const upNext = this.q('[data-r=upnext]');
      if (upNext) { const next = (info.queue || [])[0], sig = next ? JSON.stringify([next.index,next.title,next.queueKey]) : ''; if (sig !== this.metaQueueSig) { const restoreFocus=upNext.contains(document.activeElement);this.metaQueueSig = sig; upNext.replaceChildren(); upNext.hidden = !next; if (next) upNext.append(this.el(`<button class="sh-next-item sh-next-inline" type="button" data-a="queue" data-index="${Number(next.index)}" data-queue-key="${esc(next.queueKey)}"><small>${T('SIRADAKİ', 'UP NEXT')}</small><strong>${esc(next.title)}</strong></button>`));if(restoreFocus)(upNext.querySelector('button')||this.q('[data-a=toggle]'))?.focus({preventScroll:true}); } }
      const dur = Number(st.duration) || 0, observedTime = Number(st.time) || 0;
      const time = Number.isFinite(st.displayTime) ? st.displayTime : observedTime;
      const position = this.drag ? this.dragR * dur : dur > 0 ? Math.max(0, Math.min(dur, time)) : Math.max(0, time);
      const p = dur ? Math.min(100, position / dur * 100) : 0;
      const w = this.q('[data-r=wave]'); w.style.setProperty('--p', p + '%'); w.setAttribute('aria-disabled', String(!this.canSeek));
      const t0 = this.q('[data-r=t0]'); if (t0) { t0.textContent = info.live ? T('CANLI','LIVE') : fmt(position); this.q('[data-r=t1]').textContent = info.live ? '' : dur ? '-' + fmt(Math.max(0, dur - position)) : '--:--'; }
      w.tabIndex = this.canSeek ? 0 : -1;
      w.setAttribute('aria-valuenow', dur > 0 ? Math.round(position) : 0); w.setAttribute('aria-valuemax', Math.round(dur)); w.setAttribute('aria-valuetext', `${fmt(position)} / ${dur ? fmt(dur) : '--:--'}`);
      const chapters=(info.chapters||[]).filter(chapter=>Number.isFinite(chapter.t));
      const currentChapter=st.adPlaying ? null : chapters.reduce((best,chapter)=>chapter.t<=time+.001&&(!best||chapter.t>=best.t)?chapter:best,null);
      const chapterLabel=this.q('.sh-chapter-current');
      if(chapterLabel){
        const label = currentChapter
          ? (this.o.mode === 'cinema' ? T('Şu an: ', 'Now: ') : fmt(currentChapter.t) + ' · ') + currentChapter.label
          : this.o.mode === 'cinema' ? T('Bölüm başlıkları','Chapters') : T('Tümünü göster','Show all');
        if(chapterLabel.textContent!==label)chapterLabel.textContent=label;
      }
      for(const button of this.root.querySelectorAll('button.sh-chap')){
        const active=!!currentChapter&&Number(button.dataset.t)===currentChapter.t;
        button.classList.toggle('on',active);
        if(active)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
        button.disabled=!this.canSeek;
      }
      const currentChapterButton = this.q('[data-a=currentChapter]');
      if (currentChapterButton) currentChapterButton.disabled = !currentChapter || !this.canSeek;
      const suspended = st.adPlaying || st.seeking;
      const playbackIndex = suspended ? -1 : this.cueAt(observedTime);
      this.playbackIndex = playbackIndex;
      const liveTranslation = suspended ? null : this.liveCueAt(st.captionTracks?.[1], time);
      const sourceIndex = suspended ? -1 : this.cueAt(time);
      let idx = sourceIndex;
      const display = this.displayMode();
      const translationFocus = this.o.mode !== 'cinema' && st.captionTracks
        && (display === 'tr' || (display === 'both' && idx < 0));
      const matchingRows = liveTranslation && display !== 'src' ? this.translationRowByCue.get(liveTranslation.id) : null;
      const translationRow = matchingRows?.includes(sourceIndex) && !this.lines[sourceIndex]?.hidden ? sourceIndex
        : matchingRows?.find(index => !this.lines[index]?.hidden) ?? matchingRows?.[0];
      if (translationFocus) {
        idx = translationRow ?? -1;
      }
      this.updateScope();this.time = time; this.cur = idx;this.paintTransport(observedTime, playbackIndex);this.root.classList.toggle('sh-audio',!!info.audio);
      if (idx !== s.idx || this.activeLine !== this.lines[idx]) {
        const prev = s.idx;
        this.activeLine?.classList.remove('on');
        this.activeLine?.classList.remove('sh-translation-live');
        this.activeLine?.removeAttribute('aria-current');
        s.idx = idx;
        this.activeLine = this.lines[idx];
        this.activeLine?.classList.add('on');
        this.activeLine?.setAttribute('aria-current', 'true');
        this.onActive(idx, prev);
      }
      this.activeLine?.classList.toggle('sh-translation-live', !!translationFocus && !!liveTranslation);
      const translationPart = this.rows[translationRow]?.translationCueIds?.indexOf(liveTranslation?.id);
      const livePart = translationPart >= 0
        ? this.lines[translationRow]?.querySelector(`[data-translation-part="${translationPart}"]`) : null;
      if (this.livePart !== livePart) {
        this.livePart?.removeAttribute('aria-current');
        livePart?.setAttribute('aria-current', 'true');
        this.livePart = livePart;
        const scroll = this.q('[data-r=scroll]');
        if (livePart && this.s.follow && this.lines[translationRow]?.offsetHeight > scroll.clientHeight) this.followAfterLayout();
      }
      const readCurrent = this.q('[data-a=readCurrent]');
      if (readCurrent) readCurrent.disabled = !this.activeLine && !livePart;
      if(info.webVideo && this.lastDisplay!==this.displayMode()){this.lastDisplay=this.displayMode();this.run('display',this.lastDisplay);}
      if(this.o.mode==='cinema')this.drawCinema(info,st);
      this.wordsTick(translationFocus && liveTranslation
        ? { start: liveTranslation.start, end: liveTranslation.end, offset: st.captionTracks[1]?.offsetSeconds }
        : null);
      this.drawTasks();
      const volume = this.q('.sh-local-volume');
      if (volume && Number.isFinite(st.volume)) {
        const value=this.volumePending&&Number.isFinite(this.volumeWork.requested)?this.volumeWork.requested:st.volume;
        if (value > 0) this.lastAudibleVolume = value;
        this.paintVolume(volume, value);
      }
      this.paintCaptionVisibility(info, st, time, liveTranslation);
      this.paintLiveSpeech(st, time, liveTranslation);
      this.drawJob(); this.drawPanel(false); this.paint();
      this.restoreReadingPosition();
    }
    drawIdentity(info) {
      const identityKey=JSON.stringify([info.title,info.cover,info.sub,info.eyebrow,info.tint]);
      if(identityKey===this.identityKey)return;this.identityKey=identityKey;
      const title=this.q('[data-r=title]');if(!title)return;
      title.textContent=info.title||T('Başlıksız bölüm','Untitled episode');
      this.root.classList.toggle('sh-long-title',Array.from(title.textContent).length>72);
      this.q('[data-r=eyebrow]').textContent=info.eyebrow||T('Şimdi çalıyor','Now playing');
      this.q('[data-r=sub]').textContent=info.sub||'';this.setTint(info.tint);
      const cover=this.q('[data-r=cover]'),source=info.cover||'';
      if(this.coverSource!==source||!cover.firstElementChild){this.coverSource=source;cover.replaceChildren(source?this.el(`<img src="${esc(source)}" alt="">`):this.coverInitials());}
      else if(!cover.querySelector('img'))cover.replaceChildren(this.coverInitials());
    }
    coverInitials() {
      const initials = this.q('[data-r=title]').textContent.trim().split(/\s+/).slice(0,2).map(word => [...word][0]).join('');
      return this.el(`<span class="sh-initials">${esc(initials.toLocaleUpperCase(T('tr','en')))}</span>`);
    }
    navigateSentence(command) {
      return this.run(command, this.displayMode() === 'tr' && this.st?.translationTargets ? 'translation' : undefined);
    }
    paintCaptionSeek(button, range, translated) {
      const start = Math.max(0, range?.start);
      const valid = Number.isFinite(range?.start) && Number.isFinite(range?.end)
        && Math.min(this.st.duration, range.end) > start;
      button.disabled = !this.canSeek || !valid;
      const stamp = valid ? captionStamp(start, translated) : '—';
      const label = translated ? T('Çeviriye git', 'Go to translation') : T('Cümleye git', 'Go to sentence');
      (button.querySelector('span') || button).textContent = stamp;
      button.setAttribute('aria-label', valid ? stamp + ' · ' + label : T('Altyazı zamanı doğrulanamadı', 'Caption timing is unverified'));
      button.title = button.getAttribute('aria-label');
    }
    paintTransport(time, active) {
      const hint = this.q('[data-r=transportHint]');
      if (!hint) return;
      const display = this.displayMode();
      if (this.transportSeekable !== this.canSeek || this.transportLines !== this.lines || this.transportDisplay !== display || this.transportDuration !== this.st.duration) {
        this.transportSeekable = this.canSeek;
        this.transportLines = this.lines;
        this.transportDisplay = display;
        this.transportDuration = this.st.duration;
        this.lines.forEach((line, index) => {
          if (!this.rows[index]?.timed) return;
          const seek = line.querySelector('[data-a=cueSeek]');
          if (seek) {
            const row = this.rows[index], translated = this.usesTranslationTime(row);
            this.paintCaptionSeek(seek, translated ? row.translationRange : row, translated);
          }
          const loop = line.querySelector('[data-act=loop]');
          if (loop) {const row=this.rows[index];loop.disabled = !this.canSeek || !Number.isFinite(row.start) || !Number.isFinite(row.end) || row.end<=row.start || row.start>=this.st.duration || row.end<=0;}
          for (const button of line.querySelectorAll('[data-a=translationSeek]')) {
            this.paintCaptionSeek(button, this.rows[index].translationRanges?.[Number(button.dataset.part)], true);
          }
        });
      }
      const hasTimed = this.rows.some(row => row.timed);
      const available = this.canSeek && hasTimed;
      const cue = this.rows[active ?? -1];
      const next = available && this.rows.some(row => row.timed && !row.standaloneTranslation
        && row.end > 0 && row.start < this.st.duration && row.start > (cue?.start ?? time));
      const enabled = {
        back: this.canSeek && time > 0, fwd: this.canSeek && time < this.st.duration, prev: available, next,
        replay: available && !!cue, loop: this.s.loop || (available && !!cue)
      };
      const targets = display === 'tr' ? this.st.translationTargets : undefined;
      if (targets) {
        enabled.prev = this.canSeek && Number.isFinite(targets.prevCue);
        enabled.next = this.canSeek && Number.isFinite(targets.nextCue);
        enabled.replay = this.canSeek && Number.isFinite(targets.replay);
      }
      const jump = this.q('.sh-times [data-a=jump]');
      if (jump) {
        if (!this.canSeek && !this.q('[data-r=jumpForm]').hidden) this.toggleJump();
        if (!this.canSeek && document.activeElement === jump) this.q('[data-a=toggle]')?.focus({preventScroll:true});
        jump.disabled = !this.canSeek;
      }
      const noteSeek = this.q('[data-a=noteSeek]');
      if (noteSeek) noteSeek.disabled = !this.canSeek || !!this.s.note?.stale;
      const noteRebind=this.q('[data-a=noteRebind]');
      if(noteRebind)noteRebind.disabled=!!this.s.note?.pending||this.noteRowIndex(this.s.note)<0;
      for (const button of this.root.querySelectorAll('.browser-study-transport button[data-a]')) {
        const value = enabled[button.dataset.a];
        if (value !== undefined) button.disabled = !value;
      }
      this.paintLoopPending();
      if (this.transportTranslationLabels !== !!targets) {
        this.transportTranslationLabels = !!targets;
        const labels = targets ? {
          prev: T('Önceki çeviri satırı', 'Previous translation line'),
          next: T('Sonraki çeviri satırı', 'Next translation line'),
          replay: T('Çeviri satırını tekrar dinle', 'Replay translation line')
        } : {
          prev: T('Önceki cümle', 'Previous sentence'),
          next: T('Sonraki cümle', 'Next sentence'),
          replay: T('Cümleyi tekrar dinle', 'Replay sentence')
        };
        for (const [action, label] of Object.entries(labels)) {
          for (const button of this.root.querySelectorAll(`[data-a=${action}]`)) {
            button.setAttribute('aria-label', label);
            button.title = label;
          }
        }
      }
      const message = this.st.adPlaying
        ? T('Reklam oynuyor. Konuşma takibi içerik dönünce devam eder.', 'An ad is playing. Transcript follow resumes with the content.')
        : this.st.seeking ? T('Yeni konum bekleniyor…', 'Waiting for the new position…')
        : this.st.waiting ? T('Video veri bekliyor…', 'Waiting for video data…')
        : !this.canSeek
        ? T('Bu kaynakta konuma atlama şu anda kullanılamıyor.', 'Seeking is unavailable for this source right now.')
        : !hasTimed ? T('Cümle kontrolleri için zamanlı transkript gerekli.', 'Sentence controls need a timed transcript.') : '';
      if (hint.textContent !== message) hint.textContent = message;
      hint.hidden = !message;
    }
    wordsTick(translation) {
      const idx = this.cur; if (idx < 0) return; const row = this.rows[idx], ws = this.words && this.words[idx]; const c = row; const time = this.time;
      if (ws && row.words) row.words.forEach((w, k) => { const n = ws[k]; if (!n) return; n.classList.toggle('done', time >= w.t1); n.classList.toggle('now', time >= w.t0 && time < w.t1); });
      const range = translation || c, offset = Number(translation?.offset) || 0;
      const l = this.lines[idx], span = Math.max(.01, range.end - range.start), lp = Math.max(0, Math.min(1, (time - range.start - offset) / span)); if (l) { l.style.setProperty('--lp', (lp * 100).toFixed(1) + '%'); l.style.setProperty('--lpn', lp.toFixed(3)); }
    }
    motionAllowed(){return !document.hidden && !root.matchMedia?.('(prefers-reduced-motion: reduce)').matches && !['off','reduced'].includes(document.documentElement.dataset.cinemaMotion) && (root.PlayerUiKit?.motionAllowed?.()??true);}
    usesTranslationTime(row) {
      return row.standaloneTranslation || (this.displayMode() === 'tr' && Object.hasOwn(row, 'translationRange'));
    }
    scrollToActive(force) {
      const sc = this.q('[data-r=scroll]'), l = this.lines[this.cur]; if (!l || l.hidden || this.root.classList.contains('sh-chapters-open')) return;
      const target = l.offsetHeight > sc.clientHeight && l.contains(this.livePart) ? this.livePart : l;
      const base = sc.getBoundingClientRect().top - sc.scrollTop, targetTop = target.getBoundingClientRect().top - base;
      let top = targetTop - (sc.clientHeight - target.offsetHeight) / (this.o.mode !== 'podcast' ? 3 : 2);
      // Keep the sentence before the speaking one fully readable when both fit; never push the speaking one out of view.
      let prev = null; for (let i = this.cur - 1; i >= 0 && !prev; i--) if (this.lines[i] && !this.lines[i].hidden) prev = this.lines[i];
      if (prev && target === l) { const prevTop = prev.getBoundingClientRect().top - base - 12; if (prevTop < top && targetTop + target.offsetHeight - prevTop <= sc.clientHeight - 16) top = prevTop; }
      sc.scrollTo({ top: Math.max(0, top), behavior: force || !this.motionAllowed() || this.s.idx === -2 ? 'auto' : 'smooth' });
    }
    readingPosition() {
      const scroll=this.q('[data-r=scroll]'),viewport=scroll.getBoundingClientRect();
      const line=!this.root.classList.contains('sh-chapters-open')&&scroll.clientHeight>0
        ?this.lines.find(line=>{const rect=line.getBoundingClientRect();return !line.hidden&&rect.bottom>viewport.top&&rect.top<viewport.bottom;}):null;
      const row=line&&this.rows[Number(line.dataset.i)];
      return {scrollTop:scroll.scrollTop,viewportAnchor:row?{rev:this.st?.rev,id:row.id,trackId:row.trackId,standaloneTranslation:!!row.standaloneTranslation,offset:line.getBoundingClientRect().top-viewport.top}:null};
    }
    applyReadingPosition(reading) {
      const scroll=this.q('[data-r=scroll]');scroll.scrollTo({top:reading.scrollTop,behavior:'instant'});
      const anchor=reading.viewportAnchor;
      if(!anchor||anchor.rev!==this.st?.rev)return;
      const index=this.rows.findIndex(row=>row.id===anchor.id&&row.trackId===anchor.trackId&&!!row.standaloneTranslation===!!anchor.standaloneTranslation),line=this.lines[index];
      if(!line||line.hidden)return;
      // Offscreen cue cards use intrinsic estimated heights. Measure the actual
      // target before clamping its clipped reading offset to the new layout.
      if(this.readingAnchorLine){const previous=this.readingAnchorLine;previous.line.style.contentVisibility=previous.visibility;}
      this.readingAnchorLine={line,visibility:line.style.contentVisibility};
      line.style.contentVisibility='visible';
      line.scrollIntoView?.({block:'start',inline:'nearest',behavior:'instant'});
      const rect=line.getBoundingClientRect(),offset=Math.max(anchor.offset,1-(rect.bottom-rect.top));
      scroll.scrollTo({top:scroll.scrollTop+rect.top-scroll.getBoundingClientRect().top-offset,behavior:'instant'});
      // Revealing virtualized neighbours can resolve their estimated heights
      // over successive layouts. Bound settlement and yield to manual input.
      cancelAnimationFrame(this.readingLayoutRaf);
      const query=this.q('[data-r=q]')?.value,revision=this.st?.rev,identity=this.a.identity?.();
      const settle=remaining=>{
        if(this.dead||identity!==this.a.identity?.()||this.s.follow||revision!==this.st?.rev||query!==this.q('[data-r=q]')?.value||this.readingAnchorLine?.line!==line||!line.isConnected||line.hidden)return;
        const final=line.getBoundingClientRect(),clipped=Math.max(anchor.offset,1-final.height);
        scroll.scrollTo({top:scroll.scrollTop+final.top-scroll.getBoundingClientRect().top-clipped,behavior:'instant'});
        if(remaining)this.readingLayoutRaf=requestAnimationFrame(()=>settle(remaining-1));
      };
      this.readingLayoutRaf=requestAnimationFrame(()=>settle(2));
    }
    restoreReadingPosition() {
      const reading = this.readingScroll;
      if (!reading) return;
      if (this.s.follow || this.q('[data-r=q]')?.value !== reading.query) {
        this.readingScroll = null;
        return;
      }
      const scroll = this.q('[data-r=scroll]');
      if (!scroll?.clientHeight) return;
      this.applyReadingPosition(reading);
      this.readingScroll = null;
    }
    followAfterLayout() {
      cancelAnimationFrame(this.followRaf);
      this.followRaf=requestAnimationFrame(()=>{
        if(!this.dead&&this.s.follow&&!this.q('[data-r=scroll]').contains(document.activeElement))this.scrollToActive(true);
      });
    }
    liveCueAt(track, time) {
      if (track?.timed === false) return;
      let active;
      const trackTime = time - (Number(track?.offsetSeconds) || 0);
      for (const cue of track?.cues || []) {
        if (cue.start <= trackTime && trackTime < cue.end && (!active || cue.start >= active.start)) active = cue;
      }
      return active;
    }
    paintLiveSpeech(state, time, liveTranslation) {
      const panel = this.q('[data-r=liveSpeech]');
      if (!panel || this.o.mode !== 'podcast') return;
      const display = this.displayMode();
      const row = this.rows[this.cur];
      const tracks = state.captionTracks;
      const source = state.adPlaying || state.seeking || display === 'tr' ? '' : tracks ? this.liveCueAt(tracks[0], time)?.text || '' : row?.src || '';
      const translation = state.adPlaying || state.seeking || display === 'src' ? ''
        : liveTranslation?.text || (!tracks && row && !row.src ? row.trs.join(' ') : '');
      panel.hidden = !source.trim() && !translation.trim();
      for (const [name, text] of [['liveSource', source], ['liveTranslation', translation]]) {
        const line = this.q('[data-r='+name+']');
        if (line.textContent !== text) line.textContent = text;
        line.hidden = !text.trim();
      }
    }
    paintCaptionVisibility(info, state, time, liveTranslation) {
      const captions = this.q('[data-r=subs]');
      if (!captions) return;
      const display = this.displayMode();
      const independent = this.o.mode === 'study' && !info.webVideo && !!state.captionTracks;
      if (independent) {
        const source = this.liveCueAt(state.captionTracks[0], time)?.text || '';
        const translation = liveTranslation?.text || '';
        this.writeCaption(captions, source, translation);
      }
      const hasSource = display !== 'tr' && !!this.q('[data-r=s]').textContent.trim();
      const hasTranslation = display !== 'src' && !!this.q('[data-r=t]').textContent.trim();
      captions.hidden = (!independent && this.cur < 0) || info.webVideo || this.o.mode === 'podcast'
        || (this.o.mode !== 'cinema' && !hasSource && !hasTranslation);
    }
    writeCaption(box, source, translation) {
      const original = this.q('[data-r=s]'), translated = this.q('[data-r=t]');
      if (original.textContent === source && translated.textContent === translation) return;
      original.textContent = source;
      translated.textContent = translation;
      box.classList.toggle('long', source.length + translation.length > 150);
      box.classList.toggle('xlong', source.length + translation.length > 260);
      box.scrollTop = 0;
    }
    onActive(idx, prev) {
      const c = this.rows[idx];
      const sb = this.q('[data-r=subs]');
      if (sb && !(this.o.mode === 'study' && this.st?.captionTracks)) this.writeCaption(sb, c?.src || '', c?.trs.join('  ') || '');
      if (this.s.follow && !this.q('[data-r=scroll]').contains(document.activeElement)) {
        if (prev === -2) this.followAfterLayout();
        else this.scrollToActive(false);
      }
    }
    recoveryMarkup() {
      return this.el('<div class="sh-job sh-recovery" data-r="recovery" hidden><span role="status"></span><button class="sh-chip" data-a="playbackRetry" type="button"></button></div>');
    }
    statusOwner(action){if(action==='playbackRetry')return this.a.recovery?.()?.ownerToken;if(!['jobcancel','jobretry'].includes(action))return undefined;const job=this.a.panel?.()?.job;return job?.ownerToken??job?.id;}
    async runStatusAction(button, action, statusAction=button.dataset.a) {
      if (typeof action !== 'function' || button.disabled || this.dead || this.id0 !== (this.a.identity?.() ?? '')) return;
      const identity = this.a.identity?.();
      const jobAction=['jobcancel','jobretry'].includes(statusAction);
      const playback=statusAction==='playbackRetry',rateAction=statusAction==='rate',shared=jobAction||playback||rateAction;
      const actionOwner=()=>this.statusOwner(statusAction);
      const owner=jobAction||playback?actionOwner():undefined;
      const current=()=>!this.dead&&identity===this.a.identity?.()&&(!(jobAction||playback)||owner===actionOwner());
      const pending=button._shStatusAction={identity,owner,pending:true};
      if(shared)this.panelWork.statusActions.set(statusAction,pending);
      const returnToTransport = button.dataset.a === 'playbackRetry' && document.activeElement === button;
      if (returnToTransport) this.q('[data-a=toggle]')?.focus({preventScroll:true});
      if(!rateAction)button.disabled = true;
      button.setAttribute('aria-busy','true');
      if(playback)this.drawJob();
      if(rateAction)this.syncRate();
      try {
        const result = await action();
        if (result?.ok === false) throw new Error(result.message||T('İşlem uygulanamadı. Yeniden deneyebilirsiniz.','The action could not be completed. You can retry.'));
      } catch (error) {
        const message=error?.message||T('İşlem uygulanamadı.','The action could not be completed.');
        if(current())this.toast(message);
        else if(this.dead&&shared&&identity===this.a.identity?.()&&this.panelWork.statusActions.get(statusAction)===pending)pending.error=message;
      } finally {
        pending.pending=false;
        if(shared&&!pending.error&&this.panelWork.statusActions.get(statusAction)===pending)this.panelWork.statusActions.delete(statusAction);
        if(button._shStatusAction===pending){delete button._shStatusAction;if(!rateAction)button.disabled=false;button.removeAttribute('aria-busy');}
        if(playback&&!this.dead&&identity===this.a.identity?.())this.drawJob();
        if(rateAction&&!this.dead)this.tick();
        if (returnToTransport && current()
            && document.activeElement === document.body) {
          this.q('[data-a=toggle]')?.focus({preventScroll:true});
        }
      }
    }
    drawJob() {
      const recovery = this.a.recovery?.();
      const recoveryBox = this.q('[data-r=recovery]');
      if (!recovery && recoveryBox.contains(document.activeElement)) {
        this.q('[data-a=toggle]')?.focus({preventScroll:true});
      }
      recoveryBox.hidden = !recovery;
      const recoveryButton=recoveryBox.querySelector('button'),pendingRecovery=this.panelWork.statusActions.get('playbackRetry');
      this.playbackRetryPending=!!recovery&&(!!recovery.busy||!!pendingRecovery?.pending&&pendingRecovery.identity===this.a.identity?.()&&pendingRecovery.owner===recovery.ownerToken);
      recoveryButton.disabled=this.playbackRetryPending;if(this.playbackRetryPending)recoveryButton.setAttribute('aria-busy','true');else recoveryButton.removeAttribute('aria-busy');
      recoveryBox.setAttribute('aria-busy',String(!!recovery&&!!this.playbackRetryPending));
      if (recovery) {
        const status = recoveryBox.querySelector('span'), button = recoveryBox.querySelector('button');
        if (status.textContent !== recovery.message) status.textContent = recovery.message;
        const label=this.playbackRetryPending?T('Bekleyin…','Please wait…'):recovery.label;
        if (button.textContent !== label) button.textContent = label;
      }
      const p = this.a.panel?.(); const j = p && p.job, box = this.q('[data-r=job]'); if (!box) return;
      const show = !!j && ['running','failed','stopped','partial','cancelled'].includes(j.state);
      if(!show&&box.contains(document.activeElement))this.q('[data-a=toggle]')?.focus({preventScroll:true});
      if (box.hidden === show) box.hidden = !show; if (!show) return;
      box.dataset.state = j.state;
      let stateLabel=box.querySelector('.sh-job-state');
      if(!stateLabel){stateLabel=document.createElement('strong');stateLabel.className='sh-job-state';box.prepend(stateLabel);}
      const stateText={running:T('İşleniyor','Processing'),failed:T('Tamamlanamadı','Failed'),partial:T('Kısmi sonuç','Partial result'),stopped:T('Durduruldu','Stopped'),cancelled:T('İptal edildi','Cancelled')}[j.state];
      if(stateLabel.textContent!==stateText)stateLabel.textContent=stateText;
      const status = this.q('[data-r=jobt]');
      const message = j.text || (['stopped','cancelled'].includes(j.state)?T('Durduruldu. Kaydedilmiş sonuçlar korunur; İşlemler’den kullanılabilir sonuçları açabilirsiniz.','Stopped. Saved results are kept; open available results in Tasks.'):j.state==='partial'?T('Kısmi sonuç kaydedildi. Hazır satırlar korunur; İşlemler’den eksikleri tamamlayabilirsiniz.','Partial result saved. Ready lines are kept; complete missing lines in Tasks.'):j.state === 'failed' ? T('İşlem başarısız oldu.', 'The task failed.') : T('İşlem sürüyor…', 'Working…'));
      if (status.textContent !== message) status.textContent = message;
      const running = j.state === 'running';
      const progress = running && Number.isFinite(j.progress) ? Math.round(Math.max(0, Math.min(1, j.progress)) * 100) : null;
      const bar = this.q('[data-r=jobbar]');
      bar.hidden = !running;
      bar.classList.toggle('ind', running && progress === null);
      const percent = this.q('[data-r=jobpercent]');
      const fill = progress === null ? '' : progress + '%';
      if (bar.firstElementChild.style.width !== fill) bar.firstElementChild.style.width = fill;
      if (percent) {
        percent.hidden = progress === null;
        if (progress === null) bar.removeAttribute('aria-valuenow');
        else if (bar.getAttribute('aria-valuenow') !== String(progress)) bar.setAttribute('aria-valuenow', progress);
        if (percent.textContent !== fill) percent.textContent = fill;
      }
      this.q('[data-a=jobcancel]').hidden = !(j.state === 'running' && j.cancel); const retry=this.q('[data-a=jobretry]');retry.hidden=!(['failed','partial','stopped','cancelled'].includes(j.state)&&j.retry);
      for(const button of [this.q('[data-a=jobcancel]'),retry]){const pending=this.panelWork.statusActions.get(button.dataset.a);button.disabled=!!pending?.pending&&pending.identity===this.a.identity?.()&&pending.owner===(j.ownerToken??j.id);if(button.disabled)button.setAttribute('aria-busy','true');else button.removeAttribute('aria-busy');}
      retry.textContent=retry.disabled?T('Bekleyin…','Please wait…'):j.retryLabel||T('Yeniden dene','Retry');
      if(box.contains(document.activeElement)&&document.activeElement.hidden)this.q('[data-a=toggle]')?.focus({preventScroll:true});
    }
    togglePanel(opener) {
      this.s.panel=!this.s.panel;
      if(this.s.panel){
        if(this.s.note)this.closeNote();
        if(this.s.word)this.closeWord();
        this.panelOpener=opener||document.activeElement;
        this.drawPanel(true);
        const target = opener?.hasAttribute('data-caption-entry') ? this.q('[data-caption-section] button:not(:disabled)') : null;
        (target || this.q('[data-pclose]'))?.focus();
      }else{
        this.drawPanel(true);
        (this.panelOpener?.isConnected?this.panelOpener:this.q('.sh-top [data-a=panel]'))?.focus({preventScroll:true});
      }
    }
    usesTranscriptDrawer() {
      return this.o.mode !== 'cinema' && !this.root.classList.contains('sh-audio') && window.innerWidth < 1100;
    }
    showReading(chapters) {
      const list = this.q('[data-r=chaps]');
      if (!list || this.o.mode === 'cinema') return;
      cancelAnimationFrame(this.readingLayoutRaf);
      const scroll = this.q('[data-r=scroll]');
      if (chapters && list.hidden) {
        this.transcriptReading=this.readingPosition();
        this.transcriptScroll=scroll.scrollTop;
      }
      const changed = list.hidden === chapters;
      list.hidden = !chapters;
      this.q('[data-r=chapterTools]').hidden = !chapters;
      this.root.classList.toggle('sh-chapters-open', chapters);
      this.q('[data-r=readingTitle]').textContent = chapters ? T('Bölüm başlıkları','Chapters') : T('Transkript','Transcript');
      this.q('[data-a=reading]').setAttribute('aria-pressed', String(!chapters));
      for (const button of this.root.querySelectorAll('[data-a=chapters]')) button.setAttribute('aria-pressed', String(chapters));
      if (!chapters && changed) {
        if(!this.s.follow)this.applyReadingPosition(this.transcriptReading||{scrollTop:this.transcriptScroll||0});
        else scroll.scrollTop=this.transcriptScroll||0;
        this.followAfterLayout();
      }
    }
    chapterFocusTarget() {
      const list = this.q('[data-r=chaps]');
      return list.querySelector('button[aria-current=true]:not(:disabled):not([hidden])') || list.querySelector('button:not(:disabled):not([hidden])') || this.q('[data-r=chapterSearch]');
    }
    toggleTranscript(opener) {
      this.s.transcript=!this.s.transcript;
      this.paint();
      if(this.s.transcript){
        this.transcriptOpener=opener||document.activeElement;
        const search = this.q('[data-r=q]');
        const target = this.root.classList.contains('sh-chapters-open') ? this.chapterFocusTarget() : search?.closest('.bp-flow[hidden]')
          ? this.q('.browser-study-transcript-close')
          : search;
        target?.focus({preventScroll:true});
        this.restoreReadingPosition();
        this.followAfterLayout();
      }else{
        if (this.followBeforeFullSentence !== undefined) {
          if (this.followBeforeFullSentence && !this.q('[data-r=q]')?.value) this.s.follow = true;
          this.followBeforeFullSentence = undefined;
          this.paint();
        }
        (this.transcriptOpener?.isConnected && !this.transcriptOpener.hidden && !this.transcriptOpener.disabled
          ? this.transcriptOpener : this.q('.sh-transcript-toggle'))?.focus({preventScroll:true});
      }
    }
    drawPanel(force) {
      const box = this.q('[data-r=panel]'); if (!box) return; box.hidden = !this.s.panel; this.root.classList.toggle('panel-open', this.s.panel); this.paint(); if (!this.s.panel) return;
      const p = this.a.panel?.(); if (!p) { box.textContent = ''; return; }
      const sig = JSON.stringify([this.st?.rev,this.taskPending,[...this.panelPending],p.sections.map((s) => [s.title, s.items.map((i) => [i.id, i.primary, i.type, i.label, i.value, i.disabled, i.pressed, i.hint, (i.options || []).map((o) => o.value + o.label).join('|'), i.text])])]);
      if (!force && sig === this.s.psig) return; this.s.psig = sig;
      const focused = box.contains(document.activeElement) ? document.activeElement.dataset.pid||document.activeElement.closest('.mk-picker')?.querySelector('.mk-picker-trigger')?.dataset.pid||'close' : null;
      const previousScroll=box.scrollTop;box.textContent = '';
      const panelIdentity=this.id0;
      const fieldCurrent=control=>!this.dead&&this.s.panel&&!box.hidden&&box.contains(control)&&control.isConnected&&panelIdentity===this.id0&&panelIdentity===(this.a.identity?.()??'');
      box.append(this.el(`<div class="sh-panel-h"><b>${T('İşlemler', 'Tasks')}</b><button class="sh-btn icon" type="button" data-pclose aria-label="${T('Kapat', 'Close')}">${ic('close')}</button></div>`));
      box.querySelector('[data-pclose]').onclick=()=>this.togglePanel();
      p.sections.forEach((sec) => {
        const s = this.el(`<section class="sh-psec"><h3>${esc(sec.title)}</h3></section>`);
        if (sec.id === 'captions') s.dataset.captionSection = '';
        sec.items.forEach((it, n) => {
          if (it.type === 'note') { s.append(this.el(`<p class="sh-pnote">${esc(it.text)}</p>`)); return; }
          if (it.type === 'offset') {
            const row = this.el(`<div class="sh-offset" role="group" aria-label="${esc(it.label)}"><div><strong>${esc(it.label)}</strong><output>${esc(it.text)}</output></div></div>`);
            const actions = this.el('<div class="sh-offset-actions"></div>');
            for (const [label, delta] of [[T('−0,1 sn', '−0.1 s'), -.1], [T('+0,1 sn', '+0.1 s'), .1], [T('Sıfırla', 'Reset'), null]]) {
              const b = this.el(`<button type="button" class="sh-btn">${label}</button>`);
              b.dataset.pid = sec.title + ':' + n + ':' + delta;
              b.setAttribute('aria-label', it.label + ' · ' + label);
              b.onclick = () => { if(!fieldCurrent(b))return;try { it.run(delta); this.tick(); } catch (_) { this.toast(T('Zaman ayarı uygulanamadı.', 'Timing adjustment could not be applied.')); } };
              actions.append(b);
            }
            row.append(actions); s.append(row); return;
          }
          if(it.type==='range'){const L=this.el(`<label class="sh-psel sh-prange"><span>${esc(it.label)}</span><output></output><input type="range" min="0" max="1" step="0.01" aria-label="${esc(it.label)}"></label>`);const input=L.querySelector('input');input.value=String(it.value);input.dataset.pid=sec.title+':'+n;const output=L.querySelector('output'),show=()=>{output.textContent=Math.round(Number(input.value)*100)+'%';};show();input.oninput=()=>{if(!fieldCurrent(input))return;show();it.onChange(Number(input.value));};s.append(L);return;}
          if (it.type === 'select') { const L = this.el(`<div class="sh-psel"><span>${esc(it.label)}</span></div>`);const select=root.PlayerUiKit.select({label:it.label,value:it.value,options:it.options,searchable:true,onChange:value=>{if(fieldCurrent(select.trigger))it.onChange(value);}});select.trigger.dataset.pid=`${sec.title}:${n}`;L.append(select);s.append(L); return; }
          const actionKey=it.id?'action:'+it.id:'item:'+JSON.stringify([sec.id||sec.title,it.label,sec.items.slice(0,n).filter(item=>!item.id&&item.label===it.label).length]);
          const pending=!!this.panelPending?.has(actionKey);
          const b = this.el(`<button type="button" class="sh-pbtn${it.primary ? ' pri' : ''}" data-pid="${esc(actionKey)}" aria-busy="${pending}" ${it.disabled || pending || it.id && this.taskPending ? 'disabled' : ''} ${it.pressed !== undefined ? `aria-pressed="${!!it.pressed}"` : ''}><span>${esc(it.label)}</span>${pending ? `<small role="status">${T('Bekleyin…','Please wait…')}</small>` : it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button>`);
          b.onclick = async () => {
            const identity=this.a.identity?.(),current=()=>!this.dead&&identity===this.a.identity?.();if(!current()||identity!==this.id0||this.panelPending?.has(actionKey))return;
            const reportFailure=message=>{if(current())this.toast(message);else if(this.dead&&identity===this.a.identity?.())this.panelWork.notices.push(message);};
            if (it.id && (this.a.actions?.() || []).some(action => action.id === it.id)) { const pending=this.startTask(it.id); this.tick(); await pending; if(current())this.drawPanel(false); return; }
            (this.panelPending??=new Set()).add(actionKey);b.disabled=true;this.drawPanel(true);
            try { const result=await it.run?.(); if(result?.ok===false)reportFailure(result.message||T('İşlem uygulanamadı.','Task could not be applied.')); }
            catch(error){reportFailure(error?.message||T('İşlem uygulanamadı.','Task could not be applied.'));}
            finally{this.panelPending.delete(actionKey);if(current()){this.drawPanel(true);this.tick();}}
          }; s.append(b);
        });
        box.append(s);
      });
      if(focused)([...box.querySelectorAll('[data-pid]')].find(n=>n.dataset.pid===focused&&!n.disabled)||box.querySelector('[data-pclose]'))?.focus({preventScroll:true});
      box.scrollTop=previousScroll;
    }
    drawCinema(info,st){
      const meta=this.q('.sh-cinema-meta');meta.querySelector('h1').textContent=info.title||T('Oynatıcı','Player');meta.querySelector('p').textContent=info.sub||'';
      this.root.classList.toggle('sh-native',!!info.native);const clearance=Math.ceil(this.q('.sh-dock').getBoundingClientRect().height)+40;if(this.dockClearance!==clearance){this.dockClearance=clearance;this.root.style.setProperty('--sh-local-dock-clearance',clearance+'px');}
      this.q('.sh-local-clock').textContent=fmt(st.time)+' / '+(Number(st.duration)>0?fmt(st.duration):'—');
      const language=this.q('[data-a=display]');language.textContent=this.s.disp==='both'?T('İki dil','Both languages'):this.s.disp==='src'?T('Kaynak','Source'):T('Çeviri','Translation');
      const list=info.queue||[],signature=JSON.stringify(list);if(signature!==this.queueSig){this.queueSig=signature;const target=this.q('.sh-up-next');target.textContent='';list.forEach((item,i)=>{const button=this.el(`<button class="sh-next-item" type="button" data-a="queue" data-index="${item.index}" data-queue-key="${esc(item.queueKey)}"><small>${i?T('ARDINDAN','THEN'):T('SIRADAKİ','UP NEXT')}</small><strong>${esc(item.title)}</strong></button>`);target.append(button);});}
      const chapters=info.chapters||[],sig=JSON.stringify(chapters)+':'+st.duration;if(sig!==this.chapterSig){this.chapterSig=sig;const strip=this.q('.sh-cinema-chapters');strip.textContent='';strip.hidden=!chapters.length;chapters.forEach((c,i)=>{const end=chapters[i+1]?.t||st.duration,button=this.el(`<button class="sh-chap" type="button" data-t="${c.t}" title="${esc(c.label)} · ${fmt(c.t)}" aria-label="${esc(c.label)} · ${fmt(c.t)}"><span>${esc(c.label)}</span></button>`);button.style.flex=String(Math.max(.01,end-c.t));strip.append(button);});}
      const paused=!!st.paused;if(this.lastPause!==paused){this.lastPause=paused;this.reveal?.();}
    }
    captureAssistantPassage() {
      const previous=this.assistantChoice,retained=this.assistantPassage();
      this.assistantChoice=null;this.assistantSelectionError='';try{
      const selection=root.getSelection?.();if(!selection?.rangeCount||selection.isCollapsed){if(retained)this.assistantChoice=previous;return retained;}
      const index=this.lines.findIndex(line=>{const source=line?.querySelector('.src');return source?.contains(selection.anchorNode)&&source.contains(selection.focusNode);});
      const row=this.rows[index],text=String(selection).trim();
      if(!row||!text||!row.src.includes(text))return null;
      if(text.length>4000){this.assistantSelectionError=T('Seçili pasaj 4000 karakteri aşıyor. Daha kısa bir kaynak pasajı seçip Asistana sor düğmesine yeniden basın.','The selected passage exceeds 4000 characters. Select a shorter source passage, then choose Ask assistant again.');return null;}
      this.assistantChoice={identity:this.id0,rev:this.st?.rev,index,id:row.id,text};
      return this.assistantPassage();
      }finally{this.paintAssistantSelection();document.dispatchEvent(new Event('media-context-changed'));}
    }
    paintAssistantSelection(){
      const box=this.q('[data-r=assistantSelection]');if(!box)return;
      const passage=this.assistantChoice?this.assistantPassage():null;
      const owned=box.contains(document.activeElement);box.hidden=!passage;
      const text=this.q('[data-r=assistantExcerpt]');if(text.textContent!==(passage?.text||''))text.textContent=passage?.text||'';
      if(!passage&&owned)this.cardReturnTarget(this.q('[data-a=assistant]'))?.focus({preventScroll:true});
    }
    clearAssistantSelection(){
      this.assistantChoice=null;this.assistantSelectionError='';
      const selection=root.getSelection?.();if(selection?.anchorNode&&this.root.contains(selection.anchorNode))selection.removeAllRanges();
      this.paintAssistantSelection();document.dispatchEvent(new Event('media-context-changed'));
    }
    assistantPassage() {
      const claim=this.assistantChoice,row=this.rows[claim?.index];
      if(!claim||this.dead||claim.identity!==this.a.identity?.()||claim.rev!==this.a.state()?.rev||row?.id!==claim.id||!row.src.includes(claim.text))return null;
      return {text:claim.text,timed:!!row.timed,...(row.timed?{start:row.start,end:row.end}:{})};
    }
    assistantContext(context,question='') {
      const passage=this.assistantPassage();
      if(!context||!passage||context.workspace&&context.workspace!=='podcast'||/(?:bu ana kadar|şu ana kadar|şimdiye kadar|buraya kadar|so far|up to (?:now|this point)|until now)/iu.test(String(question)))return context;
      if(context.selectedText===passage.text)return context;
      return {...context,selectedText:passage.text,not:[context.not,'Explicit user-selected source passage. Selection does not establish what has been heard.'].filter(Boolean).join(' ')};
    }
    noteRowIndex(note){return note?this.rows.findIndex(row=>row.id===note.rowId&&row.trackId===note.trackId&&!!row.standaloneTranslation===!!note.standaloneTranslation):-1;}
    openNote(row,opener){
      const cue=this.rows[row];if(!cue||!this.caps.save)return;
      const selection=root.getSelection?.(),source=this.lines[row]?.querySelector('.src');
      const excerpt=selection?.rangeCount&&source?.contains(selection.anchorNode)&&source.contains(selection.focusNode)?String(selection).trim():'';
      const existing=this.noteDraft;
      this.closeWord();const same=existing?.identity===this.id0&&this.noteRowIndex(existing)===row;
      const newExcerpt=!!(same&&excerpt&&excerpt!==existing.excerpt);
      if(existing?.identity===this.id0&&(!same||newExcerpt)&&(existing.pending||existing.text?.trim()||newExcerpt&&existing.rev!==this.st?.rev)){this.renderNote(existing);this.toast(T('Önce açık taslağı kaydedin veya Taslağı bırak seçeneğini kullanın.','Save the open draft first, or choose Discard draft.'));return;}
      this.noteOpener=opener||document.activeElement;
      const note=same&&!newExcerpt?existing:{identity:this.id0,row,rowId:cue.id,trackId:cue.trackId,standaloneTranslation:!!cue.standaloneTranslation,rev:this.st?.rev,source:cue.src,translations:[...cue.trs],start:cue.start,end:cue.end,timed:!!cue.timed,text:'',...(excerpt&&cue.src.includes(excerpt)?{excerpt}:{})};
      note.open=true;this.noteDraft=note;this.renderNote(note);
      if(note.result)this.finishNote(note);
    }
    captureNoteView(note){
      const box=this.q('.sh-note-card'),input=box?.querySelector('[data-note-text]'),excerpt=box?.querySelector('.sh-note-excerpt');
      if(!note||this.s.note!==note||box.hidden||!input)return;
      const active=document.activeElement;
      note.view={scrollTop:box.scrollTop,inputTop:input.scrollTop,inputLeft:input.scrollLeft,excerptTop:excerpt?.scrollTop||0,
        start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection,
        focus:active===excerpt?'excerpt':active===input?'input':note.view?.focus||'input'};
    }
    renderNote(note,focus=true){
      this.captureNoteView(note);
      if(this.s.panel){this.s.panel=false;this.drawPanel(true);}
      if(this.s.word)this.closeWord();
      const box=this.q('.sh-note-card'),active=document.activeElement,owned=box.contains(active),action=active?.dataset.a,view=note.view;
      this.s.note=note;this.noteDraft=note;note.open=true;
      if(note.rev!==this.a.state()?.rev)note.stale=true;
      box.hidden=false;
      box.innerHTML=`<header><h2>${T('Cümle ve not','Sentence and note')}</h2><button class="sh-btn" type="button" data-a="noteClose" aria-label="${T('Kapat','Close')}">${ic('close')}</button></header><div class="sh-note-excerpt" tabindex="0" role="region" aria-label="${T('Kaynak alıntı ve çeviri','Source excerpt and translation')}"><p class="sh-word-context" dir="auto">${esc(note.excerpt||note.source)}</p>${(note.excerpt?[]:note.translations||[]).map(x=>`<p class="sh-word-translation" dir="auto">${esc(x)}</p>`).join('')}</div><label>${T('Notunuz (isteğe bağlı)','Your note (optional)')}<textarea rows="3" maxlength="8000" data-note-text></textarea></label><p class="sh-note-state" role="status"></p><footer>${note.stale?`<button class="sh-btn" type="button" data-a="noteRebind">${T('Güncel pasajı kullan','Use current passage')}</button>`:''}<button class="sh-btn" type="button" data-a="noteDiscard" ${note.pending?'disabled':''}>${T('Taslağı bırak','Discard draft')}</button><button class="sh-btn" type="button" data-a="noteSave">${T('Araştırma defterine kaydet','Save to research notebook')}</button>${note.timed?`<button class="sh-btn" type="button" data-a="noteSeek">${T('Cümleye dön','Return to sentence')} · ${fmt(note.start)}</button>`:`<small>${T('Zamansız metin · atlama yok','Untimed text · no seeking')}</small>`}</footer>`;
      const input=box.querySelector('textarea');input.value=note.text||'';input.disabled=!!note.pending;input.oninput=()=>note.text=input.value;
      const save=box.querySelector('[data-a=noteSave]');save.disabled=!!note.pending||!!note.stale;save.setAttribute('aria-busy',String(!!note.pending));
      if(note.pending)save.textContent=T('Kaydediliyor…','Saving…');
      else if(note.error&&!note.stale)save.textContent=T('Kaydetmeyi yeniden dene','Retry saving');
      const notice=box.querySelector('.sh-note-state');notice.textContent=note.stale?T('Altyazı değişti. Taslağın korundu; kaydetmek için güncel pasajı önce incele.','The transcript changed. Your draft is kept; review the current passage before saving.'):note.pending?T('Kayıt sonucu bekleniyor. Görünüm değiştirmek ikinci kayıt başlatmaz.','Waiting for the save result. Switching views does not save a second copy.'):note.error||'';if(note.error)notice.tabIndex=0;
      box.querySelector('[data-a=noteSeek]')?.toggleAttribute('disabled',!!note.stale);box.querySelector('[data-a=noteRebind]')?.toggleAttribute('disabled',!!note.pending||this.noteRowIndex(note)<0);
      box.dataset.state=note.stale?'stale':note.pending?'saving':note.error?'error':'draft';this.paint();
      if((focus&&!note.pending)||owned){const fallback=note.pending?box.querySelector('[data-a=noteClose]'):view?.focus==='excerpt'?box.querySelector('.sh-note-excerpt'):input;const target=(owned&&action?box.querySelector('[data-a="'+action+'"]:not(:disabled)'):null)||fallback;target?.focus({preventScroll:true});}
      if(view){
        if(Number.isInteger(view.start)&&Number.isInteger(view.end))input.setSelectionRange(view.start,view.end,['backward','forward','none'].includes(view.direction)?view.direction:'none');
        input.scrollTop=view.inputTop||0;input.scrollLeft=view.inputLeft||0;
        box.querySelector('.sh-note-excerpt').scrollTop=view.excerptTop||0;box.scrollTop=view.scrollTop||0;
      }
    }
    cardReturnTarget(...preferred){
      return [...preferred,this.q('[data-r=q]'),this.q('[data-a=toggle]')].find(node=>node?.isConnected&&this.root.contains(node)&&!node.disabled&&!node.closest('[hidden],[inert]'));
    }
    closeNote(){const note=this.s.note;this.captureNoteView(note);if(note){note.text=this.q('[data-note-text]')?.value??note.text;note.open=false;}this.s.note=null;const box=this.q('.sh-note-card'),restore=box?.contains(document.activeElement);if(box){box.hidden=true;box.textContent='';}this.paint();if(restore){const index=this.noteRowIndex(note);const row=index>=0?this.lines[index]:null;const opener=this.noteOpener?.isConnected?this.noteOpener:row&&!row.hidden&&row.querySelector('[data-act=save]');this.cardReturnTarget(opener,row&&!row.hidden&&row.querySelector('[data-act=save]'))?.focus({preventScroll:true});}}
    finishNote(note){
      if(!note.result||(this.s.note!==note&&this.noteDraft!==note)||this.dead||note.identity!==this.a.identity?.())return;
      const result=note.result;note.result=null;
      if(result?.ok){if(this.s.note===note)this.closeNote();if(this.noteDraft===note)this.noteDraft=null;this.paint();this.toast(T('Araştırma defterine kaydedildi.','Saved to research notebook.'));}
      else{note.error=result?.message||T('Not kaydedilemedi. Taslağın korundu; yeniden deneyebilirsin.','The note could not be saved. Your draft is kept; you can retry.');if(this.s.note===note)this.renderNote(note,false);}
    }
    async saveNote(){
      const note=this.s.note;if(!note||note.pending||note.stale||note.rev!==this.a.state()?.rev||note.identity!==this.a.identity?.())return;
      note.text=this.q('[data-note-text]')?.value||'';note.error='';note.pending=true;this.renderNote(note);
      // This receipt belongs to the note, so a same-source view handoff cannot dispatch it twice.
      try{note.result=await this.a.cmd('save',{row:note.row,note:note.text,...(note.excerpt?{excerpt:note.excerpt}:{})},note.rev);}
      catch(error){note.result={ok:false,message:error?.message||T('Not kaydedilemedi.','Could not save the note.')};}
      finally{note.pending=false;}
      if(!this.dead&&note.identity===this.a.identity?.())this.finishNote(note);
    }
    async runWordAction(button) {
      const word = this.s.word;
      if (!word || word.pending) return;
      if(word.rev!==this.a.state()?.rev){this.closeWord();return;}
      word.pending = true;
      this.paintWordPending();
      const action = button.dataset.a;
      try {
        const result = await this.run(action, {row:word.row,word:word.word,cueId:word.cueId}, word.rev);
        if(!this.dead&&this.s.word===word&&word.rev!==this.a.state()?.rev){this.closeWord();return;}
        if (!this.dead && result?.ok && this.s.word === word) {
          const focused = document.activeElement === button;
          this.s.word = {...word,...result,pending:false};
          this.drawWord();
          if (focused) this.q('.sh-word-card [data-a="'+action+'"]')?.focus({preventScroll:true});
        }
      } finally {
        word.pending = false;
        if(this.s.word===word&&!this.dead)this.paintWordPending();
      }
    }
    async openWord(row,word){
      this.closeNote();
      const openingFocus=document.activeElement;
      const line = this.lines[row];
      this.wordOpener = line?.contains(document.activeElement) ? document.activeElement
        : line?.querySelector('[data-a=cueSeek]:not(:disabled), [data-act=copy]') || this.q('[data-r=q]');
      const identity = this.a.identity?.(), revision = this.st?.rev, seq = this.wordSeq = (this.wordSeq || 0) + 1;
      const result = await this.run('wordInfo', {row,word}, revision);
      if(this.dead||seq!==this.wordSeq||identity!==this.a.identity?.()||revision!==this.a.state().rev||!result?.ok)return;
      this.s.word={...result,row,rev:revision,cueId:this.rows[row]?.id};this.drawWord();this.paint();
      if(document.activeElement===openingFocus)this.q('.sh-word-card [data-a=wordClose]')?.focus({preventScroll:true});
    }
    closeWord(){this.wordSeq=(this.wordSeq||0)+1;this.s.word=null;const box=this.q('.sh-word-card'),restore=box?.contains(document.activeElement);if(box){box.hidden=true;box.textContent='';}this.paint();if(restore)this.cardReturnTarget(this.wordOpener)?.focus({preventScroll:true});}
    paintWordPending(){
      const box=this.q('.sh-word-card'),pending=!!this.s.word?.pending;
      box.setAttribute('aria-busy',String(pending));
      for(const button of box.querySelectorAll('[data-a=wordLookup],[data-a=wordSave]'))button.setAttribute('aria-disabled',String(pending||button.disabled));
      const status=box.querySelector('[data-r=wordState]');if(status){status.hidden=!pending;if(pending)status.textContent=T('İşleniyor…','Working…');}
    }
    drawWord(){
      const word=this.s.word,box=this.q('.sh-word-card');if(!word){box.hidden=true;return;}box.hidden=false;
      box.innerHTML=`<header><h2>${esc(word.word)}</h2><button class="sh-btn" data-a="wordClose" type="button" aria-label="${T('Kapat','Close')}">${ic('close')}</button></header><div class="sh-word-body" tabindex="0" role="region" aria-label="${T('Sözcüğün altyazı bağlamı','Subtitle context for the word')}"><p class="sh-word-context">${esc(word.source)}</p>${word.translations.map(x=>`<p class="sh-word-translation">${esc(x)}</p>`).join('')}<small>${T('Altyazı bağlamı · sözlük tanımı değildir.','Subtitle context · not a dictionary definition.')}</small></div><small data-r="wordState" role="status" hidden></small><footer><button class="sh-btn" data-a="wordLookup" type="button" title="${T('Seçili sözcüğü mevcut sözlük tercihinizle uygulama dışında açar.','Opens the word outside the app with your existing dictionary preference.')}">${T('Sözlükte aç ↗','Open dictionary ↗')}</button><button class="sh-btn" data-a="wordSave" type="button" ${word.canSave?'':`disabled title="${T('Bu iz mevcut sözcük koleksiyonuna kaydedilemiyor.','This track cannot be saved to the existing word collection.')}"`}>${word.saved?T('Kayıtlı · Kaldır','Saved · Remove'):T('Sözcüğü kaydet','Save word')}</button></footer>`;
      this.paintWordPending();
    }
    frame() { const f = () => { if (this.dead) return; if (this.cur >= 0 && this.st && !this.st.paused) this.wordsTick(); this.raf = requestAnimationFrame(f); }; this.raf = requestAnimationFrame(f); }
    destroy() {
      if(this.dead)return;
      cancelAnimationFrame(this.readingLayoutRaf);
      if(this.readingAnchorLine){const previous=this.readingAnchorLine;previous.line.style.contentVisibility=previous.visibility;this.readingAnchorLine=null;}
      if(this.volumeWork.owner===this)this.volumeWork.owner=null;
      if(this.sleepWork.owner===this)this.sleepWork.owner=null;
      if(this.jumpWork.owner===this)this.jumpWork.owner=null;
      if(this.loopWork.owner===this)this.loopWork.owner=null;
      this.dead = true; document.removeEventListener('fullscreenchange', this.fullscreenChanged); cancelAnimationFrame(this.followRaf);root.removeEventListener('resize',this.followResize); clearInterval(this.timer); cancelAnimationFrame(this.raf); clearTimeout(this.toastT);clearTimeout(this.idleTimer); document.removeEventListener('keydown', this.keys, true);
      if (this.s.loop) {
        try {
          if(this.id0===(this.a.identity?.()??'')&&this.st?.rev===this.a.state()?.rev){
            Promise.resolve(this.a.cmd('loop', { on: false },this.st?.rev)).catch(()=>{});
          }
        } catch (_) { /* source may already have been released */ }
      }
      this.a.releaseSlot?.(); this.root.remove(); root.syncBrowserOcclusion?.();
    }
  }
  root.Sahne = Sahne; root.SahneFmt = fmt; root.SahneIcon = ic; root.SahneArt = artSVG;
})(typeof window !== 'undefined' ? window : globalThis);
