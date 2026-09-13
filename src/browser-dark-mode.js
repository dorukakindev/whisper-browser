'use strict';

const MAX_DARK_READER_CSS_CHARS = 2_000_000;

function buildDarkReaderCssScript(bundle, theme = {}) {
  const code = String(bundle || '');
  if (!code.includes('exports.exportGeneratedCSS')) throw new TypeError('Dark Reader API paketi geçersiz.');
  const options = {
    brightness: Math.max(50, Math.min(150, Number(theme.brightness) || 100)),
    contrast: Math.max(50, Math.min(150, Number(theme.contrast) || 100)),
    sepia: Math.max(0, Math.min(100, Number(theme.sepia) || 0)),
  };
  return `${code}\n;(async () => {
    try {
      globalThis.DarkReader.enable(${JSON.stringify(options)});
      await new Promise((resolve) => setTimeout(resolve, 80));
      const css = await globalThis.DarkReader.exportGeneratedCSS();
      globalThis.DarkReader.disable();
      try { delete globalThis.DarkReader; } catch (_) {}
      const text = String(css || '');
      if (!text.trim()) return { ok: false, error: 'Dark Reader boş CSS üretti.' };
      if (text.length > ${MAX_DARK_READER_CSS_CHARS}) {
        return { ok: false, error: 'Dark Reader CSS güvenli boyut sınırını aşıyor.' };
      }
      return { ok: true, css: text };
    } catch (error) {
      try { globalThis.DarkReader?.disable?.(); delete globalThis.DarkReader; } catch (_) {}
      return { ok: false, error: String(error?.message || error || '').slice(0, 240) };
    }
  })()`;
}

module.exports = { MAX_DARK_READER_CSS_CHARS, buildDarkReaderCssScript };
