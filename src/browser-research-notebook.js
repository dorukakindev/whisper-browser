const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:']);

function normalizeResearchTags(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  const seen = new Set();
  const tags = [];
  for (const raw of source) {
    const tag = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 48);
    const key = tag.toLocaleLowerCase('tr-TR');
    if (!tag || seen.has(key)) continue;
    seen.add(key); tags.push(tag);
    if (tags.length >= 24) break;
  }
  return tags;
}

function normalizeResearchLinks(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  const links = [];
  const seen = new Set();
  for (const raw of source) {
    const candidate = typeof raw === 'string' ? { url: raw } : raw;
    if (!candidate || typeof candidate !== 'object') continue;
    let parsed;
    try { parsed = new URL(String(candidate.url || '').trim()); } catch (_) { continue; }
    if (!SAFE_LINK_PROTOCOLS.has(parsed.protocol) || seen.has(parsed.href)) continue;
    seen.add(parsed.href);
    links.push({ label: String(candidate.label || '').trim().slice(0, 120), url: parsed.href.slice(0, 2000) });
    if (links.length >= 16) break;
  }
  return links;
}

function normalizeReviewState(raw = {}, now = Date.now()) {
  const reviewCount = Math.max(0, Math.min(100000, Math.trunc(Number(raw.reviewCount) || 0)));
  return {
    dueAt: Math.max(0, Number(raw.dueAt) || (reviewCount ? now : 0)),
    intervalDays: Math.max(0, Math.min(3650, Number(raw.intervalDays) || 0)),
    ease: Math.max(1.3, Math.min(3, Number(raw.ease) || 2.5)),
    reviewCount,
    lapses: Math.max(0, Math.min(100000, Math.trunc(Number(raw.lapses) || 0))),
    lastReviewedAt: Math.max(0, Number(raw.lastReviewedAt) || 0),
  };
}

function scheduleReview(raw = {}, rating = 'good', now = Date.now()) {
  const previous = normalizeReviewState(raw, now);
  let interval = previous.intervalDays;
  let ease = previous.ease;
  let lapses = previous.lapses;
  if (rating === 'again') { interval = 10 / 1440; ease = Math.max(1.3, ease - 0.2); lapses += 1; }
  else if (rating === 'hard') { interval = Math.max(1, interval ? interval * 1.2 : 1); ease = Math.max(1.3, ease - 0.15); }
  else if (rating === 'easy') { interval = Math.max(4, interval ? interval * ease * 1.35 : 4); ease = Math.min(3, ease + 0.15); }
  else interval = Math.max(previous.reviewCount ? 2 : 1, interval ? interval * ease : 1);
  interval = Math.min(3650, Math.round(interval * 10000) / 10000);
  return {
    ...previous,
    status: rating === 'again' ? 'learning' : rating === 'easy' && interval >= 21 ? 'known' : (raw.status || 'learning'),
    dueAt: Math.round(now + interval * 86400000),
    intervalDays: interval,
    ease,
    reviewCount: previous.reviewCount + 1,
    lapses,
    lastReviewedAt: now,
  };
}

function filterResearchAnnotations(rows, filters = {}, now = Date.now()) {
  const query = String(filters.query || '').trim().toLocaleLowerCase('tr-TR');
  const tag = String(filters.tag || '').trim().toLocaleLowerCase('tr-TR');
  const type = String(filters.type || 'all');
  const status = String(filters.status || 'all');
  const dueOnly = filters.dueOnly === true;
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (type !== 'all' && row.type !== type) return false;
    if (status !== 'all' && row.status !== status) return false;
    const tags = normalizeResearchTags(row.tags);
    if (tag && !tags.some((value) => value.toLocaleLowerCase('tr-TR').includes(tag))) return false;
    if (dueOnly && Number(row.dueAt || 0) > now) return false;
    if (!query) return true;
    return [row.source, row.translation, row.note, row.mediaTitle, ...tags,
      ...normalizeResearchLinks(row.links).flatMap((link) => [link.label, link.url])]
      .some((value) => String(value || '').toLocaleLowerCase('tr-TR').includes(query));
  });
}

function markdownEscape(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/([\[\]*_`>])/g, '\\$1').trim();
}

function researchAnnotationsToMarkdown(rows, title = 'Whisper Local arastirma defteri') {
  const lines = [`# ${markdownEscape(title)}`, '', `Disa aktarim: ${new Date().toISOString()}`, ''];
  for (const row of Array.isArray(rows) ? rows : []) {
    lines.push(`## ${markdownEscape(row.mediaTitle || row.source || 'Adsiz not')}`, '');
    const meta = [row.type, row.status, Number.isFinite(Number(row.start)) ? `${Number(row.start).toFixed(3)} sn` : ''].filter(Boolean).join(' · ');
    if (meta) lines.push(markdownEscape(meta), '');
    if (row.mediaUrl && /^https?:\/\//i.test(row.mediaUrl)) lines.push(`[Kaynak](${String(row.mediaUrl).replace(/\)/g, '%29')})`, '');
    if (row.source) lines.push('> ' + markdownEscape(row.source).replace(/\n/g, '\n> '), '');
    if (row.translation) lines.push(`**Ceviri:** ${markdownEscape(row.translation)}`, '');
    if (row.note) lines.push(markdownEscape(row.note), '');
    const tags = normalizeResearchTags(row.tags);
    if (tags.length) lines.push(`Etiketler: ${tags.map((tag) => `\`${tag.replace(/`/g, '')}\``).join(' ')}`, '');
    for (const link of normalizeResearchLinks(row.links)) lines.push(`- [${markdownEscape(link.label || link.url)}](${link.url.replace(/\)/g, '%29')})`);
    if (row.links?.length) lines.push('');
  }
  return `${lines.join('\n').trim()}\n`;
}

module.exports = { filterResearchAnnotations, normalizeResearchLinks, normalizeResearchTags,
  normalizeReviewState, researchAnnotationsToMarkdown, scheduleReview };
