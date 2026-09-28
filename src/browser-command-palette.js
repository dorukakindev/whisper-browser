function normalizeTurkishSearch(value) {
  return String(value == null ? '' : value).toLocaleLowerCase('tr-TR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/ş/g, 's')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').trim();
}

function rankBrowserCommands(commands, query, context = {}) {
  const needle = normalizeTurkishSearch(query);
  // Komut başlıkları TR anahtarları olarak kayıtlı; EN arayüzde kullanıcı
  // İngilizce isimle arar. Her iki dilde de eşleşmesi için UiLocale
  // çevirisini haystack'e kat (UiLocale yoksa TR metin zaten kendisi).
  const t = (s) => globalThis.UiLocale?.t?.(s) || s;
  return (Array.isArray(commands) ? commands : []).map((command, index) => {
    const availability = typeof command.available === 'function' ? command.available(context) : { enabled: true };
    const enabled = availability !== false && availability?.enabled !== false;
    const disabledReason = enabled ? '' : String(availability?.reason || command.disabledReason || 'Bu bağlamda kullanılamıyor.');
    const titleTr = normalizeTurkishSearch(command.title);
    const titleEn = normalizeTurkishSearch(t(command.title));
    const titles = titleEn !== titleTr ? [titleTr, titleEn] : [titleTr];
    const haystack = normalizeTurkishSearch([
      command.title, t(command.title),
      ...(command.keywords || []), ...(command.keywords || []).map((k) => t(k)),
      command.category, t(command.category || ''),
    ].join(' '));
    let score = needle ? (titles.some((ti) => ti === needle) ? 1000
      : titles.some((ti) => ti.startsWith(needle)) ? 800
      : titles.some((ti) => ti.includes(needle)) ? 500
      : haystack.includes(needle) ? 250 : -1) : 100;
    if (!enabled) score -= 5;
    return { ...command, enabled, disabledReason, score, index };
  }).filter((command) => command.score >= 0)
    .sort((a, b) => Number(b.enabled) - Number(a.enabled)
      || b.score - a.score || a.index - b.index);
}

function browserCommandContextMatches(opened, current) {
  return !!opened && !!current && String(opened.tabId || '') === String(current.tabId || '')
    && Number(opened.generation || 0) === Number(current.generation || 0)
    && String(opened.mediaId || '') === String(current.mediaId || '');
}

function browserShortcutForInput(input = {}) {
  if (input.type !== 'keyDown') return '';
  const rawKey = String(input.key || '');
  const key = rawKey.toLowerCase();
  const modifier = !!(input.control || input.meta);
  // Değiştiricisiz / yalnız Alt'lı standart tarayıcı kısayolları. Eskiden bu
  // tuşların hiçbiri köprülenmiyordu: Alt+← geri gitmiyor, F5 yenilemiyordu.
  if (!modifier) {
    if (input.alt && !input.shift) {
      if (key === 'arrowleft') return 'back';
      if (key === 'arrowright') return 'forward';
      if (key === 'd') return 'l';
      return '';
    }
    if (input.alt) return '';
    if (rawKey === 'F5') return input.shift ? 'reload-hard' : 'r';
    if (rawKey === 'F6') return 'l';
    if (rawKey === 'BrowserBack') return 'back';
    if (rawKey === 'BrowserForward') return 'forward';
    return '';
  }
  if (input.alt) return ({ arrowleft: 'subtitle-earlier', arrowright: 'subtitle-later',
    arrowup: 'subtitle-larger', arrowdown: 'subtitle-smaller' })[key] || '';
  if (rawKey === 'F5') return 'reload-hard';
  if (key === 'pagedown') return 'tab-next';
  if (key === 'pageup') return 'tab-previous';
  if (input.shift) {
    if (key === 'r') return 'reload-hard';
    return ['p', 't', 'h', 'tab', '+', '='].includes(key) ? key : '';
  }
  return ['k', 'p', 'f', 'l', 't', 'w', 'r', 'tab', '0', '+', '=', '-', '_',
    '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(key) ? key : '';
}

const browserCommandPaletteApi = { browserCommandContextMatches, browserShortcutForInput, normalizeTurkishSearch, rankBrowserCommands };
if (typeof window !== 'undefined') window.BrowserCommandPalette = browserCommandPaletteApi;
if (typeof module !== 'undefined') module.exports = browserCommandPaletteApi;
