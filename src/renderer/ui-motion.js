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
  function reveal(node, kind = 'section') {
    if (!node?.isConnected || typeof node.animate !== 'function') return;
    const previous = running.get(node);
    const current = previous ? getComputedStyle(node) : null;
    const from = current ? { opacity: current.opacity, translate: current.translate } : null;
    stop(node);
    if (preference.matches) return;
    const panel = kind === 'panel';
    const animation = node.animate([
      from || { opacity: panel ? .65 : .55, translate: panel ? 'none' : '0 6px' },
      { opacity: 1, translate: 'none' },
    ], { duration: panel ? 160 : 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
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
