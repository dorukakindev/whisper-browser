const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8');
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

ok('tema, boşluk, köşe ve amber token sözleşmesi var', () => {
  for (let i = 1; i <= 6; i++) assert.match(css, new RegExp(`--space-${i}:\\s*${i * 4}px`));
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

ok('ilk açılışta temel ayarlar sade ve kullanıcı tercihiyle kalıcı', () => {
  assert.match(html, /<details class="settings-overview" id="primarySettingsOpen">/);
  assert.doesNotMatch(html, /<details class="settings-overview" id="primarySettingsOpen"[^>]*\sopen(?:\s|>)/);
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

// Amber dolgu uzerindeki metin rengi TEMAYA GORE donmek zorunda. Sabit bir renk
// (ya da baska bir token) yazildiginda bir tema mutlaka kaybediyor: beyaz metin
// koyu temanin acik amberi uzerinde 2,28:1; sabit koyu metin acik temanin koyu
// amberi uzerinde 3,2-3,4:1 -- ikisi de WCAG AA'nin (4,5:1) altinda.
// var(--accent-contrast) her iki temada da 5,2:1 ve uzerini garanti eder.
ok('amber dolgu üzerindeki metin her zaman --accent-contrast kullanır', () => {
  const offenders = [];
  for (const match of css.matchAll(/(?:^|\n)([^{}\n]{1,160})\{([^}]*)\}/g)) {
    const [, selector, body] = match;
    if (!/background(?:-color)?\s*:\s*(?:var\(--accent\)|#d5a35c)/i.test(body)) continue;
    const color = body.match(/(?<!-)color\s*:\s*([^;]+);/i);
    if (color && !color[1].includes('accent-contrast')) {
      offenders.push(`${selector.trim()} -> color: ${color[1].trim()}`);
    }
  }
  assert.deepEqual(offenders, [], 'amber dolgu üzerinde tema dışı metin rengi: ' + offenders.join(' | '));
});

ok('kanonik amber hex yalnız --accent token tanımında kalır', () => {
  const declaration = /--accent\s*:\s*#d5a35c\s*;/i;
  assert.match(css, declaration, 'kanonik koyu tema --accent tanımı kayıp');
  const remaining = css.replace(declaration, '').match(/#d5a35c/gi) || [];
  assert.equal(remaining.length, 0,
    `${remaining.length} ham #d5a35c bulundu; kullanım amacına uygun semantik token kullan`);
});

ok('rapordaki kontrast düzeltmeleri kaynakta sabit', () => {
  assert.match(css, /\.btn-icon-add\s*\{[\s\S]*?color:\s*var\(--accent-contrast\)/);
  assert.match(css, /a\s*\{[\s\S]*?color:\s*var\(--accent-hover\)/);
  assert.match(css, /\.browser-signal-kicker\s*\{[^}]*font-size:\s*10px/);
  assert.match(css, /\.browser-tab-close[\s\S]*?color:\s*var\(--text-muted\)/);
  assert.match(css, /\.browser-place-remove\s*\{[^}]*color:\s*#c58a82/);
  assert.match(css, /\.browser-error-surface code\s*\{[^}]*color:\s*var\(--text-muted\)/);
  assert(contrast('#1b160f', '#d5a35c') >= 4.5);
  assert(contrast('#fffaf0', '#985b1a') >= 4.5);
  assert(contrast('#84929c', '#141415') >= 4.5);
  assert(contrast('#6d655d', '#fffdf8') >= 4.5);
});

console.log('\nTasarım sistemi ve tema sözleşmesi geçti.');
