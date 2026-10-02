'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeText } = require('./subtitle-sentence-layout');

const PDF_TRANSLATION_STATE_VERSION = 1;
const PDF_HASH_CHUNK_BYTES = 1024 * 1024;
const DEFAULT_MARGIN_RATIO = 0.07;
const DEFAULT_SHORT_LINE_LENGTH = 120;
const SPACELESS_SCRIPT = /[ぁ-ヿ㐀-鿿豈-﫿]/u;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pageHeightFrom(options = {}) {
  return Math.max(0, finiteNumber(options.pageHeight ?? options.viewport?.height));
}

function pageWidthFrom(options = {}) {
  return Math.max(0, finiteNumber(options.pageWidth ?? options.viewport?.width));
}

function mapPdfItemsThroughViewport(items, options = {}) {
  if (!Array.isArray(items)) return [];
  const matrix = Array.isArray(options.viewportTransform) ? options.viewportTransform.slice(0, 6).map(Number) : [];
  const height = pageHeightFrom(options);
  if (matrix.length !== 6 || matrix.some((value) => !Number.isFinite(value)) || !height) {
    return items.map((item) => ({ ...item,
      transform: Array.isArray(item?.transform) ? item.transform.slice(0, 6) : [] }));
  }
  return items.map((item) => {
    const transform = Array.isArray(item?.transform) ? item.transform.slice(0, 6).map(Number) : [];
    if (transform.length !== 6 || transform.some((value) => !Number.isFinite(value))) {
      return { ...item, transform: [] };
    }
    const x = transform[4], y = transform[5];
    const viewportX = matrix[0] * x + matrix[2] * y + matrix[4];
    const viewportY = matrix[1] * x + matrix[3] * y + matrix[5];
    transform[4] = viewportX;
    // textItemsToLines kendi Kartezyen sözleşmesinde üst satırı büyük Y ile
    // sıralar; PDF.js viewport Y'si aşağı arttığı için ekseni geri çevir.
    transform[5] = height - viewportY;
    return { ...item, transform };
  });
}

function itemGeometry(item, index) {
  const transform = Array.isArray(item?.transform) ? item.transform : [];
  const transformHeight = Math.hypot(finiteNumber(transform[2]), finiteNumber(transform[3]));
  const height = Math.max(0.01, finiteNumber(item?.height, transformHeight || 1));
  return {
    index,
    raw: String(item?.str ?? ''),
    text: normalizeText(item?.str),
    x: finiteNumber(transform[4]),
    y: finiteNumber(transform[5]),
    width: Math.max(0, finiteNumber(item?.width)),
    height,
    hasEOL: item?.hasEOL === true,
    rtl: item?.dir === 'rtl',
  };
}

