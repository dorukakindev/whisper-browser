/* Shared, finite motion. Navigation and native-view visibility never wait for it. */
(() => {
  'use strict';
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Map();
  const transfers = new Set();
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
    const panel = kind === 'panel', page = kind === 'page';
    const role = page ? '--ui-motion-page' : panel ? '--ui-motion-panel' : '--ui-motion-surface';
    const pixels = offset(token(current, page ? '--ui-motion-page-offset' : panel ? '--ui-motion-panel-offset' : '--ui-motion-section-offset'), page ? 12 : panel ? 0 : 4);
    const animation = node.animate([
      from || { opacity: page ? .18 : panel ? .65 : .55, translate: pixels === 0 ? 'none' : `0 ${pixels}px` },
      { opacity: 1, translate: 'none' },
    ], { duration: duration(token(current, role), page ? 360 : panel ? 160 : 180),
      easing: easing(token(current, '--ui-motion-ease')) });
    running.set(node, animation);
    const release = () => { if (running.get(node) === animation) running.delete(node); };
    animation.finished.then(release, release);
  }
  function captureMedia(node) {
    if (preference.matches || !node?.isConnected) return null;
    const image = node.tagName === 'IMG' ? node : node.querySelector?.('img');
    if (!image?.complete || !image.naturalWidth) return null;
    const rect = image.getBoundingClientRect(), src = image.currentSrc || image.src;
    if (!src || ![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite) || rect.width < 24 || rect.height < 24) return null;
    return { src, x:rect.x, y:rect.y, width:rect.width, height:rect.height, radius:getComputedStyle(image.parentElement||image).borderRadius };
  }
  function mediaTransfer(snapshot,target) {
    if (preference.matches || !snapshot || !target?.isConnected || typeof document === 'undefined') return;
    const rect=target.getBoundingClientRect();
    if (![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite) || rect.width<24 || rect.height<24) return;
    for (const transfer of [...transfers]) transfer();
    const image=document.createElement('img');image.src=snapshot.src;image.alt='';image.setAttribute('aria-hidden','true');image.dataset.uiMediaTransfer='';
    Object.assign(image.style,{position:'fixed',left:snapshot.x+'px',top:snapshot.y+'px',width:snapshot.width+'px',height:snapshot.height+'px',objectFit:'cover',borderRadius:snapshot.radius||'10px',pointerEvents:'none',transformOrigin:'0 0',zIndex:'5000'});
    document.body.append(image);
    if(typeof image.animate!=='function'){image.remove();return;}
    const previousOpacity=target.style.opacity;target.style.opacity='0';
    const style=getComputedStyle(target),animation=image.animate([{transform:'none',opacity:1},{transform:`translate(${rect.x-snapshot.x}px,${rect.y-snapshot.y}px) scale(${rect.width/snapshot.width},${rect.height/snapshot.height})`,opacity:1}],{duration:duration(token(style,'--ui-motion-media'),420),easing:easing(token(style,'--ui-motion-ease'))});
    let observer;
    const clear=()=>{transfers.delete(clear);observer?.disconnect();animation.cancel();image.remove();if(target.style.opacity==='0')target.style.opacity=previousOpacity;};transfers.add(clear);
    if(typeof MutationObserver==='function'){observer=new MutationObserver(()=>{if(!target.isConnected)clear();});observer.observe(document.body,{childList:true,subtree:true});}
    animation.finished.then(clear,clear);
  }
  preference.addEventListener('change', () => {
    if (preference.matches) { for (const node of [...running.keys()]) stop(node);for(const transfer of [...transfers])transfer(); }
  });
  window.addEventListener('pagehide', () => {
    for (const node of [...running.keys()]) stop(node);for(const transfer of [...transfers])transfer();
  });
  window.UiMotion = Object.freeze({ reveal, stop, captureMedia, mediaTransfer });
})();
