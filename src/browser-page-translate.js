'use strict';

const crypto = require('crypto');
const { normalizeText } = require('./subtitle-sentence-layout');

const MAX_PAGE_BLOCKS = 1500;
const MAX_PAGE_BLOCK_TEXT = 2000;
const MAX_PAGE_CHARACTERS = 400000;
const MAX_PAGE_BATCH_BLOCKS = 20;
const PAGE_CACHE_VERSION = 1;
const MEANINGFUL_CJK = /[ぁ-ヿ㐀-鿿豈-﫿]/u;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeJsonForScript(value) {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function normalizeOnePageBlock(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id ?? '').trim().slice(0, 240);
  const text = normalizeText(raw.text).slice(0, MAX_PAGE_BLOCK_TEXT);
  if (!id || (text.length < 2 && !MEANINGFUL_CJK.test(text)) || /^[\p{P}\p{S}\p{N}\s]+$/u.test(text)) return null;
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : raw.nodeLengths;
  const nodes = (Array.isArray(rawNodes) ? rawNodes : [])
    .map((value) => Math.max(0, Math.min(1000000, Math.trunc(finiteNumber(value)))))
    .filter((value) => value > 0)
    .slice(0, 10000);
  const top = finiteNumber(raw.top ?? raw.rect?.top, 0);
  const bottom = finiteNumber(raw.bottom ?? raw.rect?.bottom, top);
  const left = finiteNumber(raw.left ?? raw.rect?.left, 0);
  const right = finiteNumber(raw.right ?? raw.rect?.right, left);
  const visible = raw.visible === true;
  const distance = Math.max(0, finiteNumber(raw.distance, visible ? 0 : Number.MAX_SAFE_INTEGER));
  return {
    id,
    text,
    nodes,
    top,
    bottom,
    left,
    right,
    visible,
    distance,
    order: Math.max(0, Math.trunc(finiteNumber(raw.order ?? raw.blockIndex, index))),
  };
}

function normalizedPageBlockCandidates(raw) {
  const source = Array.isArray(raw) ? raw : Array.isArray(raw?.blocks) ? raw.blocks : [];
  const seen = new Set();
  const blocks = [];
  for (let index = 0; index < source.length; index++) {
    const block = normalizeOnePageBlock(source[index], index);
    if (!block || seen.has(block.id)) continue;
    seen.add(block.id);
    blocks.push(block);
  }
  return blocks;
}

function normalizePageBlocks(raw) {
  const result = [];
  let characterCount = 0;
  for (const block of normalizedPageBlockCandidates(raw)) {
    if (result.length >= MAX_PAGE_BLOCKS) break;
    if (characterCount + block.text.length > MAX_PAGE_CHARACTERS) continue;
    result.push(block);
    characterCount += block.text.length;
  }
  return result;
}

function pageBlockDistance(block, viewportTop, viewportBottom) {
  if (block.visible || (block.bottom >= viewportTop && block.top <= viewportBottom)) return 0;
  if (block.bottom < viewportTop) return viewportTop - block.bottom;
  if (block.top > viewportBottom) return block.top - viewportBottom;
  return Math.max(0, block.distance);
}

