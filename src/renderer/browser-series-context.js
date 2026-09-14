(() => {
  'use strict';
  const section = document.getElementById('bfSeriesContext');
  if (!section) return;
  const $ = (id) => document.getElementById(id);
  let signature = '';
  let requestId = 0;
  let busy = false;
  const context = () => {
    const tab = typeof browserTabState === 'function' ? browserTabState() : null;
    return player.workspaceMode === 'browser' && tab
      ? { tabId: tab.id, generation: tab.generation, mediaId: tab.mediaId || '' } : null;
  };
  const key = (ctx) => ctx ? `${ctx.tabId}|${ctx.generation}|${ctx.mediaId}` : '';
  function status(message, error = false) {
    $('bfContextStatus').textContent = message;
    $('bfContextStatus').classList.toggle('bf-series-error', error);
  }
  function setBusy(value) {
    busy = value;
    $('bfContextBind').disabled = value;
    $('bfContextSave').disabled = value;
    $('bfContextCheck').disabled = value;
  }
  async function invoke(action, payload = {}, quiet = false) {
    const ctx = context();
    if (!ctx || typeof window.api.browserExtras !== 'function') {
      if (!quiet) status('Önce tarayıcıda bir video açın.', true);
      return null;
    }
    const id = ++requestId;
    if (!quiet) { setBusy(true); status('İşleniyor…'); }
    try {
      const result = await window.api.browserExtras({ action, ...ctx, ...payload });
      if (id !== requestId || key(ctx) !== key(context())) return null;
      if (!result?.ok) {
        if (!quiet) status(result?.error || 'Dizi bağlamı işlemi tamamlanamadı.', true);
        return null;
      }
      return result;
    } catch (error) {
      if (!quiet && id === requestId) status(error?.message || 'Dizi bağlamı işlemi tamamlanamadı.', true);
      return null;
    } finally {
      if (!quiet && id === requestId) setBusy(false);
    }
  }
  function fill(record) {
    $('bfContextSeries').value = record?.seriesName || '';
    $('bfContextStyle').value = record?.profile?.addressStyle || '';
    $('bfContextSynopsis').value = record?.profile?.synopsis || '';
    $('bfContextTerms').value = (record?.profile?.terms || []).map((term) => `${term.source} = ${term.target}`).join('\n');
    $('bfContextIssues').replaceChildren();
  }
  async function refresh(ctx) {
    const result = await invoke('series-context:get', {}, true);
    if (result && key(ctx) === key(context())) fill(result.context || result.record || result.series || result);
  }
  function parseTerms() {
    const lines = $('bfContextTerms').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 80) throw new Error('En çok 80 dizi terimi girin.');
    return lines.map((line, index) => {
      const equal = line.indexOf('=');
      if (equal <= 0 || equal === line.length - 1) throw new Error(`${index + 1}. terimi “kaynak = hedef” biçiminde yazın.`);
      const source = line.slice(0, equal).trim(), target = line.slice(equal + 1).trim();
      if (!source || !target || source.length > 100 || target.length > 100) throw new Error(`${index + 1}. terim eksik veya çok uzun.`);
      return { source, target };
    });
  }
  $('bfContextBind').addEventListener('click', async () => {
    if (busy) return;
    const seriesName = $('bfContextSeries').value.trim();
    if (!seriesName) { status('Dizi adını girin.', true); $('bfContextSeries').focus(); return; }
    const result = await invoke('series-context:bind', { seriesName });
    if (result) {
      fill(result.context);
      status('Bölüm diziye bağlandı; kayıtlı tercihler yüklendi. Sonraki çeviri bu tercihleri kullanır.');
    }
  });
  $('bfContextSave').addEventListener('click', async () => {
    if (busy) return;
    const seriesName = $('bfContextSeries').value.trim();
    if (!seriesName) { status('Dizi adını girin.', true); $('bfContextSeries').focus(); return; }
    let terms;
    try { terms = parseTerms(); } catch (error) { status(error.message, true); return; }
    const result = await invoke('series-context:save', { seriesName,
      profile: { synopsis: $('bfContextSynopsis').value.trim(),
        addressStyle: $('bfContextStyle').value.trim(), terms } });
    if (result) status('Dizi bağlamı kaydedildi. Sonraki çeviri bu tercihleri kullanır; diğer bölümleri aynı dizi adına bağlayabilirsiniz.');
  });
  $('bfContextCheck').addEventListener('click', async () => {
    if (busy) return;
    const roles = browserSubtitleRoleCues();
    const videoCues = (rows) => (rows || []).map((cue) => ({
      start: subtitleVideoTime(cue.start, rows === player.cues2),
      end: subtitleVideoTime(cue.end, rows === player.cues2), text: cue.text,
    }));
    const cues = videoCues(roles.source);
    const translations = videoCues(roles.translation);
    if (!cues.length || !translations.length) { status('Önce kaynak ve çeviri altyazılarını yükleyin.', true); return; }
    if (cues.length > 10000 || translations.length > 10000) { status('Kontrol en çok 10000 replik destekler.', true); return; }
    const result = await invoke('series-context:check', { cues, translations });
    if (!result) return;
    const list = $('bfContextIssues'); list.replaceChildren();
    const issues = Array.isArray(result.issues) ? result.issues : [];
    if (!issues.length) { status(`${Number(result.checked) || 0} replik kontrol edildi; kayıtlı terim uyuşmazlığı bulunmadı.`); return; }
    status(`${issues.length} terim incelemesi gerekli${result.truncated ? ' (liste sınırlandı)' : ''}. Çeviri otomatik değiştirilmedi.`);
    for (const issue of issues.slice(0, 100)) {
      const item = document.createElement('div'); item.className = 'bf-result';
      const title = document.createElement('strong'); title.textContent = `${issue.source} → ${issue.target}`;
      const body = document.createElement('span'); body.className = 'bf-meta';
      body.textContent = `${Number.isFinite(Number(issue.start)) ? `${Math.floor(Number(issue.start) / 60)}:${String(Math.floor(Number(issue.start) % 60)).padStart(2, '0')} · ` : ''}${String(issue.actual || '').slice(0, 240)}`;
      item.append(title, body); list.append(item);
    }
  });
  setInterval(() => {
    const ctx = context(), next = key(ctx);
    if (next === signature) return;
    signature = next; requestId++; setBusy(false); fill(null); status('');
    if (ctx) void refresh(ctx);
  }, 1000);
  const initial = context();
  signature = key(initial);
  if (initial) void refresh(initial);
})();
