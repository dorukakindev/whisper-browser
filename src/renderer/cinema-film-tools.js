(() => {
  'use strict';
  const owners = new WeakMap();
  const t = (en, tr) => window.UiLocale?.get?.() === 'tr' ? tr : en;
  function mount(page, body, personal, heroActions) {
    owners.get(page)?.dispose();
    if (!body) return { dispose() {} };
    body.classList.add('cn-film-tools');
    let disposed = false, burst = 0, burstAt = 0, burstTimer = 0;
    const createdHero = [];
    const observer = new MutationObserver(enhance);
    const watch = () => observer.observe(body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'aria-busy', 'aria-pressed'] });
    function statuses(root) {
      const select = root.querySelector('.pm-watch select,select[data-title-action=status]');
      if (!select) return;
      { const label = select.closest('label'); if (!label.hidden) label.hidden = true; }
      let group = root.querySelector('.cn-status-segments');
      if (!group) {
        group = document.createElement('div');
        group.className = 'cn-status-segments';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', t('Watch status', 'İzleme durumu'));
        select.closest('label').after(group);
        for (const option of select.options) {
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = option.textContent;
          button.dataset.statusValue = option.value;
          button.addEventListener('click', () => {
            if (select.disabled || button.disabled) return;
            select.value = option.value;
            // The canonical owner still stages the preview and requires confirmation.
            select.dispatchEvent(new Event('change', { bubbles: true }));
            enhance();
          });
          group.append(button);
        }
      }
      for (const button of group.querySelectorAll(':scope > button')) {
        if (button.disabled !== select.disabled) button.disabled = select.disabled;
        const pressed = String(button.dataset.statusValue === select.value);
        if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
      }
    }
    function reactions(root) {
      const quick = root.querySelector(':scope > .pm-actions');
      if (!quick || !heroActions) return;
      const original = [...quick.querySelectorAll(':scope > button')].slice(0, 2);
      original.forEach((button, index) => {
        if (!button.hidden) button.hidden = true;
        let proxy = [...heroActions.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === button.textContent.trim());
        if (!proxy && window.CinemaUI) {
          proxy = window.CinemaUI.action(button.textContent, () => {
            body.closest('details').open = true;
            root.querySelectorAll(':scope > .pm-actions > button')[index]?.click();
            root.scrollIntoView({ block: 'center' });
          }, 'icon', index ? 'dislike' : 'like');
          heroActions.append(proxy); createdHero.push(proxy);
        }
        if (proxy) { if (proxy.disabled !== button.disabled) proxy.disabled = button.disabled; const pressed = button.getAttribute('aria-pressed') || 'false'; if (proxy.getAttribute('aria-pressed') !== pressed) proxy.setAttribute('aria-pressed', pressed); }
      });
    }
    function enhance() {
      if (disposed) return;
      observer.disconnect();
      { const now = performance.now(); if (now - burstAt > 50) { burst = 0; burstAt = now; } }
      // Enhance existing nodes: fields, drafts, source IDs and event owners remain intact.
      for (const root of body.querySelectorAll('.pm-panel,.mtd-personal')) { statuses(root); reactions(root); }
      for (const h of body.querySelectorAll('.fw-workspace > h2,.fw-source-controls > h2')) if(h.textContent.trim()===body.closest('details')?.querySelector('summary .cn-accordion-title')?.textContent.trim()) h.remove();
      for (const h of body.querySelectorAll('h1,h2')) {
        const heading = document.createElement('h3');
        for (const attr of h.attributes) heading.setAttribute(attr.name, attr.value);
        heading.append(...h.childNodes); h.replaceWith(heading);
      }
      for (const textarea of body.querySelectorAll('.daily-journal-form textarea')) if (textarea.rows !== 3) textarea.rows = 3;
      for (const add of body.querySelectorAll('.daily-add-entry:not([data-cn-journal])')) {
        add.dataset.cnJournal = 'true'; add.open = true;
      }
      // Başka bir gözlemciyle karşılıklı tetiklenme mikro görev döngüsüne dönüp renderer'ı ve IPC yanıtlarını bloklayamaz: sık tekrarda yeniden izleme ertelenir.
      // Ertelenen turda gözlemci kapalıdır; kaçan güncelleme olmasın diye zamanlayıcı enhance()'ı çalıştırır (enhance kendisi yeniden izler).
      if (++burst > 12) { clearTimeout(burstTimer); burstTimer = setTimeout(() => { burst = 0; burstAt = 0; if (!disposed) enhance(); }, 60); } else watch();
    }
    function dispose() {
      disposed = true; clearTimeout(burstTimer); observer.disconnect();
      createdHero.forEach(node => node.remove());
      page.removeEventListener('close', dispose);
      if (owners.get(page)?.dispose === dispose) owners.delete(page);
    }
    page.addEventListener('close', dispose, { once: true });
    const owner = { dispose }; owners.set(page, owner); enhance(); return owner;
  }
  window.CinemaFilmTools = Object.freeze({ mount });
})();