function shouldInsertItemSpace(previous, current) {
  if (/\s$/u.test(previous.raw) || /^\s/u.test(current.raw)) return true;
  if (/^[,.;:!?…。！？%)\]}»”’]/u.test(current.text)) return false;
  if (/[(\[{«“‘]$/u.test(previous.text)) return false;
  if (SPACELESS_SCRIPT.test(previous.text) && SPACELESS_SCRIPT.test(current.text)) return false;
  if (!previous.width) return true;
  const gap = current.x - (previous.x + previous.width);
  return gap > Math.max(previous.height, current.height) * 0.14;
}

function joinLineItems(items) {
  // Sağdan sola satırda (Arapça/İbranice) okuma sırası azalan X'tir. Öğeleri
  // aynalayıp soldan sağa mantığını aynen kullan; eskiden sözcükler ters
  // sırada birleştirilip modele "جميعا بكم مرحبا" gibi gidiyordu.
  const rtl = items.filter((item) => item.rtl).length * 2 > items.length;
  const ordered = rtl
    ? items.map((item) => ({ ...item, x: -(item.x + item.width) })).sort((a, b) => a.x - b.x || a.index - b.index)
    : items;
  let text = '';
  let previous = null;
  for (const item of ordered) {
    if (!item.text) continue;
    if (text && shouldInsertItemSpace(previous, item)) text += ' ';
    text += item.text;
    previous = item;
  }
  return normalizeText(text);
}

/** Convert pdf.js getTextContent().items into geometrically ordered lines. */
function textItemsToLines(items, options = {}) {
  if (!Array.isArray(items)) return [];
  const geometries = items.map(itemGeometry).filter((item) => item.text);
  if (!geometries.length) return [];
  geometries.sort((a, b) => b.y - a.y || a.x - b.x || a.index - b.index);

  const groups = [];
  for (const item of geometries) {
    // Geometries are already ordered by descending Y.  The last group is
    // therefore the only possible line match; scanning every previous line
    // made text extraction quadratic on dense/book-length PDFs.
    let line = groups.at(-1);
    if (line && Math.abs(line.y - item.y) >= Math.max(line.height, item.height) * 0.30) line = null;
    if (!line) {
      line = { y: item.y, height: item.height, items: [] };
      groups.push(line);
    }
    line.items.push(item);
    line.height = Math.max(line.height, item.height);
    line.y = line.items.reduce((sum, part) => sum + part.y, 0) / line.items.length;
  }

  const pageHeight = pageHeightFrom(options);
  const measuredLeft = Math.min(...geometries.map((item) => item.x));
  const measuredRight = Math.max(...geometries.map((item) => item.x + item.width));
  const pageWidth = pageWidthFrom(options) || Math.max(0, measuredRight - Math.min(0, measuredLeft));
  const lines = [];
  const gutters = [];
  for (const [groupIndex, line] of groups.entries()) {
    line.items.sort((a, b) => a.x - b.x || a.index - b.index);
    const fragments = [[]];
    for (const item of line.items) {
      const fragment = fragments.at(-1);
      const previous = fragment.at(-1);
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      const splitGap = Math.max(pageWidth * 0.06,
        Math.max(previous?.height || 0, item.height) * 3);
      if (previous && gap > splitGap) fragments.push([]);
      fragments.at(-1).push(item);
    }
    for (const [partIndex, fragment] of fragments.entries()) {
      const first = fragment[0];
      const last = fragment.at(-1);
      const rightEdge = Math.max(...fragment.map((item) => item.x + item.width));
      if (partIndex > 0) {
        const previous = fragments[partIndex - 1].at(-1);
        gutters.push({
          groupIndex,
          left: previous.x + previous.width,
          right: first.x,
          midpoint: (previous.x + previous.width + first.x) / 2,
        });
      }
      const text = joinLineItems(fragment);
      if (text) lines.push({
        text,
        x: first.x,
        y: line.y,
        width: Math.max(0, rightEdge - first.x),
        height: line.height,
        pageHeight,
        pageWidth,
        rowGroup: groupIndex,
        rowPart: partIndex,
      });
    }
  }

  // Aynı geniş yatay boşluğun birden çok satırda tekrarlanması sütun
  // sınırıdır. Tek bir satırdaki olağandışı boşluk satırı bölebilir ama bütün
  // sayfanın okuma sırasını tek başına değiştiremez.
  const tolerance = Math.max(8, pageWidth * 0.04);
  const clusters = [];
  for (const gutter of gutters) {
    let cluster = clusters.find((item) => Math.abs(item.midpoint - gutter.midpoint) <= tolerance);
    if (!cluster) {
      cluster = { midpoint: gutter.midpoint, values: [], groups: new Set() };
      clusters.push(cluster);
    }
    cluster.values.push(gutter.midpoint);
    cluster.groups.add(gutter.groupIndex);
    cluster.midpoint = cluster.values.reduce((sum, value) => sum + value, 0) / cluster.values.length;
  }
  const boundaries = clusters.filter((cluster) => cluster.groups.size >= 2)
    .map((cluster) => cluster.midpoint).sort((a, b) => a - b);
  if (!boundaries.length) return lines.sort((a, b) => b.y - a.y || a.x - b.x);

  for (const line of lines) {
    const right = line.x + line.width;
    const spanning = boundaries.some((boundary) => line.x < boundary && right > boundary);
    const center = line.x + line.width / 2;
    line.column = spanning ? -1 : boundaries.filter((boundary) => center > boundary).length;
  }
  markTableRegions(lines, pageWidth);
  const spanning = lines.filter((line) => line.column < 0).sort((a, b) => b.y - a.y || a.x - b.x);
  let remaining = lines.filter((line) => line.column >= 0);
  const ordered = [];
  const appendColumnOrder = (batch) => ordered.push(...batch.sort((a, b) =>
    a.column - b.column || b.y - a.y || a.x - b.x));
  for (const separator of spanning) {
    const above = remaining.filter((line) => line.y > separator.y);
    remaining = remaining.filter((line) => line.y <= separator.y);
    appendColumnOrder(above);
    ordered.push(separator);
  }
  appendColumnOrder(remaining);
  return ordered;
}

// Tablo bölgeleri: art arda ≥3 satırda aynı sütun hizasında ≥3 parça varsa ve
// en az bir hücre kendi bandını doldurmuyorsa (tıraşlı sağ kenar) bölge
// tablodur. Hücreler `tableCell` olarak işaretlenip spanning (-1) sütununa
// alınır — spanning döngüsü y-major (satır satır) sıraladığı için tablo
// doğru okuma sırasında, üstteki/alttaki sütun içeriğinden ayrı kalır.
// İki sütunlu gövde metni bu denetimden geçmez (≥3 parça şartı).
function markTableRegions(lines, pageWidth) {
  const byGroup = new Map();
  for (const line of lines) {
    if (!Number.isInteger(line.rowGroup)) continue;
    if (!byGroup.has(line.rowGroup)) byGroup.set(line.rowGroup, []);
    byGroup.get(line.rowGroup).push(line);
  }
  const rows = [...byGroup.entries()]
    .map(([groupIndex, groupLines]) => ({
      groupIndex,
      parts: groupLines.sort((a, b) => a.rowPart - b.rowPart)
        .map((line) => ({ x: line.x, right: line.x + line.width, lines: [line] })),
    }))
    .filter((row) => row.parts.length >= 3);
  if (rows.length < 3) return;
  const xTolerance = Math.max(6, pageWidth * 0.02);
  const aligned = (prev, next) => prev.parts.length === next.parts.length
    && prev.parts.every((part, index) => Math.abs(part.x - next.parts[index].x) <= xTolerance);
  // Ardışık hizalı satır dizileri bul.
  const regions = [];
  const rowOrder = rows.map((row) => row.groupIndex).sort((a, b) => a - b);
  const rowByIndex = new Map(rows.map((row) => [row.groupIndex, row]));
  let prevIndex = null;
  let run = [];
  for (const index of rowOrder) {
    const row = rowByIndex.get(index);
    const prev = prevIndex == null ? null : rowByIndex.get(prevIndex);
    const consecutive = prev && index === prevIndex + 1 && aligned(prev, row);
    if (!consecutive) {
      if (run.length >= 3) regions.push(run);
      run = [row];
    } else run.push(row);
    prevIndex = index;
  }
  if (run.length >= 3) regions.push(run);
  for (const region of regions) {
    // Gövde sütunu metni bandı doldurur; tablo hücreleri bandı doldurmayabilir —
    // en az bir hücrenin sağ kenarı bandının %40'ından darsa bölge tablodur.
    let ragged = false;
    for (const row of region) {
      for (let index = 0; index < row.parts.length; index++) {
        const part = row.parts[index];
        const bandEnd = index + 1 < row.parts.length ? row.parts[index + 1].x : Infinity;
        const bandStart = index ? row.parts[index - 1].right : -Infinity;
        const bandWidth = Math.min(bandEnd, Number.isFinite(bandEnd) ? bandEnd : part.right)
          - Math.max(bandStart, Number.isFinite(bandStart) ? bandStart : part.x);
        if (Number.isFinite(bandWidth) && bandWidth > 0
            && part.right - part.x < bandWidth * 0.6) { ragged = true; break; }
      }
      if (ragged) break;
    }
    if (!ragged) continue;
    for (const row of region) {
      for (const part of row.parts) {
        for (const line of part.lines) {
          line.tableCell = true;
          line.column = -1;
        }
      }
    }
  }
}

function median(values) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function paragraphFrom(lines, pageNumber, index) {
  const text = normalizeText(lines.reduce((joined, line) => joined
    + (joined && !line.joinWithoutSpace ? ' ' : '') + line.text, ''));
  const digest = createHash('sha256').update(text).digest('hex').slice(0, 12);
  const top = Math.max(...lines.map((line) => line.y));
  const bottom = Math.min(...lines.map((line) => line.y - line.height));
  const left = Math.min(...lines.map((line) => line.x));
  const right = Math.max(...lines.map((line) => line.x + line.width));
  const kinds = new Set(lines.map((line) => line.kind || 'body'));
  const paragraph = {
    id: `${pageNumber}:${index}:${digest}`,
    text,
    lineCount: lines.length,
    kind: kinds.size === 1 ? [...kinds][0] : 'body',
    box: { left, top, right, bottom },
  };
  // Madde 37 — belirsiz tablo sırası: column=-1 işaretli hücreler "ragged"
  // bölgelerden gelir (sütun sınırları güvenle atanamadı); okuma sırası
  // yalnızca y/x sezgisine dayanır. Kullanıcı bu blokta sırayı doğrulamalı.
  if (paragraph.kind === 'table' && lines.some((line) => line.column === -1)) {
    paragraph.orderAmbiguous = true;
  }
  return paragraph;
}

/** Merge ordered PDF lines into translation-sized paragraphs. */
function mergePdfLines(rawLines, options = {}) {
  if (!Array.isArray(rawLines)) return [];
  const lines = rawLines
    .map((line, readingOrder) => ({
      ...line,
      readingOrder,
      text: normalizeText(line?.text),
      x: finiteNumber(line?.x),
      y: finiteNumber(line?.y, Number.NaN),
      width: Math.max(0, finiteNumber(line?.width)),
      height: Math.max(0.01, finiteNumber(line?.height, 1)),
    }))
    .filter((line) => line.text && Number.isFinite(line.y))
    .sort((a, b) => {
      if (Number.isInteger(a.column) && Number.isInteger(b.column)) {
        return a.readingOrder - b.readingOrder;
      }
      return b.y - a.y || a.x - b.x;
    });
  if (!lines.length) return [];

  const gaps = [];
  for (let index = 1; index < lines.length; index++) {
    const gap = Number(lines[index - 1].y) - Number(lines[index].y);
    if (gap > 0) gaps.push(gap);
  }
  const fallbackGap = median(lines.map((line) => Math.max(0.01, finiteNumber(line.height, 1))));
  const normalGap = median(gaps) || fallbackGap;
  const paragraphGap = Math.max(normalGap * 1.6,
    finiteNumber(options.minimumParagraphGap, 0));
  const pageNumber = Math.max(1, Math.trunc(finiteNumber(options.pageNumber, 1)));
  // Madde 36 — satır türleri: belirgin büyük yazı başlık, alt kenardaki
  // küçük yazı dipnot; ikisi de gövde paragrafıyla birleşmez (başlık metni
  // dipnota, dipnot metni gövdeye karışmadan ayrı bloklar üretilir).
  const medianHeight = Math.max(0.01, fallbackGap);
  const pageHeight = Math.max(0, ...lines.map((line) => finiteNumber(line.pageHeight)))
    || pageHeightFrom(options);
  for (const line of lines) {
    if (line.tableCell) { line.kind = 'table'; continue; }
    if (pageHeight && line.y <= pageHeight * 0.14 && line.height <= medianHeight * 0.78
        && !isStandalonePageNumber(line.text)) { line.kind = 'footnote'; continue; }
    if (line.height >= medianHeight * 1.45 && line.text.length <= 200) {
      line.kind = 'heading';
      continue;
    }
    line.kind = line.kind || 'body';
  }

  const paragraphs = [];
  let current = [{ ...lines[0] }];
  for (let index = 1; index < lines.length; index++) {
    const previous = current.at(-1);
    const next = { ...lines[index] };
    const hyphenated = /[-\u00ad\u2010]\s*$/u.test(previous.text);
    const gap = Number(previous.y) - Number(next.y);
    const columnChanged = Number.isInteger(previous.column) && Number.isInteger(next.column)
      && previous.column !== next.column;
    const splitRow = previous.rowGroup === next.rowGroup && previous.rowPart !== next.rowPart;
    const kindChanged = (previous.kind || 'body') !== (next.kind || 'body');
    // Tablo hücreleri atomiktir: aynı satırın hücreleri bile birleşmez.
    const tableBoundary = previous.kind === 'table' || next.kind === 'table';
    const startsNewParagraph = !hyphenated && (columnChanged || splitRow || kindChanged
      || tableBoundary || gap > paragraphGap || gap < -fallbackGap * 2);
    if (startsNewParagraph) {
      paragraphs.push(paragraphFrom(current, pageNumber, paragraphs.length));
      current = [next];
      continue;
    }
    if (hyphenated) {
      previous.text = previous.text.replace(/[-\u00ad\u2010]\s*$/u, '');
      next.text = next.text.replace(/^\s+/u, '');
      next.joinWithoutSpace = true;
      current.push(next);
    } else {
      current.push(next);
    }
  }
  paragraphs.push(paragraphFrom(current, pageNumber, paragraphs.length));
  return paragraphs;
}

function mergePdfTextItems(items, options = {}) {
  return mergePdfLines(textItemsToLines(items, options), options);
}

function marginalRegion(line, pageHeight, marginRatio) {
  if (!pageHeight) return null;
  if (Number(line.y) >= pageHeight * (1 - marginRatio)) return 'top';
  if (Number(line.y) <= pageHeight * marginRatio) return 'bottom';
  return null;
}

function marginalSignature(text) {
  return normalizeText(text).toLowerCase();
}

function isStandalonePageNumber(text) {
  const stripped = normalizeText(text).replace(/^[-–—]\s*|\s*[-–—]$/gu, '');
  return /^(?:(?:sayfa|page|s\.?)\s*)?(?:\d{1,5}|[ivxlcdm]{1,12})(?:\s*(?:\/|of)\s*\d{1,5})?$/iu.test(stripped);
}

/** Remove repeated short headers/footers and standalone page numbers. */
function filterRepeatedMarginalLines(rawPages, options = {}) {
  if (!Array.isArray(rawPages)) return [];
  const marginRatio = Math.min(0.25, Math.max(0, finiteNumber(options.marginRatio, DEFAULT_MARGIN_RATIO)));
  const maxLength = Math.max(1, Math.trunc(finiteNumber(options.maxShortLineLength,
    DEFAULT_SHORT_LINE_LENGTH)));
  const pages = rawPages.map((page, index) => {
    const pageNumber = Math.max(1, Math.trunc(finiteNumber(page?.pageNumber, index + 1)));
    const pageHeight = pageHeightFrom(page);
    return {
      ...page,
      pageNumber,
      pageHeight,
      pageWidth: pageWidthFrom(page),
      lines: Array.isArray(page?.lines) ? page.lines
        : textItemsToLines(page?.items, {
          pageHeight, pageWidth: pageWidthFrom(page), pageNumber,
        }),
    };
  });

  const occurrences = new Map();
  for (const page of pages) {
    const seenOnPage = new Set();
    for (const line of page.lines) {
      const text = normalizeText(line?.text);
      const region = marginalRegion(line, page.pageHeight, marginRatio);
      if (!region || !text || text.length > maxLength || isStandalonePageNumber(text)) continue;
      const key = `${region}:${marginalSignature(text)}`;
      if (!seenOnPage.has(key)) occurrences.set(key, (occurrences.get(key) || 0) + 1);
      seenOnPage.add(key);
    }
  }

  const minimumPages = Math.max(2, Math.trunc(finiteNumber(options.minimumRepeatPages,
    Math.ceil(pages.length / 2))));
  const repeated = new Set([...occurrences]
    .filter(([, count]) => count >= minimumPages)
    .map(([key]) => key));

  return pages.map((page) => ({
    ...page,
    lines: page.lines.filter((line) => {
      const text = normalizeText(line?.text);
      const region = marginalRegion(line, page.pageHeight, marginRatio);
      if (!region) return true;
      if (isStandalonePageNumber(text)) return false;
      return !repeated.has(`${region}:${marginalSignature(text)}`);
    }),
  }));
}

function buildPdfParagraphPages(rawPages, options = {}) {
  const pages = filterRepeatedMarginalLines(rawPages, options);
  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    paragraphs: mergePdfLines(page.lines, { ...options, pageNumber: page.pageNumber }),
  }));
}

