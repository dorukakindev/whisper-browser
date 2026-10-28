(() => {
  'use strict';
  function mount(host, { onUse, onError = () => {}, otherAudio = () => null } = {}) {
    if (!host) return null;
    const make = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
    const t = (en, tr) => window.UiLocale?.get?.() === 'tr' ? tr : en;
    const trigger = make('button', 'btn btn-secondary reference-ab-trigger');trigger.type = 'button';
    const section = make('dialog', 'reference-ab'), header = make('header'), summary = make('h2'), close = make('button', 'btn btn-ghost'), hint = make('p', 'reference-ab-hint');
    section.setAttribute('aria-labelledby', 'referenceABTitle');summary.id = 'referenceABTitle';close.type = 'button';close.textContent = '×';header.append(summary, close);
    trigger.addEventListener('click', () => { if (!section.open) section.showModal(); });
    close.addEventListener('click', () => section.close());
    const grid = make('div', 'reference-ab-grid'), notice = make('p', 'reference-ab-notice');
    notice.setAttribute('role', 'status');
    let references = [], locked = false, applying = false, disposed = false, feedback = '';
    const cards = ['A', 'B'].map(letter => {
      const card = make('section', 'reference-ab-card'), heading = make('strong'), label = make('label');
      const select = make('select'), audio = make('audio'), use = make('button', 'btn btn-secondary');
      audio.controls = true; audio.preload = 'none'; use.type = 'button';
      label.append(select); card.append(heading, label, audio, use); grid.append(card);
      const slot = { letter, card, heading, label, select, audio, use, id: '' };
      select.addEventListener('change', () => { slot.id = select.value; feedback = ''; render(); });
      audio.addEventListener('play', () => {
        for (const other of cards) if (other !== slot) other.audio.pause();
        otherAudio()?.pause();
      });
      use.addEventListener('click', async () => {
        if (locked || applying || !references.some(r => r.id === slot.id)) return;
        applying = true; render();
        try { feedback = (await onUse(slot.id))?.ok === true ? 'applied' : 'failed'; }
        catch (error) { feedback = 'failed'; onError(error); }
        finally { applying = false; if (!disposed) render(); }
      });
      return slot;
    });
    section.append(header, hint, notice, grid); host.append(trigger);document.body.append(section);
    function stop() { for (const slot of cards) slot.audio.pause(); }
    function render() {
      trigger.textContent = summary.textContent = t('Compare two voice references', 'İki referans sesi karşılaştır');
      close.setAttribute('aria-label',t('Close voice comparison','Ses karşılaştırmasını kapat'));
      hint.textContent = t('Listen to the recordings, then choose the voice you want to use. These are reference recordings, not two narrations of the same text.', 'Kayıtları dinle, ardından kullanacağın sesi seç. Bunlar referans kayıtlarıdır; aynı metnin iki ayrı seslendirmesi değildir.');
      notice.textContent = feedback === 'applied' ? t('Voice selected for future jobs.', 'Sonraki işler için ses seçildi.') : feedback === 'failed' ? t('The voice could not be applied. Check the reference and try again.', 'Ses uygulanamadı. Referansı kontrol edip yeniden dene.') : references.length < 2 ? t('Add a second reference to compare voices side by side.', 'Sesleri yan yana karşılaştırmak için ikinci bir referans ekle.') : '';
      notice.hidden = !feedback && references.length >= 2;
      for (const slot of cards) {
        slot.heading.textContent = t(`Voice ${slot.letter}`, `${slot.letter} sesi`);
        slot.select.setAttribute('aria-label', t(`Voice reference ${slot.letter}`, `${slot.letter} referans sesi`));
        slot.audio.setAttribute('aria-label', t(`Listen to reference ${slot.letter}`, `${slot.letter} referansını dinle`));
        slot.use.textContent = t('Use this voice', 'Bu sesi kullan');
        slot.select.replaceChildren();
        const empty = make('option'); empty.value = ''; empty.textContent = t('Choose a reference', 'Referans seç'); slot.select.append(empty);
        for (const ref of references) { const option = make('option'); option.value = ref.id; option.textContent = ref.name; option.setAttribute('data-ui-untranslated', ''); slot.select.append(option); }
        slot.select.value = slot.id;
        const ref = references.find(r => r.id === slot.id), next = ref?.url || '';
        if ((slot.audio.getAttribute('src') || '') !== next) {
          slot.audio.pause();
          if (next) slot.audio.src = next; else slot.audio.removeAttribute('src');
          slot.audio.load();
        }
        slot.audio.hidden = !ref;
        slot.select.disabled = locked || applying;
        slot.use.disabled = locked || applying || !ref;
        slot.card.dataset.selected = String(!!ref);
      }
    }
    section.addEventListener('close', () => { stop();if(trigger.isConnected)trigger.focus(); });
    const locale = () => render(); document.addEventListener('ui-locale-change', locale);
    render();
    return {
      update(items, { busy = false, selectedId = '' } = {}) {
        references = Array.isArray(items) ? items : []; locked = busy;
        for (const slot of cards) if (!references.some(r => r.id === slot.id)) slot.id = '';
        if (!cards[0].id) cards[0].id = references.find(r => r.id === selectedId)?.id || references[0]?.id || '';
        if (!cards[1].id) cards[1].id = references.find(r => r.id !== cards[0].id)?.id || '';
        if (locked) stop(); render();
      },
      stop() { stop();if(section.open)section.close(); },
      dispose() { disposed = true; stop(); document.removeEventListener('ui-locale-change', locale); section.remove();trigger.remove(); },
    };
  }
  window.VoiceReferenceCompare = Object.freeze({ mount });
})();
