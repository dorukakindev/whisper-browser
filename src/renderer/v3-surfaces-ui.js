/* V3 yüzeyleri: sinema bülteni, rota taslağı, karşılaştırma matrisi, kütüphane bakımı önizlemesi, oynatma sağlığı fişi.
   Saf render; yalnız textContent. Hiçbir yüzey yazma yapmaz: "uygula" eylemleri handlers üzerinden mevcut proposal/apply yoluna gider.
   Bilinmeyen değer "—" ve açık etiketle gösterilir; kapalı spoiler hücresi içerik taşımaz. */
(function (root, factory) {
  const isNode = typeof require === 'function' && typeof module === 'object';
  const api = factory(isNode ? require('./player-ui-kit.js') : root.PlayerUiKit);
  if (isNode) module.exports = api; else root.V3SurfacesUI = api;
})(globalThis, (Kit) => {
  'use strict';
  const { h, icon, cover } = Kit;
  const S = {
    tr: { bulletin: 'Sinema bülteni', checked: (a, b) => `${a} / ${b} kaynak kontrol edildi`, incomplete: 'Bülten eksik: bazı kaynaklara ulaşılamadı.', complete: 'Tüm kaynaklar kontrol edildi.', candidate: 'Aday eşleşme', confirmed: 'Onaylı bağlantı', copies: (n) => `${n} kopya`, indep: (n) => `${n} bağımsız yayıncı`, opposing: 'Karşıt görüşler var', markRead: 'Okundu işaretle', read: 'Okundu', unlinked: 'Kütüphanede karşılığı yok', retry: 'Yeniden dene',
      st_ok: 'Yeni içerik', st_not_modified: 'Değişmedi', st_forbidden: 'Erişim reddedildi', st_rate_limited: 'Sınıra takıldı', st_unavailable: 'Ulaşılamıyor', st_error: 'Hata', st_not_attempted: 'Denenmedi',
      route: 'İzleme rotası', budget: (m) => `${m} dk bütçe`, total: (m) => `Toplam ${m} dk`, fitsUnknown: 'Süresi bilinmeyen öğe var; toplam kesin değil.', skipped: 'Sığmayan', exceeds: 'bütçeyi aşıyor', dup: 'tekrar', maxItems: 'sınır', unknownLen: 'Süre bilinmiyor', ready: 'Kaynak hazır', needsSource: 'Kaynak gerekli', srcUnknown: 'Kaynak bilinmiyor', preview: 'Önizle ve koleksiyona ekle', draftNote: 'Taslak yalnız okunur: beğeni, not veya izlendi yazmaz.',
      matrix: 'Karşılaştırma', rev: (n) => `Sürüm ${n}`, unknown: 'Bilinmiyor', hidden: 'Spoiler kapalı', reveal: 'Göster', export: 'Dışa aktar', sources: (n) => `${n} kaynak`, edited: 'Elle düzenlendi', partial: 'Eksik hücreler var',
      maintenance: 'Kütüphane bakımı', rootsOk: (a, b) => `${a} / ${b} kök doğrulandı`, noMove: 'Medya dosyaları taşınmaz, yeniden adlandırılmaz veya silinmez; yalnız kayıtlı kaynak yolu güncellenir.', k_missing: 'Dosya bulunamadı', k_root: 'Kök doğrulanamadı, kayıp sayılmadı', k_conflict: 'Kimlik çakışması', k_dupwork: 'Olası yinelenen kayıt', k_epunknown: 'Bölüm listesi bilinmiyor', k_ambiguous: 'Birden çok aday', g_editions: 'Sürümler (silme önerilmez)', g_parts: 'Çok parçalı', g_extras: 'Ek içerik', g_dup: 'Yinelenen aday', relink: 'Yeniden bağla', previewChosen: 'Seçilenleri önizle', noHash: 'İçerik karması hesaplanmadı.', none: 'Sorun bulunamadı.',
      health: 'Oynatma sağlığı', decoder: 'Çözücü', requested: 'İstenen', current: 'Etkin', hdr: 'HDR', file: 'Dosya', output: 'Çıkış', audio: 'Ses', channels: 'Kanal', stalls: 'Takılma', window: (s) => `Son ${s} sn`, dropped: 'Düşen kare', buffering: 'Tamponlama', software: 'Yazılım', hardware: 'Donanım', unk: 'Ölçülemedi', yes: 'Evet', no: 'Hayır', stale: 'Ölçüm bayat; yeniden okunuyor.', nodata: 'Henüz ölçüm yok.', readOnlyNote: 'Yalnız ölçüm: ayar veya sürücü değiştirilmez.', downmix: 'Çıkış, dosyadan daha az kanallı', surround: 'Çok kanallı çıkış' },
    en: { bulletin: 'Cinema bulletin', checked: (a, b) => `${a} / ${b} sources checked`, incomplete: 'Bulletin incomplete: some sources could not be reached.', complete: 'All sources checked.', candidate: 'Candidate match', confirmed: 'Confirmed link', copies: (n) => `${n} copies`, indep: (n) => `${n} independent publishers`, opposing: 'Opposing views', markRead: 'Mark as read', read: 'Read', unlinked: 'Not in your library', retry: 'Retry',
      st_ok: 'New items', st_not_modified: 'Unchanged', st_forbidden: 'Access denied', st_rate_limited: 'Rate limited', st_unavailable: 'Unavailable', st_error: 'Error', st_not_attempted: 'Not attempted',
      route: 'Watch route', budget: (m) => `${m} min budget`, total: (m) => `${m} min total`, fitsUnknown: 'Some items have unknown length; the total is not exact.', skipped: 'Did not fit', exceeds: 'exceeds budget', dup: 'duplicate', maxItems: 'limit', unknownLen: 'Length unknown', ready: 'Source ready', needsSource: 'Needs source', srcUnknown: 'Source unknown', preview: 'Preview and add to collection', draftNote: 'Read-only draft: writes no likes, notes or watched state.',
      matrix: 'Comparison', rev: (n) => `Revision ${n}`, unknown: 'Unknown', hidden: 'Spoiler hidden', reveal: 'Reveal', export: 'Export', sources: (n) => `${n} sources`, edited: 'Edited by hand', partial: 'Some cells are missing',
      maintenance: 'Library maintenance', rootsOk: (a, b) => `${a} / ${b} roots verified`, noMove: 'Media files are never moved, renamed or deleted; only the recorded source path is updated.', k_missing: 'File not found', k_root: 'Root unverified, not counted as missing', k_conflict: 'Identity conflict', k_dupwork: 'Possible duplicate record', k_epunknown: 'Episode list unknown', k_ambiguous: 'Multiple candidates', g_editions: 'Editions (deletion not suggested)', g_parts: 'Multi-part', g_extras: 'Extras', g_dup: 'Duplicate candidate', relink: 'Relink', previewChosen: 'Preview selected', noHash: 'Content hash was not computed.', none: 'No issues found.',
      health: 'Playback health', decoder: 'Decoder', requested: 'Requested', current: 'Active', hdr: 'HDR', file: 'File', output: 'Output', audio: 'Audio', channels: 'Channels', stalls: 'Stalls', window: (s) => `Last ${s} s`, dropped: 'Dropped frames', buffering: 'Buffering', software: 'Software', hardware: 'Hardware', unk: 'Not measurable', yes: 'Yes', no: 'No', stale: 'Measurement is stale; re-reading.', nodata: 'No measurement yet.', readOnlyNote: 'Measurement only: no setting or driver is changed.', downmix: 'Output has fewer channels than the file', surround: 'Multichannel output' },
  };
  const tr = (L, k, ...a) => { const d = S[String(L).startsWith('tr') ? 'tr' : 'en']; const v = d[k] !== undefined ? d[k] : S.tr[k]; return typeof v === 'function' ? v(...a) : v; };
  const badge = (text, kind) => h('span', { class: 'pw-badge' + (kind ? ' pw-badge--' + kind : ''), text });
  const head = (ic, title, extra) => h('header', { class: 'v3-head' }, h('span', { class: 'pw-empty__icon', style: 'width:40px;height:40px' }, icon(ic)), h('h2', { class: 'v3-title', text: title }), extra || null);
  const mount = (rootEl, node) => { rootEl.classList.add('pw-root'); rootEl.replaceChildren(h('div', { class: 'v3-page' }, node)); };

  function renderBulletin(rootEl, b, o) {
    const L = o.locale; const c = b.coverage; const hd = o.handlers || {};
    const statusKind = (s) => (s === 'ok' || s === 'not-modified' ? '' : 'warn');
    const topic = (t) => h('article', { class: 'v3-topic' },
      t.stories.map((s) => h('div', { class: 'v3-story' }, h('strong', { text: s.title }), s.copies > 1 && badge(tr(L, 'copies', s.copies)))),
      h('div', { class: 'pw-row__badges' }, badge(tr(L, 'indep', t.independentPublishers)), t.opposingStances && badge(tr(L, 'opposing'), 'warn'),
        h('button', { class: 'pw-btn pw-btn--ghost', type: 'button', 'aria-pressed': t.read ? 'true' : 'false', on: { click: () => hd.onToggleRead && hd.onToggleRead(t.topicId) } }, icon('check', 'pw-icon--sm'), tr(L, t.read ? 'read' : 'markRead'))));
    mount(rootEl, [
      head('rss', tr(L, 'bulletin'), badge(tr(L, 'checked', c.checkedFeeds, c.checkedFeeds + c.remainingFeeds), c.complete ? 'accent' : 'warn')),
      !c.complete && h('div', { class: 'v3-alert', role: 'status' }, icon('alert'), h('div', null, h('p', { text: tr(L, 'incomplete') }), h('div', { class: 'pw-row__badges' }, c.remaining.map((r) => badge(`${r.feedId}: ${tr(L, 'st_' + r.status.replace(/-/g, '_'))}`, statusKind(r.status)))), h('button', { class: 'pw-btn', type: 'button', on: { click: () => hd.onRetry && hd.onRetry() }, text: tr(L, 'retry') }))),
      b.sections.map((s) => h('section', { class: 'v3-section' }, h('div', { class: 'v3-work' }, cover(s.title, s.workId, 'v3-cover'), h('div', null, h('h3', { text: s.title }), badge(tr(L, s.linkConfidence === 'confirmed' ? 'confirmed' : 'candidate'), s.linkConfidence === 'confirmed' ? 'accent' : 'warn'))), s.topics.map(topic))),
      b.unlinked.length > 0 && h('section', { class: 'v3-section' }, h('h3', { text: tr(L, 'unlinked') }), b.unlinked.map(topic)),
    ]);
  }

  function renderItinerary(rootEl, it, o) {
    const L = o.locale; const hd = o.handlers || {};
    mount(rootEl, [
      head('route', tr(L, 'route'), h('span', { class: 'v3-meta' }, badge(tr(L, 'budget', it.budgetMinutes)), badge(tr(L, 'total', it.totalMinutes), it.fits === true ? 'accent' : 'warn'))),
      it.fits === 'unknown' && h('div', { class: 'v3-alert', role: 'status' }, icon('alert'), h('p', { text: tr(L, 'fitsUnknown') })),
      h('ol', { class: 'v3-route' }, it.items.map((i) => h('li', { class: 'v3-stop' },
        h('span', { class: 'v3-time pw-num', text: `${i.startOffsetMinutes}${i.endOffsetMinutes != null ? '–' + i.endOffsetMinutes : '–?'} dk` }), cover(i.title, i.itemId, 'v3-cover'),
        h('div', { style: 'min-width:0' }, h('strong', { text: i.title }), i.reason && h('p', { class: 'pw-subtitle', text: i.reason }), h('div', { class: 'pw-row__badges' }, i.runtimeKnown ? badge(`${i.runtimeMinutes} dk`) : badge(tr(L, 'unknownLen'), 'warn'), badge(tr(L, i.sourceReady === 'ready' ? 'ready' : i.sourceReady === 'needs-source' ? 'needsSource' : 'srcUnknown'), i.sourceReady === 'ready' ? 'accent' : 'warn')))))),
      it.skipped.length > 0 && h('div', null, h('h3', { class: 'pw-subtitle', text: tr(L, 'skipped') }), h('div', { class: 'pw-row__badges' }, it.skipped.map((s) => badge(`${(o.titles && o.titles[s.itemId]) || s.itemId}: ${tr(L, s.reason === 'exceeds-budget' ? 'exceeds' : s.reason === 'duplicate' ? 'dup' : 'maxItems')}`)))),
      h('div', { class: 'v3-foot' }, h('button', { class: 'pw-btn pw-btn--primary pw-btn--lg', type: 'button', on: { click: () => hd.onPreviewApply && hd.onPreviewApply(it.draftRevision) }, text: tr(L, 'preview') }), h('span', { class: 'pw-subtitle', text: tr(L, 'draftNote') }))]);
  }

  function renderMatrix(rootEl, doc, body, o) {
    const L = o.locale; const hd = o.handlers || {}; const revealed = o.revealed || new Set();
    const cells = new Map(body.cells.map((c) => [c.rowId + '\u0000' + c.colId, c]));
    const cell = (r, c) => { const x = cells.get(r.id + '\u0000' + c.id); if (!x || x.status === 'unknown') return h('td', { class: 'v3-unknown', text: '—', title: tr(L, 'unknown') });
      if (x.spoiler === 'closed' && !revealed.has(r.id + c.id)) return h('td', null, h('button', { class: 'pw-btn pw-btn--ghost v3-hidden', type: 'button', on: { click: () => hd.onReveal && hd.onReveal(r.id, c.id) } }, icon('shield', 'pw-icon--sm'), tr(L, 'hidden') + ' · ' + tr(L, 'reveal')));
      return h('td', null, h('span', { text: x.value }), h('div', { class: 'pw-row__badges' }, x.claims.length > 0 && badge(tr(L, 'sources', x.claims.length)), x.userEdited && badge(tr(L, 'edited'), 'accent'))); };
    mount(rootEl, [
      head('list', body.title || tr(L, 'matrix'), h('span', { class: 'v3-meta' }, badge(tr(L, 'rev', doc.revision)), body.coverage && body.coverage.partial && badge(tr(L, 'partial'), 'warn'))),
      h('div', { class: 'v3-tablewrap' }, h('table', { class: 'v3-table' }, h('thead', null, h('tr', null, h('th'), body.columns.map((c) => h('th', { scope: 'col', text: c.label })))), h('tbody', null, body.rows.map((r) => h('tr', null, h('th', { scope: 'row', text: r.label }), body.columns.map((c) => cell(r, c))))))),
      h('div', { class: 'v3-foot' }, ['csv', 'json', 'markdown', 'html'].map((f) => h('button', { class: 'pw-btn', type: 'button', on: { click: () => hd.onExport && hd.onExport(f, doc.revision) }, text: `${tr(L, 'export')} ${f.toUpperCase()}` })))]);
  }

  function renderMaintenance(rootEl, p, o) {
    const L = o.locale; const hd = o.handlers || {}; const chosen = o.chosen || new Set();
    const kind = { 'missing-file': ['k_missing', 'danger'], 'root-unverified': ['k_root', 'warn'], 'identity-conflict': ['k_conflict', 'danger'], 'possible-duplicate-work': ['k_dupwork', 'warn'], 'episode-list-unknown': ['k_epunknown', ''], 'relink-ambiguous': ['k_ambiguous', 'warn'] };
    const shown = p.issues.filter((i) => kind[i.kind]);
    mount(rootEl, [
      head('wrench', tr(L, 'maintenance'), badge(tr(L, 'rootsOk', p.roots.accessible, p.roots.total), p.roots.unverified ? 'warn' : 'accent')),
      h('div', { class: 'v3-alert', role: 'note' }, icon('shield'), h('p', { text: tr(L, 'noMove') + ' ' + (p.hashed ? '' : tr(L, 'noHash')) })),
      shown.length === 0 && h('p', { class: 'pw-subtitle', text: tr(L, 'none') }),
      h('ul', { class: 'v3-issues' }, shown.map((i) => h('li', null, badge(tr(L, kind[i.kind][0]), kind[i.kind][1]), h('span', { text: (o.titles && o.titles[i.workId]) || i.workId || (i.workIds || []).join(', ') || '' }), i.path && h('code', { text: i.path })))),
      p.groups.length > 0 && h('div', { class: 'pw-row__badges' }, p.groups.map((g) => badge(`${tr(L, { editions: 'g_editions', 'multi-part': 'g_parts', extras: 'g_extras', 'duplicate-candidate': 'g_dup' }[g.kind])}: ${(o.titles && o.titles[g.workId]) || g.workId}`))),
      p.proposals.length > 0 && h('section', { class: 'v3-section' }, h('h3', { text: tr(L, 'relink') }), p.proposals.map((x) => h('label', { class: 'v3-proposal' }, h('input', { type: 'checkbox', checked: chosen.has(x.opId), on: { change: () => hd.onToggleOp && hd.onToggleOp(x.opId) } }), h('span', null, h('code', { text: x.from }), icon('arrow-right', 'pw-icon--sm'), h('code', { text: x.to }), h('span', { class: 'pw-subtitle', text: x.evidence.join(', ') }))))),
      p.proposals.length > 0 && h('div', { class: 'v3-foot' }, h('button', { class: 'pw-btn pw-btn--primary pw-btn--lg', type: 'button', disabled: chosen.size === 0, on: { click: () => hd.onPreviewCommit && hd.onPreviewCommit(Array.from(chosen)) }, text: tr(L, 'previewChosen') }))]);
  }

  function renderHealth(rootEl, r, o) {
    const L = o.locale;
    const card = (title, rows) => h('section', { class: 'v3-card' }, h('h3', { text: title }), h('dl', null, rows.map(([k, v, kind]) => [h('dt', { text: k }), h('dd', null, typeof v === 'string' ? badge(v, kind) : v)])));
    const tri = (v) => (v === 'unknown' || v === null || v === undefined ? [tr(L, 'unk'), ''] : v === true ? [tr(L, 'yes'), 'accent'] : [tr(L, 'no'), '']);
    if (r.status !== 'ok') { mount(rootEl, [head('activity', tr(L, 'health')), h('p', { class: 'pw-subtitle', role: 'status', text: tr(L, r.status === 'stale' ? 'stale' : 'nodata') })]); return; }
    const dec = r.decode.current.state === 'hardware' ? [`${tr(L, 'hardware')} ${r.decode.current.api || ''}`.trim(), 'accent'] : r.decode.current.state === 'software' ? [tr(L, 'software'), 'warn'] : [tr(L, 'unk'), ''];
    mount(rootEl, [
      head('activity', tr(L, 'health'), badge(tr(L, 'window', r.windowSeconds))),
      h('div', { class: 'v3-cards' },
        card(tr(L, 'decoder'), [[tr(L, 'requested'), r.decode.requested || tr(L, 'unk'), ''], [tr(L, 'current'), dec[0], dec[1]]]),
        card(tr(L, 'hdr'), [[`${tr(L, 'hdr')} ${tr(L, 'file')}`, ...tri(r.hdr.fileIsHdr)], [`${tr(L, 'hdr')} ${tr(L, 'output')}`, ...tri(r.hdr.outputIsHdr)]]),
        card(tr(L, 'audio'), [[`${tr(L, 'channels')} ${tr(L, 'file')}`, r.audio.fileChannels == null ? tr(L, 'unk') : String(r.audio.fileChannels), ''], [`${tr(L, 'channels')} ${tr(L, 'output')}`, r.audio.outputChannels == null ? tr(L, 'unk') : String(r.audio.outputChannels), r.audio.downmixed ? 'warn' : '']]),
        card(tr(L, 'stalls'), [[tr(L, 'dropped'), r.stalls.droppedFrames == null ? tr(L, 'unk') : String(r.stalls.droppedFrames), r.stalls.droppedFrames > 0 ? 'warn' : ''], [tr(L, 'buffering'), String(r.stalls.bufferingSamples), r.stalls.bufferingSamples ? 'warn' : '']])),
      h('p', { class: 'pw-subtitle', text: tr(L, 'readOnlyNote') })]);
  }
  return Object.freeze({ renderBulletin, renderItinerary, renderMatrix, renderMaintenance, renderHealth });
});