/** Madde 36 — farklı düzenlerde metin sırasının ve sayfa ilişkilerinin
 *  korunmasını ölçer: sayfa başına paragraf sayısı, tür dağılımı (body/
 *  heading/footnote/table) ve kimliklerin okuma sırası. Testler bu özeti
 *  beklenen sırayla karşılaştırır; ayrıca onarım/rapor araçları da
 *  kullanabilir. */
function readingOrderMetrics(rawPages, options = {}) {
  const pages = buildPdfParagraphPages(rawPages, options);
  const perPage = pages.map((page) => {
    const kinds = { body: 0, heading: 0, footnote: 0, table: 0 };
    for (const paragraph of page.paragraphs) {
      const kind = paragraph.kind || 'body';
      kinds[kind] = (kinds[kind] || 0) + 1;
    }
    return {
      pageNumber: page.pageNumber,
      paragraphCount: page.paragraphs.length,
      kinds,
      order: page.paragraphs.map((paragraph) => paragraph.text.slice(0, 60)),
    };
  });
  return {
    pageCount: perPage.length,
    paragraphCount: perPage.reduce((sum, page) => sum + page.paragraphCount, 0),
    pages: perPage,
  };
}

function normalizedIdentity(identity = {}) {
  return {
    pdfHash: String(identity.pdfHash ?? '').trim(),
    targetLanguage: String(identity.targetLanguage ?? '').trim(),
    model: String(identity.model ?? '').trim(),
    // Aynı model adıyla farklı sağlayıcı kullanılırsa önbellek karışmasın.
    endpoint: String(identity.endpoint ?? '').trim(),
  };
}

