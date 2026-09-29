'use strict';

function createNdjsonLineBuffer(options = {}) {
  const maxLineChars = Math.max(1024, Number(options.maxLineChars) || 32 * 1024 * 1024);
  const onOverflow = typeof options.onOverflow === 'function' ? options.onOverflow : () => {};
  let pending = '';
  let dropping = false;

  function push(chunk) {
    let text = String(chunk ?? '');
    const lines = [];

    if (dropping) {
      const newline = text.indexOf('\n');
      if (newline < 0) return lines;
      text = text.slice(newline + 1);
      dropping = false;
    }

    const combined = pending + text;
    pending = '';
    let start = 0;
    while (start < combined.length) {
      const newline = combined.indexOf('\n', start);
      if (newline < 0) break;
      const line = combined.slice(start, newline);
      if (line.length > maxLineChars) onOverflow(line.length);
      else lines.push(line);
      start = newline + 1;
    }

    pending = combined.slice(start);
    if (pending.length > maxLineChars) {
      onOverflow(pending.length);
      pending = '';
      dropping = true;
    }
    return lines;
  }

  function flush() {
    if (dropping || !pending) {
      pending = '';
      dropping = false;
      return [];
    }
    const line = pending;
    pending = '';
    return [line];
  }

  return { push, flush };
}

// Tek satırı olay nesnesine çözer. yt-dlp'nin "[download] ..." ilerleme
// metni gibi JSON olmayan çıktı, yardımcı sürecin stdout'unda aynı satıra
// yapışabilir; tüm satırı parse etmek o olayı sessizce düşürür (ör. subs
// indirilmesine rağmen "indirilemedi" dönmesi). Önce tam satır denenir;
// tutmazsa ilk '{' ile son '}' arasındaki aday nesne kurtarılır.
function parseNdjsonLine(raw) {
  const line = String(raw ?? '').trim();
  if (!line) return null;
  const ok = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
  if (line.startsWith('{')) {
    try { return ok(JSON.parse(line)); } catch (_) { /* aşağıda kurtarma dene */ }
  }
  const start = line.indexOf('{');
  const end = line.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return ok(JSON.parse(line.slice(start, end + 1))); } catch (_) { return null; }
}

module.exports = { createNdjsonLineBuffer, parseNdjsonLine };