function planPageTranslationBatches(rawBlocks, options = {}) {
  const viewportTop = finiteNumber(options.viewportTop, 0);
  const viewportHeight = Math.max(1, finiteNumber(options.viewportHeight, 900));
  const viewportBottom = finiteNumber(options.viewportBottom, viewportTop + viewportHeight);
  const maxBlocks = Math.max(1, Math.min(MAX_PAGE_BLOCKS,
    Math.trunc(finiteNumber(options.maxBlocks, MAX_PAGE_BLOCKS))));
  const maxCharacters = Math.max(1, Math.min(MAX_PAGE_CHARACTERS,
    Math.trunc(finiteNumber(options.maxCharacters, MAX_PAGE_CHARACTERS))));
  const batchSize = Math.max(1, Math.min(MAX_PAGE_BATCH_BLOCKS,
    Math.trunc(finiteNumber(options.batchSize, MAX_PAGE_BATCH_BLOCKS))));
  const excluded = options.excluded instanceof Set ? options.excluded : new Set(options.excluded || []);

  const ranked = normalizedPageBlockCandidates(rawBlocks)
    .filter((block) => !excluded.has(block.id))
    .map((block) => ({ block, distance: pageBlockDistance(block, viewportTop, viewportBottom) }))
    .sort((a, b) => a.distance - b.distance
      || Number(b.block.visible) - Number(a.block.visible)
      || a.block.order - b.block.order);

  const selected = [];
  let characterCount = 0;
  for (const item of ranked) {
    if (selected.length >= maxBlocks) break;
    if (characterCount + item.block.text.length > maxCharacters) continue;
    selected.push(item.block);
    characterCount += item.block.text.length;
  }

  const batches = [];
  for (let index = 0; index < selected.length; index += batchSize) {
    batches.push(selected.slice(index, index + batchSize));
  }
  return batches;
}

function pageBlockCacheKey(block, context = {}) {
  const material = JSON.stringify({
    version: PAGE_CACHE_VERSION,
    text: normalizeText(block?.text),
    targetLanguage: String(context.targetLanguage || '').trim().toLowerCase(),
    sourceLanguage: String(context.sourceLanguage || '').trim().toLowerCase(),
    model: String(context.model || '').trim(),
    style: String(context.style || '').trim(),
    glossaryVersion: String(context.glossaryVersion || ''),
  });
  return crypto.createHash('sha256').update(material, 'utf8').digest('hex');
}