// Madde 38 — durum zaten normalize edilmişse recordPdfPageTranslation'ın
// her sayfada tüm blokları yeniden normalize etmesi O(n²) maliyet üretiyordu.
// JSON.stringify ve spread kopyasına taşınmayan non-enumerable işaret ile
// "bu nesne normalize" kanıtlanır; işaretsiz durumlar eskisi gibi tam
// normalize edilir (güvenli yedek yol).
const PDF_STATE_NORMALIZED = Symbol('pdfStateNormalized');
function markPdfStateNormalized(state) {
  try { Object.defineProperty(state, PDF_STATE_NORMALIZED, { value: true, enumerable: false, configurable: true }); } catch (_) {}
}

function createPdfTranslationState(identity) {
  const normalized = normalizedIdentity(identity);
  if (!normalized.pdfHash) throw new TypeError('PDF kimliği boş olamaz.');
  const state = { version: PDF_TRANSLATION_STATE_VERSION, ...normalized, pages: {} };
  markPdfStateNormalized(state);
  return state;
}

function normalizePdfBlock(block, index) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
  const source = normalizeText(block.source ?? block.text);
  if (!source || source.length > 12000) return null;
  const translation = typeof block.translation === 'string'
    ? normalizeText(block.translation).slice(0, 24000) : '';
  const requestedStatus = String(block.status ?? '').toLowerCase();
  const status = translation ? 'translated'
    : (requestedStatus === 'failed' ? 'failed' : requestedStatus === 'skipped' ? 'skipped' : 'pending');
  const normalized = {
    id: String(block.id ?? index).slice(0, 200),
    source,
    translation,
    status,
  };
  if (['heading', 'footnote', 'table'].includes(block.kind)) normalized.kind = block.kind;
  if (block.orderAmbiguous === true) normalized.orderAmbiguous = true;
  // Madde 36 — karşılık vurgusu için sayfa koordinatları (x/y sayfa
  // yüksekliğiyle bölünerek çift görünümde konum çizgisine dönüşür).
  const box = block.box;
  if (box && [box.top, box.bottom, box.left, box.right].every(Number.isFinite)) {
    normalized.box = {
      top: Number(box.top), bottom: Number(box.bottom),
      left: Number(box.left), right: Number(box.right),
    };
  }
  // Madde 37 — kullanıcı düzeltmesi: hedef metne elle yazılan userText
  // çevirinin üstünde gösterilir ve yeniden işlemelerde korunur.
  const userText = typeof block.userText === 'string' ? normalizeText(block.userText).slice(0, 24000) : '';
  if (userText) { normalized.userText = userText; normalized.edited = true; }
  if (status === 'failed' && block.error != null) normalized.error = normalizeText(block.error).slice(0, 1000);
  return normalized;
}

