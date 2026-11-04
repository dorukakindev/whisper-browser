/* Katalog arayüzü: kaynak dizini (sayfa içi, global gezinme değil) + kaynak tanıtımı + içerik listesi.
   Saf render: renderCatalog(root, vm, handlers). Katalog açılışı medya/AI/indirme BAŞLATMAZ; satır başlığı ayrıntıyı,
   küçük görsel/oynat düğmesi oynatmayı açar (iki ayrı odak hedefi). Kullanıcı metni yalnız textContent ile yazılır. */
(function (root, factory) {
  const isNode = typeof require === 'function' && typeof module === 'object';
  const api = factory(isNode ? require('./player-ui-kit.js') : root.PlayerUiKit, isNode ? require('../player-source-catalog.js') : root.PlayerSourceCatalog);
  if (isNode) module.exports = api; else root.PlayerSourceCatalogUI = api;
})(globalThis, (Kit, Catalog) => {
  'use strict';
  const { h, icon, t, cover, formatClock, formatDate, formatRelative, cleanTitle } = Kit;
  const KIND_TABS = [['youtube', 'videos', 'play'], ['podcast', 'podcasts', 'mic'], ['local', 'local', 'folder']];
  const noop = () => {};

  function sourceRow(vm, source, handlers, pinned) {
    const L = vm.locale; const current = vm.selectedSourceId === source.sourceId;
    const count = Number.isInteger(source.itemCount) ? String(source.itemCount) : '';
    return h('div', { class: 'pw-source', 'aria-current': current ? 'true' : null, data: { sourceId: source.sourceId } },
      h('button', { class: 'pw-source__open pw-link', type: 'button', 'aria-label': source.title, on: { click: () => handlers.onSelectSource && handlers.onSelectSource(source.sourceId) } },
        cover(source.title, source.sourceId, 'pw-source__avatar'),
        h('span', { class: 'pw-source__name' }, h('span', { text: source.title }), count && h('span', { class: 'pw-source__count pw-num', text: count }))),
      h('span', { class: 'pw-source__tools' },
        h('button', { class: 'pw-source__pin', type: 'button', 'aria-pressed': pinned ? 'true' : 'false', 'aria-label': `${t(L, pinned ? 'unpin' : 'pin')}: ${source.title}`, on: { click: () => handlers.onTogglePin && handlers.onTogglePin(source.sourceId) } }, icon('pin', 'pw-icon--sm'))));
  }

  function rail(vm, handlers) {
    const L = vm.locale; const ordered = Catalog.orderSources({ sources: vm.sources.filter((s) => s.kind === vm.kind), pinned: vm.pinned });
    const scroll = h('div', { class: 'pw-rail__scroll', role: 'list', 'aria-label': t(L, 'sources') });
    if (ordered.pinned.length) { scroll.append(h('div', { class: 'pw-rail__group', text: t(L, 'pinned') })); ordered.pinned.forEach((s) => scroll.append(sourceRow(vm, s, handlers, true))); scroll.append(h('div', { class: 'pw-rail__group', text: t(L, 'all') })); }
    ordered.rest.forEach((s) => scroll.append(sourceRow(vm, s, handlers, false)));
    return h('aside', { class: 'pw-rail', 'data-drawer': vm.drawerOpen ? 'open' : 'closed', role: vm.drawerOpen ? 'dialog' : null, 'aria-modal': vm.drawerOpen ? 'true' : null, 'aria-label': t(L, 'sources') },
      h('div', { class: 'pw-rail__head' }, h('span', { class: 'pw-rail__title', text: t(L, 'sources') }),
        vm.drawerOpen && h('button', { class: 'pw-btn pw-btn--ghost pw-btn--icon', type: 'button', 'aria-label': t(L, 'closeToast'), on: { click: () => handlers.onCloseDrawer && handlers.onCloseDrawer() } }, icon('close'))),
      scroll);
  }

  function kindTabs(vm, handlers) {
    const L = vm.locale;
    return h('div', { class: 'pw-kinds', role: 'tablist', 'aria-label': t(L, 'kinds') }, KIND_TABS.map(([kind, key, ic]) =>
      h('button', { class: 'pw-kind', type: 'button', role: 'tab', 'aria-selected': vm.kind === kind ? 'true' : 'false', on: { click: () => handlers.onSelectKind && handlers.onSelectKind(kind) } }, icon(ic, 'pw-icon--sm'), t(L, key))));
  }

  /** Arama kutusu bir kez oluşturulur ve yeniden çizimlerde TAŞINIR: IME bileşimi, odak ve imleç korunur. */
  function searchBox(vm, handlers, previous) {
    const L = vm.locale; let input = previous || null; let timer = null; let composing = false;
    const fire = () => handlers.onQuery && handlers.onQuery({ text: input.value, cursor: null });
    if (!input) {
      input = h('input', { type: 'search', class: 'pw-search__input', autocomplete: 'off', spellcheck: 'false', 'aria-label': t(L, 'search'), placeholder: t(L, 'search') });
      input.addEventListener('compositionstart', () => { composing = true; });
      input.addEventListener('compositionend', () => { composing = false; clearTimeout(timer); timer = setTimeout(fire, 250); });
      input.addEventListener('input', () => { if (composing) return; clearTimeout(timer); timer = setTimeout(fire, 250); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); fire(); } if (e.key === 'Escape') { input.blur(); } });
    }
    input.setAttribute('aria-label', t(L, 'search')); input.setAttribute('placeholder', t(L, 'search'));
    if (document.activeElement !== input && input.value !== vm.query.text) input.value = vm.query.text;
    return h('div', { class: 'pw-search' }, icon('search', 'pw-icon--sm'), input,
      vm.query.text && h('button', { type: 'button', 'aria-label': t(L, 'searchClear'), on: { click: () => handlers.onClearSearch && handlers.onClearSearch() } }, icon('close', 'pw-icon--sm')));
  }

  const SORTS = [['newest', 'sortNewest'], ['oldest', 'sortOldest'], ['shortest', 'sortShortest'], ['longest', 'sortLongest'], ['title', 'sortTitle']];
  const CHIP_LABELS = { durations: (v, L) => t(L, 'dur_' + v), personalStates: (v, L) => t(L, 'p_' + v), subtitleAvailability: (v, L) => t(L, 'av_' + v), live: (v, L) => t(L, v === 'live' ? 'liveOnly' : 'vodOnly'), searchDescription: (v, L) => t(L, 'searchDesc') };
  function chipLabel(chip, vm) {
    const L = vm.locale;
    if (chip.field === 'sourceIds') { const s = vm.sources.find((x) => x.sourceId === chip.value); return s ? s.title : chip.value; }
    if (chip.field === 'speechLanguages') return `${t(L, 'speech')}: ${chip.value.toUpperCase()}`;
    if (chip.field === 'subtitleLanguages') return `${t(L, 'subtitleLang')}: ${chip.value.toUpperCase()}`;
    if (chip.field === 'subtitleOrigins') return chip.value;
    return CHIP_LABELS[chip.field] ? CHIP_LABELS[chip.field](chip.value, L) : chip.value;
  }

  function filtersPanel(vm, handlers) {
    const L = vm.locale; const q = vm.query;
    const toggle = (field, value) => () => { const cur = q[field].slice(); const i = cur.indexOf(value); if (i >= 0) cur.splice(i, 1); else cur.push(value); handlers.onQuery && handlers.onQuery({ [field]: cur, cursor: null }); };
    const group = (legend, field, options) => h('fieldset', null, h('legend', { text: legend }), options.map(([value, label]) => h('label', { class: 'pw-check' }, h('input', { type: 'checkbox', checked: q[field].includes(value), on: { change: toggle(field, value) } }), h('span', { text: label }))));
    return h('div', { class: 'pw-filters', role: 'group', 'aria-label': t(L, 'filters') },
      group(t(L, 'duration'), 'durations', ['under10', '10to30', '30to60', '60plus', 'unknown'].map((v) => [v, t(L, 'dur_' + v)])),
      group(t(L, 'personal'), 'personalStates', ['unwatched', 'watched', 'saved', 'later', 'liked'].map((v) => [v, t(L, 'p_' + v)])),
      h('fieldset', null, h('legend', { text: t(L, 'availability') }), ['all', 'present', 'absent', 'unknown'].map((v) => h('label', { class: 'pw-check' }, h('input', { type: 'radio', name: 'pw-av', checked: q.subtitleAvailability === v, on: { change: () => handlers.onQuery && handlers.onQuery({ subtitleAvailability: v, cursor: null }) } }), h('span', { text: t(L, 'av_' + v) })))),
      h('fieldset', null, h('legend', { text: t(L, 'filters') }),
        h('label', { class: 'pw-check' }, h('input', { type: 'checkbox', checked: q.live === 'live', on: { change: (e) => handlers.onQuery && handlers.onQuery({ live: e.target.checked ? 'live' : 'all', cursor: null }) } }), h('span', { text: t(L, 'liveOnly') })),
        h('label', { class: 'pw-check' }, h('input', { type: 'checkbox', checked: q.searchDescription, on: { change: (e) => handlers.onQuery && handlers.onQuery({ searchDescription: e.target.checked, cursor: null }) } }), h('span', { text: t(L, 'searchDesc') }))));
  }

  function toolbar(vm, handlers, prevInput) {
    const L = vm.locale; const chips = Catalog.activeFilterChips(vm.query); const n = chips.length;
    const count = Catalog.resultCountLabel(vm.result, vm.shown, L);
    return h('div', null,
      h('div', { class: 'pw-toolbar' },
        h('button', { class: 'pw-btn pw-rail-toggle', type: 'button', 'aria-expanded': vm.drawerOpen ? 'true' : 'false', on: { click: () => handlers.onOpenDrawer && handlers.onOpenDrawer() } }, icon('list', 'pw-icon--sm'), t(L, 'sources')),
        searchBox(vm, handlers, prevInput),
        h('button', { class: 'pw-btn', type: 'button', 'aria-expanded': vm.filtersOpen ? 'true' : 'false', 'aria-pressed': n ? 'true' : null, on: { click: () => handlers.onToggleFilters && handlers.onToggleFilters() } }, icon('filter', 'pw-icon--sm'), t(L, 'filtersN', n)),
        h('select', { class: 'pw-select', 'aria-label': t(L, 'sort'), on: { change: (e) => handlers.onQuery && handlers.onQuery({ sort: e.target.value, cursor: null }) } }, SORTS.map(([v, k]) => h('option', { value: v, selected: vm.query.sort === v, text: t(L, k) }))),
        h('span', { class: 'pw-count pw-num', role: 'status', text: count })),
      n > 0 && h('div', { class: 'pw-chips', style: 'margin-top:12px' }, chips.map((c) => h('span', { class: 'pw-chip' }, h('span', { text: chipLabel(c, vm) }), h('button', { type: 'button', 'aria-label': `${t(L, 'dismiss')}: ${chipLabel(c, vm)}`, on: { click: () => handlers.onRemoveChip && handlers.onRemoveChip(c) } }, icon('close', 'pw-icon--sm')))),
        h('button', { class: 'pw-btn pw-btn--ghost', type: 'button', on: { click: () => handlers.onClearFilters && handlers.onClearFilters() } }, t(L, 'clearFilters'))),
      vm.filtersOpen && h('div', { style: 'margin-top:12px' }, filtersPanel(vm, handlers)));
  }

  function hero(vm, handlers) {
    const s = vm.sources.find((x) => x.sourceId === vm.selectedSourceId); if (!s) return null;
    const L = vm.locale; const pinned = vm.pinned.includes(s.sourceId); const open = vm.heroOpen === true;
    return h('section', { class: 'pw-hero', 'aria-label': s.title },
      cover(s.title, s.sourceId, 'pw-hero__cover'),
      h('div', null,
        h('h2', { class: 'pw-hero__title', text: s.title }),
        h('div', { class: 'pw-hero__meta' },
          h('span', { class: 'pw-badge', text: s.kind === 'podcast' ? t(L, 'podcasts') : s.kind === 'local' ? t(L, 'local') : 'YouTube' }),
          h('span', { class: 'pw-badge pw-num', text: Number.isInteger(s.itemCount) ? t(L, 'items', s.itemCount) : t(L, 'itemsUnknown') }),
          s.language && h('span', { class: 'pw-badge', text: s.language.toUpperCase() }),
          s.lastRefreshed && h('span', { class: 'pw-count', style: 'margin:0', text: t(L, 'refreshed', formatRelative(s.lastRefreshed, L, vm.now)) })),
        s.description && h('p', { class: 'pw-hero__desc', 'data-open': open ? 'true' : 'false', text: s.description }),
        s.description && s.description.length > 220 && h('button', { class: 'pw-link pw-hero__more', type: 'button', on: { click: () => handlers.onToggleHero && handlers.onToggleHero() }, text: t(L, open ? 'readLess' : 'readMore') }),
        h('div', { class: 'pw-hero__actions' },
          h('button', { class: 'pw-btn pw-btn--primary pw-btn--lg', type: 'button', 'aria-pressed': s.followed ? 'true' : 'false', on: { click: () => handlers.onToggleFollow && handlers.onToggleFollow(s.sourceId) } }, icon(s.followed ? 'check' : 'plus', 'pw-icon--sm'), t(L, s.followed ? 'following' : 'follow')),
          h('button', { class: 'pw-btn pw-btn--lg pw-btn--icon', type: 'button', 'aria-pressed': pinned ? 'true' : 'false', 'aria-label': t(L, pinned ? 'unpin' : 'pin'), title: t(L, pinned ? 'unpin' : 'pin'), on: { click: () => handlers.onTogglePin && handlers.onTogglePin(s.sourceId) } }, icon('pin')),
          s.url && h('button', { class: 'pw-btn pw-btn--lg pw-btn--ghost pw-btn--icon', type: 'button', 'aria-label': t(L, 'openSource'), title: t(L, 'openSource'), on: { click: () => handlers.onOpenSourceUrl && handlers.onOpenSourceUrl(s.sourceId) } }, icon('external'))),
        Array.isArray(s.similar) && s.similar.length > 0 && h('div', { class: 'pw-similar' }, h('h3', { text: t(L, 'similar') }),
          h('div', { class: 'pw-similar__row' }, s.similar.slice(0, 6).map((x) => h('button', { class: 'pw-similar__item', type: 'button', on: { click: () => handlers.onSelectSource && handlers.onSelectSource(x.sourceId) } }, cover(x.title, x.sourceId), h('span', { text: x.title })))),
          h('small', { text: s.similarBasis || '' }))));
  }

  function subtitleBadges(item, L) {
    if (item.subtitleLanguages === null || item.subtitleLanguages === undefined) return [h('span', { class: 'pw-badge', text: t(L, 'subtitleUnknown') })];
    if (!item.subtitleLanguages.length) return [h('span', { class: 'pw-badge', text: t(L, 'noSubtitle') })];
    const origins = Array.isArray(item.subtitleOrigins) ? item.subtitleOrigins : [];
    return item.subtitleLanguages.map((lang, i) => { const o = origins[i] || origins[0]; const mt = o === 'machine-translation' || o === 'asr';
      return h('span', { class: 'pw-badge' + (mt ? '' : ' pw-badge--accent'), title: o || '', text: `${lang.toUpperCase()}${o === 'asr' ? ' otomatik' : o === 'machine-translation' ? ' çeviri' : ''}` }); });
  }

  function videoRow(vm, item, handlers) {
    const L = vm.locale; const src = vm.sources.find((s) => s.sourceId === item.sourceId); const progress = item.progress > 0 && item.progress < 1 ? item.progress : 0;
    const playLabel = `${t(L, progress ? 'resume' : 'play')}: ${item.title}`;
    return h('article', { class: 'pw-row', data: { itemId: item.itemId } },
      h('button', { class: 'pw-thumb', type: 'button', 'aria-label': playLabel, on: { click: () => handlers.onOpenItem && handlers.onOpenItem(item, 'play') } },
        item.thumbnail ? h('img', { src: item.thumbnail, alt: '', loading: 'lazy' }) : cover(item.title, item.itemId),
        h('span', { class: 'pw-thumb__play' }, icon('play')),
        item.isLive ? h('span', { class: 'pw-thumb__dur', text: t(L, 'live') }) : Number.isFinite(item.durationSeconds) && h('span', { class: 'pw-thumb__dur', text: formatClock(item.durationSeconds) }),
        progress > 0 && h('span', { class: 'pw-thumb__bar' }, h('i', { style: `width:${Math.round(progress * 100)}%` }))),
      h('div', { style: 'min-width:0' },
        h('h3', { class: 'pw-row__title' }, h('button', { class: 'pw-link', type: 'button', on: { click: () => handlers.onOpenItem && handlers.onOpenItem(item, 'detail') }, text: item.title })),
        h('div', { class: 'pw-row__meta' }, h('span', { text: item.sourceTitle || (src && src.title) || '' }), item.publishedAt && h('span', { text: formatDate(item.publishedAt, L) })),
        h('div', { class: 'pw-row__badges' }, subtitleBadges(item, L), item.personal && item.personal.watched && h('span', { class: 'pw-badge', text: t(L, 'watched') }))),
      h('div', { class: 'pw-row__actions' }, h('button', { class: 'pw-btn pw-btn--lg pw-btn--icon pw-btn--ghost', type: 'button', 'aria-label': playLabel, title: t(L, progress ? 'resume' : 'play'), on: { click: () => handlers.onOpenItem && handlers.onOpenItem(item, 'play') } }, icon('play'))));
  }

  function transcriptBadge(item, L) {
    const best = (item.transcriptDescriptors || []).slice().sort((a, b) => ({ yes: 0, conditional: 1, unknown: 2, no: 3 }[a.timed] - { yes: 0, conditional: 1, unknown: 2, no: 3 }[b.timed]))[0];
    if (!best) return h('span', { class: 'pw-badge', text: t(L, 'transcriptNone') });
    if (best.timed === 'yes') return h('span', { class: 'pw-badge pw-badge--accent', text: t(L, 'transcriptTimed') });
    if (best.timed === 'no') return h('span', { class: 'pw-badge pw-badge--warn', text: t(L, 'transcriptUntimed') });
    return h('span', { class: 'pw-badge', text: t(L, 'transcriptNone') });
  }
  function episodeRow(vm, item, handlers) {
    const L = vm.locale; const playLabel = `${t(L, 'play')}: ${item.title}`;
    return h('article', { class: 'pw-episode', data: { itemId: item.itemId } },
      h('span', { class: 'pw-episode__no pw-num', text: item.episodeNumber != null ? String(item.episodeNumber) : '' }),
      h('button', { class: 'pw-thumb', type: 'button', style: 'width:120px;aspect-ratio:1', 'aria-label': playLabel, on: { click: () => handlers.onOpenItem && handlers.onOpenItem(item, 'play') } }, item.thumbnail ? h('img', { src: item.thumbnail, alt: '', loading: 'lazy' }) : cover(item.sourceTitle || item.title, item.sourceId), h('span', { class: 'pw-thumb__play' }, icon('play'))),
      h('div', { style: 'min-width:0' },
        h('h3', { class: 'pw-row__title' }, h('button', { class: 'pw-link', type: 'button', on: { click: () => handlers.onOpenItem && handlers.onOpenItem(item, 'detail') }, text: item.title })),
        h('div', { class: 'pw-row__meta' }, h('span', { text: item.sourceTitle || '' }), item.publishedAt && h('span', { text: formatRelative(item.publishedAt, L, vm.now) }), Number.isFinite(item.durationSeconds) && h('span', { class: 'pw-badge', text: formatClock(item.durationSeconds) })),
        item.description && h('p', { class: 'pw-row__desc', text: item.description }),
        h('div', { class: 'pw-row__badges' }, transcriptBadge(item, L), item.offline && h('span', { class: 'pw-badge', text: t(L, 'offline') }))),
      h('div', { class: 'pw-row__actions' }, h('button', { class: 'pw-btn pw-btn--lg pw-btn--icon pw-btn--ghost', type: 'button', 'aria-label': playLabel, on: { click: () => handlers.onOpenItem && handlers.onOpenItem(item, 'play') } }, icon('play'))));
  }
  function localRow(vm, item, handlers) {
    const L = vm.locale; const title = cleanTitle(item.title); const missing = item.fileMissing === true;
    return h('article', { class: 'pw-row', data: { itemId: item.itemId } },
      h('button', { class: 'pw-thumb', type: 'button', disabled: missing, 'aria-label': `${t(L, 'play')}: ${title}`, on: { click: () => handlers.onOpenItem && handlers.onOpenItem(item, 'play') } }, cover(title, item.itemId), Number.isFinite(item.durationSeconds) && h('span', { class: 'pw-thumb__dur', text: formatClock(item.durationSeconds) })),
      h('div', { style: 'min-width:0' }, h('h3', { class: 'pw-row__title' }, h('button', { class: 'pw-link', type: 'button', title: item.title, on: { click: () => handlers.onOpenItem && handlers.onOpenItem(item, 'detail') }, text: title })),
        h('div', { class: 'pw-row__badges' }, missing ? h('span', { class: 'pw-badge pw-badge--danger', text: t(L, 'fileMissing') }) : subtitleBadges(item, L))),
      h('div', { class: 'pw-row__actions' }, missing && h('button', { class: 'pw-btn', type: 'button', on: { click: () => handlers.onLocate && handlers.onLocate(item) }, text: t(L, 'findFile') })));
  }

  function emptyState(vm, handlers) {
    const L = vm.locale; const r = vm.result;
    const box = (ic, title, body, action, ghost) => h('div', { class: 'pw-empty', role: 'status' }, h('div', { class: 'pw-empty__icon' }, icon(ic, '')), h('h3', { text: title }), h('p', { text: body }), action, ghost && h('div', { class: 'pw-ghost', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
    if (!vm.sources.some((s) => s.kind === vm.kind)) return box('folder', t(L, 'emptyTitle'), t(L, 'emptyBody'), h('button', { class: 'pw-btn pw-btn--primary pw-btn--lg', type: 'button', on: { click: () => handlers.onAddSource && handlers.onAddSource(vm.kind) }, text: t(L, 'addSource') }), true);
    if (r.needsMoreSourcePages) return box('search', t(L, 'needMoreTitle'), t(L, 'needMoreBody'), h('button', { class: 'pw-btn pw-btn--primary pw-btn--lg', type: 'button', on: { click: () => handlers.onLoadRemote && handlers.onLoadRemote(r.remoteNextCursor) }, text: t(L, 'loadSource') }));
    return box('filter', t(L, 'noResultTitle'), t(L, 'noResultBody'), h('button', { class: 'pw-btn pw-btn--primary pw-btn--lg', type: 'button', on: { click: () => handlers.onClearFilters && handlers.onClearFilters() }, text: t(L, 'clearFilters') }));
  }

  /** Kök kapsayıcıyı yeniden çizer; arama kutusunu, kaydırma konumlarını ve odağı korur. */
  function renderCatalog(root, vm, handlers) {
    const prevInput = root.querySelector('.pw-search__input');
    const prevMain = root.querySelector('.pw-main'); const prevRail = root.querySelector('.pw-rail__scroll');
    const keep = { main: prevMain ? prevMain.scrollTop : 0, rail: prevRail ? prevRail.scrollTop : 0 };
    const hadFocus = prevInput && document.activeElement === prevInput;
    const sel = hadFocus ? [prevInput.selectionStart, prevInput.selectionEnd] : null;
    const L = vm.locale;
    const items = vm.result.items;
    const isGrid = vm.kind === 'podcast' && !vm.selectedSourceId && !vm.query.text && vm.sources.some((s) => s.kind === 'podcast');
    let body;
    if (vm.loading) body = h('div', { class: 'pw-ghost', style: 'width:100%;opacity:.35', 'aria-busy': 'true' }, h('i'), h('i'), h('i'), h('i'));
    else if (isGrid) body = h('div', { class: 'pw-programs' }, vm.sources.filter((s) => s.kind === 'podcast').map((s) => h('button', { class: 'pw-program', type: 'button', on: { click: () => handlers.onSelectSource && handlers.onSelectSource(s.sourceId) } }, cover(s.title, s.sourceId), h('span', null, h('strong', { text: s.title }), h('small', { text: s.publisher || (Number.isInteger(s.itemCount) ? t(L, 'items', s.itemCount) : '') })))));
    else if (!items.length) body = emptyState(vm, handlers);
    else body = h('div', { class: 'pw-list', role: 'list' }, items.map((it) => h('div', { role: 'listitem' }, vm.kind === 'podcast' ? episodeRow(vm, it, handlers) : vm.kind === 'local' ? localRow(vm, it, handlers) : videoRow(vm, it, handlers))),
      vm.result.nextCursor && h('button', { class: 'pw-btn pw-more', type: 'button', on: { click: () => handlers.onLoadMore && handlers.onLoadMore(vm.result.nextCursor) }, text: t(L, 'loadMore') }),
      !vm.result.nextCursor && vm.result.remoteNextCursor && h('button', { class: 'pw-btn pw-more', type: 'button', on: { click: () => handlers.onLoadRemote && handlers.onLoadRemote(vm.result.remoteNextCursor) }, text: t(L, 'loadSource') }));
    const noSources = !vm.sources.some((s) => s.kind === vm.kind);
    const main = h('div', { class: 'pw-main', 'aria-hidden': vm.drawerOpen ? 'true' : null }, kindTabs(vm, handlers), noSources ? null : toolbar(vm, handlers, prevInput), hero(vm, handlers), body);
    const layout = h('div', { class: 'pw-catalog' }, rail(vm, handlers), main);
    const nodes = [layout];
    if (vm.drawerOpen) nodes.push(h('div', { class: 'pw-scrim', on: { click: () => handlers.onCloseDrawer && handlers.onCloseDrawer() } }));
    if (vm.toast) nodes.push(h('div', { class: 'pw-toast', role: 'status' }, h('span', { text: vm.toast }), h('button', { class: 'pw-btn pw-btn--ghost pw-btn--icon', type: 'button', 'aria-label': t(L, 'closeToast'), on: { click: () => handlers.onDismissToast && handlers.onDismissToast() } }, icon('close'))));
    root.classList.add('pw-root'); root.replaceChildren(...nodes);
    const newMain = root.querySelector('.pw-main'); const newRail = root.querySelector('.pw-rail__scroll');
    if (newMain) newMain.scrollTop = keep.main; if (newRail) newRail.scrollTop = keep.rail;
    const input = root.querySelector('.pw-search__input');
    if (hadFocus && input) { input.focus(); if (sel) input.setSelectionRange(sel[0], sel[1]); }
    return { searchInput: input };
  }
  return Object.freeze({ renderCatalog, chipLabel });
});