function pageBlockScanScript(options = {}) {
  const encoded = safeJsonForScript(options);
  return `(() => {
    const incoming = ${encoded};
    const MAX_BLOCKS = ${MAX_PAGE_BLOCKS};
    const MAX_TEXT = ${MAX_PAGE_BLOCK_TEXT};
    const MAX_CHARS = ${MAX_PAGE_CHARACTERS};
    const normalize = (value) => String(value == null ? '' : value).normalize('NFC').replace(/\\s+/g, ' ').trim();
    const meaningful = (value) => (value.length >= 2 || /[ぁ-ヿ㐀-鿿豈-﫿]/u.test(value))
      && !/^[\\p{P}\\p{S}\\p{N}\\s]+$/u.test(value);
    const hashText = (value) => {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36);
    };
    const excludedSelector = 'script,style,noscript,code,pre,kbd,samp,textarea,svg,math,[contenteditable],input,select,[translate="no"],.notranslate,[aria-hidden="true"],.whisper-page-tr';
    const blockedDisplays = new Set(['block', 'list-item', 'table-cell', 'flex', 'grid']);
    const state = window.__whisperPageTranslateState || {
      refs: new Map(),
      knownIds: new Set(),
      originalValues: new WeakMap(),
      blockIndexes: new WeakMap(),
      latestIdByRoot: new WeakMap(),
      activeByRoot: new WeakMap(),
      roots: new Set(),
      observers: new Map(),
      nextBlockIndex: 0,
      emittedCount: 0,
      emittedCharacters: 0,
      timer: 0,
      visible: true,
      destroyed: false,
    };
    window.__whisperPageTranslateState = state;
    state.config = {
      ...state.config,
      ...incoming,
      maxBlocks: Math.max(1, Math.min(MAX_BLOCKS, Math.trunc(Number(incoming.maxBlocks) || MAX_BLOCKS))),
      maxCharacters: Math.max(1, Math.min(MAX_CHARS, Math.trunc(Number(incoming.maxCharacters) || MAX_CHARS))),
      bridgeToken: String(incoming.bridgeToken || state.config?.bridgeToken || ''),
    };
    state.destroyed = false;

    const parentAcrossShadow = (element) => element?.parentElement || element?.getRootNode?.()?.host || null;
    const excluded = (node) => {
      let element = node?.parentElement || node?.getRootNode?.()?.host || null;
      while (element) {
        try { if (element.matches?.(excludedSelector)) return true; } catch (_) {}
        element = parentAcrossShadow(element);
      }
      return false;
    };
    const visibleNode = (node) => {
      const element = node?.parentElement;
      if (!element) return false;
      let rectCount = 1;
      try { rectCount = typeof element.getClientRects === 'function' ? element.getClientRects().length : 1; } catch (_) {}
      return !(element.offsetParent === null && rectCount === 0);
    };
    const blockRoot = (node) => {
      let element = node?.parentElement || node?.getRootNode?.()?.host || null;
      const fallback = element;
      while (element) {
        try {
          const display = getComputedStyle(element).display;
          if (blockedDisplays.has(display)) return element;
        } catch (_) {}
        element = parentAcrossShadow(element);
      }
      return fallback || document.body || document.documentElement;
    };
    const discoverRoots = () => {
      const queue = [document];
      const discovered = [];
      const seen = new Set();
      while (queue.length) {
        const root = queue.shift();
        if (!root || seen.has(root)) continue;
        seen.add(root);
        discovered.push(root);
        let elements = [];
        try { elements = root.querySelectorAll ? root.querySelectorAll('*') : []; } catch (_) {}
        for (const element of elements) if (element.shadowRoot) queue.push(element.shadowRoot);
      }
      for (const root of discovered) state.roots.add(root);
      return discovered;
    };
    const ownAddedNode = (node) => {
      const element = node?.nodeType === 1 ? node : node?.parentElement;
      if (!element) return false;
      try { return element.matches?.('.whisper-page-tr') || !!element.closest?.('.whisper-page-tr'); }
      catch (_) { return false; }
    };
    const disconnectObservers = () => {
      for (const observer of state.observers.values()) observer.disconnect();
      state.observers.clear();
      if (state.timer) clearTimeout(state.timer);
      state.timer = 0;
    };
    const emitNewBlocks = () => {
      if (state.destroyed || document.hidden) return;
      const result = state.scan();
      if (result.blocks.length) {
        globalThis.__whisperTrustedBridgeSend?.('page-blocks', {
          ...result,
          bridgeToken: state.config.bridgeToken,
        });
      }
    };
    const observeRoots = () => {
      if (state.destroyed || document.hidden || typeof MutationObserver !== 'function') return;
      for (const root of discoverRoots()) {
        if (state.observers.has(root)) continue;
        const observer = new MutationObserver((mutations) => {
          let shouldScan = false;
          for (const mutation of mutations) {
            const added = [...(mutation.addedNodes || [])];
            if (added.some((node) => !ownAddedNode(node))) { shouldScan = true; break; }
          }
          if (!shouldScan) return;
          if (state.timer) clearTimeout(state.timer);
          state.timer = setTimeout(() => {
            state.timer = 0;
            observeRoots();
            emitNewBlocks();
          }, 400);
        });
        observer.observe(root, { childList: true, subtree: true });
        state.observers.set(root, observer);
      }
    };
    state.scan = () => {
      const groups = new Map();
      let order = 0;
      for (const root of discoverRoots()) {
        let walker;
        try { walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); } catch (_) { continue; }
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const raw = String(state.originalValues.has(node) ? state.originalValues.get(node) : node.nodeValue || '');
          if (!raw || excluded(node) || !visibleNode(node)) continue;
          const owner = blockRoot(node);
          if (!owner) continue;
          let group = groups.get(owner);
          if (!group) {
            group = { owner, nodes: [], originals: [], order: order++ };
            groups.set(owner, group);
          }
          if (!state.originalValues.has(node)) state.originalValues.set(node, raw);
          group.nodes.push(node);
          group.originals.push(String(state.originalValues.get(node)));
        }
      }

      const candidates = [];
      let foundCharacters = 0;
      for (const group of groups.values()) {
        const text = normalize(group.originals.join(''));
        if (!meaningful(text)) continue;
        let blockIndex = state.blockIndexes.get(group.owner);
        if (!Number.isInteger(blockIndex)) {
          blockIndex = state.nextBlockIndex++;
          state.blockIndexes.set(group.owner, blockIndex);
        }
        const boundedText = text.slice(0, MAX_TEXT);
        const id = blockIndex + ':' + hashText(boundedText);
        if (state.knownIds.has(id)) continue;
        let rect = { top: 0, bottom: 0, left: 0, right: 0 };
        try { rect = group.owner.getBoundingClientRect?.() || rect; } catch (_) {}
        const top = Number(rect.top) || 0;
        const bottom = Number(rect.bottom) || top;
        const viewportBottom = Math.max(1, Number(innerHeight) || 1);
        const isVisible = bottom >= 0 && top <= viewportBottom;
        const distance = isVisible ? 0 : (bottom < 0 ? -bottom : top - viewportBottom);
        foundCharacters += boundedText.length;
        candidates.push({
          id, text: boundedText, nodes: group.originals.map((value) => value.length),
          top, bottom, left: Number(rect.left) || 0, right: Number(rect.right) || 0,
          visible: isVisible, distance: Math.max(0, distance), order: group.order,
          _group: group,
        });
      }
      candidates.sort((a, b) => Number(b.visible) - Number(a.visible)
        || a.distance - b.distance || a.order - b.order);
      const blocks = [];
      const blockBudget = Math.max(0, state.config.maxBlocks - state.emittedCount);
      const characterBudget = Math.max(0, state.config.maxCharacters - state.emittedCharacters);
      let usedCharacters = 0;
      for (const candidate of candidates) {
        if (blocks.length >= blockBudget) break;
        if (usedCharacters + candidate.text.length > characterBudget) continue;
        const { _group: group, ...serializable } = candidate;
        const previousId = state.latestIdByRoot.get(group.owner);
        const previous = previousId ? state.refs.get(previousId) : null;
        if (previous) previous.active = false;
        state.refs.set(candidate.id, {
          id: candidate.id, root: group.owner, nodes: group.nodes,
          originals: group.originals, translation: '', mode: '', active: false, applied: false,
          rootDisplay: (() => { try { return getComputedStyle(group.owner).display; } catch (_) { return ''; } })(),
        });
        state.latestIdByRoot.set(group.owner, candidate.id);
        state.knownIds.add(candidate.id);
        blocks.push(serializable);
        usedCharacters += candidate.text.length;
      }
      state.emittedCount += blocks.length;
      state.emittedCharacters += usedCharacters;
      const overflow = candidates.length > blocks.length;
      return {
        blocks,
        overflow,
        warning: overflow
          ? 'Sayfa çok büyük: 1500 bloktan fazlası çevrilmiyor. Görünen kısımdan başlanacak.'
          : '',
        stats: { found: candidates.length, foundCharacters, selected: blocks.length,
          selectedCharacters: usedCharacters },
      };
    };
    state.onVisibilityChange ||= () => {
      if (document.hidden) disconnectObservers();
      else { observeRoots(); emitNewBlocks(); }
    };
    document.removeEventListener?.('visibilitychange', state.onVisibilityChange);
    document.addEventListener?.('visibilitychange', state.onVisibilityChange);
    const result = state.scan();
    if (incoming.observe !== false) observeRoots();
    return result;
  })()`;
}