/** Persisted dosya normalize'dan veri taşıyabilir mi? Kimlik/sürüm/sayfa
 *  kalıbını tek yerde tanımlar — okuma döngüsü uyumsuz adayı atlayıp
 *  .bak/legacy'ye düşebilsin diye. */
function isPdfTranslationStateCompatible(raw, identity) {
  const fresh = createPdfTranslationState(identity);
  return Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw)
    && raw.version === PDF_TRANSLATION_STATE_VERSION
    && String(raw.pdfHash ?? '').trim() === fresh.pdfHash
    && String(raw.targetLanguage ?? '').trim() === fresh.targetLanguage
    && String(raw.model ?? '').trim() === fresh.model
    && String(raw.endpoint ?? '').trim() === fresh.endpoint
    && Boolean(raw.pages) && typeof raw.pages === 'object' && !Array.isArray(raw.pages);
}

/** Validate persisted state; identity/version drift deliberately starts fresh. */
function normalizePdfTranslationState(raw, identity) {
  const fresh = createPdfTranslationState(identity);
  if (!isPdfTranslationStateCompatible(raw, identity)) return fresh;

  for (const [pageKey, blocks] of Object.entries(raw.pages)) {
    if (!/^[1-9]\d*$/u.test(pageKey) || !Array.isArray(blocks)) continue;
    const normalizedBlocks = blocks.map(normalizePdfBlock).filter(Boolean);
    if (!blocks.length || normalizedBlocks.length) fresh.pages[String(Number(pageKey))] = normalizedBlocks;
  }
  markPdfStateNormalized(fresh);
  return fresh;
}

