function normalizeTurkishSearch(value) {
  return String(value == null ? '' : value).toLocaleLowerCase('tr-TR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/ş/g, 's')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').trim();
}

function rankBrowserCommands(commands, query, context = {}) {
  const needle = normalizeTurkishSearch(query);
  return (Array.isArray(commands) ? commands : []).map((command, index) => {
    const availability = typeof command.available === 'function' ? command.available(context) : { enabled: true };
    const enabled = availability !== false && availability?.enabled !== false;
    const disabledReason = enabled ? '' : String(availability?.reason || command.disabledReason || 'Bu bağlamda kullanılamıyor.');
    const title = normalizeTurkishSearch(command.title);
    const haystack = normalizeTurkishSearch([command.title, ...(command.keywords || []), command.category].join(' '));
    let score = needle ? (title === needle ? 1000 : title.startsWith(needle) ? 800 : title.includes(needle) ? 500
      : haystack.includes(needle) ? 250 : -1) : 100;
    if (!enabled) score -= 5;
    return { ...command, enabled, disabledReason, score, index };
  }).filter((command) => command.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function browserCommandContextMatches(opened, current) {
  return !!opened && !!current && String(opened.tabId || '') === String(current.tabId || '')
    && Number(opened.generation || 0) === Number(current.generation || 0)
    && String(opened.mediaId || '') === String(current.mediaId || '');
}

function browserShortcutForInput(input = {}) {
  if (input.type !== 'keyDown' || input.alt || !(input.control || input.meta)) return '';
  const key = String(input.key || '').toLowerCase();
  return key === 'k' || key === 'f' || key === 'l' || (key === 't' && input.shift) ? key : '';
}

const browserCommandPaletteApi = { browserCommandContextMatches, browserShortcutForInput, normalizeTurkishSearch, rankBrowserCommands };
if (typeof window !== 'undefined') window.BrowserCommandPalette = browserCommandPaletteApi;
if (typeof module !== 'undefined') module.exports = browserCommandPaletteApi;
