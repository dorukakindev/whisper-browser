(() => {
  'use strict';
  const t = (en, tr) => window.UiLocale?.get?.() === 'tr' ? tr : en;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ''; if (text !== undefined) n.textContent = text; return n; };
  const contexts = new Map();
  const changed = () => document.dispatchEvent(new CustomEvent('media-context-changed'));
  function setContext(owner, value) {
    if (!owner || !value) return;
    contexts.delete(owner); contexts.set(owner, {
      id: String(value.id || '').slice(0, 120), type: String(value.type || 'title').slice(0, 40),
      title: String(value.title || '').slice(0, 500), synopsis: String(value.synopsis || '').slice(0, 4000),
      chapter: String(value.chapter || '').slice(0, 500), excerpt: String(value.excerpt || '').slice(0, 8000),
    }); changed();
    if (!owner.dataset.contextObserved) { owner.dataset.contextObserved = '1'; owner.addEventListener('close', changed); }
  }
  function context() {
    for (const [owner, row] of [...contexts].reverse()) {
      if (!owner.isConnected) { contexts.delete(owner); continue; }
      if (owner.open && !owner.hidden) return { workspace: 'media-selection', ...row, note: 'Only selected item metadata or a limited chapter excerpt is provided; do not claim to know the full work.' };
    }
    return null;
  }
  let taskDialog, taskTimer;
  function openTasks() {
    if (taskDialog?.open) { taskDialog.querySelector('button')?.focus(); return; }
    if (!taskDialog) {
      taskDialog = el('dialog', 'mx-dialog media-surface'); taskDialog.id = 'globalTaskCenter';
      const header = el('header'), title = el('h2', '', t('Activity', 'İşlem merkezi'));
      const close = el('button', 'mh-action', '×'); close.type = 'button'; close.setAttribute('aria-label', t('Close activity', 'İşlem merkezini kapat')); close.onclick = () => taskDialog.close();
      header.append(title, close); taskDialog.append(header, el('p', 'mx-intro', t('Closing this window leaves jobs running. Use Stop to cancel a job.', 'Bu pencereyi kapatmak işleri durdurmaz. İptal etmek için Durdur’u kullan.')));
      const list = el('div', 'mx-tasks'); list.id = 'globalTaskList'; taskDialog.append(list); document.body.append(taskDialog);
      taskDialog.addEventListener('close', () => { clearInterval(taskTimer); if (typeof syncBrowserOcclusion === 'function') void syncBrowserOcclusion(); });
    }
    taskDialog.querySelector('h2').textContent = t('Activity', 'İşlem merkezi');
    taskDialog.querySelector('.mx-intro').textContent = t('Closing this window leaves jobs running. Use Stop to cancel a job.', 'Bu pencereyi kapatmak işleri durdurmaz. İptal etmek için Durdur’u kullan.');
    taskDialog.querySelector('header button').setAttribute('aria-label',t('Close activity','İşlem merkezini kapat'));
    taskDialog.showModal(); void syncBrowserOcclusion();
    const draw = () => updatePlayerTaskCenter({ listTarget: $('globalTaskList') });
    draw(); taskTimer = setInterval(draw, 1000);
  }
  const jobs = new Map();
  function taskRows() {
    const rows = [...jobs.values()].map(row=>({...row,label:t('Voice production','Ses üretimi'),
      actions:row.actions.map((action,index)=>({...action,label:index===0?t('Open','Aç'):t('Stop','Durdur')}))}));
    if (player.downloading) rows.push({ id:'active-media-download', label:t('Video download','Video indirme'), state:'running',
      detail:$('playerDlText')?.textContent || t('Downloading','İndiriliyor'), percent:parseFloat($('playerDlText')?.textContent),
      actions:[{label:t('Stop','Durdur'),kind:'stop',run:()=>window.api.cancelYoutubeDownload()}] });
    return rows;
  }
  async function openVoice() {
    // Opens the existing source/reference/range review, never starts generation.
    try {
      if (window.DubGeneratorUI?.prepareCurrent) return await window.DubGeneratorUI.prepareCurrent();
      $('dubMainOpen')?.click();
    } catch (error) {
      const message = error?.message || t('Voice window could not be opened.','Ses penceresi açılamadı.');
      if ($('mhStatus')) $('mhStatus').textContent = message;
      if (!$('playerLayer')?.classList.contains('hidden')) setBrowserSignal(message,false);
      return false;
    }
  }
  window.api.onDubEvent?.(event => {
    if (!event.id || !['progress','status','done','error','cancelled'].includes(event.type)) return;
    const previous = jobs.get('dub:' + event.id), ended = ['done','error','cancelled'].includes(event.type);
    const row = { ...previous, id: 'dub:' + event.id, label: t('Voice production', 'Ses üretimi'), startedAt: previous?.startedAt || Date.now(),
      state: ended ? event.type === 'error' ? 'failed' : event.type === 'cancelled' ? 'cancelled' : 'done' : 'running',
      detail: event.error || event.text || (ended ? t('Finished — open voice studio for results', 'Tamamlandı — sonuçlar için ses penceresini aç') : previous?.detail || t('Preparing voice / background audio', 'Ses / arka plan hazırlanıyor')),
      completed: event.done ?? previous?.completed, total: event.total ?? previous?.total,
      actions: [{ label: t('Open', 'Aç'), run: () => $('dubMainOpen')?.click() }, ...(!ended ? [{ label: t('Stop', 'Durdur'), kind: 'stop', run: () => $('dubGeneratorCancel')?.click() }] : [])],
      dismiss: ended ? () => { jobs.delete('dub:' + event.id); } : null };
    jobs.set(row.id, row); while (jobs.size > 25) jobs.delete(jobs.keys().next().value);
  });
  document.addEventListener('media-playback-preferences-changed', () => { if (player.mediaKey) void flushWatchState(false, false); });
  // Global keyboard shortcut is scoped to this app and does not intercept typing.
  document.addEventListener('keydown', event => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'j') { event.preventDefault(); openTasks(); }
  });
  window.MediaExperience = Object.freeze({ setContext, context, openTasks, taskRows, openVoice });
  $('mediaCatalogDialog')?.classList.add('media-surface');
})();