/** State dosya adı: sağlayıcı kimliğini de kapsar — sağlayıcı değişimi
 *  ayrı durum dosyası üretir; öncekinin sayfa çevirileri korunur. */
function pdfTranslationStateFileStem(pdfHash, endpoint) {
  return createHash('sha256')
    .update(`${String(pdfHash || '')}|${String(endpoint || '')}`, 'utf8').digest('hex');
}

/** Endpoint alanı eklenmeden önceki dosya adı — geriye dönük okuma yolu. */
function pdfTranslationStateLegacyFileStem(pdfHash) {
  return createHash('sha256').update(String(pdfHash || ''), 'utf8').digest('hex');
}

/** `directory` altındaki durum dosyalarından ilk uyumlu olanı döndürür.
 *  Aday sırası: birincil → .bak → legacy → legacy.bak; kimliği/sürümü
 *  uyuşmayan ya da bozuk adaylar atlanır (bozuk birincil sağlam yedeği
 *  gizleyemez). Uyumlu dosya yoksa taze durum döner. */
function loadPdfTranslationState(directory, identity) {
  const normalized = normalizedIdentity(identity);
  const primary = path.join(directory, `${pdfTranslationStateFileStem(normalized.pdfHash, normalized.endpoint)}.json`);
  // Endpoint alanı eklenmeden önce yazılmış dosyalar pdfHash-only anahtardaydı.
  const legacy = path.join(directory, `${pdfTranslationStateLegacyFileStem(normalized.pdfHash)}.json`);
  for (const candidate of [primary, `${primary}.bak`, legacy, `${legacy}.bak`]) {
    try {
      if (!fs.existsSync(candidate) || fs.statSync(candidate).size > 64 * 1024 * 1024) continue;
      const raw = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (!isPdfTranslationStateCompatible(raw, normalized)) continue;
      // Bozuk sayfa kayıtları (geçersiz anahtar, dizi olmayan değer,
      // normalize'da null dönen blok) dosyayı tek başına gömmez: sağlam
      // kayıtlar kurtarılır. Tümüyle bozuk dosya ise sağlam .bak/legacy
      // yedeğini gizleyemez — aday atlanır. Boş sayfa kaydı ({n: []})
      // meşrudur: temizlenen sayfanın eski çevirilerini yedekten diriltmez.
      const entries = Object.entries(raw.pages);
      const validEntries = entries.filter(([key, blocks]) =>
        /^[1-9]\d*$/u.test(key) && Array.isArray(blocks)
        && !blocks.some((block) => !normalizePdfBlock(block)));
      if (entries.length && !validEntries.length) continue;
      if (validEntries.length !== entries.length) {
        raw.pages = Object.fromEntries(validEntries);
      }
      return normalizePdfTranslationState(raw, normalized);
    } catch (_) {}
  }
  return createPdfTranslationState(normalized);
}

