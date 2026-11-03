/* Cinematic presentation. Existing data, routing, confirmations and settings own behavior. */
(() => {
  'use strict';
  const media = matchMedia('(prefers-reduced-motion: reduce)'), roots = new Map(), heroes = new Map(), reveals = new Map(), animations = new Set(), carousels = new Set(), swaps = new Map(), tintCache = new Map();
  const abort = new AbortController(), signal = abort.signal, accordions = new WeakMap(), transitions = new Set();
  let rootTransitionUsers = 0, originalRootTransitionName = '';
  const pendingTints = new Map();let tintTask = 0;
  let preference = 'auto', mode = 'full', battery = null, nativePower = null, powerTimer = 0, frame = 0, scanning = false, stopped = false, origin = null;
  const full = () => mode === 'full', active = () => !document.hidden && document.hasFocus?.() !== false;
  const activeHero = hero => { const modal = document.querySelector('.cn-film-page[open]'); return active() && (!modal || modal.contains(hero)); };
  const scope = '.cn-home-content,.cn-discover-page,.cn-film-page';
  function animate(node, frames, options = {}) {
    if (!node?.isConnected || mode === 'off' || typeof node.animate !== 'function') return null;
    const motion = node.animate(mode === 'reduced' ? frames.map(frame => ({ opacity: frame.opacity })) : frames, { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)', ...options, ...(mode === 'reduced' ? { duration: 200, delay: 0 } : {}) });
    animations.add(motion);
    const finish = () => { animations.delete(motion); node.style.willChange = ''; };
    motion.finished?.then(finish, finish);
    return motion;
  }
  function resolveMode() {
    const saving = nativePower?.saverEnabled === true || battery && !battery.charging && battery.level <= .2 || nativePower?.onBattery && nativePower?.batteryPercent !== null && nativePower?.batteryPercent <= 20;
    mode = preference === 'auto' ? media.matches || saving ? 'reduced' : 'full' : preference;
    document.documentElement.dataset.cinemaMotion = mode;
    if (!full()) for (const animation of [...animations]) animation.cancel();
    for (const [hero, state] of heroes) hero.dataset.motionActive = String(full() && state.visible && activeHero(hero));
    for (const controller of carousels) controller.sync();
  }
  function setPreference(value) { preference = ['auto', 'full', 'reduced', 'off'].includes(value) ? value : 'auto'; resolveMode(); void checkPower(); }
  function bindSetting() {
    const control = document.getElementById('uiMotion');
    if (control && !control.dataset.cinemaMotionBound) {
      control.dataset.cinemaMotionBound = 'true'; setPreference(control.value);
      control.addEventListener('change', () => setPreference(control.value), { signal });
    }
  }
  bindSetting();
  // Renderer owns loading and saving this ordinary UI preference.
  if (typeof initialSettingsReady !== 'undefined') Promise.resolve(initialSettingsReady).then(() => { if (!stopped) { bindSetting(); setPreference(document.getElementById('uiMotion')?.value || 'auto'); } }).catch(() => {});
  media.addEventListener('change', resolveMode, { signal });
  if (navigator.getBattery) navigator.getBattery().then(value => {
    if (stopped) return; battery = value;
    battery.addEventListener('chargingchange', resolveMode, { signal }); battery.addEventListener('levelchange', resolveMode, { signal }); resolveMode();
  }).catch(() => {});
  async function checkPower() {
    if (stopped || preference !== 'auto' || !active() || typeof window.api?.systemPowerStatus !== 'function') return;
    try { const value = await window.api.systemPowerStatus(); if (!stopped && value?.ok) { nativePower = value; resolveMode(); } } catch {}
  }
  function pollPower() { if (stopped) return; void checkPower(); powerTimer = setTimeout(pollPower, 30000); }
  if (typeof window.api?.systemPowerStatus === 'function') pollPower();
  function tint(img, host) {
    if (!img?.naturalWidth || !host || stopped) return;
    const src=img.currentSrc||img.src,key=`${src.length}:${src.slice(0,128)}:${src.slice(-128)}`;
    if(tintCache.has(key)){host.style.setProperty('--cn-ambient-rgb',tintCache.get(key));return;}
    pendingTints.set(host,img);while(pendingTints.size>128)pendingTints.delete(pendingTints.keys().next().value);
    scheduleTint();
  }
  function scheduleTint(){
    if(tintTask||stopped||!pendingTints.size)return;
    const work=deadline=>{tintTask=0;if(stopped)return;if(deadline&&!deadline.didTimeout&&deadline.timeRemaining()<5){scheduleTint();return;}
      const [host,img]=pendingTints.entries().next().value||[];if(host){pendingTints.delete(host);if(host.isConnected&&img.isConnected)sampleTint(img,host);}scheduleTint();};
    tintTask=typeof requestIdleCallback==='function'?requestIdleCallback(work,{timeout:1800}):setTimeout(()=>work(null),50);
  }
  function sampleTint(img, host) {
    if (!img?.naturalWidth || !host) return;
    const src = img.currentSrc || img.src, key = `${src.length}:${src.slice(0, 128)}:${src.slice(-128)}`;
    if (tintCache.has(key)) { host.style.setProperty('--cn-ambient-rgb', tintCache.get(key)); return; }
    let rgb = '126,97,63', sampled = false;
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(img, 0, 0, 16, 16);
      const pixels = context.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0, weight = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]), min = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
        if (max < 25 || min > 225 || pixels[i + 3] < 128) continue;
        const w = 1 + (max - min) / 80; r += pixels[i] * w; g += pixels[i + 1] * w; b += pixels[i + 2] * w; weight += w;
      }
      if (weight) rgb = [r, g, b].map(v => Math.round(v / weight)).join(','); sampled = true;
    } catch { /* Cross-origin canvas protection: use the warm palette, never proxy credentials. */ }
    tintCache.set(key, rgb); while (tintCache.size > 64) tintCache.delete(tintCache.keys().next().value);
    host.style.setProperty('--cn-ambient-rgb', rgb); host.dataset.cinemaTint = sampled ? 'sampled' : 'warm-fallback';
  }
  function grain() {
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const context = canvas.getContext('2d'), data = context.createImageData(64, 64); let seed = 17;
      for (let i = 0; i < data.data.length; i += 4) { seed = (seed * 1664525 + 1013904223) >>> 0; data.data[i] = data.data[i + 1] = data.data[i + 2] = seed >>> 24; data.data[i + 3] = 8; }
      context.putImageData(data, 0, 0); document.documentElement.style.setProperty('--cn-grain', `url(${canvas.toDataURL()})`);
    } catch { /* A blocked canvas must not prevent the application opening. */ }
  }
  grain();
  const visibility = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = heroes.get(entry.target); if (!state) continue;
      state.visible = entry.isIntersecting; entry.target.dataset.motionVisible = String(state.visible);
      entry.target.dataset.motionActive = String(full() && state.visible && activeHero(entry.target));
      for (const controller of carousels) if (controller.hero === entry.target) controller.sync();
    }
  }, { threshold: 0 });
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      const node = entry.target, index = reveals.get(node) || 0; revealObserver.unobserve(node); reveals.delete(node); node.dataset.cinemaRevealed = 'done';
      animate(node, node.matches('.film-person-card') ? [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1)' }] : [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: node.matches('.film-person-card') ? 320 : 600, delay: full() ? index * 40 : 0 });
    }
  }, { threshold: .08 });
  function enter(hero) {
    const state = { visible: false }; heroes.set(hero, state); visibility.observe(hero);
    hero.querySelectorAll('.cn-eyebrow,h1,.cn-meta,.cn-hero-description,.cn-hero-actions,.cn-hero-progress').forEach((node, index) => animate(node, [{ opacity: 0, transform: 'translateY(15px)' }, { opacity: 1, transform: 'translateY(0)' }], { delay: full() ? index * 50 : 0 }));
  }
  function imageReady(img) { img.dataset.cinemaImageReady = 'true'; tint(img, img.closest('.cn-hero,.cn-poster,.md-card')); }
  function scan() {
    scanning = false; if (stopped) return;
    bindSetting();
    for (const [root] of roots) if (!root.isConnected) roots.delete(root);
    for (const [hero] of heroes) if (!hero.isConnected) { visibility.unobserve(hero); heroes.delete(hero); swaps.get(hero)?.(); swaps.delete(hero); }
    for (const [node] of reveals) if (!node.isConnected) { revealObserver.unobserve(node); reveals.delete(node); }
    for (const controller of [...carousels]) if (!controller.hero.isConnected) controller.dispose();
    for (const root of document.querySelectorAll(scope)) {
      if (!roots.has(root)) roots.set(root, true);
      for (const hero of root.querySelectorAll('.cn-hero')) if (!heroes.has(hero)) enter(hero);
      for (const img of root.querySelectorAll('img:not([data-cinema-image-ready])')) if (img.complete && img.naturalWidth) imageReady(img);
      for (const section of root.querySelectorAll('.cn-shelf,.cn-story,.cn-cast,.cn-audience,.cn-extras,.md-grid,.film-person-card')) {
        if (section.dataset.cinemaRevealed) continue; section.dataset.cinemaRevealed = 'waiting';
        const index = section.matches('.film-person-card') ? [...section.parentElement.children].indexOf(section) % 8 : 0;
        reveals.set(section, index); revealObserver.observe(section);
      }
      for (const button of root.querySelectorAll('.cn-button[data-kind=icon]')) if (button.title) button.dataset.cinemaTooltip = button.title;
      for (const group of root.querySelectorAll('.cn-status-segments,.cn-watch-views')) segment(group);
      for (const card of root.querySelectorAll('.cn-poster,.md-card')) {
        const art = card.querySelector('.cn-poster-art,.md-card-art');
        if (art && !art.querySelector('.cn-quick-action')) { const label = document.createElement('span'); label.className = 'cn-quick-action'; label.textContent = card.dataset.homeItem?.startsWith('youtube:') ? 'İzlemeye devam et' : 'Filmi keşfet'; label.setAttribute('aria-hidden', 'true'); art.append(label); }
      }
    }
    for (const [hero, state] of heroes) hero.dataset.motionActive = String(full() && state.visible && activeHero(hero));
    for (const controller of carousels) controller.sync();
  }
  function segment(group) {
    const selected = group.querySelector('button[aria-pressed=true],button[aria-current=page],button.current'); if (!selected) return;
    let indicator = group.querySelector('.cn-sliding-indicator');
    if (!indicator) { indicator = document.createElement('span'); indicator.className = 'cn-sliding-indicator'; indicator.setAttribute('aria-hidden', 'true'); group.append(indicator); }
    indicator.style.width = selected.offsetWidth + 'px'; indicator.style.translate = selected.offsetLeft + 'px 0';
  }
  function scheduleScan() { if (!scanning && !stopped) { scanning = true; queueMicrotask(scan); } }
  const observer = new MutationObserver(scheduleScan); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  document.addEventListener('load', event => { if (event.target.tagName === 'IMG' && event.target.closest(scope)) imageReady(event.target); }, { capture: true, signal });
  function scroll() {
    if (frame || !full() || !active()) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const controls of document.querySelectorAll('.cn-discover-controls')) controls.classList.toggle('cn-stuck', (controls.closest('#mediaHome')?.scrollTop || 0) > 2);
      for (const [hero, state] of heroes) if (state.visible) {
        const scroller = hero.closest('#mediaHome'), y = scroller ? scroller.scrollTop : Math.max(0, -hero.getBoundingClientRect().top);
        hero.style.setProperty('--cn-parallax', Math.min(y * .15, 100) + 'px');
        // Quarter-pixel blur steps retain the subtle scroll treatment without
        // invalidating a large filtered surface for every tiny scroll delta.
        const blur = Math.min(Math.round(y / 220 * 4) / 4, 2), filter = blur ? `blur(${blur}px)` : 'none';
        if (hero.style.getPropertyValue('--cn-scroll-filter') !== filter) { hero.style.setProperty('--cn-scroll-filter', filter); hero.style.setProperty('--cn-scroll-blur', blur + 'px'); }
        const opacity = String(Math.max(.45, Math.round((1 - y / 1600) * 100) / 100));
        if (hero.style.getPropertyValue('--cn-scroll-opacity') !== opacity) hero.style.setProperty('--cn-scroll-opacity', opacity);
        document.getElementById('mediaHome')?.classList.toggle('cn-scrolled', y > 80);
      }
    });
  }
  document.addEventListener('scroll', scroll, { capture: true, passive: true, signal });
  const syncVisibility = () => { document.documentElement.dataset.cinemaPaused = String(!active()); resolveMode(); if (active()) void checkPower(); };
  document.addEventListener('visibilitychange', syncVisibility, { signal }); window.addEventListener('blur', syncVisibility, { signal }); window.addEventListener('focus', syncVisibility, { signal });
  function carousel(hero, { count, getIndex, goTo, indicators, duration = 9000 }) {
    const lifetime = new AbortController(); let timer = 0, animation = null, remaining = duration, started = 0, disposed = false;
    const dots = indicators || hero.querySelector('.cn-carousel-dots') || document.createElement('div'); dots.classList.add('cn-carousel-dots'); dots.replaceChildren();
    if (!dots.isConnected) (hero.querySelector('.cn-hero-switch') || hero).prepend(dots);
    let start = Math.max(0, Math.min(count - 7, getIndex() - 3)), buttons = [];
    function renderWindow() { dots.replaceChildren();buttons = Array.from({ length: Math.min(7, count) }, (_, offset) => {
      const index = start + offset;
      const button = document.createElement('button'), fill = document.createElement('i'); button.type = 'button'; button.setAttribute('aria-label', `${index + 1}. içeriği göster`); button.append(fill); dots.append(button);
      button.dataset.slideIndex = String(index);
      button.style.setProperty('--cn-dot-width', index === getIndex() ? '28px' : Math.abs(index - getIndex()) > 2 ? '7px' : '12px');
      button.addEventListener('click', () => jump(index), { signal: lifetime.signal }); return button;
    }); } renderWindow();
    function stop() { if (timer) { clearTimeout(timer); timer = 0; remaining = Math.max(0, remaining - (performance.now() - started)); } animation?.pause(); }
    function sync() {
      if (disposed) return;
      const visible = heroes.get(hero)?.visible ?? hero.dataset.motionVisible !== 'false';
      if (!full() || !activeHero(hero) || !visible || hero.matches(':hover,:focus-within') || count < 2) { stop(); if (!full()) { animation?.cancel(); animation = null; } return; }
      if (!animation && typeof buttons.find(b => Number(b.dataset.slideIndex) === getIndex())?.firstChild.animate === 'function') mark();
      if (!timer) { started = performance.now(); animation?.play(); timer = setTimeout(() => { timer = 0; remaining = duration; jump((getIndex() + 1) % count); }, remaining); }
    }
    function mark() {
      animation?.cancel(); animation = null; remaining = duration;
      const nextStart=Math.max(0,Math.min(count-7,getIndex()-3));if(nextStart!==start){start=nextStart;renderWindow();}
      buttons.forEach(button => { const index=Number(button.dataset.slideIndex);button.style.setProperty('--cn-dot-width',index===getIndex()?'28px':Math.abs(index-getIndex())>2?'7px':'12px');button.setAttribute('aria-current', String(index === getIndex())); if (index === getIndex() && full() && typeof button.firstChild.animate === 'function') { animation = button.firstChild.animate([{ scale: '0 1' }, { scale: '1 1' }], { duration, fill: 'forwards', easing: 'linear' }); animation.finished?.catch(() => {}); animation.pause(); } });
    }
    function jump(index) { stop(); goTo((index + count) % count); if (!disposed) { mark(); sync(); } }
    const controller = { hero, sync, jump, dispose() { if (disposed) return; disposed = true; stop(); animation?.cancel(); lifetime.abort(); carousels.delete(controller); } };
    ['pointerenter', 'pointerleave', 'focusin'].forEach(name => hero.addEventListener(name, sync, { signal: lifetime.signal }));
    hero.addEventListener('focusout', () => queueMicrotask(sync), { signal: lifetime.signal });
    if (!hero.hasAttribute('tabindex')) hero.tabIndex = 0;
    hero.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.target.matches('input,textarea,select') || !count) return; event.preventDefault(); jump(getIndex() + (event.key === 'ArrowLeft' ? -1 : 1)); }, { signal: lifetime.signal });
    carousels.add(controller); mark(); sync(); return controller;
  }
  function swapArtwork(hero, old, next) {
    swaps.get(hero)?.(); if (!old) return;
    let canceled = false, entering, leaving;
    const cleanup = () => { canceled = true; entering?.cancel(); leaving?.cancel(); next.style.opacity = ''; old.remove(); next.removeEventListener('home-art-ready', ready); next.removeEventListener('home-art-error', cleanup); if (swaps.get(hero) === cleanup) swaps.delete(hero); };
    const ready = () => {
      if (canceled || !next.isConnected) return cleanup();
      if (mode === 'off') return cleanup();
      next.style.opacity = ''; entering = animate(next, [{ opacity: 0 }, { opacity: 1 }], { duration: full() ? 800 : 200, easing: 'ease-in-out' });
      leaving = animate(old, [{ opacity: 1 }, { opacity: 0 }], { duration: full() ? 800 : 200, easing: 'ease-in-out' });
      if (entering?.finished) entering.finished.then(cleanup, cleanup); else cleanup();
      hero.querySelectorAll('.cn-hero-copy>*,.md-hero-copy>*').forEach((node, i) => animate(node, [{ opacity: 0, transform: 'translateY(15px)' }, { opacity: 1, transform: 'none' }], { delay: full() ? i * 50 : 0 }));
    };
    swaps.set(hero, cleanup); next.style.opacity = '0'; old.classList.add('cn-art-outgoing'); next.addEventListener('home-art-ready', ready, { once: true }); next.addEventListener('home-art-error', cleanup, { once: true });
    if (next.querySelector('img')?.complete && next.querySelector('img')?.naturalWidth) ready();
  }
  // Opacity/transform only: native details remain in normal document flow.
  document.addEventListener('click', event => {
    const summary = event.target.closest('summary'), details = summary?.parentElement;
    if (!details?.closest(scope) || !details.matches('details.cn-accordion,.pm-details,.daily-preferences,.daily-add-entry') || mode === 'off') return;
    const content = [...details.children].filter(node => node !== summary); if (!content.length) return;
    event.preventDefault();
    const previous = accordions.get(details), opening = previous ? !previous.opening : !details.open;
    previous?.animations.forEach(animation => animation?.cancel());
    const state = { opening, animations: [] }; accordions.set(details, state);
    // Let existing summary click handlers record their next expanded state first.
    queueMicrotask(() => {
      if (!details.isConnected || accordions.get(details) !== state) return;
        const nativeHeight = typeof CSS !== 'undefined' && CSS.supports?.('interpolate-size', 'allow-keywords');
        if (opening || nativeHeight) details.open = opening;
      state.animations = content.map(node => animate(node, opening ? [{ opacity: 0, transform: 'translateY(-7px)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-5px)' }], { duration: opening ? 320 : 200 }));
      Promise.all(state.animations.map(animation => animation?.finished?.catch(() => {}))).then(() => { if (accordions.get(details) !== state) return; if (!opening) details.open = false; accordions.delete(details); });
    });
  }, { capture: true, signal });
  document.addEventListener('click', event => { const group = event.target.closest('.cn-status-segments,.cn-watch-views'); if (group) queueMicrotask(() => segment(group)); }, { signal });
  const baseMotion = window.UiMotion;
  function transfer(snapshot, target) {
    if (!snapshot || !target?.isConnected || mode === 'off') return;
    if (!full() || !document.startViewTransition) { if (full()) baseMotion?.mediaTransfer(snapshot, target); else animate(target, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 }); return; }
    const image = document.createElement('img'); image.src = snapshot.src; image.alt = ''; image.setAttribute('aria-hidden', 'true');
    Object.assign(image.style, { position: 'fixed', left: snapshot.x + 'px', top: snapshot.y + 'px', width: snapshot.width + 'px', height: snapshot.height + 'px', objectFit: 'cover', borderRadius: snapshot.radius || '9px', zIndex: '5000', pointerEvents: 'none', viewTransitionName: 'cinema-selected-poster' });
    const previousOpacity = target.style.opacity; target.style.opacity = '0'; document.body.append(image);
    // Page entry already has its own 320 ms animation. Capture the shared poster
    // alone rather than taking a second full-window snapshot of the same page.
    if (!rootTransitionUsers++) { originalRootTransitionName = document.documentElement.style.viewTransitionName; document.documentElement.style.viewTransitionName = 'none'; }
    let transition, cleaned = false;
    const cleanup = () => { if (cleaned) return; cleaned = true; image.remove(); target.style.opacity = previousOpacity; target.style.viewTransitionName = ''; if (!--rootTransitionUsers) document.documentElement.style.viewTransitionName = originalRootTransitionName; };
    try { transition = document.startViewTransition(() => { image.remove(); target.style.opacity = previousOpacity; target.style.viewTransitionName = 'cinema-selected-poster'; }); transitions.add(transition); transition.finished.finally(() => { transitions.delete(transition); cleanup(); }).catch(() => {}); } catch { cleanup(); baseMotion?.mediaTransfer(snapshot, target); }
  }
  if (baseMotion) window.UiMotion = Object.freeze({ ...baseMotion,
    captureMedia(node) {
      let snapshot = mode === 'off' ? null : baseMotion.captureMedia(node);
      // An explicit Full choice overrides the OS default, including the shared poster.
      if (!snapshot && full() && node?.isConnected) {
        const image = node.tagName === 'IMG' ? node : node.querySelector?.('img'), rect = image?.getBoundingClientRect();
        if (image?.naturalWidth && rect?.width >= 24 && rect.height >= 24) snapshot = { src: image.currentSrc || image.src, x: rect.x, y: rect.y, width: rect.width, height: rect.height, radius: getComputedStyle(image.parentElement || image).borderRadius };
      }
      if (snapshot && node?.closest(scope)) origin = { node, snapshot }; return snapshot;
    },
    mediaTransfer(snapshot, target) { if (target?.closest('.cn-film-page')) transfer(snapshot, target); else baseMotion.mediaTransfer(snapshot, target); },
    reveal(node, kind) { if (node?.matches('.cn-film-page')) animate(node, [{ opacity: .15, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320 }); else baseMotion.reveal(node, kind); }
  });
  let backSnapshot = null;
  document.addEventListener('click', event => { if (event.target.closest('.cn-back')) backSnapshot = baseMotion?.captureMedia(event.target.closest('.cn-film-page')?.querySelector('.cn-film-poster')); }, { capture: true, signal });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') backSnapshot = baseMotion?.captureMedia(document.querySelector('.cn-film-page[open] .cn-film-poster')); }, { capture: true, signal });
  document.addEventListener('close', event => { if (!event.target.matches('.cn-film-page')) return; const target = origin?.node?.querySelector?.('img') || origin?.node; if (backSnapshot && target?.isConnected) transfer(backSnapshot, target); backSnapshot = null; origin = null; }, { capture: true, signal });
  function dispose() {
    if(tintTask){if(typeof cancelIdleCallback==='function')cancelIdleCallback(tintTask);else clearTimeout(tintTask);tintTask=0;}pendingTints.clear();
    stopped = true; observer.disconnect(); visibility.disconnect(); revealObserver.disconnect(); abort.abort(); if (frame) cancelAnimationFrame(frame); clearTimeout(powerTimer);
    for (const transition of transitions) transition.skipTransition?.(); transitions.clear();
    for (const controller of [...carousels]) controller.dispose(); for (const clear of [...swaps.values()]) clear(); for (const animation of animations) animation.cancel(); animations.clear(); roots.clear(); heroes.clear(); reveals.clear(); tintCache.clear();
    if (baseMotion) window.UiMotion = baseMotion;
  }
  window.addEventListener('pagehide', dispose, { once: true });
  window.CinemaMotion = Object.freeze({ carousel, swapArtwork, setPreference, get mode() { return mode; }, dispose, diagnostics: () => ({ roots: roots.size, heroes: heroes.size, pendingReveals: reveals.size, carousels: carousels.size, animations: animations.size, tints: tintCache.size }) });
  resolveMode(); scan();
})();
