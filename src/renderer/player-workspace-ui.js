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
      h('details', { class: 'pw-tools' }, h('summary', { class: 'pw-btn pw-btn--lg', 'aria-label': t(L, 'tools') }, icon('tools', 'pw-icon--sm'), h('span', { class: 'pw-tools__label', text: t(L, 'tools') })),
        h('div', { class: 'pw-tools__menu' },
          h('label', null, h('span', { text: t(L, 'subtitleMode') }), h('select', { class: 'pw-select', on: { change: (e) => handlers.onSubtitleMode && handlers.onSubtitleMode(e.target.value) } }, modes.map(([v, k]) => h('option', { value: v, selected: vm.subtitleMode === v, text: t(L, k) })))),
          h('label', null, h('span', { text: t(L, 'speed') }), h('select', { class: 'pw-select', on: { change: (e) => handlers.onRate && handlers.onRate(Number(e.target.value)) } }, [0.75, 1, 1.25, 1.5].map((r) => h('option', { value: String(r), selected: s.rate === r, text: `${r}×` })))))),
      btn('fullscreen', 'fullscreen', () => handlers.onFullscreen && handlers.onFullscreen()));
  }

  function timeline(vm, handlers) {
    const L = vm.locale; const s = vm.snapshot; const d = Number.isFinite(s.duration) && s.duration > 0 ? s.duration : 0; const pct = (x) => (d ? Math.max(0, Math.min(100, (x / d) * 100)) : 0);
    const ticks = (vm.rows || []).filter((_, i, a) => a.length <= 200 || i % Math.ceil(a.length / 200) === 0);
    return h('div', { class: 'pw-timeline' }, h('div', { class: 'pw-timeline__track', 'aria-hidden': 'true' },
      vm.ab && h('span', { class: 'pw-timeline__ab', style: `left:${pct(vm.ab.a)}%;width:${Math.max(0, pct(vm.ab.b) - pct(vm.ab.a))}%` }),
      h('span', { class: 'pw-timeline__fill', style: `width:${pct(s.time)}%` }), ticks.map((r) => h('i', { class: 'pw-timeline__tick', style: `left:${pct(r.videoStart)}%` })), h('span', { class: 'pw-timeline__knob', style: `left:${pct(s.time)}%` })),
      h('input', { type: 'range', min: '0', max: '1000', step: '1', value: String(Math.round(pct(s.time) * 10)), 'aria-label': t(L, 'timeline'), 'aria-valuetext': `${formatClock(s.time)} / ${formatClock(s.duration)}`, on: { change: (e) => handlers.onSeekRatio && handlers.onSeekRatio(Number(e.target.value) / 1000) } }));
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
    if (vm.transcriptState === 'none') list.append(h('div', { class: 'pw-empty', style: 'margin:16px;border:0' }, h('div', { class: 'pw-empty__icon' }, icon('transcript')), h('h3', { text: t(L, 'transcriptNone') })));
    rows.forEach((r) => list.append(cueRow(vm, r, handlers)));
    let programmatic = false;
    const pause = () => { if (vm.follow !== false) handlers.onFollow && handlers.onFollow(false); };
    ['wheel', 'touchstart', 'keydown'].forEach((ev) => list.addEventListener(ev, pause, { passive: true }));
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
        if (!el) { pill.hidden = true; return; }
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
        h('select', { class: 'pw-select', style: 'height:32px;font-size:12px', 'aria-label': t(L, 'askAssistant'), on: { change: (e) => handlers.onScope && handlers.onScope(e.target.value) } }, [['watched', 'scopeUpTo'], ['selection', 'scopeSelection'], ['whole', 'scopeWhole']].map(([v, k]) => h('option', { value: v, selected: scope === v, text: t(L, k) }))),
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
    const panel = h('section', { class: 'pw-panel', 'aria-label': vm.media.title },
      h('div', { class: 'pw-tabs', role: 'tablist' }, tabs.map(([k, key, ic]) => h('button', { class: 'pw-tab', type: 'button', role: 'tab', 'aria-selected': vm.tab === k ? 'true' : 'false', on: { click: () => handlers.onTab && handlers.onTab(k) } }, t(L, key)))),
      vm.tab === 'transcript' && h('div', { class: 'pw-panel__tools' }, h('div', { class: 'pw-search' }, icon('search', 'pw-icon--sm'), search)),
      content,
      vm.tab === 'transcript' && tr && vm.activeKey && h('div', { class: 'pw-follow', hidden: true }, h('button', { class: 'pw-btn pw-btn--primary', type: 'button', on: { click: () => handlers.onFollow && handlers.onFollow(true) } }, icon('chevron-down', 'pw-icon--sm'), t(L, 'followNow'))),
      vm.tab === 'transcript' && inspector(vm, handlers));
    const left = h('div', { class: 'pw-stage-col' },
      handlers.onBack && h('div', null, h('button', { class: 'pw-btn pw-btn--ghost', type: 'button', on: { click: () => handlers.onBack() } }, icon('chevron-left', 'pw-icon--sm'), t(L, 'back'))),
      stage(vm), timeline(vm, handlers), controls(vm, handlers),
      h('div', null, h('h1', { class: 'pw-title', text: vm.media.title }), vm.media.subtitle && h('div', { class: 'pw-subtitle', text: vm.media.subtitle })));
    root.classList.add('pw-root');
    const current = root.querySelector(':scope > .pw-player');
    const existingStage = current && current.querySelector('[data-slot="stage"]');
    if (vm.stageMode === 'slot' && existingStage) {
      // Keep the media surface and every ancestor connected while other areas update.
      const column = current.querySelector('.pw-stage-col');
      const incoming = [...left.children];
      const old = [...column.children];
      incoming.forEach((node, index) => {
        if (node.matches('[data-slot="stage"]')) return;
        if (old[index]) old[index].replaceWith(node); else column.append(node);
      });
      current.querySelector('.pw-panel').replaceWith(panel);
    } else root.replaceChildren(h('div', { class: 'pw-player' }, left, panel));
    const list = root.querySelector('.pw-transcript');
    if (list) { list.scrollTop = keepScroll; if (tr && tr.list.__afterMount) tr.list.__afterMount(root.querySelector('.pw-follow')); }
    const inp = root.querySelector('.pw-panel__tools input'); if (hadFocus && inp) { inp.focus(); const n = inp.value.length; inp.setSelectionRange(n, n); }
    return { stageSlot: root.querySelector('[data-slot="stage"]') };
  }
  return Object.freeze({ renderPlayerWorkspace, appendHighlighted, rowMatches, fold });
});
