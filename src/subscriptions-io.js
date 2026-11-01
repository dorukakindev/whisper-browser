'use strict';
// A07 — Abonelik içe/dışa aktarma biçimleri: OPML, CSV, düz JSON ve
// NewPipe Takeout (newpipe_subscriptions.json). Yalnız kanal adı/kimliği/URL
// taşınır — hesap parolası, oturum çerezi veya token ASLA bu dosyaya girmez.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SubscriptionIO = api;
}(typeof self !== 'undefined' ? self : globalThis, function () {
  const UCID_RE = /UC[A-Za-z0-9_-]{20,24}/;
  const MAX_SUBS = 1000;
  const HANDLE_RE = /^@[\p{L}\p{M}\p{N}._-]{2,40}$/u;

  function decodeXmlAttribute(value) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, key) => {
      if (key[0] !== '#') return named[key.toLowerCase()];
      const point = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
    });
  }

  function channelRefFromUrl(url) {
    const u = String(url || '').trim();
    const uc = u.match(UCID_RE);
    if (uc) return { authorId: uc[0] };
    try {
      const parsed = new URL(u);
      const handle = decodeURIComponent(parsed.pathname).match(/^\/(@[^/]+)\/?$/)?.[1];
      if (/^(?:www\.|m\.)?youtube\.com$/i.test(parsed.hostname) && handle && HANDLE_RE.test(handle)) return { handle };
    } catch (_) {}
    const inv = u.match(/channel\/([A-Za-z0-9_-]{6,40})/i);
    if (inv) return { authorId: inv[1] };
    return null;
  }

  function normSub(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const author = String(entry.author || entry.name || '').trim().slice(0, 120);
    let authorId = String(entry.authorId || entry.channelId || entry.ucid || '').trim();
    if (authorId && !/^[A-Za-z0-9_-]{2,40}$/.test(authorId)) authorId = '';
    let handle = String(entry.handle || '').trim();
    if (handle && !HANDLE_RE.test(handle)) handle = '';
    const url = String(entry.url || '').trim().slice(0, 500);
    const ref = !authorId && !handle ? channelRefFromUrl(url) : null;
    const sub = {
      authorId: authorId || (ref && ref.authorId) || '',
      handle: handle || (ref && ref.handle) || '',
      author,
      group: String(entry.group || '').trim().slice(0, 60),
    };
    if (!sub.authorId && !sub.handle) return null;
    return sub;
  }

  function dedupe(subs) {
    const seen = new Set();
    const out = [];
    for (const s of subs) {
      const key = s.authorId || String(s.handle || '').normalize('NFC').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(s);
      if (out.length >= MAX_SUBS) break;
    }
    return out;
  }

  // ---- içe aktarma ----
  function parseSubscriptions(text, fileName = '') {
    const t = String(text || '').trim();
    if (!t) return { ok: false, error: 'Dosya boş.' };
    if (t[0] === '{' || t[0] === '[') return parseJsonSubs(t);
    if (/<(opml|outline|feed)\b/i.test(t)) return parseOpml(t);
    return parseCsv(t, fileName);
  }

  function parseJsonSubs(text) {
    let data;
    try { data = JSON.parse(text); } catch (_) { return { ok: false, error: 'JSON okunamadı.' }; }
    // NewPipe Takeout: {subscriptions:[{service_id, url, name}]}
    if (data && Array.isArray(data.subscriptions)) {
      const subs = data.subscriptions
        .filter((s) => s && (s.service_id === 0 || /youtube/i.test(String(s.service_name || '')) || /youtube/i.test(String(s.url || ''))))
        .map((s) => normSub({ author: s.name, url: s.url }))
        .filter(Boolean);
      return { ok: true, format: 'newpipe', subs: dedupe(subs) };
    }
    // Whisper formatı: {channels:[...], groups:[...]} veya düz dizi
    const list = Array.isArray(data) ? data : (Array.isArray(data.channels) ? data.channels : null);
    if (!list) return { ok: false, error: 'Tanınmayan JSON biçimi.' };
    const groups = Array.isArray(data.groups) ? data.groups.map((g) => String(g).slice(0, 60)).filter(Boolean) : [];
    return { ok: true, format: 'json', subs: dedupe(list.map(normSub).filter(Boolean)), groups };
  }

  function parseOpml(text) {
    const subs = [];
    const re = /<outline\b[^>]*>/gi;
    let m;
    while ((m = re.exec(text))) {
      const tag = m[0];
      const attr = (name) => {
        const a = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
        return a ? decodeXmlAttribute(a[2]) : '';
      };
      const url = attr('htmlUrl') || attr('xmlUrl') || attr('url');
      const ref = channelRefFromUrl(url);
      if (!ref) continue;
      subs.push(normSub({ author: attr('title') || attr('text'), url, authorId: ref.authorId || '', handle: ref.handle || '' }));
    }
    return { ok: true, format: 'opml', subs: dedupe(subs.filter(Boolean)) };
  }

  function parseCsv(text, fileName) {
    const subs = [];
    const rows = [];
    let row = [], cell = '', quoted = false;
    const input = String(text);
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (quoted) {
        if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"' && !cell.trim()) quoted = true;
      else if (ch === ',') { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && input[i + 1] === '\n') i++;
        row.push(cell.trim()); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (quoted) return { ok: false, error: 'CSV okunamadı.' };
    row.push(cell.trim()); rows.push(row);
    const header = rows[0] || [];
    const urlColumn = header.findIndex(cell => /^(?:url|channel url)$/i.test(cell));
    const nameColumn = header.findIndex(cell => /^(?:kanal|channel(?: name)?|name|title)$/i.test(cell));
    for (const row of rows) {
      if (!row.length) continue;
      // "Kanal adı, https://youtube.com/channel/UC..." veya "UCid, url"
      const urlCell = (urlColumn >= 0 ? row[urlColumn] : row.find((c) => /^https?:\/\//i.test(c))) || '';
      const idCell = row.find((c) => c.match(UCID_RE)?.[0] === c) || '';
      const nameCell = (nameColumn >= 0 ? row[nameColumn] : row.find((c) => c && c !== urlCell && c !== idCell)) || '';
      const ref = channelRefFromUrl(urlCell) || (idCell ? { authorId: idCell } : null);
      const s = ref && normSub({ author: nameCell, url: urlCell, authorId: ref.authorId || '', handle: ref.handle || '' });
      if (s) subs.push(s);
    }
    if (!subs.length) return { ok: false, error: 'CSV içinde kanal bulunamadı.' };
    return { ok: true, format: 'csv', subs: dedupe(subs) };
  }

  // ---- dışa aktarma ----
  function exportSubscriptions(subs, groups, format) {
    const list = dedupe((subs || []).map(normSub).filter(Boolean));
    const urlOf = (s) => s.authorId
      ? `https://www.youtube.com/channel/${s.authorId}`
      : `https://www.youtube.com/${s.handle}`;
    const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    switch (format) {
      case 'opml': {
        const outlines = list.map((s) =>
          `    <outline text="${esc(s.author || s.authorId || s.handle)}" title="${esc(s.author || '')}" type="rss" xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=${esc(s.authorId)}" htmlUrl="${esc(urlOf(s))}"/>`).join('\n');
        return {
          fileName: 'whisper-abonelikler.opml',
          text: `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="1.0">\n  <head><title>Whisper abonelikleri</title></head>\n  <body>\n${outlines}\n  </body>\n</opml>\n`,
        };
      }
      case 'newpipe': {
        const subscriptions = list.map((s) => ({ service_id: 0, url: urlOf(s), name: s.author || s.authorId || s.handle }));
        return { fileName: 'newpipe_subscriptions.json', text: `${JSON.stringify({ app_version: 'whisper-export', subscriptions }, null, 2)}\n` };
      }
      case 'csv': {
        const rows = list.map((s) => `"${String(s.author || '').replace(/"/g, '""')}","${urlOf(s)}"`);
        return { fileName: 'whisper-abonelikler.csv', text: `Kanal,URL\n${rows.join('\n')}\n` };
      }
      default: {
        return {
          fileName: 'whisper-abonelikler.json',
          text: `${JSON.stringify({ version: 1, groups: groups || [], channels: list }, null, 2)}\n`,
        };
      }
    }
  }

  return { parseSubscriptions, exportSubscriptions, channelRefFromUrl, normSub, dedupe, MAX_SUBS };
}));