function pageApplyScript(payload = {}) {
  const encoded = safeJsonForScript(payload);
  return `(() => {
    const input = ${encoded};
    const state = window.__whisperPageTranslateState;
    if (!state?.refs) return { ok: false, applied: 0, missing: 0, message: 'Sayfa metni taranmamış.' };
    const mode = input?.mode === 'replace' ? 'replace' : 'bilingual';
    const source = Array.isArray(input) ? input
      : Array.isArray(input?.translations) ? input.translations
        : Array.isArray(input?.blocks) ? input.blocks
          : Array.isArray(input?.results) ? input.results
            : input?.id != null ? [input]
              : input?.translations && typeof input.translations === 'object'
                ? Object.entries(input.translations).map(([id, translation]) => ({ id, translation })) : [];
    const styleId = '__whisper_page_tr';
    let sheet = document.getElementById(styleId);
    if (!sheet) {
      sheet = document.createElement('style');
      sheet.id = styleId;
      sheet.className = 'whisper-page-tr';
      sheet.textContent = '.whisper-page-tr{display:block;margin:.35em 0;color:inherit;font:inherit;line-height:inherit;opacity:.88}.whisper-page-tr[hidden]{display:none!important}';
      (document.head || document.documentElement).appendChild(sheet);
    }
    const restoreRef = (ref) => {
      ref.nodes.forEach((node, index) => {
        if (node && node.isConnected !== false) node.nodeValue = ref.originals[index];
      });
    };
    const distribute = (ref, value) => {
      const characters = Array.from(String(value || ''));
      const weights = ref.originals.map((original) => Math.max(1, String(original).length));
      const total = weights.reduce((sum, weight) => sum + weight, 0) || weights.length || 1;
      let cursor = 0;
      let cumulative = 0;
      ref.nodes.forEach((node, index) => {
        cumulative += weights[index] || 1;
        let end = index === ref.nodes.length - 1 ? characters.length
          : Math.max(cursor, Math.min(characters.length, Math.round(characters.length * cumulative / total)));
        if (end > cursor && end < characters.length) {
          let best = end;
          for (let offset = 0; offset <= 12; offset++) {
            const forward = end + offset;
            const backward = end - offset;
            if (forward < characters.length && /\\s/u.test(characters[forward])) { best = forward + 1; break; }
            if (backward > cursor && /\\s/u.test(characters[backward - 1])) { best = backward; break; }
          }
          end = best;
        }
        if (node && node.isConnected !== false) node.nodeValue = characters.slice(cursor, end).join('');
        cursor = end;
      });
    };
    let applied = 0;
    let missing = 0;
    for (const item of source) {
      const id = String(item?.id ?? '');
      const ref = state.refs.get(id);
      if (!ref || state.latestIdByRoot?.get(ref.root) !== id || !ref.nodes.length) { missing++; continue; }
      const translation = String(item?.translation ?? item?.translatedText ?? item?.text ?? '').slice(0, 12000);
      if (!translation.trim()) { missing++; continue; }
      const previous = state.activeByRoot?.get(ref.root);
      if (previous && previous !== ref) {
        previous.active = false;
        previous.overlay?.remove?.();
        restoreRef(previous);
      }
      ref.overlay?.remove?.();
      ref.overlay = null;
      restoreRef(ref);
      ref.translation = translation;
      ref.mode = mode;
      ref.active = true;
      ref.applied = true;
      state.activeByRoot?.set(ref.root, ref);
      if (mode === 'replace') {
        if (state.visible !== false) distribute(ref, translation);
      } else {
        const span = document.createElement('span');
        span.className = 'whisper-page-tr';
        span.setAttribute('data-whisper-tr', id);
        span.setAttribute('translate', 'no');
        if (input?.targetLanguage) span.lang = String(input.targetLanguage).slice(0, 35);
        span.textContent = translation;
        span.hidden = state.visible === false;
        span.style.setProperty('display', state.visible === false ? 'none' : 'block', 'important');
        const layoutRoot = /^(?:flex|grid|inline-flex|inline-grid)$/.test(String(ref.rootDisplay || ''))
          && ref.root !== document.body && ref.root !== document.documentElement;
        if (layoutRoot && ref.root.parentNode?.insertBefore) {
          ref.root.parentNode.insertBefore(span, ref.root.nextSibling || null);
        } else {
          ref.root.appendChild(span);
        }
        ref.overlay = span;
      }
      applied++;
    }
    return { ok: missing === 0, partial: applied > 0 && missing > 0, applied, missing, mode };
  })()`;
}

