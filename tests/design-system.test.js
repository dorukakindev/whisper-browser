const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'browser-chrome.css'), 'utf8');
const palette = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'theme-palette.css'), 'utf8');
const assistantHtml = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'assistant-overlay.html'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer.js'), 'utf8');
const security = fs.readFileSync(path.join(ROOT, 'src', 'settings-security.js'), 'utf8');

function ok(name, fn) { fn(); console.log(`  OK  ${name}`); }

function splitSelectors(head) {
  const result = []; let start = 0; let paren = 0; let bracket = 0; let quote = '';
  for (let i = 0; i <= head.length; i++) {
    const char = head[i] || ',';
    if (quote) { if (char === quote && head[i - 1] !== '\\') quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(') paren++;
    else if (char === ')') paren--;
    else if (char === '[') bracket++;
    else if (char === ']') bracket--;
    if (char === ',' && paren === 0 && bracket === 0) {
      result.push(head.slice(start, i).trim()); start = i + 1;
    }
  }
  return result;
}

function topLevelSelectors(source) {
  const result = []; let i = 0;
  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i])) i++;
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    const open = source.indexOf('{', i);
    if (open < 0) break;
    const head = source.slice(i, open).trim();
    let depth = 1; let cursor = open + 1; let quote = '';
    for (; cursor < source.length && depth; cursor++) {
      const char = source[cursor];
      if (quote) { if (char === quote && source[cursor - 1] !== '\\') quote = ''; continue; }
      if (char === '"' || char === "'") quote = char;
      else if (char === '{') depth++;
      else if (char === '}') depth--;
    }
    if (!head.startsWith('@')) result.push(...splitSelectors(head));
    i = cursor;
  }
  return result;
}

