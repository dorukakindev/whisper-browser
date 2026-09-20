/**
 * C22 — axe-core erişilebilirlik regresyon kapısı.
 *
 * src/renderer/index.html'i jsdom'a yükler (script çalıştırmadan) ve axe-core
 * taraması yapar. Amaç mevcut ARIA/klavye sözleşmesini regresyona karşı
 * korumak; gerçek odak akışı bu testin kapsamı dışında kalır ve ayrıca
 * elle doğrulanır.
 *
 * Sözleşme:
 *  - Bilinen tek istisna `region` (içerik landmark'ları) borcudur; düğüm sayısı
 *    ilk tarama tabanından (REGION_BASELINE) fazla büyüyemez.
 *  - Bunun dışında HİÇBİR axe ihlali kabul edilmez — yeni ihlal ekleyen
 *    değişiklik bu testi kırmalıdır.
 *  - jsdom'un hesaplayamadığı kurallar (renk kontrastı gibi) kapalıdır.
 */
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const INDEX = path.join(__dirname, '..', 'src', 'renderer', 'index.html');

// Mevcut borç: landmark dışında kalan içerik düğümleri. Yeni ihlal eklenemez.
const ALLOWED_RULES = new Set(['region']);
const REGION_BASELINE = 35;

// jsdom gerçek boyama yapmadığı için bu kurallar anlamlı sonuç üretmez.
const DISABLED_RULES = ['color-contrast', 'color-contrast-enhanced'];

async function main() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  try {
    dom.window.eval(require('axe-core').source);
    const results = await dom.window.axe.run(dom.window.document, {
      resultTypes: ['violations'],
      rules: Object.fromEntries(DISABLED_RULES.map((id) => [id, { enabled: false }])),
    });
    const unexpected = [];
    for (const v of results.violations) {
      if (!ALLOWED_RULES.has(v.id)) {
        unexpected.push(`${v.id} (${v.impact}, ${v.nodes.length} düğüm): ${v.nodes[0]?.target?.join(' ') || '?'}`);
      }
    }
    const region = results.violations.find((v) => v.id === 'region');
    const regionCount = region ? region.nodes.length : 0;
    assert.strictEqual(unexpected.length, 0,
      `axe ihlalleri:\n${unexpected.join('\n')}`);
    assert.ok(regionCount <= REGION_BASELINE,
      `region ihlalleri büyüdü: ${regionCount} > ${REGION_BASELINE}`);
    console.log(`accessibility: ${unexpected.length} yeni ihlal kuralı, ` +
      `region borcu ${regionCount}/${REGION_BASELINE} düğüm — OK`);
  } finally {
    dom.window.close();
  }
}

main().catch((error) => {
  console.error('accessibility testi başarısız:', error.message);
  process.exit(1);
});