function isPdfPageComplete(blocks) {
  return Array.isArray(blocks) && blocks.every((block) => block.status === 'translated' || block.status === 'skipped');
}

function translatedPdfPages(state) {
  if (!state?.pages || typeof state.pages !== 'object') return [];
  return Object.keys(state.pages)
    .filter((key) => /^[1-9]\d*$/u.test(key) && isPdfPageComplete(state.pages[key]))
    .map(Number).sort((a, b) => a - b);
}

function pendingPdfPages(requestedPages, state) {
  const complete = new Set(translatedPdfPages(state));
  return [...new Set((Array.isArray(requestedPages) ? requestedPages : [])
    .map(Number).filter((page) => Number.isSafeInteger(page) && page > 0))]
    .filter((page) => !complete.has(page));
}

function recordPdfPageTranslation(state, pageNumber, blocks) {
  const page = Number(pageNumber);
  if (!Number.isSafeInteger(page) || page < 1 || !Array.isArray(blocks)) {
    throw new TypeError('PDF sayfa sonucu geçersiz.');
  }
  const normalized = state?.[PDF_STATE_NORMALIZED] === true
    ? { ...state, pages: { ...state.pages } }
    : normalizePdfTranslationState(state, {
      pdfHash: state.pdfHash,
      targetLanguage: state.targetLanguage,
      model: state.model,
      endpoint: state.endpoint,
    });
  const normalizedBlocks = blocks.map(normalizePdfBlock).filter(Boolean);
  if (blocks.length && !normalizedBlocks.length) throw new TypeError('PDF çeviri bloğu geçersiz.');
  // Madde 37 — yeniden işlemede kullanıcı düzeltmeleri korunur: aynı blok
  // kimliğindeki eski userText yeni sonuca taşınır.
  const previous = Array.isArray(normalized.pages?.[String(page)]) ? normalized.pages[String(page)] : [];
  const previousEdits = new Map(previous.filter((block) => block?.userText).map((block) => [block.id, block.userText]));
  if (previousEdits.size) {
    for (const block of normalizedBlocks) {
      const kept = previousEdits.get(block.id);
      if (kept && !block.userText) { block.userText = kept; block.edited = true; }
    }
  }
  normalized.pages[String(page)] = normalizedBlocks;
  markPdfStateNormalized(normalized);
  return normalized;
}

