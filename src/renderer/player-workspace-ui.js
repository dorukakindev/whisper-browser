/* Oynatıcı çalışma alanı arayüzü: medya alanı (slot) + tek kontrol satırı + tek timeline + sağ panel (Transkript / Asistan / Sıra).
   Gerçek video/native yüzey BU MODÜLDE ÇİZİLMEZ: stageMode:'slot' ile mevcut video sarmalayıcısı slot'a taşınır.
   Saf render + kimlik denetimli komutlar: komutlar handlers aracılığıyla köprüye (player-workspace-model) gider.
   Doğal metin seçimi ve Ctrl+C korunur; zaman damgası seek yapar, metin seçimi yalnız seçer. */
(function (root, factory) {
  const isNode = typeof require === 'function' && typeof module === 'object';
  const api = factory(isNode ? require('./player-ui-kit.js') : root.PlayerUiKit);
  if (isNode) module.exports = api; else root.PlayerWorkspaceUI = api;
})(globalThis, (Kit) => {
  'use strict';
  const { h, icon, t, cover, formatClock } = Kit;
  const foldChar = (c) => c.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
  const fold = (s) => Array.from(String(s == null ? '' : s)).map(foldChar).join('');

  /** Arama vurgusu: katlanmış eşleşmeyi özgün metin aralığına geri eşler; <mark> yalnız textContent ile. */
  function appendHighlighted(el, text, query) {
    const q = fold(query).trim(); const src = Array.from(String(text == null ? '' : text));
    if (!q) { el.textContent = src.join(''); return; }
    let folded = ''; const map = [];
    src.forEach((ch, i) => { const f = foldChar(ch); for (let k = 0; k < f.length; k++) map.push(i); folded += f; });
    let from = 0; let at = folded.indexOf(q);
    if (at < 0) { el.textContent = src.join(''); return; }
    while (at >= 0) {
      const a = map[at]; const b = map[at + q.length - 1] + 1;
      if (a >= from) { el.append(document.createTextNode(src.slice(from, a).join(''))); el.append(h('mark', { text: src.slice(a, b).join('') })); from = b; }
      at = folded.indexOf(q, at + q.length);
    }
    el.append(document.createTextNode(src.slice(from).join('')));
  }
  function rowMatches(row, q) { const f = fold(q).trim(); return !f || fold(row.sourceText + ' ' + row.secondaryText).includes(f); }

  function controls(vm, handlers) {
    const L = vm.locale; const s = vm.snapshot;
    const btn = (ic, key, onClick, extra) => h('button', { class: 'pw-btn pw-btn--lg pw-btn--icon pw-btn--ghost' + (extra && extra.cls ? ' ' + extra.cls : ''), type: 'button', 'aria-label': t(L, key), title: t(L, key), 'aria-pressed': extra && extra.pressed !== undefined ? String(!!extra.pressed) : null, on: { click: onClick } }, icon(ic));
    const langs=[vm.sourceLang,vm.secondaryLang].filter(Boolean).map(lang=>lang.toLocaleUpperCase('tr'));
    const modes = [['source', 'modeSource'], ['secondary', 'modeSecondary'], ['both', 'modeBoth'], ['off', 'modeOff']];
    return h('div', { class: 'pw-controls', role: 'toolbar', 'aria-label': vm.media.title },
      btn('skip-prev', 'prevCue', () => handlers.onPrevCue && handlers.onPrevCue()),
      h('button', { class: 'pw-btn pw-btn--primary pw-btn--lg pw-btn--icon', type: 'button', 'aria-label': t(L, s.paused ? 'play' : 'pause'), on: { click: () => handlers.onTogglePlay && handlers.onTogglePlay() } }, icon(s.paused ? 'play' : 'pause')),
      btn('skip-next', 'nextCue', () => handlers.onNextCue && handlers.onNextCue()),
      btn('replay', 'replayCue', () => handlers.onReplay && handlers.onReplay()),
      btn('ab', 'abLoop', () => handlers.onToggleAb && handlers.onToggleAb(), { pressed: !!vm.ab }),
      h('span', { class: 'pw-time pw-num', role: 'timer', text: `${formatClock(s.time)} / ${formatClock(s.duration)}` }),
      h('span', { class: 'pw-controls__spacer' }),
      btn('volume', 'volume', () => handlers.onVolume && handlers.onVolume()),
      choice(t(L, 'speed'), s.rate, [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4].map(value => ({value:String(value),label:`${value}×`})), value => handlers.onRate?.(Number(value)), 'pw-speed-choice'),
      choice(t(L, 'subtitleMode'), vm.subtitleMode, modes.map(([value,key]) => ({value,label:`${t(L,'subtitleMode')}: ${value==='both'&&langs.length===2?langs.join(' + '):t(L,key)}`})), value => handlers.onSubtitleMode?.(value), 'pw-subtitle-choice'),
      tools(L, handlers),
      btn('fullscreen', 'fullscreen', () => handlers.onFullscreen && handlers.onFullscreen()));
  }

  function choice(label, value, options, onChange, cls = '') {
    if (Kit.select) { const node = Kit.select({label,value:String(value),options,onChange}); node.classList.add(cls || 'pw-scope-choice'); node.trigger.title=options.find(option=>String(option.value)===String(value))?.label||label; return node; }
    return h('label', {class: cls}, h('span', {class:'pw-sr-only',text:label}), h('select', {class:'pw-select','aria-label':label,on:{change:e=>onChange(e.target.value)}}, options.map(o=>h('option',{value:o.value,selected:String(value)===o.value,text:o.label}))));
  }
  function tools(L, handlers) {
    const menu = h('div', {class:'pw-tools__menu',hidden:true,popover:'auto','aria-label':t(L,'tools')});
    const setOpen=open=>{
      if(open){menu.hidden=false;if(menu.showPopover){menu.showPopover();const rect=button.getBoundingClientRect();menu.style.position='fixed';menu.style.inset='auto';menu.style.left=Math.max(16,Math.min(rect.right-260,window.innerWidth-276))+'px';menu.style.top=Math.max(16,rect.top-Math.min(menu.scrollHeight,400)-8)+'px';}}
      else{if(menu.hidePopover)menu.hidePopover();menu.hidden=true;}
      button.setAttribute('aria-expanded',String(open));if(open)wrapper.setAttribute('data-pw-occludes-native','true');else wrapper.removeAttribute('data-pw-occludes-native');wrapper.classList.toggle('pw-tools-is-open',open);handlers.onControlsReveal?.();
    };
    const button = h('button', {class:'pw-btn pw-btn--ghost pw-btn--icon',type:'button','aria-label':t(L,'tools'),'aria-expanded':'false','aria-haspopup':'true',on:{click:()=>setOpen(menu.hidden)}}, icon('tools'));
    const wrapper = h('div', {class:'pw-tools'}, button, menu);
    menu.addEventListener('toggle',event=>{if(event.newState==='closed'){menu.hidden=true;wrapper.removeAttribute('data-pw-occludes-native');wrapper.classList.remove('pw-tools-is-open');button.setAttribute('aria-expanded','false');}});
    wrapper.__open=()=>setOpen(true);
    wrapper.addEventListener('keydown',event=>{if(event.key==='Escape'){setOpen(false);button.focus();event.stopPropagation();}});
    return wrapper;
  }

  function timeline(vm, handlers) {
    const L = vm.locale; const s = vm.snapshot; const d = Number.isFinite(s.duration) && s.duration > 0 ? s.duration : 0; const pct = (x) => (d ? Math.max(0, Math.min(100, (x / d) * 100)) : 0);
    const ticks = (vm.rows || []).filter((_, i, a) => a.length <= 200 || i % Math.ceil(a.length / 200) === 0);
    const tip = h('output', {class:'pw-timeline__tooltip',hidden:true,text:formatClock(s.time)});
    const reveal = ratio => {tip.textContent=formatClock(ratio*d);tip.style.left=`${Math.max(3,Math.min(97,ratio*100))}%`;tip.hidden=false;};
    return h('div', { class: 'pw-timeline' }, h('div', { class: 'pw-timeline__track', 'aria-hidden': 'true' },
      vm.ab && h('span', { class: 'pw-timeline__ab', style: `left:${pct(vm.ab.a)}%;width:${Math.max(0, pct(vm.ab.b) - pct(vm.ab.a))}%` }),
      h('span', { class: 'pw-timeline__fill', style: `width:${pct(s.time)}%` }), ticks.map((r) => h('i', { class: 'pw-timeline__tick', style: `left:${pct(r.videoStart)}%` })), h('span', { class: 'pw-timeline__knob', style: `left:${pct(s.time)}%` })),
      h('input', { type: 'range', min: '0', max: '1000', step: '1', value: String(Math.round(pct(s.time) * 10)), disabled:!d, 'aria-label': t(L, 'timeline'), 'aria-valuetext': `${formatClock(s.time)} / ${formatClock(s.duration)}`, on: { change: e => handlers.onSeekRatio?.(Number(e.target.value)/1000), input:e=>reveal(Number(e.target.value)/1000), pointermove:e=>{const r=e.target.getBoundingClientRect();if(r.width)reveal(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)));},pointerleave:()=>tip.hidden=true,focus:e=>reveal(Number(e.target.value)/1000),blur:()=>tip.hidden=true } }),
      (vm.markers||[]).filter(m=>d&&Number.isFinite(m.time)&&m.time>=0&&m.time<=d).map(m=>h('button',{class:'pw-timeline__marker',type:'button',style:`left:${pct(m.time)}%`,'aria-label':`${formatClock(m.time)} · ${m.label||''}`,title:`${formatClock(m.time)} · ${m.label||''}`,on:{click:()=>handlers.onSeekRatio?.(m.time/d)}},h('span',{text:formatClock(m.time)}))),tip);
  }

  function stage(vm) {
    if (vm.stageMode === 'slot') return h('div', { class: 'pw-stage', data: { slot: 'stage' } });
    const row = (vm.rows || []).find((r) => r.key === vm.activeKey);
    const showSrc = row && (vm.subtitleMode === 'source' || vm.subtitleMode === 'both'); const showSec = row && row.secondaryText && (vm.subtitleMode === 'secondary' || vm.subtitleMode === 'both');
    if (vm.media.kind === 'audio') return h('div', { class: 'pw-stage pw-stage--audio', data: { slot: 'stage' } }, cover(vm.media.title, vm.media.coverSeed || vm.media.title), h('div', null, h('p', { class: 'pw-subtitle', text: vm.media.subtitle || '' }), h('h2', { class: 'pw-title', text: vm.media.title })));
    return h('div', { class: 'pw-stage', data: { slot: 'stage' } }, cover(vm.media.title, vm.media.coverSeed || vm.media.title, ''), row && h('div', { class: 'pw-caption' }, showSrc && h('span', { text: row.sourceText }), showSec && h('span', { text: row.secondaryText })));
  }

  function cueRow(vm, row, handlers) {
    const L = vm.locale; const active = row.key === vm.activeKey; const q = vm.query || '';
    const src = h('p', { class: 'pw-cue__src', lang: vm.sourceLang || null }); appendHighlighted(src, row.sourceText, q);
    const body = [src];
    const hasSecondary = vm.hasSecondary !== false;
    if (row.secondaryText) { const sec = h('p', { class: 'pw-cue__sec', lang: vm.secondaryLang || null }); appendHighlighted(sec, row.secondaryText, q); body.push(sec); }
    else if (hasSecondary && row.pairing === 'missing') body.push(h('p', { class: 'pw-cue__sec pw-cue__sec--missing', text: t(L, 'noTranslation') }));
    if (row.pairing === 'uncertain') body.push(h('div', { class: 'pw-cue__flags' }, h('span', { class: 'pw-badge pw-badge--warn', text: t(L, 'uncertain') }), row.secondaryCandidates.map((c) => h('span', { class: 'pw-badge', title: c.text, text: `${formatClock(c.videoStart)}` }))));
    const timed = vm.transcriptState !== 'untimed';
    return h('div', { class: 'pw-cue', role: 'listitem', 'aria-current': active ? 'true' : null, data: { key: row.key, cueId: row.cueId } },
      timed ? h('button', { class: 'pw-cue__time', type: 'button', 'aria-label': `${t(L, 'playHere')} ${formatClock(row.videoStart)}`, on: { click: () => handlers.onSeekRow && handlers.onSeekRow(row, 'preserve') } }, formatClock(row.videoStart)) : h('span'),
      h('div', { class: 'pw-cue__body' }, body));
  }

  function transcriptTab(vm, handlers) {
    const L = vm.locale; const all = vm.rows || [];
    const rows = (vm.query ? all.filter((r) => rowMatches(r, vm.query)) : all).slice(0, vm.pageSize || 500);
    const activeVisible = rows.some((r) => r.key === vm.activeKey);
    const list = h('div', { class: 'pw-transcript', role: 'list', tabindex: '0', 'aria-label': t(L, 'transcript') });
    if (vm.transcriptState === 'untimed') list.append(h('div', { class: 'pw-answer', style: 'margin:8px 16px' }, h('p', { text: t(L, 'transcriptUntimed') })));
    if (vm.transcriptState === 'none' || (!all.length && vm.transcriptState !== 'untimed')) list.append(h('div', { class: 'pw-empty', style: 'margin:16px;border:0' }, h('div', { class: 'pw-empty__icon' }, icon('transcript')), h('h3', { text: L==='tr'?'Henüz konuşma dökümü yok.':'No transcript loaded yet.' }),h('p',{text:L==='tr'?'Altyazı yüklediğinde zamanlı satırlar burada görünür.':'Load subtitles to see timed lines here.'})));
    else if (all.length && !rows.length) list.append(h('div',{class:'pw-empty'},h('h3',{text:L==='tr'?'Aramada eşleşme yok.':'No matching lines.'})));
    rows.forEach((r) => list.append(cueRow(vm, r, handlers)));
    if(rows.length && !vm.hasMoreRows) list.append(h('p',{class:'pw-transcript-end',text:L==='tr'?'Yüklü dökümün sonu':'End of loaded transcript'}));
    let programmatic = false;
    const pause = () => { if (vm.follow !== false) handlers.onFollow && handlers.onFollow(false); };
    ['wheel', 'touchstart'].forEach((ev) => list.addEventListener(ev, pause, { passive: true }));
    list.addEventListener('keydown', (event) => {
      if (!event.defaultPrevented && event.target === list && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) pause();
    });
    list.addEventListener('pointerdown', (e) => { if (e.target === list) pause(); });
    list.addEventListener('scroll', () => { if (programmatic) { programmatic = false; } }, { passive: true });
    const sel = () => { const s = globalThis.getSelection && globalThis.getSelection(); const text = s ? String(s).trim() : ''; if (!text || !s.anchorNode) return; const node = (s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode); const cue = node && node.closest && node.closest('.pw-cue'); if (cue && list.contains(cue)) handlers.onSelection && handlers.onSelection({ text, cueId: cue.dataset.cueId, rowKey: cue.dataset.key }); };
    list.addEventListener('mouseup', sel); list.addEventListener('keyup', (e) => { if (e.shiftKey) sel(); });
    list.__afterMount = (pill) => {
      const active = list.querySelector('.pw-cue[aria-current="true"]');
      if (active && vm.follow !== false && vm.followScroll !== false) { programmatic = true; const a = active.getBoundingClientRect(); const l = list.getBoundingClientRect(); list.scrollTop += (a.top - l.top) - (l.height - a.height) / 2; }
      const update = () => {
        if (!pill) return;
        const el = list.querySelector('.pw-cue[aria-current="true"]');
        if (!el) { pill.hidden = vm.follow !== false; return; }
        const a = el.getBoundingClientRect(); const l = list.getBoundingClientRect();
        pill.hidden = !(a.bottom < l.top || a.top > l.bottom || vm.follow === false);
      };
      list.addEventListener('scroll', update, { passive: true }); update();
    };
    return { list, activeVisible };
  }

  function inspector(vm, handlers) {
    const L = vm.locale; const sel = vm.selection; if (!sel) return null;
    const row = (vm.rows || []).find((r) => r.cueId === sel.cueId) || null; const ev = vm.evidence;
    const scope = vm.scope || 'watched';
    return h('div', { class: 'pw-inspector', role: 'region', 'aria-label': t(L, 'askAssistant') },
      h('blockquote', { lang: vm.sourceLang || null, text: sel.text }),
      row && h('div', { class: 'pw-inspector__ctx' }, h('span', { class: 'pw-num', text: `${formatClock(row.videoStart)}  ` }), row.secondaryText || row.sourceText),
      h('div', { class: 'pw-receipt' },
        choice(t(L, 'askAssistant'),scope,[['watched', 'scopeUpTo'], ['selection', 'scopeSelection'], ['whole', 'scopeWhole']].map(([value,key])=>({value,label:t(L,key)})),value=>handlers.onScope?.(value)),
        ev && ev.ok && h('span', { class: 'pw-badge', text: t(L, 'cuesN', ev.envelope.cueIds.length) }), h('span', { class: 'pw-badge pw-badge--accent', text: t(L, 'textOnly') })),
      ev && !ev.ok && ev.code === 'requires-scope-change' && h('div', { class: 'pw-answer', role: 'alert' }, h('p', { text: ev.message }), h('button', { class: 'pw-btn', type: 'button', on: { click: () => handlers.onSwitchScope && handlers.onSwitchScope() }, text: t(L, 'switchScope') })),
      ev && !ev.ok && ev.code !== 'requires-scope-change' && h('div', { class: 'pw-answer', role: 'alert' }, h('p', { text: ev.message })),
      h('div', { class: 'pw-inspector__actions' },
        h('button', { class: 'pw-btn pw-btn--primary', type: 'button', disabled: vm.busy === true, on: { click: () => handlers.onAsk && handlers.onAsk('phrase') } }, icon('sparkle', 'pw-icon--sm'), t(L, 'askAssistant')),
        h('span', { class: 'pw-controls__spacer' }),
        h('button', { class: 'pw-btn pw-btn--ghost pw-btn--icon', type: 'button', 'aria-label': t(L, 'playHere'), title: t(L, 'playHere'), on: { click: () => row && handlers.onSeekRow && handlers.onSeekRow(row, 'play') } }, icon('play', 'pw-icon--sm')),
        h('button', { class: 'pw-btn pw-btn--ghost pw-btn--icon', type: 'button', 'aria-label': t(L, 'save'), title: t(L, 'save'), on: { click: () => handlers.onSave && handlers.onSave(sel) } }, icon('bookmark', 'pw-icon--sm')),
        h('button', { class: 'pw-btn pw-btn--ghost pw-btn--icon', type: 'button', 'aria-label': t(L, 'copy'), title: t(L, 'copy'), on: { click: () => handlers.onCopy && handlers.onCopy(sel) } }, icon('copy', 'pw-icon--sm')),
        h('button', { class: 'pw-btn pw-btn--ghost', type: 'button', 'aria-label': t(L, 'dictionary'), title: t(L, 'dictionary'), on: { click: () => handlers.onDictionary && handlers.onDictionary(sel) } }, icon('external', 'pw-icon--sm'), t(L, 'dictionaryShort'))));
  }

  function assistantTab(vm, handlers) {
    const L = vm.locale; const a = vm.assistant || {};
    return h('div', { class: 'pw-assistant' },
      h('div', { class: 'pw-quick' }, [['scene', 'explainScene'], ['phrase', 'explainPhrase'], ['range', 'summarizeRange'], ['translation', 'explainTranslation']].map(([k, key]) => h('button', { class: 'pw-btn', type: 'button', disabled: vm.busy === true, on: { click: () => handlers.onAsk && handlers.onAsk(k) }, text: t(L, key) }))),
      a.paragraphs && h('div', { class: 'pw-answer' }, a.paragraphs.map((p) => h('p', { text: p }))),
      a.envelope && h('div', { class: 'pw-receipt' }, h('span', { class: 'pw-badge pw-badge--accent', text: t(L, a.envelope.scope === 'watched' ? 'scopeUpTo' : a.envelope.scope === 'whole' ? 'scopeWhole' : 'scopeSelection') }), h('span', { class: 'pw-badge', text: t(L, 'cuesN', a.envelope.cueIds.length) }), h('span', { class: 'pw-badge', text: `${formatClock(a.envelope.range.start)}–${formatClock(a.envelope.range.end)}` })),
      a.paragraphs && h('p', { class: 'pw-subtitle', text: t(L, 'answerBasis') }));
  }
  function queueTab(vm, handlers) {
    const L = vm.locale;
    if(!(vm.queue||[]).length)return h('div',{class:'pw-assistant'},h('div',{class:'pw-empty'},h('h3',{text:L==='tr'?'Oynatma sırası boş.':'The play queue is empty.'})));
    return h('div', { class: 'pw-assistant' }, (vm.queue || []).map((q) => h('div', { class: 'pw-source', style: 'grid-template-columns:44px minmax(0,1fr) auto' }, cover(q.title, q.itemId, ''), h('button', { class: 'pw-link', type: 'button', on: { click: () => handlers.onOpenQueued && handlers.onOpenQueued(q) }, text: q.title }), h('span', { class: 'pw-count', text: formatClock(q.durationSeconds) }))));
  }

  function renderPlayerWorkspace(root, vm, handlers) {
    const prev = root.querySelector('.pw-transcript'); const keepScroll = prev ? prev.scrollTop : 0; const prevSearch = root.querySelector('.pw-panel__tools input');
    const hadFocus = prevSearch && document.activeElement === prevSearch; const L = vm.locale;
    const tabs = [['transcript', 'transcript', 'transcript'], ['assistant', 'assistant', 'sparkle'], ['queue', 'queue', 'list']];
    let content; let tr = null;
    if (vm.tab === 'assistant') content = assistantTab(vm, handlers); else if (vm.tab === 'queue') content = queueTab(vm, handlers);
    else { tr = transcriptTab(vm, handlers); content = tr.list; }
    const search = h('input', { type: 'search', value: vm.query || '', autocomplete: 'off', 'aria-label': t(L, 'findInTranscript'), placeholder: t(L, 'findInTranscript'), on: { input: (e) => handlers.onQuery && handlers.onQuery(e.target.value) } });
    const panel = h('section', { class: 'pw-panel', tabindex:'-1', 'aria-label': vm.media.title },
      h('header',{class:'pw-panel-heading'},h('div',null,h('h2',{text:vm.tab==='transcript'?(L==='tr'?'Konuşma dökümü':'Transcript'):t(L,vm.tab)}),h('p',{text:[vm.sourceLang,vm.secondaryLang].filter(Boolean).join(' + ')})),h('button',{class:'pw-panel-close pw-btn pw-btn--ghost pw-btn--icon',type:'button','aria-label':L==='tr'?'Paneli kapat':'Close panel',on:{click:()=>handlers.onPanelClose?.()}},icon('close'))),
      h('div', { class: 'pw-tabs', role: 'tablist' }, tabs.map(([k, key, ic]) => h('button', { class: 'pw-tab', type: 'button', role: 'tab', 'aria-selected': vm.tab === k ? 'true' : 'false', on: { click: () => handlers.onTab && handlers.onTab(k) } }, t(L, key)))),
      vm.tab === 'transcript' && h('div', { class: 'pw-panel__tools' }, h('div', { class: 'pw-search' }, icon('search', 'pw-icon--sm'), search)),
      content,
      vm.tab === 'transcript' && tr && vm.activeKey && h('div', { class: 'pw-follow', hidden: true }, h('button', { class: 'pw-btn pw-btn--primary', type: 'button', on: { click: () => handlers.onFollow && handlers.onFollow(true) } }, icon('chevron-down', 'pw-icon--sm'), t(L, 'followNow'))),
      vm.tab === 'transcript' && inspector(vm, handlers),
      vm.tab==='transcript'&&h('footer',{class:'pw-panel-footer'},h('span',{class:'pw-follow-status',text:vm.follow===false?(L==='tr'?'Otomatik takip duraklatıldı':'Auto-follow paused'):(L==='tr'?'Oynatma konumunu izliyor':'Following playback')}),h('button',{class:'pw-btn',type:'button',disabled:!vm.activeKey,on:{click:()=>handlers.onAsk?.('scene')}},icon('sparkle'),L==='tr'?'Bu sahneyi sor':'Ask about this scene')));
    const heading=h('header',{class:'pw-player-heading'},h('div',null,handlers.onBack&&h('button',{class:'pw-player-back',type:'button',on:{click:()=>handlers.onBack()}},icon('chevron-left'),t(L,'back')),h('span',{class:'pw-eyebrow',text:L==='tr'?'ŞİMDİ OYNUYOR':'NOW PLAYING'}),h('h1',{class:'pw-title',text:vm.media.title}),h('div',{class:'pw-player-metachips'},(vm.media.metadata||[]).filter(Boolean).map(label=>h('span',{class:'pw-badge',text:label})))),h('div',{class:'pw-player-heading-actions'},h('button',{class:'pw-open-panel pw-btn',type:'button','aria-expanded':String(!!vm.panelOpen),on:{click:()=>handlers.onPanelOpen?.()}},icon('transcript'),t(L,'transcript')),h('button',{class:'pw-btn',type:'button',on:{click:()=>handlers.onMarker?.()}},icon('bookmark'),L==='tr'?'İşaret koy':'Bookmark'),Kit.menuButton?Kit.menuButton({label:L==='tr'?'Oynatıcı seçenekleri':'Player options',icon:'tools',items:[{label:L==='tr'?'İleri araçlar ve altyazı işlemleri':'Advanced tools and subtitle actions',onSelect:()=>handlers.onAdvanced?.()},{label:L==='tr'?'Oynatma sağlığı':'Playback health',onSelect:()=>handlers.onHealth?.()}]}):h('button',{class:'pw-btn',type:'button',on:{click:()=>handlers.onAdvanced?.()}},icon('tools'))));
    const options=heading.querySelector('.pw-player-heading-actions>.mk-picker');
    if(options){options.classList.add('pw-player-options');options.querySelector('.mk-picker-trigger>.pw-icon')?.replaceWith(icon('more'));}
    const transport=h('div',{class:'pw-transport'},timeline(vm,handlers),controls(vm,handlers));
    const next=(vm.queue||[])[vm.nextQueueIndex||0];
    const below=h('div',{class:'pw-player-below'},next&&h('div',{class:'pw-next-up'},h('span',{class:'pw-eyebrow',text:L==='tr'?'SIRADAKİ':'UP NEXT'}),h('strong',{text:next.title}),h('button',{class:'pw-btn pw-btn--icon pw-btn--ghost',type:'button','aria-label':L==='tr'?'Sıradakini oynat':'Play next',on:{click:()=>handlers.onOpenQueued?.(next)}},icon('chevron-right'))),h('div',{class:'pw-player-note'},icon('bookmark'),h('div',null,h('strong',{text:L==='tr'?'Bu ana bir not bırak.':'Leave a note at this moment.'}),h('p',{text:L==='tr'?'Zaman koduyla birlikte, sadece sana özel.':'For you, with the current timestamp.'})),h('button',{class:'pw-btn pw-btn--ghost',type:'button',on:{click:()=>handlers.onNote?.()}},L==='tr'?'Not ekle':'Add note')));
    const left = h('div', { class: 'pw-stage-col' },h('div',{class:'pw-theater'},h('div',{class:'pw-ambient','aria-hidden':'true'},h('div',{class:'pw-ambient-layer'}),h('div',{class:'pw-ambient-layer'})),stage(vm),transport),below);
    root.classList.add('pw-root');
    const current = root.querySelector(':scope > .pw-player');
    const existingStage = current && current.querySelector('[data-slot="stage"]');
    if (vm.stageMode === 'slot' && existingStage) {
      // Keep the media surface and every ancestor connected while other areas update.
      current.querySelector('.pw-transport').replaceWith(transport);
      current.querySelector('.pw-player-below').replaceWith(below);
      current.querySelector('.pw-panel').replaceWith(panel);
      root.querySelector('.pw-player-heading').replaceWith(heading);
    } else root.replaceChildren(heading,h('div', { class: 'pw-player' }, left, panel));
    const list = root.querySelector('.pw-transcript');
    if (list) { list.scrollTop = keepScroll; if (tr && tr.list.__afterMount) tr.list.__afterMount(root.querySelector('.pw-follow')); }
    const inp = root.querySelector('.pw-panel__tools input'); if (hadFocus && inp) { inp.focus(); const n = inp.value.length; inp.setSelectionRange(n, n); }
    return { stageSlot: root.querySelector('[data-slot="stage"]') };
  }
  return Object.freeze({ renderPlayerWorkspace, appendHighlighted, rowMatches, fold });
});
