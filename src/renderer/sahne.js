/* SAHNE motoru v2 — podcast sahnesi ve çift dilli çalışma sahnesi.
   Arayüz tek yerde: maketlerde sahte oynatıcıyla, uygulamada mevcut ortak oynatma arayüzünün adaptörüyle çalışır.
   adapter = { identity(), info(), state(), cmd(type,value), panel?(), slot?(), releaseSlot?(), caps }
   state().rows[i] = { id, start, end, timed, src, trs:[metin], unc:[metin], words:[{s,e,t0,t1}]|null }
   Gerçek olmayan bilgi göstermez: dil kodu yoksa rozet yok, kelime doldurma yalnız gerçek kelime zamanı varsa. */
(function (root) {
  'use strict';
  const P = {
    play: 'M8 5.2v13.6a.6.6 0 0 0 .92.5l10.6-6.8a.6.6 0 0 0 0-1L8.92 4.7A.6.6 0 0 0 8 5.2Z', pause: 'M6.5 5h4v14h-4z|M13.5 5h4v14h-4z',
    prev: 'M6.5 5.5v13|M18 6.2v11.6a.5.5 0 0 1-.8.4l-8-5.8a.5.5 0 0 1 0-.8l8-5.8a.5.5 0 0 1 .8.4Z', next: 'M17.5 5.5v13|M6 6.2v11.6a.5.5 0 0 0 .8.4l8-5.8a.5.5 0 0 0 0-.8l-8-5.8a.5.5 0 0 0-.8.4Z',
    back: 'M11 5 5 10l6 5|M5 10h8a6 6 0 0 1 0 12h-2', fwd: 'M13 5l6 5-6 5|M19 10h-8a6 6 0 0 0 0 12h2', replay: 'M4 12a8 8 0 1 0 2.6-5.9|M4 4v5h5',
    loop: 'M17 2l4 4-4 4|M3 11V9a3 3 0 0 1 3-3h15|M7 22l-4-4 4-4|M21 13v2a3 3 0 0 1-3 3H3', moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5Z',
    focus: 'M4 9V5h4|M20 9V5h-4|M4 15v4h4|M20 15v4h-4', close: 'M6 6l12 12|M18 6 6 18', copy: 'M9 9h10v10H9z|M5 15V5h10', star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8Z',
    classic: 'M4 5h16v14H4z|M15 5v14', search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z|m15.5 15.5 4 4', swap: 'M7 7h13l-3-3|M17 17H4l3 3', chev: 'm15 5-7 7 7 7',
    volume: 'M11 5 6 9H3v6h3l5 4V5Z|M15 8a6 6 0 0 1 0 8|M18 5a10 10 0 0 1 0 14', mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 6 0Z|M6 11a6 6 0 0 0 12 0|M12 17v4', tools: 'M4 7h10|M18 7h2|M4 17h2|M10 17h10|M14 4v6|M6 14v6', down: 'M12 5v14|m6 13 6 6 6-6'
  };
  const FILLED = new Set(['play', 'pause']);
  const ic = (n) => `<svg class="i${FILLED.has(n) ? ' f' : ''}" viewBox="0 0 24 24" aria-hidden="true">${P[n].split('|').map((d) => `<path d="${d}"/>`).join('')}</svg>`;
  const fmt = (v) => { const s = Math.max(0, Math.floor(Number(v) || 0)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
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
      this.s = Object.assign({ focus: false, loop: false, loopRow: -1, sleep: 0, sleepAt: 0, disp: 'both', follow: true, idx: -2, key: '', panel: false, psig: '' }, opts.prefs || {}, { loop: false, loopRow: -1, sleep: 0, sleepAt: 0, follow: true, idx: -2, key: '', panel: false, psig: '' });
      this.lines = []; this.rows = []; this.dead = false; this.id0 = undefined; this.build(); this.tick();
      this.timer = setInterval(() => this.tick(), 120); this.raf = 0;
    }
    el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
    q(sel) { return this.root.querySelector(sel); }
    prefs() { return { focus: this.s.focus, disp: this.s.disp }; }
    buildStudy() {
      this.root = this.el(root.BrowserStudyView.markup({ mode: this.o.mode, caps: this.caps, display: this.s.disp, T, esc, icon: ic }));
      this.host.append(this.root);
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
      const main = this.q('.sh-main');
      const seg = () => `<div class="sh-seg" data-r="disp" style="--n:3;--i:${['src', 'both', 'tr'].indexOf(this.s.disp)}" role="group" aria-label="${T('Gösterilen metin', 'Shown text')}"><button type="button" data-d="src" aria-selected="${this.s.disp === 'src'}">${T('Kaynak', 'Source')}</button><button type="button" data-d="both" aria-selected="${this.s.disp === 'both'}">${T('İkisi', 'Both')}</button><button type="button" data-d="tr" aria-selected="${this.s.disp === 'tr'}">${T('Çeviri', 'Translation')}</button></div>`;
      const wave = () => `<div class="sh-wave" data-r="wave" role="slider" tabindex="0" aria-label="${T('Bölüm konumu', 'Episode position')}" title="${T('Çubuklar ses dalgası değil; transkriptteki konuşma yoğunluğudur.', 'Bars are not an audio waveform; they show speech density from the transcript.')}"><div class="bars" data-r="bars"></div><div class="bars fill" data-r="fill"></div><div class="head"></div><span class="tip" data-r="tip"></span></div>`;
      const loopChip = this.caps.loop ? `<button class="sh-chip" data-a="loop" type="button" aria-pressed="false">${ic('loop')}${T('Cümle döngüsü', 'Loop sentence')}</button>` : '';
      const follow = `<button class="sh-follow" data-a="follow" type="button" hidden>${ic('down')}${T('Konuşmaya dön', 'Back to speech')}</button>`;
      if (study) {
        main.append(this.el(`<div class="sh-theater"><div class="sh-audio-summary"><div class="sh-cover"><div class="sh-cover-art" data-r="cover"></div></div><div class="sh-meta"><span class="sh-eyebrow" data-r="eyebrow"></span><h1 class="sh-title" data-r="title"></h1><p class="sh-sub" data-r="sub"></p><div data-r="chaps" class="sh-chaps"></div></div></div><div class="sh-screenwrap"><div class="sh-ambi" aria-hidden="true"></div><div class="sh-screen"><div class="slot" data-r="slot"></div><div class="frame"></div></div></div>
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
      const r = this.a.cmd(type, v, revision);
      Promise.resolve(r).then((res) => { if (res && res.ok === false && !this.dead) this.toast(res.code === 'stale-source' || res.code === 'source-changed' ? T('Kaynak değişti; komut uygulanmadı.', 'The source changed; command not applied.') : res.code === 'unsupported' ? T('Bu kaynakta bu komut desteklenmiyor.', 'This source does not support that command.') : (res.message || T('Komut uygulanamadı.', 'Command could not be applied.'))); }).catch(() => {});
      return Promise.resolve(r);
    }
    bind() {
      const r = this.root, a = this.a;
      r.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a],[data-mode],[data-d],.sh-chap,[data-i],[data-act],[data-task]'); if (!b || !r.contains(b)) return;
        if (b.dataset.task) { this.startTask(b.dataset.task); return; }
        if (b.dataset.act) { e.stopPropagation(); this.act(b.dataset.act, +b.closest('[data-i]').dataset.i); return; }
        if (b.dataset.i !== undefined && !b.dataset.a) { const row = this.rows[+b.dataset.i]; if (row && row.timed) this.run('seekCue', +b.dataset.i); return; }
        if (b.classList.contains('sh-chap')) { this.run('seek', +b.dataset.t); return; }
        if (b.dataset.mode) { this.o.onMode?.(b.dataset.mode, this.prefs()); return; }
        if (b.dataset.d) { this.s.disp = b.dataset.d; this.applyDisp(); return; }
        switch (b.dataset.a) {
          case 'close': this.o.onClose?.(); break; case 'classic': this.o.onClassic?.(); break;
          case 'fullscreen':this.run('fullscreen');break;
          case 'assistant':this.run('assistant');break;
          case 'noteClose':this.closeNote();break;
          case 'noteSave':void this.saveNote();break;
          case 'noteSeek':if(this.s.note)this.run('seekCue',this.s.note.row,this.s.note.rev);break;
          case 'advanced':this.run('advanced');break;
          case 'display':{const modes=['both','src','tr'];this.s.disp=modes[(modes.indexOf(this.s.disp)+1)%3];this.applyDisp();break;}
          case 'queue':this.run('openQueued',Number(b.dataset.index));break;
          case 'wordClose':this.closeWord();break;
          case 'wordLookup':case 'wordSave':{const word=this.s.word;if(word)this.run(b.dataset.a,{row:word.row,word:word.word,cueId:word.cueId},word.rev).then(result=>{if(!this.dead&&result?.ok&&this.s.word===word){this.s.word={...word,...result};this.drawWord();}});break;}
          case 'toggle': this.run('toggle'); break; case 'prev': this.run('prevCue'); break; case 'next': this.run('nextCue'); break; case 'replay': this.run('replay'); break;
          case 'back': this.run('seekBy', -10); break; case 'fwd': this.run('seekBy', 10); break;
          case 'rate': { const cur = Number(a.state().rate) || 1, i = RATES.indexOf(cur); this.run('rate', RATES[(i + 1) % RATES.length]); break; }
          case 'loop': this.toggleLoop(); break;
          case 'focus': this.s.focus = !this.s.focus; this.paint(); break;
          case 'sleep': { const i = SLEEP.indexOf(this.s.sleep); this.s.sleep = SLEEP[(i + 1) % SLEEP.length]; this.s.sleepAt = this.s.sleep ? Date.now() + this.s.sleep * 60000 : 0; this.paint(); break; }
          case 'follow': {
            if (this.o.mode !== 'cinema' && this.s.follow) { this.s.follow = false; this.paint(); break; }
            const query = this.q('[data-r=q]'); if (query) query.value = '';
            this.filterRows(); this.s.follow = true; this.scrollToActive(true); this.paint(); break;
          }
          case 'transcript': this.s.transcript=!this.s.transcript;this.paint();break;
          case 'panel': this.s.panel = !this.s.panel; this.drawPanel(true); break;
          case 'jobcancel': this.a.panel?.().job?.cancel?.(); break; case 'jobretry': this.a.panel?.().job?.retry?.(); break;
        }
      });
      const wave = this.q('[data-r=wave]');
      const ratio = (e) => { const b = wave.getBoundingClientRect(); return b.width ? Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)) : 0; };
      wave.addEventListener('pointerdown', (e) => { if(e.target.closest?.('.sh-chap'))return; if (!this.canSeek) return; this.drag = true; wave.classList.add('drag'); wave.setPointerCapture(e.pointerId); this.dragR = ratio(e); this.tick(); });
      wave.addEventListener('pointermove', (e) => { const st = this.st || a.state(), dur = Number(st.duration) || 0, rr = ratio(e); if (this.drag) this.dragR = rr; const t = rr * dur, row = this.rows.find((c) => c.timed && t >= c.start && t < c.end), tip = this.q('[data-r=tip]'); tip.textContent = dur ? `${fmt(t)}${row ? ' · ' + (row.src || '').slice(0, 70) : ''}` : ''; tip.style.setProperty('--tx', Math.max(12, Math.min(88, rr * 100)) + '%'); });
      const end = (e) => { if (!this.drag) return; this.drag = false; wave.classList.remove('drag'); const d = Number(a.state().duration) || 0; if (d && this.canSeek) this.run('seek', ratio(e) * d); };
      wave.addEventListener('pointerup', end); wave.addEventListener('pointercancel', () => { this.drag = false; wave.classList.remove('drag'); });
      wave.addEventListener('keydown', (e) => { const k = { ArrowRight: 5, ArrowLeft: -5 }[e.key]; if (k && this.canSeek) { e.preventDefault(); this.run('seekBy', e.shiftKey ? k * 6 : k); } });
      const sc = this.q('[data-r=scroll]'); const manual = () => { if (this.s.follow) { this.s.follow = false; this.paint(); } };
      sc.addEventListener('wheel', manual, { passive: true }); sc.addEventListener('touchmove', manual, { passive: true });
      sc.addEventListener('pointerdown', (e) => { if (e.target === sc) manual(); });
      sc.addEventListener('keydown', (e) => { if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(e.key)) manual(); });
      const cover = this.q('.sh-cover'); if (cover) { cover.addEventListener('pointermove', (e) => { const b = cover.getBoundingClientRect(), x = (e.clientX - b.left) / b.width - .5, y = (e.clientY - b.top) / b.height - .5; cover.style.setProperty('--ry', (x * 14) + 'deg'); cover.style.setProperty('--rx', (-y * 14) + 'deg'); }); cover.addEventListener('pointerleave', () => { cover.style.setProperty('--ry', '0deg'); cover.style.setProperty('--rx', '0deg'); }); }
      const q = this.q('[data-r=q]'); if (q) q.addEventListener('input', () => { this.s.follow = false; this.filterRows(); this.paint(); });
      this.keys = (e) => { if (e.defaultPrevented || document.querySelector('dialog[open]') || !this.root.isConnected || e.target.closest?.('[contenteditable=true]') || e.key!=='Escape'&&e.target.closest?.('button') || e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return; const k = e.key.toLowerCase(); let h = true; if (k === ' ') this.run('toggle'); else if (k === 'j') this.run('prevCue'); else if (k === 'k') this.run('nextCue'); else if (k === 'l' && this.caps.loop) this.toggleLoop(); else if (k === 'f') { this.s.focus = !this.s.focus; this.paint(); } else if (k === 'escape') { if(this.s.note){this.closeNote();}else if(this.s.word){this.closeWord();}else if (this.s.panel) { this.s.panel = false; this.drawPanel(true); } else if(this.s.transcript){this.s.transcript=false;this.paint();}else this.o.onClose?.(); } else h = false; if (h) { e.preventDefault(); e.stopImmediatePropagation(); } };
      document.addEventListener('keydown', this.keys, true);
      r.addEventListener('dblclick',e=>{if(!(this.caps.cinema||this.caps.word)||!e.target.closest('.src,[data-r=s]'))return;const word=String(root.getSelection?.()||'').trim();const row=e.target.closest('[data-i]');if(word)this.openWord(row?Number(row.dataset.i):this.cur,word);});
      this.reveal=()=>{r.classList.remove('controls-idle');clearTimeout(this.idleTimer);if(this.o.mode==='cinema'&&!this.st?.paused&&!this.a.info().native)this.idleTimer=setTimeout(()=>{if(!this.dead&&!this.s.panel&&!this.s.transcript&&!this.s.word&&!r.contains(document.activeElement))r.classList.add('controls-idle');},2400);};
      r.addEventListener('pointermove',this.reveal);r.addEventListener('pointerdown',this.reveal);r.addEventListener('focusin',this.reveal);
      const volume=this.q('.sh-local-volume');if(volume)volume.oninput=()=>{this.run('volume',Number(volume.value));const output=volume.parentElement.querySelector('output');if(output)output.textContent=Math.round(Number(volume.value)*100)+'%';};
    }
    taskButtons() {
      return (this.a.actions?.() || []).map(action => `<button class="sh-btn${action.primary ? ' sh-primary' : ''}" type="button" data-task="${esc(action.id)}" ${action.disabled || this.taskPending ? 'disabled' : ''} title="${esc(action.hint || action.label)}">${ic(action.id === 'translate' ? 'swap' : 'mic')}<span>${esc(action.label)}</span></button>`).join('');
    }
    drawTasks() {
      const bar = this.q('[data-r=workbar]'), html = this.taskButtons();
      if (html !== this.taskHTML) { this.taskHTML = html; bar.innerHTML = html; bar.hidden = !html; }
    }
    async startTask(id) {
      if (this.taskPending) return;
      const action = (this.a.actions?.() || []).find(item => item.id === id);
      if (!action || action.disabled) return;
      this.taskPending = true; this.drawTasks();
      try { const result = await action.run(); if (!this.dead && result?.queued) this.toast(T('İşlem kuyruğa eklendi. İlerlemeyi İşlemler’den izleyebilirsiniz.', 'Task queued. Follow progress in Tasks.')); }
      catch (error) { if (!this.dead) this.toast(error?.message || T('İşlem başlatılamadı.', 'Could not start task.')); }
      finally { this.taskPending = false; if (!this.dead) this.drawTasks(); }
    }
    toggleLoop() {
      if (!this.caps.loop) return; const on = !this.s.loop, idx = this.s.idx >= 0 ? this.s.idx : this.cur;
      if (on && !(idx >= 0 && this.rows[idx]?.timed)) { this.toast(T('Döngü için önce zamanlı bir cümle çalmalı.', 'Play a timed sentence first to loop it.')); return; }
      this.run('loop', on ? { on: true, row: idx } : { on: false }).then(res=>{if(!this.dead&&res?.ok){this.s.loop=on;this.s.loopRow=on?idx:-1;this.paint();}});
    }
    act(kind, i) {
      const c = this.rows[i]; if (!c) return;
      if (kind === 'loop') { if (!c.timed || !this.caps.loop) return; this.run('loop', { on: true, row: i }).then(res=>{if(!this.dead&&res?.ok){this.s.loop=true;this.s.loopRow=i;this.run('seekCue',i);this.paint();}}); }
      else if (kind === 'copy') { const text = [c.src, ...c.trs].filter(Boolean).join('\n'); try { navigator.clipboard?.writeText(text); } catch (_) { /* pano yok */ } this.run('copy', text); }
      else if (kind === 'save') this.openNote(i);
    }
    filterRows() {
      const query = this.q('[data-r=q]')?.value.trim().toLocaleLowerCase() || '';
      this.lines.forEach((line, index) => { const row = this.rows[index]; line.hidden = !!query && ![row.src, ...row.trs, ...(row.unc || [])].join(' ').toLocaleLowerCase().includes(query); });
    }
    applyDisp() { const d = this.s.disp, seg = this.q('[data-r=disp]'); if (!seg) return; seg.style.setProperty('--i', ['src', 'both', 'tr'].indexOf(d)); seg.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.d === d)); if (this.o.mode !== 'cinema') b.setAttribute('aria-pressed', String(b.dataset.d === d)); }); this.root.classList.toggle('hide-src', d === 'tr'); this.root.classList.toggle('hide-tr', d === 'src'); }
    paint() {
      const r = this.root, s = this.s, st = this.st || this.a.state();
      r.classList.toggle('sh-focus', s.focus); r.classList.toggle('sh-playing', !st.paused);if(st.paused)r.classList.remove('controls-idle');
      for (const b of r.querySelectorAll('[data-a=loop]')) { b.setAttribute('aria-pressed', String(s.loop)); b.lastChild.textContent = s.loop && s.loopRow >= 0 && this.rows[s.loopRow] ? ` ${T('Döngü', 'Loop')} · ${fmt(this.rows[s.loopRow].start)}` : T('Cümle döngüsü', 'Loop sentence'); }
      for (const b of r.querySelectorAll('[data-a=focus]')) b.setAttribute('aria-pressed', String(s.focus));
      const sl = r.querySelector('[data-a=sleep]'); if (sl) { sl.setAttribute('aria-pressed', String(!!s.sleep)); r.querySelector('[data-r=sleeplbl]').textContent = s.sleep ? `${Math.max(0, Math.ceil((s.sleepAt - Date.now()) / 60000))} ${T('dk', 'min')}` : T('Uyku', 'Sleep'); }
      for (const b of r.querySelectorAll('[data-a=rate]')) b.textContent = (Number(st.rate) || 1) + '×';
      for (const b of r.querySelectorAll('[data-a=toggle]')) { const want = st.paused ? 'play' : 'pause'; if (b.dataset.ic !== want) { b.dataset.ic = want; b.innerHTML = ic(want); b.setAttribute('aria-label', st.paused ? T('Oynat', 'Play') : T('Duraklat', 'Pause')); } }
      r.classList.toggle('transcript-open',!!s.transcript);r.querySelectorAll('[data-a=transcript]').forEach(button=>button.setAttribute('aria-expanded',String(!!s.transcript)));
      const overlay = !!s.panel || !!s.word || !!s.note || (!!s.transcript && window.innerWidth < 1100);
      if(r.hasAttribute('data-pw-occludes-native')!==overlay){if(overlay)r.setAttribute('data-pw-occludes-native','true');else r.removeAttribute('data-pw-occludes-native');root.syncBrowserOcclusion?.();}
      const f = r.querySelector('[data-a=follow]'); if (f) {
        if (this.o.mode === 'cinema') f.hidden = s.follow || this.cur < 0 || !this.rows[this.cur]?.timed;
        else { const timed=this.rows.some(row=>row.timed);f.hidden=false;f.disabled=!timed;f.setAttribute('aria-pressed',String(timed&&s.follow));f.title=timed?'':T('Zamansız metinde otomatik takip yoktur.','Automatic follow is unavailable for untimed text.');f.querySelector('span').textContent=!timed?T('Salt okunur','Read-only'):s.follow?T('Takip açık','Follow on'):T('Konuşmaya dön','Back to speech'); }
      }
      r.querySelectorAll('[data-a=panel]').forEach(button=>button.setAttribute('aria-pressed', String(s.panel)));
    }
    setTint(rgb) { const c = rgb || [213, 163, 92]; const [h] = rgb2hsl(c); this.root.style.setProperty('--sh-tint', `rgb(${c.map(Math.round).join(' ')})`); this.root.style.setProperty('--sh-tint2', `hsl(${(h + 150) % 360} 55% 58%)`); }
    rowHTML(c, i, study) {
      let src = esc(c.src);
      if (c.words && c.words.length) { let out = '', at = 0; const text = String(c.src); c.words.forEach((w, k) => { out += esc(text.slice(at, w.s)) + `<span class="w" data-k="${k}">${esc(text.slice(w.s, w.e))}</span>`; at = w.e; }); out += esc(text.slice(at)); src = out; }
      const shared = this.o.mode !== 'cinema';
      const trs = c.trs.map((t) => `<span class="tr${shared ? ' cue-card-tr' : ''}">${esc(t)}</span>`).join('');
      const unc = c.unc && c.unc.length ? `<span class="tr unc"><em>${T('Eşleşme belirsiz', 'Match uncertain')}</em>${c.unc.map((t) => `<span>${esc(t)}</span>`).join('')}</span>` : '';
      const acts = study && !shared ? '' : `<span class="acts">${this.caps.loop && c.timed ? `<button type="button" class="act" data-act="loop" title="${T('Bu cümleyi döngüye al', 'Loop this sentence')}" aria-label="${T('Döngü', 'Loop')}">${ic('loop')}</button>` : ''}<button type="button" class="act" data-act="copy" title="${T('Kopyala', 'Copy')}" aria-label="${T('Kopyala', 'Copy')}">${ic('copy')}</button>${this.caps.save ? `<button type="button" class="act" data-act="save" title="${T('Cümleyi veya seçili metni kaydet', 'Save sentence or selected text')}" aria-label="${T('Cümleyi veya seçili metni kaydet', 'Save sentence or selected text')}">${ic('star')}</button>` : ''}</span>`;
      return `${c.timed ? `<span class="at${shared ? ' cue-card-time' : ''}">${fmt(c.start)}</span>` : ''}<span class="src${shared ? ' cue-card-src' : ''}" dir="auto">${src}</span>${trs}${unc}${acts}`;
    }
    rebuild(st, info) {
      this.rows = st.rows; const scroll = this.q('[data-r=scroll]'), study = this.o.mode !== 'podcast'; scroll.textContent = ''; this.lines = [];
      const frag = document.createDocumentFragment();
      if(!st.rows.length){const empty=this.el(`<div class="sh-empty">${ic('mic')}<h2>${T('Konuşma burada metne dönüşür.','The conversation becomes text here.')}</h2><p>${T('Whisper ile bu bölümü yazıya dökün; çeviriyi aynı zaman çizelgesinde okuyun. Mevcut transkript ve ileri seçenekler İşlemler’de.','Transcribe this episode with Whisper and read its translation on the same timeline. Existing transcripts and advanced options are in Tasks.')}</p><button class="sh-btn" type="button" data-a="panel">${T('İşlemleri aç','Open tasks')}</button></div>`);frag.append(empty);}
      if (st.untimed) { const n = document.createElement('p'); n.className = 'sh-note'; n.textContent = st.timingNotice || T('Bu transkript zamansız: satırlar yalnızca okunur; atlama ve etkin satır yoktur.', 'This transcript has no timing: lines are read-only; no seeking or active line.'); frag.append(n); }
      st.rows.forEach((c, i) => {
        const row = document.createElement('div'); row.className = (this.o.mode !== 'cinema' ? 'sh-card cue-card' : 'sh-card') + (c.timed ? '' : ' is-untimed'); row.dataset.i = i;
        if (c.timed) { row.tabIndex = 0; row.setAttribute('role', 'button'); row.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === row) this.run('seekCue', i); }); }
        row.innerHTML = this.rowHTML(c, i, study); frag.append(row); this.lines.push(row);
      });
      scroll.append(frag); this.filterRows(); this.s.idx = -2; this.drawWave(st, info); this.words = this.lines.map((l, i) => this.rows[i].words ? [...l.querySelectorAll('.w')] : null);
      const li = info.langs || {}; for (const [k, v, label] of [['ls', li.src], ['lt', li.tr], ['lsb', li.src, T('Kaynak', 'Source')], ['ltb', li.tr, T('Çeviri', 'Translation')]]) { const n = this.q(`[data-r=${k}]`); if (!n) continue; if (label) n.innerHTML = `${lang(v)}${label}`; else n.textContent = v ? String(v).slice(0, 3).toUpperCase() : ''; }
    }
    drawWave(st, info) {
      const dur = Number(st.duration) || 0, d = new Array(BARS).fill(0); let any = false;
      if (dur > 0) for (const c of st.rows) { if (!c.timed) continue; any = true; const len = (c.src || '').length, s0 = Math.max(0, c.start), e0 = Math.min(dur, c.end); if (!(e0 > s0)) continue; const a = Math.min(BARS - 1, Math.floor(s0 / dur * BARS)), b = Math.min(BARS - 1, Math.floor((e0 - 1e-6) / dur * BARS)); for (let i = a; i <= b; i++) d[i] += len / (b - a + 1); }
      const mx = Math.max(...d, 1), hs = d.map((v) => v ? .24 + .76 * Math.sqrt(v / mx) : .1);
      for (const n of [this.q('[data-r=bars]'), this.q('[data-r=fill]')]) n.replaceChildren(...hs.map((h) => { const i = document.createElement('i'); i.style.setProperty('--h', h.toFixed(3)); return i; }));
      const lg = this.q('[data-r=legend]'); if (lg) lg.textContent = any ? T('konuşma yoğunluğu · metinden', 'speech density · from text') : '';
      const w = this.q('[data-r=wave]');w.dataset.density=String(any); w.querySelectorAll('.mark').forEach((n) => n.remove());
      if (dur) for (const c of (info.chapters || [])) if (c.t > 0) { const m = document.createElement('i'); m.className = 'mark'; m.style.left = (c.t / dur * 100) + '%'; w.append(m); }
    }
    tick() {
      if(this.dead)return; if(document.hidden){if(this.s.sleep&&Date.now()>=this.s.sleepAt){this.s.sleep=0;this.run('pause');}return;} const a = this.a, s = this.s;
      const id = a.identity ? a.identity() : ''; if (this.id0 === undefined) this.id0 = id; else if (id !== this.id0) { if (!this.gone) { this.gone = true; this.o.onSource?.(id, this.prefs()); } return; }
      const st = this.st = a.state(), info = a.info();if(this.s.word&&this.s.word.rev!==st.rev)this.closeWord();if(this.s.note&&this.s.note.rev!==st.rev)this.closeNote();
      this.canSeek = st.canSeek !== false && Number(st.duration) > 0;
      const key = `${st.rev}:${st.timingNotice||''}:${st.rows.length}:${Math.round(st.duration || 0)}:${info.title}:${info.cover||''}:${info.sub||''}:${info.eyebrow||''}:${(info.langs || {}).src}:${(info.langs || {}).tr}:${JSON.stringify(info.chapters||[])}`;
      if (key !== s.key) {
        s.key = key; this.rebuild(st, info); this.setTint(info.tint);
        const t = this.q('[data-r=title]'); if (t) { t.textContent = info.title || T('Başlıksız bölüm', 'Untitled episode'); this.q('[data-r=eyebrow]').textContent = info.eyebrow || T('Şimdi çalıyor', 'Now playing'); this.q('[data-r=sub]').textContent = info.sub || ''; const c = this.q('[data-r=cover]'); c.innerHTML = info.cover ? `<img src="${esc(info.cover)}" alt="">` : `<span class="sh-initials">${esc(String(info.title||'').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toLocaleUpperCase())}</span>`; const ch = this.q('[data-r=chaps]'); ch.innerHTML = (info.chapters || []).map((x) => `<button class="sh-chap" type="button" data-t="${x.t}">${esc(x.label)}</button>`).join(''); }
      }
      if (s.sleep && Date.now() >= s.sleepAt) { s.sleep = 0; this.run('pause'); }
      const dur = Number(st.duration) || 0, time = this.drag ? this.dragR * dur : Number(st.time) || 0, p = dur ? Math.min(100, time / dur * 100) : 0;
      const w = this.q('[data-r=wave]'); w.style.setProperty('--p', p + '%'); w.setAttribute('aria-disabled', String(!this.canSeek));
      const t0 = this.q('[data-r=t0]'); if (t0) { t0.textContent = fmt(time); this.q('[data-r=t1]').textContent = dur ? '-' + fmt(Math.max(0, dur - time)) : '--:--'; }
      w.setAttribute('aria-valuenow', Math.round(time)); w.setAttribute('aria-valuemax', Math.round(dur)); w.setAttribute('aria-valuetext', `${fmt(time)} / ${dur ? fmt(dur) : '--:--'}`);
      const chNow = (info.chapters || []).filter((c) => c.t <= time).at(-1); this.root.querySelectorAll('.sh-chap').forEach((b) => b.classList.toggle('on', !!chNow && +b.dataset.t === chNow.t));
      let idx = -1; this.rows.forEach((c, i) => { if (c.timed && c.start <= time && time < c.end && (idx < 0 || c.start >= this.rows[idx].start)) idx = i; });
      this.time = time; this.cur = idx;this.root.classList.toggle('sh-audio',!!info.audio);
      if (idx !== s.idx) { const prev = s.idx; s.idx = idx; this.lines.forEach((l, i) => { const d = idx < 0 ? 9 : Math.abs(i - idx); l.style.setProperty('--d', Math.min(d, 9)); l.classList.toggle('on', i === idx); if(i===idx)l.setAttribute('aria-current','true');else l.removeAttribute('aria-current'); }); this.onActive(idx, prev); }
      if(this.o.mode==='cinema')this.drawCinema(info,st);this.wordsTick(); this.drawTasks(); const volume=this.q('.sh-local-volume');if(volume&&Number.isFinite(st.volume)&&document.activeElement!==volume){volume.value=st.volume;const output=volume.parentElement.querySelector('output');if(output)output.textContent=Math.round(st.volume*100)+'%';} const subs=this.q('[data-r=subs]');if(subs)subs.hidden=!!info.audio&&idx<0; this.drawJob(); this.drawPanel(false); this.paint();
    }
    wordsTick() {
      const idx = this.cur; if (idx < 0) return; const row = this.rows[idx], ws = this.words && this.words[idx]; const c = row; const time = this.time;
      if (ws && row.words) row.words.forEach((w, k) => { const n = ws[k]; if (!n) return; n.classList.toggle('done', time >= w.t1); n.classList.toggle('now', time >= w.t0 && time < w.t1); });
      const l = this.lines[idx], span = Math.max(.01, c.end - c.start), lp = Math.max(0, Math.min(1, (time - c.start) / span)); if (l) { l.style.setProperty('--lp', (lp * 100).toFixed(1) + '%'); l.style.setProperty('--lpn', lp.toFixed(3)); }
    }
    motionAllowed(){return !document.hidden && !root.matchMedia?.('(prefers-reduced-motion: reduce)').matches && !['off','reduced'].includes(document.documentElement.dataset.cinemaMotion) && (root.PlayerUiKit?.motionAllowed?.()??true);}
    scrollToActive(force) {
      const sc = this.q('[data-r=scroll]'), l = this.lines[this.cur]; if (!l) return;
      const top = l.offsetTop - (sc.clientHeight - l.offsetHeight) / (this.o.mode !== 'podcast' ? 3 : 2); sc.scrollTo({ top: Math.max(0, top), behavior: force || !this.motionAllowed() || this.s.idx === -2 ? 'auto' : 'smooth' });
    }
    onActive(idx, prev) {
      const c = this.rows[idx];
      if (this.q('[data-r=subs]')) {
        const sb = this.q('[data-r=subs]'); sb.classList.add('swap'); clearTimeout(this.swapT);
        this.swapT = setTimeout(() => { const sEl = this.q('[data-r=s]'), tEl = this.q('[data-r=t]'); sEl.textContent = c ? c.src : ''; tEl.textContent = c ? c.trs.join('  ') : ''; const n = (c ? c.src.length + c.trs.join('').length : 0); sb.classList.toggle('long', n > 150); sb.classList.toggle('xlong', n > 260); sb.scrollTop = 0; sb.classList.remove('swap'); }, c ? 140 : 0);
      }
      if (this.lines[idx] && this.s.follow) { const sc = this.q('[data-r=scroll]'), l = this.lines[idx]; const top = l.offsetTop - (sc.clientHeight - l.offsetHeight) / (this.o.mode !== 'podcast' ? 3 : 2); sc.scrollTo({ top: Math.max(0, top), behavior: prev === -2 || !this.motionAllowed() ? 'auto' : 'smooth' }); }
    }
    drawJob() {
      const p = this.a.panel?.(); const j = p && p.job, box = this.q('[data-r=job]'); if (!box) return;
      const show = !!j && (j.state === 'running' || j.state === 'failed'); if (box.hidden === show) box.hidden = !show; if (!show) return;
      box.dataset.state = j.state; this.q('[data-r=jobt]').textContent = j.text || '';
      const bar = this.q('[data-r=jobbar]'); bar.hidden = j.state !== 'running'; bar.classList.toggle('ind', j.progress == null); bar.firstElementChild.style.width = j.progress == null ? '' : Math.round(j.progress * 100) + '%';
      this.q('[data-a=jobcancel]').hidden = !(j.state === 'running' && j.cancel); this.q('[data-a=jobretry]').hidden = !(j.state === 'failed' && j.retry);
    }
    drawPanel(force) {
      const box = this.q('[data-r=panel]'); if (!box) return; box.hidden = !this.s.panel; this.root.classList.toggle('panel-open', this.s.panel); this.paint(); if (!this.s.panel) return;
      const p = this.a.panel?.(); if (!p) { box.textContent = ''; return; }
      const sig = JSON.stringify(p.sections.map((s) => [s.title, s.items.map((i) => [i.type, i.label, i.value, i.disabled, i.pressed, i.hint, (i.options || []).map((o) => o.value + o.label).join('|'), i.text])]));
      if (!force && sig === this.s.psig) return; this.s.psig = sig;
      const focused = box.contains(document.activeElement) ? document.activeElement.dataset.pid : null; box.textContent = '';
      box.append(this.el(`<div class="sh-panel-h"><b>${T('İşlemler', 'Tasks')}</b><button class="sh-btn icon" type="button" data-pclose aria-label="${T('Kapat', 'Close')}">${ic('close')}</button></div>`));
      box.querySelector('[data-pclose]').onclick = () => { this.s.panel = false; this.drawPanel(true); this.paint(); };
      p.sections.forEach((sec) => {
        const s = this.el(`<section class="sh-psec"><h3>${esc(sec.title)}</h3></section>`);
        sec.items.forEach((it, n) => {
          if (it.type === 'note') { s.append(this.el(`<p class="sh-pnote">${esc(it.text)}</p>`)); return; }
          if(it.type==='range'){const L=this.el(`<label class="sh-psel"><span>${esc(it.label)}</span><input type="range" min="0" max="1" step="0.01" aria-label="${esc(it.label)}"></label>`);const input=L.querySelector('input');input.value=String(it.value);input.oninput=()=>it.onChange(Number(input.value));s.append(L);return;}
          if (it.type === 'select') { const L = this.el(`<div class="sh-psel"><span>${esc(it.label)}</span></div>`);const select=root.PlayerUiKit.select({label:it.label,value:it.value,options:it.options,searchable:true,onChange:it.onChange});select.trigger.dataset.pid=`${sec.title}:${n}`;L.append(select);s.append(L); return; }
          const b = this.el(`<button type="button" class="sh-pbtn${it.primary ? ' pri' : ''}" data-pid="${sec.title}:${n}" ${it.disabled ? 'disabled' : ''} ${it.pressed !== undefined ? `aria-pressed="${!!it.pressed}"` : ''}><span>${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button>`);
          b.onclick = () => { it.run?.(); this.tick(); }; s.append(b);
        });
        box.append(s);
      });
      if (focused) [...box.querySelectorAll('[data-pid]')].find(n=>n.dataset.pid===focused)?.focus();
    }
    drawCinema(info,st){
      const meta=this.q('.sh-cinema-meta');meta.querySelector('h1').textContent=info.title||T('Oynatıcı','Player');meta.querySelector('p').textContent=info.sub||'';
      this.root.classList.toggle('sh-native',!!info.native);const clearance=Math.ceil(this.q('.sh-dock').getBoundingClientRect().height)+40;if(this.dockClearance!==clearance){this.dockClearance=clearance;this.root.style.setProperty('--sh-local-dock-clearance',clearance+'px');}
      this.q('.sh-local-clock').textContent=fmt(st.time)+' / '+(Number(st.duration)>0?fmt(st.duration):'—');
      const language=this.q('[data-a=display]');language.textContent=this.s.disp==='both'?T('İki dil','Both languages'):this.s.disp==='src'?T('Kaynak','Source'):T('Çeviri','Translation');
      const list=info.queue||[],signature=JSON.stringify(list);if(signature!==this.queueSig){this.queueSig=signature;const target=this.q('.sh-up-next');target.textContent='';list.forEach((item,i)=>{const button=this.el(`<button class="sh-next-item" type="button" data-a="queue" data-index="${item.index}"><small>${i?T('ARDINDAN','THEN'):T('SIRADAKİ','UP NEXT')}</small><strong>${esc(item.title)}</strong></button>`);target.append(button);});}
      const chapters=info.chapters||[],sig=JSON.stringify(chapters)+':'+st.duration;if(sig!==this.chapterSig){this.chapterSig=sig;const strip=this.q('.sh-cinema-chapters');strip.textContent='';strip.hidden=!chapters.length;chapters.forEach((c,i)=>{const end=chapters[i+1]?.t||st.duration,button=this.el(`<button class="sh-chap" type="button" data-t="${c.t}" title="${esc(c.label)} · ${fmt(c.t)}" aria-label="${esc(c.label)} · ${fmt(c.t)}"><span>${esc(c.label)}</span></button>`);button.style.flex=String(Math.max(.01,end-c.t));strip.append(button);});}
      const paused=!!st.paused;if(this.lastPause!==paused){this.lastPause=paused;this.reveal?.();}
    }
    openNote(row){
      const cue=this.rows[row];if(!cue||!this.caps.save)return;
      const selection=root.getSelection?.(),source=this.lines[row]?.querySelector('.src');
      const excerpt=selection?.rangeCount&&source?.contains(selection.anchorNode)&&source.contains(selection.focusNode)?String(selection).trim():'';
      this.closeWord();this.s.note={row,rev:this.st?.rev,...(excerpt&&cue.src.includes(excerpt)?{excerpt}:{})};const box=this.q('.sh-note-card');box.hidden=false;
      box.innerHTML=`<header><h2>${T('Cümle ve not','Sentence and note')}</h2><button class="sh-btn" type="button" data-a="noteClose" aria-label="${T('Kapat','Close')}">${ic('close')}</button></header><p class="sh-word-context" dir="auto">${esc(this.s.note.excerpt||cue.src)}</p>${(this.s.note.excerpt?[]:cue.trs).map(x=>`<p class="sh-word-translation" dir="auto">${esc(x)}</p>`).join('')}<label>${T('Notunuz (isteğe bağlı)','Your note (optional)')}<textarea rows="3" maxlength="8000" data-note-text></textarea></label><footer><button class="sh-btn" type="button" data-a="noteSave">${T('Araştırma defterine kaydet','Save to research notebook')}</button>${cue.timed?`<button class="sh-btn" type="button" data-a="noteSeek">${T('Cümleye dön','Return to sentence')} · ${fmt(cue.start)}</button>`:`<small>${T('Zamansız metin · atlama yok','Untimed text · no seeking')}</small>`}</footer>`;
      this.paint();box.querySelector('textarea').focus();
    }
    closeNote(){this.s.note=null;const box=this.q('.sh-note-card');if(box){box.hidden=true;box.textContent='';}this.paint();}
    async saveNote(){
      const note=this.s.note;if(!note||note.pending)return;note.pending=true;
      const box=this.q('.sh-note-card'),button=box.querySelector('[data-a=noteSave]');button.disabled=true;
      const result=await this.run('save',{row:note.row,note:box.querySelector('textarea').value,...(note.excerpt?{excerpt:note.excerpt}:{})},note.rev);
      if(this.dead||this.s.note!==note)return;
      note.pending=false;button.disabled=false;
      if(result?.ok){this.closeNote();this.toast(T('Araştırma defterine kaydedildi.','Saved to research notebook.'));}
    }
    async openWord(row,word){
      this.closeNote();
      const revision=this.st?.rev,seq=this.wordSeq=(this.wordSeq||0)+1,result=await this.a.cmd('wordInfo',{row,word},revision);
      if(this.dead||seq!==this.wordSeq||revision!==this.st?.rev||!result?.ok)return;
      this.s.word={...result,row,rev:revision,cueId:this.rows[row]?.id};this.drawWord();this.paint();
    }
    closeWord(){this.wordSeq=(this.wordSeq||0)+1;this.s.word=null;const box=this.q('.sh-word-card');if(box){box.hidden=true;box.textContent='';}this.paint();}
    drawWord(){
      const word=this.s.word,box=this.q('.sh-word-card');if(!word){box.hidden=true;return;}box.hidden=false;
      box.innerHTML=`<header><h2>${esc(word.word)}</h2><button class="sh-btn" data-a="wordClose" type="button" aria-label="${T('Kapat','Close')}">${ic('close')}</button></header><p class="sh-word-context">${esc(word.source)}</p>${word.translations.map(x=>`<p class="sh-word-translation">${esc(x)}</p>`).join('')}<small>${T('Altyazı bağlamı · sözlük tanımı değildir.','Subtitle context · not a dictionary definition.')}</small><footer><button class="sh-btn" data-a="wordLookup" type="button" title="${T('Seçili sözcüğü mevcut sözlük tercihinizle uygulama dışında açar.','Opens the word outside the app with your existing dictionary preference.')}">${T('Sözlükte aç ↗','Open dictionary ↗')}</button><button class="sh-btn" data-a="wordSave" type="button" ${word.canSave?'':`disabled title="${T('Bu iz mevcut sözcük koleksiyonuna kaydedilemiyor.','This track cannot be saved to the existing word collection.')}"`}>${word.saved?T('Kayıtlı · Kaldır','Saved · Remove'):T('Sözcüğü kaydet','Save word')}</button></footer>`;
    }
    frame() { const f = () => { if (this.dead) return; if (this.cur >= 0 && this.st && !this.st.paused) this.wordsTick(); this.raf = requestAnimationFrame(f); }; this.raf = requestAnimationFrame(f); }
    destroy() { this.dead = true; clearInterval(this.timer); cancelAnimationFrame(this.raf); clearTimeout(this.swapT); clearTimeout(this.toastT);clearTimeout(this.idleTimer); document.removeEventListener('keydown', this.keys, true); if (this.s.loop) { try { this.a.cmd('loop', { on: false }); } catch (_) { /* kaynak gitmiş olabilir */ } } this.a.releaseSlot?.(); this.root.remove(); root.syncBrowserOcclusion?.(); }
  }
  root.Sahne = Sahne; root.SahneFmt = fmt; root.SahneIcon = ic; root.SahneArt = artSVG;
})(typeof window !== 'undefined' ? window : globalThis);
