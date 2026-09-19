'use strict';

/**
 * Browser address suggestions accessibility + keyboard navigation regression test.
 *
 * Test edilen alan (src/renderer/renderer.js içinde):
 *   - renderBrowserAddressResults()  (~satır 6690)
 *   - browserAddress keydown handler (~satır 10486)
 *
 * Bilinen UI/UX ihlalleri:
 *   T-01: Listbox öğeleri `<button role="option">` — ARIA spec'e göre çakışma.
 *         `<button>` zaten kendi role'ünü taşır; role="option" öğenin etkileşim
 *         rolünü geçersiz kılar.
 *   T-02: Keydown handler'ı sadece ArrowDown/ArrowUp + Enter + Escape destekler;
 *         Home/End yok (→ İlk/son öğeye atlayamıyor).
 *   T-03: Keydown handler `aria-activedescendant` güncellemesi yapmıyor —
 *         ekran okuyucu seçili öğeyi duyurmaz.
 *   T-04: renderBrowserAddressResults içinde öğelere id atanmıyor —
 *         aria-activedescendant kullanılamaz.
 *   T-05: Browser address combobox pattern'i eksik — listbox açıkken Tab tuşu
 *         ele alınmıyor.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const RENDERER = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf8');

console.log('  T-01: listbox seçenekleri etkileşimli button rolüyle çakışmıyor');
{
  const block = RENDERER.match(/function renderBrowserAddressResults[\s\S]{0,1800}?\n\s*\}/);
  assert.ok(block, 'renderBrowserAddressResults fonksiyonu bulunmalı');
  const re = /document\.createElement\('button'\)[\s\S]{0,500}?setAttribute\('role',\s*'option'\)/;
  const buttonRoleOption = re.test(block[0]);
  assert.ok(!buttonRoleOption, 'T-01: <button role="option"> rol çakışması geri geldi');
}

console.log('  T-02: Browser address keydown Home/End desteği var');
{
  // Handler içinde 'Home' veya 'End' string'i geçmiyor.
  const hasHomeEnd = /'Home'/.test(RENDERER) || /'End'/.test(RENDERER);
  // subtitle mode menu'de Home/End var; renderer içinde global olarak
  // 'Home' string'i geçiyor. Browser address handler'ı izole etmemiz
  // gerek. Bunun yerine daha kesin: handler bloğu içinde 'ArrowDown'
  // var, 'Home' yok.
  const block = RENDERER.match(/if\s*\(\$?\('browserAddress'\)\)\s*\$?\('browserAddress'\)\s*\.\s*addEventListener\('keydown'[\s\S]{0,2500}?\}\);/);
  assert.ok(block, 'Browser address keydown handler bulunmalı');
  const handler = block[0];
  const hasHomeEndInHandler = /'Home'/.test(handler) || /'End'/.test(handler);
  assert.ok(hasHomeEndInHandler, 'T-02: Home/End klavye gezinmesi eksik');
}

console.log('  T-03: aria-activedescendant seçili öneriyle güncelleniyor');
{
  // Browser address input'unda aria-activedescendant attribute yok
  // (HTML'de set edilmemiş) ve JS'de setAttribute ile de yazılmıyor.
  const updatesActiveDescendant = /aria-activedescendant/.test(RENDERER);
  assert.ok(updatesActiveDescendant, 'T-03: aria-activedescendant güncellemesi eksik');
}

console.log('  T-04: renderBrowserAddressResults seçeneklere kararlı id atıyor');
{
  const block = RENDERER.match(/function renderBrowserAddressResults[\s\S]{0,1500}?\n\s*\}/);
  assert.ok(block, 'renderBrowserAddressResults fonksiyonu bulunmalı');
  const hasIdAssignment = /\.id\s*=/.test(block[0]);
  assert.ok(hasIdAssignment, 'T-04: seçenek kimliği eksik');
}

console.log('  T-05: Tab açılır önerileri kapatıp doğal odağı koruyor');
{
  const block = RENDERER.match(/if\s*\(\$?\('browserAddress'\)\)\s*\$?\('browserAddress'\)\s*\.\s*addEventListener\('keydown'[\s\S]{0,2500}?\}\);/);
  assert.ok(block, 'Browser address keydown handler bulunmalı');
  const handler = block[0];
  const tabHandled = /event\.key\s*===\s*'Tab'/.test(handler);
  assert.ok(tabHandled, 'T-05: Tab sırasında öneri paneli kapatılmıyor');
}

console.log('\nTüm browser address listbox erişilebilirlik regresyonları geçti.');
