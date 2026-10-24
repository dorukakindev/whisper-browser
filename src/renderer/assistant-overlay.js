(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let opened = false, lastMessages = '', busy = false, pending = '';
  let suggestionKey = '', reviewing = '';
  $('reviewCancel').onclick = () => { reviewing = ''; $('review').hidden = true; };
  $('reviewConfirm').onclick = () => { if (reviewing && !busy) window.assistant.action('suggestion', reviewing); reviewing = ''; $('review').hidden = true; };
  function toggle() { opened = !opened; $('panel').hidden = !opened; $('bubble').hidden = opened; window.assistant.action('toggle'); if (opened) $('text').focus(); }
  $('bubble').onclick = toggle; $('close').onclick = toggle;
  $('expand').onclick = () => window.assistant.action('expand');
  for (const action of ['clear', 'cancel', 'retry']) $(action).onclick = () => window.assistant.action(action);
  $('scope').onchange = () => window.assistant.action('scope', $('scope').value);
  function send() { const text = $('text').value.trim(); if (!text || busy || pending) return; pending = text; window.assistant.action('send', text); }
  $('form').onsubmit = event => { event.preventDefault(); send(); };
  $('text').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } };
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && opened) { event.preventDefault(); toggle(); } });
  window.assistant.subscribe(value => {
    const tr = value.locale === 'tr'; const t = (en, turkish) => tr ? turkish : en;
    document.documentElement.lang = tr ? 'tr' : 'en'; document.documentElement.dataset.theme = value.theme;
    $('title').textContent = t('Assistant', 'Asistan'); $('context').textContent = value.context || '';
    $('bubble').setAttribute('aria-label', t('Open assistant', 'Asistanı aç')); $('bubble').title = $('title').textContent;
    $('expand').title = t('Expand / restore', 'Genişlet / geri al'); $('expand').setAttribute('aria-label', $('expand').title);
    $('close').title = t('Minimize', 'Küçült'); $('close').setAttribute('aria-label', $('close').title);
    for (const [id, en, turkish] of [['send','Send','Gönder'],['cancel','Cancel','İptal'],['retry','Retry','Yeniden dene'],['clear','Clear','Temizle']]) $(id).textContent = t(en, turkish);
    $('text').placeholder = t('Ask a question…', 'Sorunu yaz…'); $('text').setAttribute('aria-label', t('Question', 'Soru'));
    [...$('scope').options].forEach((option, i) => { option.textContent = t(['Nearby','Watched','Full transcript'][i], ['Yakın satırlar','İzlenen bölüm','Tüm altyazı'][i]); });
    $('hint').textContent = t('Uses your existing AI provider and subtitle context.', 'Mevcut AI sağlayıcını ve altyazı bağlamını kullanır.');
    $('reviewConfirm').textContent = t('Continue', 'Devam et'); $('reviewCancel').textContent = t('Cancel','Vazgeç');
    const nextSuggestions = JSON.stringify(value.suggestions || []);
    if (nextSuggestions !== suggestionKey) {
      suggestionKey = nextSuggestions; $('suggestions').replaceChildren(); reviewing = ''; $('review').hidden = true;
      for (const row of value.suggestions || []) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = row.label;
        button.onclick = () => { reviewing = row.id; $('reviewText').textContent = row.review; $('review').hidden = false; $('reviewConfirm').focus(); };
        $('suggestions').append(button);
      }
    }
    $('reviewConfirm').disabled = !!value.busy;
    busy = !!value.busy; $('send').disabled = busy; $('clear').disabled = busy; $('cancel').hidden = !busy; $('retry').hidden = !value.retry || busy;
    $('scope').value = value.scope || 'watched';
    if (pending) {
      if (value.messages?.some(row => row.role === 'user' && row.text === pending) && $('text').value.trim() === pending) $('text').value = '';
      pending = '';
    }
    const key = JSON.stringify([value.locale, value.messages]);
    if (key === lastMessages) return; lastMessages = key;
    const log = $('log'), bottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.replaceChildren();
    if (!value.messages?.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = t('Ask about your video, subtitles, translation or the current page.', 'Video, altyazı, çeviri veya bulunduğun sayfa hakkında sor.'); log.append(empty); }
    for (const row of value.messages || []) {
      const node = document.createElement('div'); node.className = 'message ' + row.role; node.textContent = row.text;
      if (row.links?.length) {
        const sources = document.createElement('div'); sources.className = 'sources';
        for (const link of row.links) { const button = document.createElement('button'); button.textContent = link.label; button.onclick = () => window.assistant.action('citation', link.id); sources.append(button); }
        node.append(sources);
      }
      log.append(node);
    }
    if (bottom) log.scrollTop = log.scrollHeight;
  });
  window.assistant.action('ready');
})();
