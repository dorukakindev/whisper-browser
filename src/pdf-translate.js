'use strict';

const { createHash } = require('node:crypto');
const { normalizeText, sentenceEnded } = require('./subtitle-sentence-layout');

const PDF_TRANSLATION_STATE_VERSION = 1;
const PDF_HASH_CHUNK_BYTES = 1024 * 1024;
const DEFAULT_MARGIN_RATIO = 0.07;
const DEFAULT_SHORT_LINE_LENGTH = 120;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pageHeightFrom(options = {}) {
  return Math.max(0, finiteNumber(options.pageHeight ?? options.viewport?.height));
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
  };
}

function shouldInsertItemSpace(previous, current) {
  if (/\s$/u.test(previous.raw) || /^\s/u.test(current.raw)) return true;
  if (/^[,.;:!?…。！？%)\]}»”’]/u.test(current.text)) return false;
  if (/[(\[{«“‘]$/u.test(previous.text)) return false;
  if (!previous.width) return true;
  const gap = current.x - (previous.x + previous.width);
  return gap > Math.max(previous.height, current.height) * 0.14;
}

function joinLineItems(items) {
  let text = '';
  let previous = null;
  for (const item of items) {
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
  return groups
    .map((line) => {
      line.items.sort((a, b) => a.x - b.x || a.index - b.index);
      const first = line.items[0];
      const last = line.items.at(-1);
      return {
        text: joinLineItems(line.items),
        x: first.x,
        y: line.y,
        width: Math.max(0, last.x + last.width - first.x),
        height: line.height,
        pageHeight,
      };
    })
    .filter((line) => line.text)
    .sort((a, b) => b.y - a.y || a.x - b.x);
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
  return {
    id: `${pageNumber}:${index}:${digest}`,
    text,
    lineCount: lines.length,
    box: { left, top, right, bottom },
  };
}

/** Merge ordered PDF lines into translation-sized paragraphs. */
function mergePdfLines(rawLines, options = {}) {
  if (!Array.isArray(rawLines)) return [];
  const lines = rawLines
    .map((line) => ({
      ...line,
      text: normalizeText(line?.text),
      x: finiteNumber(line?.x),
      y: finiteNumber(line?.y, Number.NaN),
      width: Math.max(0, finiteNumber(line?.width)),
      height: Math.max(0.01, finiteNumber(line?.height, 1)),
    }))
    .filter((line) => line.text && Number.isFinite(line.y))
    .sort((a, b) => b.y - a.y || a.x - b.x);
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

  const paragraphs = [];
  let current = [{ ...lines[0] }];
  for (let index = 1; index < lines.length; index++) {
    const previous = current.at(-1);
    const next = { ...lines[index] };
    const hyphenated = /[-\u00ad\u2010]\s*$/u.test(previous.text);
    const gap = Number(previous.y) - Number(next.y);
    const startsNewParagraph = !hyphenated
      && (gap > paragraphGap || sentenceEnded(previous.text));
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
      lines: Array.isArray(page?.lines) ? page.lines
        : textItemsToLines(page?.items, { pageHeight, pageNumber }),
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

function normalizedIdentity(identity = {}) {
  return {
    pdfHash: String(identity.pdfHash ?? '').trim(),
    targetLanguage: String(identity.targetLanguage ?? '').trim(),
    model: String(identity.model ?? '').trim(),
  };
}

function createPdfTranslationState(identity) {
  const normalized = normalizedIdentity(identity);
  if (!normalized.pdfHash) throw new TypeError('PDF kimliği boş olamaz.');
  return { version: PDF_TRANSLATION_STATE_VERSION, ...normalized, pages: {} };
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
  if (status === 'failed' && block.error != null) normalized.error = normalizeText(block.error).slice(0, 1000);
  return normalized;
}

/** Validate persisted state; identity/version drift deliberately starts fresh. */
function normalizePdfTranslationState(raw, identity) {
  const fresh = createPdfTranslationState(identity);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || raw.version !== PDF_TRANSLATION_STATE_VERSION
    || String(raw.pdfHash ?? '').trim() !== fresh.pdfHash
    || String(raw.targetLanguage ?? '').trim() !== fresh.targetLanguage
    || String(raw.model ?? '').trim() !== fresh.model
    || !raw.pages || typeof raw.pages !== 'object' || Array.isArray(raw.pages)) return fresh;

  for (const [pageKey, blocks] of Object.entries(raw.pages)) {
    if (!/^[1-9]\d*$/u.test(pageKey) || !Array.isArray(blocks)) continue;
    const normalizedBlocks = blocks.map(normalizePdfBlock).filter(Boolean);
    if (normalizedBlocks.length === blocks.length) fresh.pages[String(Number(pageKey))] = normalizedBlocks;
  }
  return fresh;
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
  const normalized = normalizePdfTranslationState(state, {
    pdfHash: state.pdfHash,
    targetLanguage: state.targetLanguage,
    model: state.model,
  });
  const normalizedBlocks = blocks.map(normalizePdfBlock).filter(Boolean);
  if (normalizedBlocks.length !== blocks.length) throw new TypeError('PDF çeviri bloğu geçersiz.');
  normalized.pages[String(page)] = normalizedBlocks;
  return normalized;
}

function pdfHashPlan(fileSize, maxChunkBytes = PDF_HASH_CHUNK_BYTES) {
  const size = Number(fileSize);
  const limit = Number(maxChunkBytes);
  if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError('PDF karma planı için dosya boyutu geçersiz.');
  }
  return { fileSize: size, offset: 0, length: Math.min(size, limit), algorithm: 'sha256' };
}

function pdfHashFromFirstChunk(fileSize, firstChunk) {
  const plan = pdfHashPlan(fileSize);
  if (!Buffer.isBuffer(firstChunk) && !(firstChunk instanceof Uint8Array)) {
    throw new TypeError('PDF karma verisi bayt dizisi olmalı.');
  }
  if (firstChunk.byteLength < plan.length) throw new TypeError('PDF karma verisi eksik.');
  const bytes = Buffer.from(firstChunk.buffer, firstChunk.byteOffset, Math.min(firstChunk.byteLength, plan.length));
  return `${plan.fileSize}:${createHash('sha256').update(bytes).digest('hex')}`;
}

module.exports = {
  PDF_TRANSLATION_STATE_VERSION,
  PDF_HASH_CHUNK_BYTES,
  textItemsToLines,
  mergePdfLines,
  mergePdfTextItems,
  filterRepeatedMarginalLines,
  buildPdfParagraphPages,
  isStandalonePageNumber,
  createPdfTranslationState,
  normalizePdfTranslationState,
  isPdfPageComplete,
  translatedPdfPages,
  pendingPdfPages,
  recordPdfPageTranslation,
  pdfHashPlan,
  pdfHashFromFirstChunk,
};
