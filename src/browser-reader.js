// Guvenilir isolated world, uzak sayfanin HTML'ini yeniden calistirmadan
// yalniz okunabilir metin ve medya dugumlerini bir okuma katmanina kopyalar.
const READER_ACTIONS = new Set(['toggle', 'open', 'close', 'preferences']);

function normalizeReaderPreferences(raw = {}) {
  return {
    fontSize: Math.max(16, Math.min(32, Number(raw.fontSize) || 20)),
    lineHeight: Math.max(1.35, Math.min(2.1, Number(raw.lineHeight) || 1.7)),
    width: Math.max(520, Math.min(1100, Number(raw.width) || 760)),
  };
}

// Mozilla Readability'nin aday seçme fikrini bağımlılık eklemeden, ölçülebilir
// ve sınırlı bir karşılaştırma olarak uygular. Gerçek çıkarım hâlâ güvenli copy()
// yolundan geçer; bu yardımcı yalnız hangi içerik kökünün daha iyi olduğunu seçer.
function scoreReaderCandidate(stats = {}) {
  const text = Math.max(0, Number(stats.textLength) || 0);
  const paragraphs = Math.max(0, Number(stats.paragraphs) || 0);
  const links = Math.max(0, Number(stats.links) || 0);
  const noise = Math.max(0, Number(stats.noise) || 0);
  return Math.max(0, Math.round(text + paragraphs * 120 - links * 18 - noise * 140));
}

function chooseReaderCandidate(candidates = [], minimumGain = 1.15) {
  const rows = Array.isArray(candidates) ? candidates.filter(Boolean).map((row) => ({
    ...row, score: scoreReaderCandidate(row), selector: String(row.selector || ''),
  })) : [];
  if (!rows.length) return { selected: null, candidates: [] };
  rows.sort((a, b) => b.score - a.score || b.textLength - a.textLength);
  const best = rows[0];
  const native = rows.find((row) => row.native) || rows[rows.length - 1];
  const selected = best.score >= Math.round((native.score || 1) * minimumGain) && best.textLength >= native.textLength
    ? best : native;
  return { selected, candidates: rows };
}

