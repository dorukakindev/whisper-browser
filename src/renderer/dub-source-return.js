(() => {
 'use strict';
 // "Open source" for a saved production run. The main process resolves the run's versioned locator against today's library
 // record and answers with an exact target; this file only drives the EXISTING open owner for that kind of source (the
 // Podcast episode opener) and reports what really happened. It never opens a path or an address, never plays or attaches
 // dubbed audio, never starts generation and never starts a second playback engine.
 //
 // Kinds: Podcast episode (existing episode opener, which has its own cancel), library video (existing catalog play + library opener)
 // and YouTube (an open tab of that video, else a new tab through the existing tab manager). The library and tab openers have no
 // cancel of their own, so these two are serialized: an older open finishes before a newer one starts and can never take it over.
 //
 // Races (all decided here, none by timing luck):
 //  * a newer open supersedes an older one; the older answer is discarded and can never reopen anything;
 //  * the same run asked twice while opening shares ONE attempt (no second open);
 //  * success is claimed only when the player really shows the resolved record at the resolved version and the run record
 //    is still the same afterwards. "Opened but not confirmed" is its own, honest result.
 // Same convention as the production panel this text appears in: English only when the interface is English, Turkish otherwise.
 const english = () => window.UiLocale?.get?.() === 'en';
 const t = (en, tr) => english() ? en : tr;
 const part = value => { const rows = String(value || '').split(' / '); return english() ? rows[0] : (rows[1] || rows[0]); };
 const call = async request => { try { return await window.api.dubRuns(request); } catch (_) { return { ok: false, code: 'transport' }; } };
 let intent = 0, chain = Promise.resolve();
 const inflight = new Map();
 const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
 const enqueue = work => { const run = chain.then(work, work); chain = run.catch(() => {}); return run; };

 const failure = (code, extra = {}) => ({ ok: false, code, ...extra });
 const MESSAGES = {
  superseded: () => t('A newer request replaced this one; nothing was changed.', 'Daha yeni bir istek bunun yerini aldı; hiçbir şey değişmedi.'),
  transport: () => t('The app did not answer. Nothing was opened.', 'Uygulama yanıt vermedi. Hiçbir şey açılmadı.'),
  unavailable: () => t('The source opener is not available right now. Nothing was opened.', 'Kaynak açıcı şu an kullanılamıyor. Hiçbir şey açılmadı.'),
  unsupported: () => t('This kind of source cannot be reopened from here. Nothing was opened.', 'Bu tür bir kaynak buradan yeniden açılamıyor. Hiçbir şey açılmadı.'),
  'open-failed': () => t('The source could not be opened. Nothing was changed.', 'Kaynak açılamadı. Hiçbir şey değişmedi.'),
  'not-confirmed': () => t('The recorded source is not what is shown now (it changed while opening). Try again.', 'Kayıtlı kaynak şu an gösterilen değil (açılırken değişti). Yeniden dene.'),
  'version-unverified': () => t('The episode opened, but its audio source version is not the one this run used, so it is not confirmed as the same source.', 'Bölüm açıldı ama ses kaynağı sürümü bu çalışmanın kullandığıyla aynı değil; aynı kaynak olarak doğrulanmadı.'),
  'record-changed': () => t('The episode opened, but the run record changed meanwhile, so it is not confirmed as this run\'s source.', 'Bölüm açıldı ama çalışma kaydı bu arada değişti; bu çalışmanın kaynağı olarak doğrulanmadı.'),
  'record-gone': () => t('The episode opened, but the run record is gone, so it is not confirmed as this run\'s source. Nothing was deleted.', 'Bölüm açıldı ama çalışma kaydı kalmadı; bu çalışmanın kaynağı olarak doğrulanmadı. Hiçbir şey silinmedi.'),
  expired: () => t('The open request expired; try again.', 'Açma isteğinin süresi doldu; yeniden dene.')
 };
 const messageFor = result => result?.reason || (MESSAGES[result?.code] ? MESSAGES[result.code]() : t('Opening was not confirmed.', 'Açılış doğrulanamadı.'));

 const confirmTicket = async (resolved, stale, extra = {}) => {
  const confirmed = await call({ action: 'source-confirm', ticket: resolved.ticket });
  if (stale()) return failure('superseded', { opened: true });
  if (!confirmed?.ok) return failure(confirmed?.code || 'transport', { opened: true, reason: part(confirmed?.error) });
  return { ok: true, kind: resolved.kind, label: resolved.label || '', versionMatches: resolved.versionMatches === true, ...extra };
 };
 const playerState = () => typeof player === 'object' ? player : null;

 async function openPodcast(resolved, stale) {
  const owner = window.PlayerSourceCatalogIntegration;
  if (typeof owner?.openPodcastEntry !== 'function') return failure('unavailable', { opened: false });
  const entryId = resolved.target.entryId;
  try { await owner.openPodcastEntry(entryId, { view: 'podcast', isCancelled: stale, autoplay:false }); }
  catch (error) { return stale() ? failure('superseded') : failure('open-failed', { opened: false, reason: String(error?.message || '').slice(0, 200) }); }
  if (stale()) return failure('superseded');
  // Success is read from the player itself, not from "the call returned".
  const state = playerState(), audio = state?.workspaceAudio;
  const shown = !!audio && audio.entryId === entryId && audio.mediaKey === state.mediaKey && audio.generation === state.generation;
  if (!shown) return failure('not-confirmed', { opened: false });
  if (audio.sourceVersion !== resolved.expectedVersion) return failure('version-unverified', { opened: true });
  return confirmTicket(resolved, stale);
 }

 // Library video: the existing catalog "play" (it authorizes the file and answers with the library item) and the existing library
 // opener. The same file that is already shown is not reloaded.
 function openCatalog(resolved, stale) {
  return enqueue(async () => {
   if (stale()) return failure('superseded');
   if (typeof window.openMediaCatalogPlayback !== 'function' || typeof window.api?.mediaCatalog !== 'function') return failure('unavailable', { opened: false });
   const played = await window.api.mediaCatalog({ action: 'play', id: resolved.target.itemId, sourceId: resolved.target.sourceId }).catch(() => null);
   if (stale()) return failure('superseded');
   if (played?.canceled) return failure('needs-confirmation', { opened: false });
   const item = played?.watchItem;
   if (!played?.ok || item?.type !== 'local' || typeof item.localPath !== 'string' || !item.localPath) return failure('open-failed', { opened: false, reason: String(played?.error || '').slice(0, 200) });
   const file = item.localPath, key = () => typeof mediaKeyFor === 'function' ? mediaKeyFor('local', file) : null;
   const shown = () => { const state = playerState(); return !!state && state.workspaceMode === 'player' && state.localPath === file && (key() === null || state.mediaKey === key()); };
   const already = shown();
   try { if (already) document.getElementById('playerLayer')?.classList.remove('hidden'); else await window.openMediaCatalogPlayback(item); }
   catch (error) { return stale() ? failure('superseded') : failure('open-failed', { opened: false, reason: String(error?.message || '').slice(0, 200) }); }
   if (stale()) return failure('superseded', { opened: !already });
   if (!shown()) return failure('not-confirmed', { opened: false });
   return confirmTicket(resolved, stale, { alreadyOpen: already });
  });
 }

 // YouTube: a tab that already shows this video is activated; otherwise one new tab is created and navigated to the canonical watch
 // address built from the verified 11-character id. The user's other tabs are never navigated.
 function openYoutube(resolved, stale, timing) {
  return enqueue(async () => {
   if (stale()) return failure('superseded');
   const id = resolved.target.videoId;
   const needs = ['setWorkspaceMode', 'activateBrowserTab', 'createBrowserTab', 'navigateBrowser', 'youtubeVideoId'];
   if (!/^[\w-]{11}$/.test(id) || needs.some(name => typeof globalThis[name] !== 'function') || !playerState()) return failure('unavailable', { opened: false });
   const idOf = url => youtubeVideoId(String(url || '')), state = playerState();
   const tabs = () => Array.isArray(state.browserTabs) ? state.browserTabs : [];
   let tab = tabs().find(row => !row.closing && idOf(row.url) === id) || null, created = false;
   try {
    document.getElementById('playerLayer')?.classList.remove('hidden');
    setWorkspaceMode('browser');
    if (tab) await activateBrowserTab(tab.id);
    else {
     tab = await createBrowserTab(); created = true;
     if (stale()) return failure('superseded', { opened: false });
     if (!tab?.id) return failure('open-failed', { opened: false });
     await navigateBrowser('https://www.youtube.com/watch?v=' + encodeURIComponent(id), tab.id, {pauseOnOpen:true});
    }
   } catch (error) { return stale() ? failure('superseded') : failure('open-failed', { opened: false, reason: String(error?.message || '').slice(0, 200) }); }
   // Success needs the tab itself to show this video and to be the active one; a tab that closed or went to another video is not it.
   for (let i = 0; i < timing.limit; i++) {
    if (stale()) return failure('superseded', { opened: created });
    const now = tabs().find(row => row.id === tab.id);
    if (!now || now.closing) return failure('not-confirmed', { opened: created });
    const current = idOf(now.url);
    if (current === id && state.browserActiveTabId === now.id) return confirmTicket(resolved, stale, { newTab: created });
    if (current && current !== id) return failure('not-confirmed', { opened: created });
    await wait(timing.poll);
   }
   return failure('not-confirmed', { opened: created });
  });
 }

 async function attempt(runId, { allowChanged, isCancelled, timing }, mine) {
  const stale = () => mine !== intent || isCancelled();
  const resolved = await call({ action: 'source-resolve', runId, allowChanged });
  if (stale()) return failure('superseded');
  if (!resolved?.ok) return failure(resolved?.code || 'transport', { reason: part(resolved?.error), next: part(resolved?.next), canOpenCurrent: resolved?.canOpenCurrent === true, opened: false });
  if (resolved.kind === 'podcast') return openPodcast(resolved, stale);
  if (resolved.kind === 'catalog') return openCatalog(resolved, stale);
  if (resolved.kind === 'youtube') return openYoutube(resolved, stale, timing);
  return failure('unsupported', { opened: false });
 }

 function open(runId, { allowChanged = false, isCancelled = () => false, timing = { poll: 150, limit: 50 } } = {}) {
  if (typeof runId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(runId)) return Promise.resolve(failure('unsupported', { opened: false }));
  const key = runId + ':' + (allowChanged ? 'current' : 'recorded');
  if (inflight.has(key)) return inflight.get(key);
  const mine = ++intent;
  const promise = attempt(runId, { allowChanged: allowChanged === true, isCancelled, timing }, mine)
   .catch(error => failure('open-failed', { opened: false, reason: String(error?.message || '').slice(0, 200) }))
   .then(result => ({ ...result, message: result.ok ? '' : messageFor(result) }))
   .finally(() => { if (inflight.get(key) === promise) inflight.delete(key); });
  inflight.set(key, promise);
  return promise;
 }
 window.DubSourceReturn = Object.freeze({ open, busy: () => inflight.size > 0, messageFor });
})();