function pageVisibilityScript(visible) {
  const encoded = safeJsonForScript(Boolean(visible));
  return `(() => {
    const visible = ${encoded};
    const state = window.__whisperPageTranslateState;
    if (!state?.refs) return false;
    state.visible = visible;
    const restoreRef = (ref) => ref.nodes.forEach((node, index) => {
      if (node && node.isConnected !== false) node.nodeValue = ref.originals[index];
    });
    const distribute = (ref) => {
      const chars = Array.from(String(ref.translation || ''));
      const weights = ref.originals.map((value) => Math.max(1, String(value).length));
      const total = weights.reduce((sum, value) => sum + value, 0) || 1;
      let cursor = 0;
      let cumulative = 0;
      ref.nodes.forEach((node, index) => {
        cumulative += weights[index] || 1;
        let end = index === ref.nodes.length - 1 ? chars.length
          : Math.max(cursor, Math.min(chars.length, Math.round(chars.length * cumulative / total)));
        if (end > cursor && end < chars.length) {
          let best = end;
          for (let offset = 0; offset <= 12; offset++) {
            const forward = end + offset;
            const backward = end - offset;
            if (forward < chars.length && /\\s/u.test(chars[forward])) { best = forward + 1; break; }
            if (backward > cursor && /\\s/u.test(chars[backward - 1])) { best = backward; break; }
          }
          end = best;
        }
        if (node && node.isConnected !== false) node.nodeValue = chars.slice(cursor, end).join('');
        cursor = end;
      });
    };
    for (const ref of state.refs.values()) {
      if (!ref.active) continue;
      if (ref.mode === 'replace') {
        if (visible) distribute(ref); else restoreRef(ref);
      }
      if (ref.overlay) {
        ref.overlay.hidden = !visible;
        ref.overlay.style.setProperty('display', visible ? 'block' : 'none', 'important');
      }
    }
    return true;
  })()`;
}

