'use strict';

const HINT_ALPHABET = 'asdfghjklqwertyuiopzxcvbnm';

function hintCode(index, count, alphabet = HINT_ALPHABET) {
  const width = Math.max(1, Math.ceil(Math.log(Math.max(1, count)) / Math.log(alphabet.length)));
  let number = Math.max(0, Number(index) || 0);
  let code = '';
  for (let i = 0; i < width; i += 1) {
    code = alphabet[number % alphabet.length] + code;
    number = Math.floor(number / alphabet.length);
  }
  return code;
}

function buildBrowserLinkHintsScript(options = {}) {
  const newTab = options.newTab === true;
  const alphabet = JSON.stringify(HINT_ALPHABET);
  return `(() => {
    const existing = window.__whisperLinkHints;
    if (existing?.cleanup) { existing.cleanup(); return { handled: true, active: false, count: 0 }; }
    if (window.parent !== window) {
      try {
        // The nearest same-origin parent owns this document and discovers it
        // through contentDocument. main.js also executes this script in every
        // Electron frame, so installing here as well would duplicate labels,
        // listeners and the reported count. Cross-origin parents cannot walk
        // into this frame; those frames keep their independent hint instance.
        void window.parent.document.documentElement;
        return { handled: true, active: false, count: 0, delegated: true };
      } catch (_) { /* cross-origin parent: install locally */ }
    }
    const alphabet = ${alphabet};
    const roots = [{ root: document, offsetX: 0, offsetY: 0, view: window }];
    for (let i = 0; i < roots.length && i < 300; i += 1) {
      const entry = roots[i];
      for (const element of entry.root.querySelectorAll?.('*') || []) {
        if (element.shadowRoot) roots.push({ ...entry, root: element.shadowRoot });
        if (/^(IFRAME|FRAME)$/.test(element.tagName || '')) {
          try {
            const child = element.contentDocument;
            const frameRect = element.getBoundingClientRect?.();
            if (child?.documentElement && frameRect && element.contentWindow) roots.push({
              root: child, view: element.contentWindow,
              offsetX: entry.offsetX + frameRect.left,
              offsetY: entry.offsetY + frameRect.top,
            });
          } catch (_) { /* cross-origin frame */ }
        }
        if (roots.length >= 300) break;
      }
    }
    const selector = 'a[href],button,input:not([type="hidden"]),select,textarea,[role="button"],[role="link"],[tabindex]';
    const candidates = [];
    const seen = new Set();
    for (const rootEntry of roots) {
      for (const element of rootEntry.root.querySelectorAll?.(selector) || []) {
        if (seen.has(element) || element.disabled || Number(element.tabIndex) < 0) continue;
        const rect = element.getBoundingClientRect?.();
        if (!rect || rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.right < 0
            || rect.top > rootEntry.view.innerHeight || rect.left > rootEntry.view.innerWidth) continue;
        const style = rootEntry.view.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none'
            || Number(style.opacity) <= .05) continue;
        seen.add(element);
        candidates.push({ element, offsetX: rootEntry.offsetX, offsetY: rootEntry.offsetY });
        if (candidates.length >= 700) break;
      }
      if (candidates.length >= 700) break;
    }
    if (!candidates.length) return { handled: false, active: false, count: 0 };
    const width = Math.max(1, Math.ceil(Math.log(candidates.length) / Math.log(alphabet.length)));
    const codeAt = (index) => {
      let value = index, code = '';
      for (let i = 0; i < width; i += 1) { code = alphabet[value % alphabet.length] + code; value = Math.floor(value / alphabet.length); }
      return code;
    };
    const layer = document.createElement('div');
    layer.setAttribute('data-whisper-link-hints', '');
    Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '2147483647',
      pointerEvents: 'none', font: 'bold 12px/1.2 system-ui,sans-serif' });
    const hints = candidates.map((candidate, index) => {
      const { element } = candidate;
      const rect = element.getBoundingClientRect();
      const label = document.createElement('span');
      const code = codeAt(index);
      label.textContent = code.toUpperCase();
      Object.assign(label.style, { position: 'fixed', left: Math.max(0, candidate.offsetX + rect.left) + 'px',
        top: Math.max(0, candidate.offsetY + rect.top) + 'px', padding: '2px 4px', border: '1px solid #08090a',
        borderRadius: '3px', color: '#08090a', background: '#d5a35c', boxShadow: '0 1px 4px #000a' });
      layer.appendChild(label);
      return { element, label, code };
    });
    document.documentElement.appendChild(layer);
    let typed = '';
    const eventDocuments = [...new Set(roots.map((entry) =>
      entry.root.nodeType === 9 ? entry.root : entry.root.ownerDocument).filter(Boolean))];
    const eventWindows = [...new Set(roots.map((entry) => entry.view).filter(Boolean))];
    const cleanup = () => {
      for (const doc of eventDocuments) doc.removeEventListener('keydown', onKey, true);
      for (const view of eventWindows) {
        view.removeEventListener('scroll', cleanup, true);
        view.removeEventListener('resize', cleanup, true);
      }
      layer.remove();
      if (window.__whisperLinkHints?.cleanup === cleanup) delete window.__whisperLinkHints;
    };
    const activate = (entry) => {
      cleanup();
      const element = entry.element;
      if (${newTab ? 'true' : 'false'} && element.href) window.open(element.href, '_blank', 'noopener');
      else if (/^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName || '')) element.focus();
      else element.click();
    };
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cleanup(); return; }
      if (event.key === 'Backspace') typed = typed.slice(0, -1);
      else {
        const key = String(event.key || '').toLowerCase();
        if (!alphabet.includes(key)) return;
        typed += key;
      }
      event.preventDefault(); event.stopImmediatePropagation();
      const matches = hints.filter((entry) => entry.code.startsWith(typed));
      for (const entry of hints) entry.label.style.display = matches.includes(entry) ? '' : 'none';
      if (matches.length === 1 && matches[0].code === typed) activate(matches[0]);
      else if (!matches.length) { typed = ''; for (const entry of hints) entry.label.style.display = ''; }
    }
    window.__whisperLinkHints = { cleanup };
    for (const doc of eventDocuments) doc.addEventListener('keydown', onKey, true);
    for (const view of eventWindows) {
      view.addEventListener('scroll', cleanup, true);
      view.addEventListener('resize', cleanup, true);
    }
    return { handled: true, active: true, count: hints.length };
  })()`;
}

module.exports = { HINT_ALPHABET, hintCode, buildBrowserLinkHintsScript };