function buildBrowserReaderScript(action = 'toggle', rawPreferences = {}) {
  const safeAction = READER_ACTIONS.has(action) ? action : 'toggle';
  const preferences = normalizeReaderPreferences(rawPreferences);
  return `(() => {
    const KEY = '__whisperReaderController';
    const action = ${JSON.stringify(safeAction)};
    const requested = ${JSON.stringify(preferences)};
    const current = globalThis[KEY];
    if (current && action === 'close') return current.close();
    if (current && action === 'toggle') return current.close();
    if (current && action === 'preferences') return current.preferences(requested);
    if (current && action === 'open') return current.snapshot();
    if (action === 'close' || action === 'preferences') return { ok: true, active: false };
    const roots = [...document.querySelectorAll('article,[role="main"],main,body')];
    const uniqueRoots = [...new Set(roots)];
    const statRows = uniqueRoots.map((root) => ({
      root,
      selector: root.matches('article') ? 'article' : root.matches('[role="main"]') ? '[role=main]' : root.tagName.toLowerCase(),
      native: root === roots[0], textLength: String(root.innerText || '').trim().length,
      paragraphs: root.querySelectorAll('p').length, links: root.querySelectorAll('a').length,
      noise: root.querySelectorAll('nav,aside,footer,header,form,script,style').length,
    }));
    const measured = statRows.map((row) => ({ ...row, score: row.textLength + row.paragraphs * 120 - row.links * 18 - row.noise * 140 }));
    measured.sort((a, b) => b.score - a.score || b.textLength - a.textLength);
    const nativeRoot = roots[0] || document.body;
    const nativeStats = statRows.find((row) => row.native) || statRows[0];
    const bestStats = measured[0] || nativeStats;
    const candidate = bestStats && bestStats.score >= Math.round((nativeStats?.score || 1) * 1.15) && bestStats.textLength >= (nativeStats?.textLength || 0)
      ? bestStats.root : nativeRoot;
    if (!candidate) return { ok: false, active: false, error: 'Okunabilir sayfa govdesi bulunamadi.' };
    const title = String(document.querySelector('h1')?.textContent || document.title || '').trim().slice(0, 500);
    const byline = String(document.querySelector('[rel="author"],.byline,.author,[itemprop="author"]')?.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 300);
    const allowed = new Set(['P','H1','H2','H3','H4','BLOCKQUOTE','PRE','CODE','UL','OL','LI','FIGURE','FIGCAPTION','IMG','A','EM','STRONG','B','I','HR']);
    const ignored = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','IFRAME','OBJECT','EMBED','HEAD']);
    const safeUrl = (value, kind) => { try { const url = new URL(String(value || ''), location.href); if (url.protocol === 'https:' || url.protocol === 'http:' || (kind === 'image' && url.protocol === 'data:' && /^data:image\\//i.test(url.href))) return url.href; } catch (_) {} return ''; };
    const copy = (node, depth = 0) => {
      if (!node || depth > 80) return null;
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue || '');
      if (node.nodeType === Node.ELEMENT_NODE && ignored.has(node.tagName)) return null;
      if (node.nodeType !== Node.ELEMENT_NODE || !allowed.has(node.tagName)) {
        const fragment = document.createDocumentFragment();
        for (const child of node.childNodes || []) { const next = copy(child, depth + 1); if (next) fragment.appendChild(next); }
        return fragment;
      }
      const element = document.createElement(node.tagName.toLowerCase());
      if (node.tagName === 'A') { const href = safeUrl(node.getAttribute('href'), 'link'); if (href) { element.setAttribute('href', href); element.setAttribute('target', '_blank'); element.setAttribute('rel', 'noopener noreferrer'); } }
      if (node.tagName === 'IMG') { const src = safeUrl(node.currentSrc || node.getAttribute('src'), 'image'); if (!src) return null; element.setAttribute('src', src); element.setAttribute('alt', String(node.getAttribute('alt') || '').slice(0, 500)); element.setAttribute('loading', 'lazy'); }
      for (const child of node.childNodes || []) { const next = copy(child, depth + 1); if (next) element.appendChild(next); }
      return element;
    };
    const article = copy(candidate);
    const textLength = String(candidate.innerText || '').trim().length;
    if (!article || textLength < 180) return { ok: false, active: false, error: 'Bu sayfada yeterli makale metni bulunamadi.' };
    const host = document.createElement('div');
    host.id = 'whisper-reader-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0b0f13;color:#e8e4dc;overflow:auto;color-scheme:dark;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = ':host{all:initial}.shell{min-height:100%;background:#0b0f13;color:#e8e4dc;font-family:Georgia,Cambria,serif}.bar{position:sticky;top:0;z-index:4;display:flex;align-items:center;gap:10px;padding:10px 18px;background:rgba(11,15,19,.96);border-bottom:1px solid #2a3038;font:13px Segoe UI,sans-serif}.bar strong{color:#d5a35c;margin-right:auto;letter-spacing:.04em}.bar button{border:1px solid #3a414b;background:#171c22;color:#e8e4dc;border-radius:6px;padding:6px 10px;cursor:pointer}.bar button:hover{border-color:#d5a35c}.layout{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:36px;max-width:calc(var(--reader-width) + 280px);margin:0 auto;padding:54px 28px 90px}.article{max-width:var(--reader-width);font-size:var(--reader-font);line-height:var(--reader-line)}h1{font-size:2.25em;line-height:1.12;margin:0 0 12px;color:#fff}h2,h3,h4{scroll-margin-top:72px;color:#f2eee7;line-height:1.25;margin:1.7em 0 .5em}p,li{margin:.8em 0}blockquote{border-left:3px solid #d5a35c;margin:1.3em 0;padding:.2em 1.1em;color:#c9c5bd}pre{overflow:auto;padding:14px;background:#12171d;border:1px solid #2a3038;border-radius:8px}code{font-family:Consolas,monospace}img{display:block;max-width:100%;height:auto;margin:1.4em auto;border-radius:7px}a{color:#72c7d5}.meta{font:13px Segoe UI,sans-serif;color:#9ca5ae;margin-bottom:32px}.toc{position:sticky;top:78px;align-self:start;max-height:calc(100vh - 96px);overflow:auto;border-left:1px solid #2a3038;padding-left:18px;font:13px/1.45 Segoe UI,sans-serif}.toc strong{display:block;color:#d5a35c;margin-bottom:10px}.toc a{display:block;color:#aeb5bd;text-decoration:none;padding:4px 0}.toc a:hover{color:#fff}@media(max-width:880px){.layout{display:block}.toc{display:none}}';
    const shell = document.createElement('div'); shell.className = 'shell';
    const bar = document.createElement('div'); bar.className = 'bar';
    const brand = document.createElement('strong'); brand.textContent = 'OKUMA GORUNUMU';
    const smaller = document.createElement('button'); smaller.type = 'button'; smaller.textContent = 'A-'; smaller.title = 'Yaziyi kucult';
    const larger = document.createElement('button'); larger.type = 'button'; larger.textContent = 'A+'; larger.title = 'Yaziyi buyut';
    const narrow = document.createElement('button'); narrow.type = 'button'; narrow.textContent = 'Dar'; narrow.title = 'Metin sutununu daralt';
    const wide = document.createElement('button'); wide.type = 'button'; wide.textContent = 'Genis'; wide.title = 'Metin sutununu genislet';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Kapat'; close.title = 'Okuma gorunumunu kapat';
    bar.append(brand, smaller, larger, narrow, wide, close);
    const layout = document.createElement('div'); layout.className = 'layout';
    const body = document.createElement('article'); body.className = 'article';
    if (title) { const heading = document.createElement('h1'); heading.textContent = title; body.appendChild(heading); }
    if (byline) { const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = byline; body.appendChild(meta); }
    body.appendChild(article);
    const toc = document.createElement('nav'); toc.className = 'toc'; toc.setAttribute('aria-label', 'Icindekiler');
    const tocTitle = document.createElement('strong'); tocTitle.textContent = 'ICINDEKILER'; toc.appendChild(tocTitle);
    const headings = [...body.querySelectorAll('h2,h3')].slice(0, 80);
    headings.forEach((heading, index) => { const id = 'whisper-reader-heading-' + index; heading.id = id; const link = document.createElement('a'); link.href = '#' + id; link.textContent = String(heading.textContent || '').trim().slice(0, 160); link.addEventListener('click', (event) => { event.preventDefault(); heading.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); toc.appendChild(link); });
    layout.append(body, toc); shell.append(bar, layout); shadow.append(style, shell); document.documentElement.appendChild(host);
    const state = { fontSize: requested.fontSize, lineHeight: requested.lineHeight, width: requested.width };
    const apply = () => { shell.style.setProperty('--reader-font', state.fontSize + 'px'); shell.style.setProperty('--reader-line', String(state.lineHeight)); shell.style.setProperty('--reader-width', state.width + 'px'); };
    const snapshot = () => ({ ok: true, active: true, title, textLength, headings: headings.length,
      extractor: candidate === nativeRoot ? 'native' : 'readability-heuristic',
      readerComparison: { native: nativeStats ? { ...nativeStats, root: undefined } : null,
        selected: bestStats ? { ...bestStats, root: undefined } : null,
        candidates: measured.slice(0, 8).map(({ root, ...row }) => row) },
      preferences: { ...state } });
    const controller = {
      snapshot,
      preferences(next) { state.fontSize = Math.max(16, Math.min(32, Number(next.fontSize) || state.fontSize)); state.lineHeight = Math.max(1.35, Math.min(2.1, Number(next.lineHeight) || state.lineHeight)); state.width = Math.max(520, Math.min(1100, Number(next.width) || state.width)); apply(); return snapshot(); },
      close() { const result = { ok: true, active: false, preferences: { ...state } }; host.remove(); delete globalThis[KEY]; return result; },
    };
    globalThis[KEY] = controller; apply();
    smaller.addEventListener('click', () => controller.preferences({ ...state, fontSize: state.fontSize - 1 }));
    larger.addEventListener('click', () => controller.preferences({ ...state, fontSize: state.fontSize + 1 }));
    narrow.addEventListener('click', () => controller.preferences({ ...state, width: state.width - 60 }));
    wide.addEventListener('click', () => controller.preferences({ ...state, width: state.width + 60 }));
    close.addEventListener('click', () => controller.close());
    return snapshot();
  })()`;
}

module.exports = { buildBrowserReaderScript, normalizeReaderPreferences, scoreReaderCandidate, chooseReaderCandidate };