function pageRestoreScript() {
  return `(() => {
    const state = window.__whisperPageTranslateState;
    if (state) {
      state.destroyed = true;
      if (state.timer) clearTimeout(state.timer);
      for (const observer of state.observers?.values?.() || []) observer.disconnect();
      if (state.onVisibilityChange) document.removeEventListener?.('visibilitychange', state.onVisibilityChange);
      const restored = new Set();
      for (const ref of state.refs?.values?.() || []) {
        if (!ref.applied) continue;
        ref.nodes.forEach((node, index) => {
          if (!restored.has(node) && node && node.isConnected !== false) {
            node.nodeValue = ref.originals[index];
            restored.add(node);
          }
        });
      }
    }
    const roots = [document];
    const seen = new Set();
    while (roots.length) {
      const root = roots.shift();
      if (!root || seen.has(root)) continue;
      seen.add(root);
      let elements = [];
      try { elements = root.querySelectorAll ? [...root.querySelectorAll('*')] : []; } catch (_) {}
      for (const element of elements) if (element.shadowRoot) roots.push(element.shadowRoot);
      let translations = [];
      try { translations = root.querySelectorAll ? [...root.querySelectorAll('.whisper-page-tr')] : []; } catch (_) {}
      for (const translation of translations) translation.remove();
    }
    document.getElementById('__whisper_page_tr')?.remove();
    try { delete window.__whisperPageTranslateState; } catch (_) { window.__whisperPageTranslateState = undefined; }
    return true;
  })()`;
}

module.exports = {
  MAX_PAGE_BLOCKS,
  MAX_PAGE_BLOCK_TEXT,
  MAX_PAGE_CHARACTERS,
  MAX_PAGE_BATCH_BLOCKS,
  pageBlockScanScript,
  pageApplyScript,
  pageRestoreScript,
  pageVisibilityScript,
  normalizePageBlocks,
  planPageTranslationBatches,
  pageBlockCacheKey,
};