/** Madde 37 — tek blok hedef metnine kullanıcı düzeltmesi yazar (boş
 *  metin düzeltmeyi kaldırır). Değişen blok döner; eşleşme yoksa null. */
function applyPdfBlockEdit(state, pageNumber, blockId, userText) {
  const page = Number(pageNumber);
  const blocks = Array.isArray(state?.pages?.[String(page)]) ? state.pages[String(page)] : null;
  if (!blocks) return null;
  const index = blocks.findIndex((block) => block?.id === String(blockId ?? ''));
  if (index < 0) return null;
  const text = typeof userText === 'string' ? normalizeText(userText).slice(0, 24000) : '';
  const next = { ...blocks[index] };
  if (text) { next.userText = text; next.edited = true; }
  else { delete next.userText; delete next.edited; }
  blocks[index] = next;
  return next;
}

/** Madde 38 — sayfa aralığı ayrıştırıcı: "1-4, 8, 12-15" → [1,2,3,4,8,12,13,14,15].
 *  Geçersiz girdi null döner; boş girdi "tümü" anlamına boş dizi döner. */
function parsePdfPageSelection(input, numPages) {
  const limit = Math.max(0, Math.trunc(Number(numPages) || 0));
  const text = String(input ?? '').trim();
  if (!text) return { pages: [], scope: 'all' };
  const pages = new Set();
  for (const part of text.split(',')) {
    const piece = part.trim();
    const match = /^(\d{1,7})(?:\s*-\s*(\d{1,7}))?$/.exec(piece);
    if (!match) return null;
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (start < 1 || end < start || (limit && end > limit)) return null;
    for (let page = start; page <= end; page += 1) {
      if (!limit || page <= limit) pages.add(page);
    }
  }
  const list = [...pages].sort((a, b) => a - b);
  return { pages: list, scope: 'range' };
}

function pdfHashPlan(fileSize, maxChunkBytes = PDF_HASH_CHUNK_BYTES) {
  const size = Number(fileSize);
  const limit = Number(maxChunkBytes);
  if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError('PDF karma planı için dosya boyutu geçersiz.');
  }
  const head = Math.min(size, limit);
  // Yalnız ilk parça aynı başlığı/şablonu paylaşan PDF'leri çakıştırıyordu;
  // son parça da karışıma katılır (kuyruk kimliği ayırt eder).
  const tail = size > head ? Math.min(size - head, Math.min(limit, 256 * 1024)) : 0;
  return { fileSize: size, offset: 0, length: head,
    tailOffset: tail ? size - tail : size, tailLength: tail, algorithm: 'sha256' };
}

function pdfHashFromFirstChunk(fileSize, firstChunk, lastChunk = null) {
  const plan = pdfHashPlan(fileSize);
  if (!Buffer.isBuffer(firstChunk) && !(firstChunk instanceof Uint8Array)) {
    throw new TypeError('PDF karma verisi bayt dizisi olmalı.');
  }
  if (firstChunk.byteLength < plan.length) throw new TypeError('PDF karma verisi eksik.');
  const bytes = Buffer.from(firstChunk.buffer, firstChunk.byteOffset, Math.min(firstChunk.byteLength, plan.length));
  const hash = createHash('sha256').update(bytes);
  if (lastChunk && plan.tailLength) {
    const tailBytes = Buffer.from(
      Buffer.isBuffer(lastChunk) ? lastChunk : lastChunk.buffer,
      Buffer.isBuffer(lastChunk) ? 0 : lastChunk.byteOffset,
      Math.min(lastChunk.byteLength, plan.tailLength));
    hash.update(tailBytes);
  }
  return `${plan.fileSize}:${hash.digest('hex')}`;
}

module.exports = {
  PDF_TRANSLATION_STATE_VERSION,
  PDF_HASH_CHUNK_BYTES,
  mapPdfItemsThroughViewport,
  textItemsToLines,
  mergePdfLines,
  mergePdfTextItems,
  filterRepeatedMarginalLines,
  buildPdfParagraphPages,
  readingOrderMetrics,
  isStandalonePageNumber,
  createPdfTranslationState,
  normalizePdfTranslationState,
  isPdfPageComplete,
  translatedPdfPages,
  pendingPdfPages,
  recordPdfPageTranslation,
  applyPdfBlockEdit,
  parsePdfPageSelection,
  pdfHashPlan,
  pdfHashFromFirstChunk,
  isPdfTranslationStateCompatible,
  loadPdfTranslationState,
  pdfTranslationStateFileStem,
  pdfTranslationStateLegacyFileStem,
};