function luminance(hex) {
  const values = hex.match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function contrast(a, b) {
  const x = luminance(a); const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

ok('tema ve mevcut bileşenlerin semantik rolleri var; değerler tasarıma aittir', () => {
  for (let i = 1; i <= 6; i++) assert.match(css, new RegExp(`--space-${i}:\\s*[^;]+;`));
  for (const token of ['radius-xs', 'radius-sm', 'radius', 'radius-lg', 'radius-pill',
    'accent-dim', 'accent-contrast']) assert.match(css, new RegExp(`--${token}:`));
  assert.match(css, /html\[data-theme="light"\]\s*\{/);
});

ok('tema kontrolü güvenli ayar şemasıyla birlikte kalıcı', () => {
  assert.match(html, /id="uiTheme"[\s\S]*?value="system"[\s\S]*?value="dark"[\s\S]*?value="light"/);
  assert.match(renderer, /'browserSponsorMode', 'uiTheme'/);
  assert.match(renderer, /function applyUiTheme\(/);
  assert.match(security, /uiTheme:\s*\['system', 'dark', 'light'\]/);
});

ok('temel ayar özeti ve kullanıcının açık/kapalı tercihi kalıcı', () => {
  assert.match(html, /<details class="settings-overview" id="primarySettingsOpen">/);
  for (const id of ['settingsOverviewModel', 'settingsOverviewLanguage', 'settingsOverviewOutput']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(css, /\.settings-overview\s*\{/);
  assert.match(renderer, /'primarySettingsOpen'/);
  assert.match(renderer, /el\.tagName === 'DETAILS' \? el\.open : el\.checked/);
  assert.match(security, /'primarySettingsOpen'/);
  assert.match(css, /\.panel\s*\{[^}]*min-width:\s*0/);
});

ok('eski ve etkin CSS bölgeleri arasında gölge seçici kalmadı', () => {
  const split = css.indexOf(':root {');
  assert(split > 0, 'etkin tema sınırı bulunamadı');
  const current = new Set(topLevelSelectors(css.slice(split)));
  const duplicates = [...new Set(topLevelSelectors(css.slice(0, split)).filter((selector) => current.has(selector)))];
  assert.deepStrictEqual(duplicates, []);
});

ok('odak göstergeleri bileşen kuralları tarafından kapatılmıyor', () => {
  assert.doesNotMatch(css, /:focus-visible[^{}]*\{[^}]*outline\s*:\s*none/i);
});

// Component accent foregrounds follow the selected theme; no hue is prescribed.
ok('vurgu dolgusu üzerindeki metin temanın kontrast rolünü kullanır', () => {
  const offenders = [];
  for (const match of css.matchAll(/(?:^|\n)([^{}\n]{1,160})\{([^}]*)\}/g)) {
    const [, selector, body] = match;
    if (!/background(?:-color)?\s*:\s*var\(--accent\)/i.test(body)) continue;
    const color = body.match(/(?<!-)color\s*:\s*([^;]+);/i);
    if (color && !color[1].includes('accent-contrast')) offenders.push(selector.trim());
  }
  assert.deepEqual(offenders, [], 'Vurgu üzerinde tema dışı metin rengi');
});

ok('ortak tema rolleri iki renderer girişinden önce yüklenir', () => {
  assert.match(css, /--accent:\s*var\(--theme-accent\)/);
  for (const [markup, component] of [[html, 'styles.css'], [assistantHtml, 'assistant-overlay.css']]) {
    assert(markup.indexOf('theme-palette.css') >= 0);
    assert(markup.indexOf('theme-palette.css') < markup.indexOf(component));
  }
  for (const role of ['bg-0', 'bg-1', 'bg-2', 'bg-3', 'text', 'text-dim', 'text-muted', 'border', 'border-strong']) {
    assert.match(palette, new RegExp(`--theme-${role}:`));
  }
});

ok('rapordaki kontrast düzeltmeleri kaynakta sabit', () => {
  assert.match(css, /\.btn-icon-add\s*\{[\s\S]*?color:\s*var\(--accent-contrast\)/);
  assert.match(css, /a\s*\{[\s\S]*?color:\s*var\(--accent-hover\)/);
  assert.match(css, /\.browser-signal-kicker\s*\{[^}]*font-size:\s*10px/);
  assert.match(css, /\.browser-tab-close[\s\S]*?color:\s*var\(--text-muted\)/);
  assert.match(css, /\.browser-place-remove\s*\{[^}]*color:\s*var\(--danger\)/);
  assert.match(css, /\.browser-place-remove:hover\s*\{[^}]*background:\s*var\(--chrome-danger-soft\)/);
  assert.match(css, /\.browser-place-folder\s*\{[^}]*color:\s*var\(--text-dim\)/);
  assert.match(css, /\.sub-hidden-hint\s*\{[^}]*color:\s*var\(--ink-bright\)/);
  assert.match(css, /\.learning-badge\s*\{[^}]*color:\s*var\(--ink-bright\)/);
  assert.match(css, /\.browser-error-surface code\s*\{[^}]*color:\s*var\(--text-muted\)/);
});

function checkThemeContrast(source) {
  const blocks = [...source.matchAll(/(:root|html\[data-theme="light"\])\s*\{([^}]+)\}/g)];
  assert.equal(blocks.length, 2, 'Koyu/açık tema blokları bulunamadı');
  for (const [, theme, body] of blocks) {
    const colour = role => {
      const match = body.match(new RegExp(`--theme-${role}:\\s*(#[0-9a-f]{6})\\s*;`, 'i'));
      assert(match, `${theme}: ${role} için kontrast kontrolünü gerçek CSS renk biçimine uyarlayın`);
      return match[1];
    };
    assert(contrast(colour('accent'), colour('accent-contrast')) >= 4.5, `${theme}: vurgu metni kontrastı`);
    for (const role of ['text', 'text-dim', 'text-muted']) {
      for (const surface of ['bg-0', 'bg-1', 'bg-2', 'bg-3']) {
        assert(contrast(colour(role), colour(surface)) >= 4.5, `${theme}: ${role}/${surface} kontrastı`);
      }
    }
  }
}

ok('seçilen gerçek tema renkleri hue bağımsız okunabilir kontrasta sahip', () => {
  checkThemeContrast(palette);
  const alternate = palette.replace(/--theme-accent:\s*#[0-9a-f]{6};/gi, '--theme-accent: #000000;')
    .replace(/--theme-accent-contrast:\s*#[0-9a-f]{6};/gi, '--theme-accent-contrast: #ffffff;');
  checkThemeContrast(alternate);
  assert.throws(() => checkThemeContrast(alternate.replace(/--theme-accent-contrast:\s*#[0-9a-f]{6};/gi,
    '--theme-accent-contrast: #000000;')), /kontrastı/);
  const mini=fs.readFileSync(path.join(ROOT,'src/renderer/browser-mini.html'),'utf8');
  assert(mini.indexOf('theme-palette.css') < mini.indexOf('browser-mini.css'));
});

console.log('\nTasarım sistemi ve tema sözleşmesi geçti.');
