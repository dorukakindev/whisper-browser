/* Shared, finite motion. Navigation and native-view visibility never wait for it. */
(() => {
  'use strict';
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Map();
  function stop(node) {
    const animation = running.get(node);
    running.delete(node);
    animation?.cancel();
  }
  // Read computed CSS roles on each entry so scoped/reduced-motion changes apply.
  // Bounded parsing keeps absent stylesheets or malformed custom properties from
  // passing invalid timing/translate values to WAAPI.
  function token(style, name) {
    return style?.getPropertyValue?.(name)?.trim() || '';
  }
  function duration(value, fallback) {
    const match = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/.exec(value);
    if (!match) return fallback;
    const milliseconds = Number(match[1]) * (match[2] === 's' ? 1000 : 1);
    return Number.isFinite(milliseconds) && milliseconds <= 2000 ? milliseconds : fallback;
  }
  function offset(value, fallback) {
    const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))px$/.exec(value);
    const pixels = match ? Number(match[1]) : NaN;
    return Number.isFinite(pixels) && Math.abs(pixels) <= 16 ? pixels : fallback;
  }
  function easing(value) {
    if (/^(linear|ease|ease-in|ease-out|ease-in-out)$/.test(value)) return value;
    const match = /^cubic-bezier\(\s*([^()]+)\s*\)$/.exec(value);
    const values = match?.[1].split(',').map(part => part.trim());
    if (values?.length === 4 && values.every(part => /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(part))) {
      const [x1, y1, x2, y2] = values.map(Number);
      if ([x1, y1, x2, y2].every(Number.isFinite) && x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1) return value;
    }
    return 'cubic-bezier(.2,.8,.2,1)';
  }
  function reveal(node, kind = 'section') {
    if (!node?.isConnected || typeof node.animate !== 'function') return;
    const previous = running.get(node);
    const current = getComputedStyle(node);
    const from = previous ? { opacity: current.opacity, translate: current.translate } : null;
    stop(node);
    if (preference.matches) return;
    const panel = kind === 'panel';
    const pixels = offset(token(current, panel ? '--ui-motion-panel-offset' : '--ui-motion-section-offset'), panel ? 0 : 4);
    const animation = node.animate([
      from || { opacity: panel ? .65 : .55, translate: pixels === 0 ? 'none' : `0 ${pixels}px` },
      { opacity: 1, translate: 'none' },
    ], { duration: duration(token(current, panel ? '--ui-motion-panel' : '--ui-motion-surface'), panel ? 160 : 180),
      easing: easing(token(current, '--ui-motion-ease')) });
    running.set(node, animation);
    const release = () => { if (running.get(node) === animation) running.delete(node); };
    animation.finished.then(release, release);
  }
  preference.addEventListener('change', () => {
    if (preference.matches) for (const node of [...running.keys()]) stop(node);
  });
  window.addEventListener('pagehide', () => {
    for (const node of [...running.keys()]) stop(node);
  });
  window.UiMotion = Object.freeze({ reveal, stop });
})();
