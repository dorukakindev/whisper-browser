/* Sahne sayfaları · uygulama bağlantısı (v2).
   Yeni oynatıcı/IPC/zamanlayıcı sahibi oluşturmaz: mevcut ortak oynatma arayüzünü kullanır —
   PlayerWorkspaceModel köprüsü (kimlik + iz + aralık kapısı), PlayerWorkspaceIntegration (yerel snapshot/iz/komut),
   PlayerTranscriptModel (kaynak→çoklu çeviri eşlemesi, bağımsız ofsetler). Tarayıcı ve yerel kaynaklar ayrı cepheler. */
(() => {
  'use strict';
  const doc = document, layer = doc.getElementById('playerLayer');
  if (!layer || !window.Sahne) return;
  const $ = (id) => doc.getElementById(id);
  const T = (tr, en) => window.UiLocale?.get?.() === 'en' ? en : tr;
  const PW = () => window.PlayerWorkspaceIntegration, MODEL = () => window.PlayerWorkspaceModel, TM = () => window.PlayerTranscriptModel;
  const ready = () => !!(PW() && MODEL() && TM() && typeof browserSubtitleRoleCues === 'function');
  const safe = (fn) => (...a) => { try { return fn(...a); } catch (e) { console.warn('cinema-sahne', e); } };
  const SS = { get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) { /* depolama yok */ } } };
  const langCode = (v) => { const m = /^[a-z]{2,3}/i.exec(String(v || '').trim()); return m ? m[0].toLowerCase() : null; };
  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  let host = null, inst = null, key = '', parked = [], localView = 'cinema', advancedOverlay = null, stageOpener = null;

  const headH = () => {
    const origin=layer.getBoundingClientRect().top;
    const selectors=player.workspaceMode==='browser'?['.browser-toolbar','#browserTabStrip']:['.player-head'];
    return Math.max(0,...selectors.map(sel=>{const el=layer.querySelector(sel),r=el?.getBoundingClientRect();return r?.height>0?r.bottom-origin:0;}));
  };
  const bounds = () => { try { if (typeof scheduleBrowserBounds === 'function') scheduleBrowserBounds(); } catch (_) { /* yok */ } requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); };
  const adopt = (el) => { if (!el || parked.some((p) => p.el === el)) return el; parked.push({ el, parent: el.parentNode, next: el.nextSibling }); return el; };
  const restore = () => { for (const p of parked.reverse()) if (p.parent?.isConnected) p.parent.insertBefore(p.el, p.next && p.next.parentNode === p.parent ? p.next : null); parked = []; bounds(); };
  const norm = (r) => (r && typeof r.ok === 'boolean') ? r : { ok: true };
  const setAB = (a, b) => { player.abA = a; player.abB = b; try { renderAbMarkers(); } catch (_) { /* yok */ } $('abLoopBtn')?.classList.toggle('active', a !== null); };

  /* ── Tarayıcı cephesi: tarayıcı altyazı işlevinden okur; tarayıcı komutlarıyla çalışır ── */
  function browserFacade() {
    const tabId = () => player.browserActiveTabId;

    const hashText = (t) => { let h = 0; const s = String(t || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
    function tracks() {

      const roles = browserSubtitleRoleCues();
      const out = ['source', 'translation'].map((role) => {
        const cues = roles[role] || [], secondary = cues === player.cues2;
        const loaded = (player.browserTracks || []).find((t) => t.id === (secondary ? player.browserLoadedTrackId2 : player.browserLoadedTrackId));
        // Resolve source proof once for this projection, rather than at every cue/word endpoint.
        const timeTransform = subtitleVideoTransform(secondary);
        let h = 7; const mapped = cues.map((c, i) => { const m = { ...c, id: String(c.id ?? i), start: subtitleVideoTime(c.start, secondary, timeTransform), end: subtitleVideoTime(c.end, secondary, timeTransform) }; h = (h * 31 + Math.round(num(m.start) * 100) + Math.round(num(m.end) * 100) * 7 + hashText(m.text)) | 0; return m; });
        return { id: `browser:${tabId()}:${loaded?.id || (secondary ? 'secondary' : 'primary')}:${role}`, revision: `${mapped.length}:${h}`, role, timed: true, offsetSeconds: 0, secondary, timeTransform, language: loaded?.language || loaded?.lang || '', cues: mapped };
      });
      return out;
    }
    const snap = () => {
      if (!player.mediaKey) return null; const [s, t] = tracks(), dur = num(player.browserDuration) || null, seen = !!player.browserMediaSeen;
      return { mediaKey: player.mediaKey, generation: player.generation, title: player.browserPageTitle || '', time: num(player.browserTime), duration: dur, paused: !!player.browserPaused, rate: num(player.browserRate) || 1, sourceVersion: `observed:${tabId()}:${player.mediaKey}:${player.generation}`, sourceTrack: { id: s.id, revision: s.revision }, secondaryTrack: t.cues.length ? { id: t.id, revision: t.revision } : null, capabilities: { seek: { support: player.isLive ? 'no' : (seen && dur ? 'yes' : 'unknown') } } };
    };
    const role = () => { const [s] = tracks(); return { trackId: s.id, trackRevision: s.revision, cues: s.cues, offsetSeconds: 0 }; };
    async function exec(c) {
      const id = tabId(), go = async (a, v) => norm(await browserCommand(a, v, id));
      switch (c.type) {
        case 'seekCue': { const cue = role().cues.find((x) => x.id === c.cueId); return cue ? go('seek', cue.start + .01) : { ok: false, code: 'unknown-cue' }; }
        case 'seek': return go('seek', c.time);
        case 'togglePlay': return go(player.browserPaused ? 'play' : 'pause');
        case 'setRate': return go('speed', c.rate);
        case 'setVolume': return go('volume-set',c.volume);
        case 'setAB': setAB(c.a, c.b); return { ok: true };
        default: return { ok: false, code: 'unsupported' };
      }
    }
    const bridge = MODEL().createPlayerWorkspaceBridge({ readSnapshot: snap, resolveSourceRole: role, executeExisting: exec });
    const wordsOf = (cue, track) => (cue && Array.isArray(cue.wordRanges) && cue.wordRanges.length) ? cue.wordRanges.map((r) => ({ s: r.start, e: r.end, t0: subtitleVideoTime(r.timeStart, track.secondary, track.timeTransform), t1: subtitleVideoTime(r.timeEnd, track.secondary, track.timeTransform) })) : null;
    const loadedLangs = () => { const roles = browserSubtitleRoleCues(), byId = (id) => (player.browserTracks || []).find((t) => t.id === id), t1 = byId(player.browserLoadedTrackId), t2 = byId(player.browserLoadedTrackId2); const of = (cues) => cues && cues.length ? (cues === player.cues2 ? t2 : t1) : null; const s = of(roles.source), r = of(roles.translation); return { src: langCode(s?.language || s?.lang), tr: langCode(r?.language || r?.lang) }; };
    return { kind: 'browser', tab: tabId, snap, tracks, dispatch: (c) => bridge.dispatch(c), dispose: () => bridge.dispose(), words: wordsOf, langs: loadedLangs, mediaTitle: () => player.browserPageTitle || $('playerTitle')?.textContent || '', sub: () => { try { return new URL(player.browserPageUrl).hostname.replace(/^www\./, ''); } catch (_) { return ''; } }, cover: () => { try { const u = typeof currentBrowserYoutubeUrl === 'function' ? currentBrowserYoutubeUrl() : ''; return u ? (window.MediaHomeModel?.thumbnail?.({ url: u }) || '') : ''; } catch (_) { return ''; } }, slot: () => adopt($('browserViewSlot')), unslot: () => $('browserViewSlot')?.classList.remove('sh-slot-fill') };
  }

  /* ── Yerel cephe: yerel oynatıcının mevcut snapshot/iz/komut yüzeyi (mpv/native dahil, tek yol) ── */
  function localFacade() {
    const podcast=()=>{const snap=PW()?.snapshot(),audio=player.workspaceAudio;return snap&&audio?.mediaKey===snap.mediaKey&&audio?.generation===snap.generation?audio:null;};
    const words = (cue, track) => (cue && Array.isArray(cue.wordRanges) && cue.wordRanges.length) ? cue.wordRanges.map((r) => ({ s: r.start, e: r.end, t0: num(r.timeStart) + num(track.offsetSeconds), t1: num(r.timeEnd) + num(track.offsetSeconds) })) : null;
    const langs = () => { const roles = browserSubtitleRoleCues(); const srcSecondary = roles.source === player.cues2 || roles.primaryTranslation; return { src: roles.source?.length ? langCode(srcSecondary ? player.sub2Lang : player.subLang) : null, tr: roles.translation?.length ? langCode(srcSecondary ? player.subLang : player.sub2Lang) : null }; };
    // Move the original stage once; the workspace explicitly yields its presentation slot.
    function slot(mode) {
      const st=$('playerStage');
      if(!st || !['study','cinema'].includes(mode) && !window.NativePlayerUI?.active() && !num($('playerVideo')?.videoWidth))return null;
      st.dataset.sahneOwned='true';return st;
    }
    function unslot(){
      const st=$('playerStage');if(!st)return;
      delete st.dataset.sahneOwned;st.classList.remove('sh-slot-fill');
      const home=doc.querySelector('#playerWorkspaceV3 .pw-stage')||layer.querySelector('.player-body');
      if(home)home.append(st);PW()?.refresh?.(true);bounds();
    }
    return { kind: 'local', tab: () => '', snap: () => PW().snapshot(), tracks: () => PW().getTranscriptTracks(), dispatch: (c) => PW().executeExisting(c), dispose() {}, words, langs, mediaTitle: () => podcast()?.title || window.PlayerUiKit?.displayTitle($('playerTitle')?.textContent || '') || '', sub: () => podcast() ? [podcast().publisher,T('Yayıncı RSS','Publisher RSS')].filter(Boolean).join(' · ') : $('playerMeta')?.textContent || '', cover: () => podcast()?.image || '', timingNotice: () => podcast()?.transcriptTimingNotice || '', eyebrow: () => podcast() ? T('Podcast · RSS','Podcast · RSS') : T('Yerel oynatıcı','Local player'), slot, unslot };
  }

  function shelfFacade(){
    const shelf=()=>window.MediaShelfUI;
    const reading=new Map();
    const empty=role=>({id:'shelf-empty:'+role,revision:'none',role,timed:false,offsetSeconds:0,cues:[]});
    return {kind:'shelf',tab:()=>'',snap:()=>shelf()?.readSnapshot(),tracks:()=>['source','translation'].map(role=>{
      const all=shelf()?.getTranscriptTracks?.()||[],track=all.find(t=>(t.role||'source')===role)||empty(role);
      if(track.timed===false && !track.cues?.length && track.text){
        let text=track.readingText||track.text;
        const cached=reading.get(role);
        if(!track.readingText&&cached?.source===track.text)text=cached.prose;
        else if(!track.readingText&&typeof parseSubtitles==='function'&&(/^(?:\uFEFF)?WEBVTT(?:\s|$)/.test(text)||/(?:^|\n)\s*\d+\s*\r?\n\s*\d{1,3}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,3}:\d{2}:\d{2}[,.]\d{3}/.test(text))){
          try{const prose=parseSubtitles(text).map(cue=>String(cue.text||'')).filter(value=>value.trim()).join('\n\n');if(prose)text=prose;}catch(_){/* Unrecognized content stays readable without acquiring timing. */}
          reading.set(role,{source:track.text,prose:text});
        }
        return {...track,cues:[{id:'plain',text,start:0,end:0}]};
      }
      return {...empty(role),...track,cues:track.cues||[]};
    }),dispatch:c=>shelf().executeExisting(c),dispose(){},words:()=>null,langs:()=>({}),mediaTitle:()=>shelf()?.readSnapshot()?.title||'',sub:()=>T('Yayıncı RSS','Publisher RSS'),cover:()=>shelf()?.podcastInfo?.()?.image||'',slot:()=>null,unslot(){} };
  }

  /* ── Ortak adaptör: cepheden Sahne sözleşmesine ── */
  function makeAdapter(kind, mode) {
    const F = kind === 'browser' ? browserFacade() : kind === 'shelf' ? shelfFacade() : localFacade();
    const first = F.snap(); const bound = first ? { mediaKey: first.mediaKey, generation: first.generation, sourceVersion: first.sourceVersion } : { mediaKey: '', generation: -1 };
    const identity = () => { const s = F.snap(); return `${kind}|${F.tab()}|${s ? s.mediaKey : ''}|${s ? s.generation : ''}|${s?.sourceVersion || ''}`; };
    let cache = { rev: '', rows: [], meta: [], untimed: false }, ownLoop = null, disposed = false, lastAction = null;
    const current = () => { const now = F.snap(); return !disposed && !!now && now.mediaKey === bound.mediaKey && now.generation === bound.generation && (!bound.sourceVersion || now.sourceVersion === bound.sourceVersion); };
    const activeLoop = (s, range) => kind === 'shelf' ? s?.loopRange?.a === range.a && s.loopRange?.b === range.b
      : player.abA === range.a && player.abB === range.b;
    function clearOwnedLoop() {
      const range = ownLoop; ownLoop = null;
      if (!range || !current() || !activeLoop(F.snap(), range)) return;
      if (kind === 'shelf') void dispatch('clearAB', {a:range.a,b:range.b});
      else setAB(null, null);
    }
    function build(src, sec, s) {
      const meta = [], secById = new Map(sec.cues.map((c) => [c.id, c]));
      if(src.timed===false && src.cues.length){
        return {rows:[{id:'plain-source',start:0,end:0,timed:false,src:src.cues.map(c=>c.text).join('\n\n'),trs:sec.cues.length?[sec.cues.map(c=>c.text).join('\n\n')]:[],unc:[],words:null}],meta:[],untimed:true};
      }
      if (src.cues.length) {
        const trows = TM().buildTranscriptRows({ sourceTrack: src, secondaryTrack: sec.cues.length ? sec : null, mediaKey: s.mediaKey, generation: s.generation });
        const byId = new Map(src.cues.map((c) => [c.id, c])), trackTimed = src.timed !== false;
        const rows = trows.map((r) => {
          const timed = trackTimed && Number.isFinite(r.videoStart) && Number.isFinite(r.videoEnd) && r.videoEnd > r.videoStart;
          meta.push({ cueId: r.cueId, trackId: r.trackId, trackRevision: r.trackRevision });
          return { id: r.cueId, start: timed ? r.videoStart : 0, end: timed ? r.videoEnd : 0, timed, src: String(r.sourceText || ''), trs: (r.secondaryCueIds || []).map((id) => secById.get(id)?.text).filter((t) => t && String(t).trim()), unc: r.pairing === 'uncertain' ? (r.secondaryCandidates || []).map((c) => c.text) : [], words: timed ? F.words(byId.get(r.cueId), src) : null };
        });
        return { rows, meta, untimed: !trackTimed };
      }
      if (sec.cues.length) { // yalnız çeviri izi yüklü: kaynak sanılmaz, yine de okunabilir
        const timedTrack = sec.timed !== false; const rows = sec.cues.map((c) => { const timed = timedTrack && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start; meta.push({ cueId: c.id, trackId: sec.id, trackRevision: sec.revision }); return { id: c.id, start: timed ? c.start + num(sec.offsetSeconds) : 0, end: timed ? c.end + num(sec.offsetSeconds) : 0, timed, src: String(c.text || ''), trs: [], unc: [], words: null }; });
        return { rows, meta, untimed: !timedTrack };
      }
      return { rows: [], meta, untimed: false };
    }
    function rowsFor(s) {
      const audio = kind === 'local' && player.workspaceAudio?.mediaKey === s.mediaKey && player.workspaceAudio?.generation === s.generation ? player.workspaceAudio : null;
      if (audio && ['untimed','needs-review'].includes(audio.transcriptState)) {
        const text = String(audio.transcriptText || ''), translation = String(audio.translationText || '');
        const paragraphs=text.split(/\n\s*\n/).filter(x=>x.trim());
        // Paragraph counts do not establish alignment; preserve both complete texts.
        const rows=translation ? [{id:'readonly:all',start:0,end:0,timed:false,src:text,trs:[translation],unc:[],words:null}] : paragraphs.map((text,i)=>({id:'readonly:'+i,start:0,end:0,timed:false,src:text,trs:[],unc:[],words:null}));
        cache = { rev: `readonly:${s.mediaKey}:${s.generation}:${JSON.stringify([text,translation])}`, meta: [], untimed: true, rows };
        return cache;
      }
      const [src, sec] = F.tracks(); const rev = `${src.id}|${src.revision}|${src.offsetSeconds}|${sec.id}|${sec.revision}|${sec.offsetSeconds}|${s.mediaKey}|${s.generation}`;
      if (rev !== cache.rev) cache = { rev, ...build(src, sec, s) };
      return cache;
    }
    const dispatch = (type, args = {}, rowIdx = -1) => { const m = rowIdx >= 0 ? cache.meta[rowIdx] : null; return Promise.resolve(F.dispatch({ type, mediaKey: bound.mediaKey, generation: bound.generation, ...(m ? { trackId: m.trackId, trackRevision: m.trackRevision } : {}), ...args })).then(norm); };
    const seekRow = i => cache.meta[i]?.trackId===F.snap()?.sourceTrack?.id ? dispatch('seekCue',{cueId:cache.rows[i].id},i) : dispatch('seek',{time:cache.rows[i].start});
    const idxAt = (t) => { let at = -1; cache.rows.forEach((r, i) => { if (r.timed && r.start <= t && t < r.end && (at < 0 || r.start >= cache.rows[at].start)) at = i; }); return at; };
    const neighbor = (t, dir) => { const timed = cache.rows.map((r, i) => r.timed ? i : -1).filter((i) => i >= 0); if (!timed.length) return -1; const cur = idxAt(t); if (dir < 0) { if (cur >= 0 && t - cache.rows[cur].start > 1.5) return cur; const before = timed.filter((i) => cache.rows[i].start < (cur >= 0 ? cache.rows[cur].start : t) - .01); return before.length ? before[before.length - 1] : timed[0]; } const after = timed.filter((i) => cache.rows[i].start > (cur >= 0 ? cache.rows[cur].start : t) + .01); return after.length ? after[0] : -1; };
    function wordAction(type,value){
      const row=cache.rows[value?.row],word=String(value?.word||'').trim();
      if(kind==='shelf'||!row||value?.cueId&&row.id!==value.cueId||!word||word.length>120||!row.src.includes(word))return Promise.resolve({ok:false,code:'invalid-word'});
      const index=(player.cues||[]).findIndex((cue,i)=>String(cue.id??i)===row.id && String(cue.text||'')===row.src);
      const primary=cache.meta[value.row]?.trackId?.startsWith('primary:') || kind==='browser'&&!F.tracks()[0]?.secondary;const canSave=primary&&index>=0;
      if(type==='wordSave'&&!canSave)return Promise.resolve({ok:false,code:'unsupported'});
      if(type==='wordLookup'||type==='wordSave'){
        const previous=player.selectedWord;player.selectedWord={word,cueIndex:index,source:'source'};
        if(type==='wordSave')toggleWordSaved();else lookupSelectedWord();
        if(!canSave)player.selectedWord=previous;
      }
      return Promise.resolve({ok:true,word,source:row.src,translations:row.trs,canSave,saved:canSave&&typeof isWordSaved==='function'?isWordSaved(word,index,'source'):false});
    }
    const stale = { ok: false, code: 'stale-source' };

    function job() {
      const snap = F.snap(), service = kind === 'shelf' ? window.MediaShelfUI : snap?.sourceKind === 'rss' ? window.PlayerSourceCatalogIntegration : null;
      if (service) {
        const status = service.podcastTaskState?.() || {}, task = status.job || {state:'idle'};
        return { ...task, state: status.preparing || task.state === 'queued' ? 'running' : task.state,
          text: status.preparing ? T('Podcast sesi hazırlanıyor…', 'Preparing podcast audio…') : task.text,
          cancel: current() && task.cancellable ? () => window.cancelPodcastQueueTask?.(snap, task.id) : null };
      }
      const activeJob = player.job;
      if (activeJob?.mediaKey && (activeJob.mediaKey !== snap?.mediaKey
        || (activeJob.generation != null && activeJob.generation !== snap?.generation)
        || (kind === 'browser' && activeJob.browserTabId && activeJob.browserTabId !== F.tab()))) {
        return { state: 'idle' };
      }
      const bar = $('playerJobBar'), vis = !!bar && !bar.classList.contains('hidden'), text = $('playerJobText')?.textContent?.trim() || '';
      const failed = !!(player.job && player.job.failed), pct = parseFloat($('playerJobFill')?.style.width);
      const cancel = $('playerJobCancel') || $('cancelBtn');
      const retryAction = lastAction;
      const jobCurrent = () => current() && player.job === activeJob;
      return { state: vis ? (failed ? 'failed' : 'running') : 'idle', text: text || (failed ? T('İşlem başarısız oldu.', 'The task failed.') : T('İşlem sürüyor…', 'Working…')), progress: Number.isFinite(pct) && pct > 0 ? Math.min(1, pct / 100) : null, cancel: current() && cancel && !cancel.disabled ? () => { if(jobCurrent() && !cancel.disabled)cancel.click(); } : null, retry: current() && retryAction ? () => { if(!jobCurrent() || lastAction !== retryAction)return; const b = retryAction(); if (b && !b.disabled) b.click(); } : null };
    }
    const mirror = (resolver, label) => { const b = resolver(); if (!b) return null; const lbl = (label || b.textContent || '').trim().replace(/\s+/g, ' '); return { type: 'button', label: lbl || b.title, hint: b.disabled ? (b.title || '') : '', disabled: !!b.disabled, pressed: b.getAttribute('aria-pressed') === 'true' ? true : undefined, run: () => { if (!current()) return; const target = resolver(); if (target && !target.disabled) { lastAction = resolver; target.click(); } } }; };
    const trackLabel = (t) => (t.label || window.PlayerUiKit?.languageName?.(t.language, window.UiLocale?.get?.()) || T('Altyazı izi', 'Caption track')) + (t.role === 'translation' ? ' · ' + T('çeviri', 'translation') : '');
    function actions() {
      const snapshot = F.snap();
      const service = kind === 'shelf' ? window.MediaShelfUI : snapshot?.sourceKind === 'rss' ? window.PlayerSourceCatalogIntegration : null;
      if (!service?.runPodcastTask) {
        const buttons = kind === 'browser' ? [
          ['whisper', () => $('browserWhisperTranslate'), T('Whisper ve çeviri', 'Whisper and translation')],
          ['live', () => $('browserLiveAsr'), T('Canlı Whisper', 'Live Whisper')],
          ['translate-track', () => $('browserTrackTranslate'), T('Altyazıyı yükle ve çevir', 'Load and translate captions')]
        ] : [
          ['whisper', () => $('makeSubsBtn'), T('Whisper ile yazıya dök', 'Transcribe with Whisper')],
          ['translate-track', () => $('makeTransBtn'), T('Altyazıyı çevir', 'Translate captions')]
        ];
        return buttons.map(([id, resolver, label]) => { const action = mirror(resolver, label); return action && { ...action, id, primary:id==='whisper' }; }).filter(Boolean);
      }
      const expected = { mediaKey: snapshot.mediaKey, generation: snapshot.generation, sourceVersion: snapshot.sourceVersion };
      const status = service.podcastTaskState?.() || {};
      return [
        ['transcribe', T('Whisper ile yazıya dök', 'Transcribe with Whisper')],
        ['transcribe-translate', T('Yazıya dök ve çevir', 'Transcribe and translate')],
        ...(status.hasSourceTranscript ? [['translate', T('Transkripti çevir', 'Translate transcript')]] : []),
        ...((status.translationRetry?.failed>0||status.translationRetry?.partial)?[['retry-translation',T('Yalnız eksikleri tamamla','Complete missing only')+(status.translationRetry.failed>0?' · '+status.translationRetry.failed:'')]]:[])
      ].map(([id, label], index) => ({ id, type: 'button', label, primary: index === 0,
        disabled: !current() || !!status.preparing || ['queued','running'].includes(status.job?.state) || id==='retry-translation'&&!status.translationRetry?.canRetry,
        hint: id==='retry-translation'?(status.translationRetry?.canRetry?`${status.translationRetry.completed}/${status.translationRetry.total} `+T('hazır; başarılı satırlar korunur.','ready; successful lines are kept.'):T('Bu sonuç için güvenli kurtarma bilgisi yok veya çeviri modu uyuşmuyor.','Safe recovery metadata is unavailable or the translation mode differs.')):status.preparing ? T('Kaynak hazırlanıyor…', 'Preparing source…') : '',
        run: (config={}) => { if (!current()) throw new Error(T('Kaynak değişti; işlem başlatılmadı.', 'Source changed; task not started.'));
          return service.runPodcastTask({ operation: id, expected,range:config.range||null, isCancelled: () => !current() }); }
      }));
    }
    function openAdvanced() {
      if (!current()) return;
      if (kind === 'local') { PW()?.openAdvanced?.(); return; }
      advancedOverlay?.close?.();
      const opener=doc.activeElement;
      const content = kind === 'browser' ? $('playerSide') : doc.querySelector('.ms-podcast-identity');
      if (!content) return;
      const anchor = doc.createComment('shared-study-advanced-home'); content.before(anchor);
      const previousStyle = content.getAttribute('style'), previousInert = content.inert;
      const dialog = doc.createElement('dialog'); dialog.className = 'sh-existing-tools'; dialog.dataset.uiUntranslated = '';
      dialog.setAttribute('data-pw-occludes-native', 'true');
      const title = doc.createElement('h2'); title.textContent = T('İleri araçlar', 'Advanced tools');
      const close = doc.createElement('button'); close.type = 'button'; close.className = 'sh-btn'; close.textContent = T('Kapat', 'Close'); close.onclick = () => dialog.close();
      const head = doc.createElement('header'); head.append(title, close); dialog.append(head, content);
      content.inert = false; content.style.width = '100%'; content.style.maxWidth = 'none'; content.style.height = 'auto';
      dialog.addEventListener('click', event => { if (!current()) { event.preventDefault(); event.stopImmediatePropagation(); dialog.close(); } }, true);
      dialog.addEventListener('close', () => {
        if (anchor.isConnected) anchor.replaceWith(content);
        if (previousStyle === null) content.removeAttribute('style'); else content.setAttribute('style', previousStyle);
        content.inert = previousInert; dialog.remove(); if (advancedOverlay === dialog) advancedOverlay = null; if(opener?.isConnected)opener.focus({preventScroll:true}); bounds();
      }, { once: true });
      doc.body.append(dialog); advancedOverlay = dialog; dialog.showModal(); bounds();
    }
    function panel() {
      const sections = [], a11y = [];
      if (kind !== 'shelf') {
        const roles = browserSubtitleRoleCues();
        const items = [];
        for (const [role, label] of [['source', T('Özgün altyazı', 'Original subtitles')],
          ['translation', T('Çeviri altyazısı', 'Translated subtitles')]]) {
          const cues = roles[role];
          if (!cues.length) continue;
          const secondary = cues === player.cues2;
          const track = kind === 'browser' ? browserSyncTrack(secondary) : localSyncProfileKey(secondary);
          if (!track) continue;
          const offset = kind === 'browser' ? subtitleVideoTransform(secondary).offsetSeconds
            : secondary ? player.offset2 : player.offset;
          const seconds = Math.abs(offset).toLocaleString(doc.documentElement.lang || 'en', { maximumFractionDigits: 3 });
          const status = Math.abs(offset) < .0005 ? T('Kayma yok', 'No offset')
            : seconds + (offset < 0 ? T(' sn erken', ' s early') : T(' sn geç', ' s late'));
          items.push({ type: 'offset', label, text: status, run: delta => {
            if (!current() || browserSubtitleRoleCues()[role] !== cues) return;
            if (kind === 'browser') {
              if (browserSyncTrack(secondary) === track) adjustStageBrowserOffset(secondary, delta);
            } else if (localSyncProfileKey(secondary) === track) {
              const input = $(secondary ? 'sub2Offset' : 'subOffset');
              if (!input) return;
              const now = secondary ? player.offset2 : player.offset;
              input.value = String(delta === null ? 0 : Math.max(-60, Math.min(60, Math.round((now + delta) * 1000) / 1000)));
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
          } });
        }
        if (items.length) sections.push({ title: T('Altyazı zamanlaması', 'Subtitle timing'), items });
      }
      if(kind==='shelf'||kind==='local'&&F.snap()?.sourceKind==='rss')sections.push({title:T('Dinleme kuyruğu','Listening queue'),items:[{type:'button',label:T('Bu bölümü kuyruğa ekle','Add this episode to queue'),run:()=>{if(current())window.MediaShelfUI?.enqueueCurrentPodcast();}},{type:'button',label:T('Dinleme kuyruğunu yönet','Manage listening queue'),run:()=>{if(current())window.MediaShelfUI?.openQueue();}}]});
      if(kind==='shelf'){
        sections.push({title:T('Podcast işlemleri','Podcast tasks'),items:[...actions(),{type:'button',label:T('Döküm, Whisper ve çeviri araçları','Transcript, Whisper and translation tools'),run:openAdvanced}]});
      } else if (kind === 'browser') {
        const tracks = (player.browserTracks || []).filter((t) => !t.sourceMismatch), s1 = $('browserTrackSelect'), s2 = $('browserTrackSelect2'), items = [];
        if (tracks.length) {
          const opts = [{ value: '', label: '—' }].concat(tracks.map((t) => ({ value: t.id, label: trackLabel(t) })));
          const set = (sel, v) => { if (!current() || !sel) return; sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); };
          items.push({ type: 'select', label: T('Kaynak izi', 'Source track'), value: s1?.value || '', options: opts, onChange: (v) => set(s1, v) });
          items.push({ type: 'select', label: T('Çeviri izi (isteğe bağlı)', 'Translation track (optional)'), value: s2?.value || '', options: opts, onChange: (v) => set(s2, v) });
          const two = !!s2?.value && s2.value !== s1?.value, loadBtn = () => two ? $('browserTrackLoadPair') : $('browserTrackLoad');
          items.push({ type: 'button', primary: true, label: T('Yükle', 'Load'), hint: !s1?.value ? T('Önce bir kaynak izi seç.', 'Choose a source track first.') : '', disabled: !s1?.value || !!loadBtn()?.disabled, run: () => { if (!current() || loadBtn()?.disabled) return; lastAction = loadBtn; loadBtn()?.click(); } });
          const tr = mirror(() => $('browserTrackTranslate'), T('Yükle ve çevir', 'Load and translate')); if (tr) items.push(tr);
        } else items.push({ type: 'note', text: T('Bu sayfada erişilebilir altyazı izi bulunamadı. Aşağıdaki Whisper seçenekleri kullanılabilir.', 'No accessible caption track found on this page. Use the Whisper options below.') });
        sections.push({ title: T('Altyazı izleri', 'Caption tracks'), items });
        const wh = ['browserWhisperTranslate', 'browserLiveAsr'].map((id) => mirror(() => doc.querySelector(`.browser-study-actions [data-study-action="${id}"]`))).filter(Boolean);
        sections.push({ title: T('Whisper ve çeviri', 'Whisper and translation'), items: wh.length ? wh : [{ type: 'note', text: T('Bu kaynak için Whisper işlemi sunulmuyor.', 'No Whisper action is offered for this source.') }] });
      } else {
        const sourceActions=F.snap()?.sourceKind==='rss'?[...actions(),{type:'button',label:T('Podcast / Whisper ve çeviri araçları','Podcast / Whisper and translation tools'),run:()=>{if(current())window.PlayerSourceCatalogIntegration?.podcastTools?.();}}]:[mirror(()=>$('makeSubsBtn'),T('Whisper ile altyazı oluştur','Create subtitles with Whisper')),mirror(()=>$('makeTransBtn'),T('Yüklü altyazıyı çevir','Translate loaded subtitles'))];
        const loc = [...sourceActions, mirror(() => $('playerPickSub'), T('Altyazı dosyası seç', 'Choose a subtitle file')), {type:'button',label:T('Tüm oynatıcı ayarları','All player settings'),run:openAdvanced}].filter(Boolean);
        sections.push({ title: T('Altyazı ve Whisper', 'Subtitles and Whisper'), items: loc.length ? loc : [{ type: 'note', text: T('Bu kaynak için altyazı işlemi sunulmuyor.', 'No subtitle task is offered for this source.') }] });
      }
      if(kind==='browser')sections.push({title:T('İleri araçlar','Advanced tools'),items:[{type:'button',label:T('Tüm altyazı ve tarayıcı araçları','All caption and browser tools'),run:openAdvanced}]});
      sections.push({ title: T('Asistan', 'Assistant'), items: [{ type: 'button', label: T('Asistana sor', 'Ask assistant'), hint: T('Mevcut asistan penceresi, bu medyanın bağlamıyla açılır.', 'Opens the existing assistant window with this media as context.'), run: () => { if (current()) window.api.showAssistant?.(); } }] });
      sections.push({title:T('Oynatma ve görünüm','Playback and view'),items:[{type:'range',label:T('Ses düzeyi','Volume'),value:kind==='shelf'?num($('mediaShelfAudio')?.volume??1):kind==='browser'?num(player.browserVolume??1):num($('playerVideo')?.volume??1),onChange:value=>{if(current())dispatch('setVolume',{volume:Number(value)});}}, {type:'button',label:T('Sahneyi tam ekran aç','Open stage fullscreen'),run:()=>{if(!current())return;if(doc.fullscreenElement)doc.exitFullscreen?.();else host?.requestFullscreen?.();}}]});
      return { job: job(), sections };
    }
    return {
      caps: { loop: true, save: typeof window.api.upsertResearchAnnotation==='function', cinema:kind==='local', study:true, word:kind!=='shelf' },
      identity, panel, actions,
      recovery: () => current() && (kind === 'shelf' ? window.MediaShelfUI?.playbackRecovery()
        : activePlaybackRecovery() && { ...activePlaybackRecovery(), run: runPlaybackRecovery }),
      processing:kind==='shelf'||F.snap()?.sourceKind==='rss'?()=>({duration:F.snap()?.duration}):null,
      info: () => {
        const s=F.snap(),l=F.langs(),audio=kind==='local'&&player.workspaceAudio;
        const podcast=s?.sourceKind==='rss'&&audio?.generation===s.generation&&audio.mediaKey===s.mediaKey;
        const duration=s?.duration,published=audio?.publisherDuration;
        const chapterTiming=podcast&&audio.publisherTiming&&Number.isFinite(duration)&&Number.isFinite(published)
          &&Math.abs(duration-published)<=Math.min(3,Math.max(1,published*.01));
        return { title: F.mediaTitle() || s?.title || '', sub: F.sub(), eyebrow: F.eyebrow?.() || (kind === 'browser' ? T('Şimdi çalıyor', 'Now playing') : kind === 'shelf' ? T('Podcast', 'Podcast') : T('Yerel oynatıcı', 'Local player')), cover: F.cover(), tint: null,
        chapters:podcast?(audio.publisherChapters||[]).map(chapter=>({...chapter,t:chapterTiming&&chapter.t!==null&&chapter.t<duration?chapter.t:null})):kind!=='local'?[]:(player.chapters||[]).filter(c=>Number.isFinite(c.start)&&c.start>=0&&(!s?.duration||c.start<s.duration)).map(c=>({t:c.start,label:String(c.title||T('Bölüm','Chapter'))})),
        queue:kind==='local'?(player.playlist||[]).map((file,index)=>({index,title:window.PlayerUiKit?.displayTitle(String(file).split(/[\\/]/).pop())||String(file)})).slice(Math.max(0,player.playlistIndex+1),Math.max(0,player.playlistIndex+1)+2):[],native:kind==='local'&&!!window.NativePlayerUI?.active(),audio:kind==='shelf'||s?.sourceKind==='rss'||kind==='local'&&num($('playerVideo')?.readyState)>=2&&!num($('playerVideo')?.videoWidth),langs:l }; },
      state: () => {
        const s = F.snap();
        if (!s) return { time: 0, duration: 0, paused: true, rate: 1, rows: [], rev: 'none', canSeek: false };
        const r = rowsFor(s);
        if (ownLoop && ownLoop.revision !== r.rev) {
          const index = r.rows.findIndex((row, i) => row.id === ownLoop.cueId && r.meta[i]?.trackId === ownLoop.trackId
            && row.timed && row.start === ownLoop.a && row.end === ownLoop.b);
          if (index < 0) clearOwnedLoop();
          else Object.assign(ownLoop, { row: index, revision: r.rev });
        }
        const loopRow = ownLoop && activeLoop(s, ownLoop) ? ownLoop.row : -1;
        if (loopRow < 0) ownLoop = null;
        return { time: num(s.time), duration: num(s.duration), paused: !!s.paused, rate: num(s.rate) || 1, volume: kind === 'shelf' ? num($('mediaShelfAudio')?.volume ?? 1) : kind === 'browser' ? num(player.browserVolume ?? 1) : num($('playerVideo')?.volume ?? 1), rows: r.rows, rev: cache.rev, untimed: r.untimed, timingNotice:F.timingNotice?.()||'', canSeek: s.capabilities?.seek?.support === 'yes', loopRow };
      },
      slot: (m) => { const el = F.slot(m); if (el) { el.classList.add('sh-slot-fill'); bounds(); } return el; },
      releaseSlot: () => { clearOwnedLoop(); disposed = true; F.unslot(); restore(); F.dispose(); },
      cmd(t, v, expectedRevision) {
        if (t === 'loop' && !(v && v.on)) { clearOwnedLoop(); return Promise.resolve({ ok: true }); }   // kendi A–B döngümüzü her durumda kapat
        const s = F.snap(); if (!current()) return Promise.resolve(stale);
        rowsFor(s);
        if(expectedRevision && expectedRevision!==cache.rev && ['seekCue','loop','replay','prevCue','nextCue','wordInfo','wordSave','wordLookup','openQueued','save'].includes(t))return Promise.resolve({ok:false,code:'stale-track',message:T('Altyazı değişti; satırı yeniden seçin.','The transcript changed; select the line again.')});
        switch (t) {
          case 'save': {
            const index=typeof v==='number'?v:v?.row,row=cache.rows[index];
            if(!row||!Number.isInteger(index)||typeof window.api.upsertResearchAnnotation!=='function')return Promise.resolve({ok:false,code:'unsupported'});
            const excerpt=v?.excerpt===undefined?'':String(v.excerpt).trim();
            if(v?.excerpt!==undefined&&(!excerpt||!row.src.includes(excerpt)))return Promise.resolve({ok:false,code:'invalid-excerpt',message:T('Kaynak metinden bir bölüm seçin.','Select a passage from the source text.')});
            const source=excerpt||row.src,translation=excerpt?'':row.trs.join('\n\n');
            if(source.length>4000||translation.length>4000)return Promise.resolve({ok:false,code:'passage-too-long',message:T('Metin kayıt sınırını aşıyor. Kaynak metinden daha kısa bir bölüm seçin (en fazla 4000 karakter).','The text exceeds the save limit. Select a shorter passage from the source text (up to 4000 characters).')});
            const podcast=kind==='shelf'||s.sourceKind==='rss',audio=kind==='local'&&player.workspaceAudio?.mediaKey===s.mediaKey&&player.workspaceAudio?.generation===s.generation?player.workspaceAudio:null;
            const payload={type:excerpt&&excerpt.length<=120&&!/\s/u.test(excerpt)?'word':'quote',mediaId:s.mediaKey,mediaType:podcast?'podcast':kind==='browser'?'browser':'local',mediaTitle:F.mediaTitle(),mediaUrl:kind==='browser'?window.BrowserPlaceUrl?.redactUrlSensitiveParams?.(player.browserPageUrl)||'':'',
              source,translation,...(String(v?.note||'').trim()?{note:String(v.note)}:{}),timed:row.timed,start:row.timed?row.start:null,end:row.timed?row.end:null,
              trackId:cache.meta[index]?.trackId||'readonly',cueId:row.id,sourceVersion:s.sourceVersion,sourceBinding:s.sourceBinding,episodeIdentity:s.episodeIdentity,playbackOwner:s.playbackOwner,
              sourceEntryId:audio?.entryId||s.entryId||''};
            return Promise.resolve(window.api.upsertResearchAnnotation(payload)).then(result=>result?.ok?{ok:true,annotation:result.annotation}: {ok:false,code:'save-failed',message:T('Not kaydedilemedi.','Could not save the note.')}).catch(()=>({ok:false,code:'save-failed',message:T('Not kaydedilemedi.','Could not save the note.')}));
          }
          case 'advanced':openAdvanced();return Promise.resolve({ok:true});
          case 'assistant':window.api.showAssistant?.();return Promise.resolve({ok:true});
          case 'fullscreen':return Promise.resolve(doc.fullscreenElement?doc.exitFullscreen?.():host?.requestFullscreen?.()).then(()=>({ok:true}));
          case 'wordInfo':case 'wordSave':case 'wordLookup':return wordAction(t,v);
          case 'openQueued': if(kind!=='local'||!Number.isInteger(v)||v<=player.playlistIndex||v>=player.playlist.length)return Promise.resolve({ok:false,code:'invalid-range'});return Promise.resolve(playPlaylistDelta(v-player.playlistIndex)).then(()=>({ok:true}));
          case 'toggle': return dispatch('togglePlay');
          case 'pause': return s.paused ? Promise.resolve({ ok: true }) : dispatch('togglePlay');
          case 'seek': return dispatch('seek', { time: Math.max(0, Math.min(num(s.duration) || Infinity, v)) });
          case 'seekBy': return dispatch('seek', { time: Math.max(0, Math.min(num(s.duration) || Infinity, num(s.time) + v)) });
          case 'seekCue': return cache.rows[v]?.timed ? seekRow(v) : Promise.resolve({ ok: false, code: 'untimed', message: T('Zamansız satıra atlanamaz.', 'Cannot seek to an untimed line.') });
          case 'prevCue': case 'nextCue': { const i = neighbor(num(s.time), t === 'prevCue' ? -1 : 1); return i >= 0 ? seekRow(i) : Promise.resolve({ ok: false, code: 'none', message: T('Zamanlı cümle yok.', 'No timed sentence.') }); }
          case 'replay': {
            const i = idxAt(num(s.time));
            if (i < 0) return Promise.resolve({ ok: false, code: 'none', message: T('Şu an çalan zamanlı cümle yok.', 'No timed sentence is playing.') });
            return seekRow(i).then(result => {
              if (!result.ok) return result;
              if (!current()) return stale;
              if (s.paused && F.snap()?.paused) return dispatch('togglePlay');
              return result;
            });
          }
          case 'rate': return dispatch('setRate', { rate: v });
          case 'volume': return dispatch('setVolume',{volume:v});
          case 'loop': {
            const r = cache.rows[v.row];
            if (!r?.timed) return Promise.resolve({ ok: false, code: 'none', message: T('Döngü için zamanlı cümle gerekli.', 'A timed sentence is required for looping.') });
            const hasLoop = kind === 'shelf' ? !!s.loopRange : player.abA !== null && player.abB !== null;
            if (hasLoop && (!ownLoop || !activeLoop(s, ownLoop))) return Promise.resolve({ ok: false, code: 'busy', message: T('Zaten bir A–B döngüsü var; önce onu kapat.', 'An A–B loop already exists; turn it off first.') });
            const previous = ownLoop;
            const range = ownLoop = { a:r.start, b:r.end, row:v.row, cueId:r.id, trackId:cache.meta[v.row]?.trackId, revision:cache.rev };
            return dispatch('setAB', {a:range.a,b:range.b}).then(result => {
              if (!result.ok && ownLoop === range) ownLoop = previous;
              return result;
            });
          }
          case 'copy': window.api.copyText?.(v); return Promise.resolve({ ok: true });
          default: return Promise.resolve({ ok: false, code: 'unsupported' });
        }
      }
    };
  }

  function unmount() { advancedOverlay?.close?.(); if (inst) { inst.destroy(); inst = null; } restore(); host?.remove(); host = null; layer.classList.remove('cp-sahne-on');doc.body.classList.remove('shelf-sahne-on');const old=doc.querySelector('.ms-podcast-workspace');if(old)old.inert=false; key = ''; }
  function mount(kind, mode, intro, prefs) {
    const k = `${kind}:${mode}`; if (inst && key === k) return; const had=!!inst,active=doc.activeElement;
    if(!had&&active?.matches?.('button,a,summary')&&!active.closest('.sh-host'))stageOpener=active;
    unmount();
    host = doc.createElement('div'); host.className = 'sh-host'; host.dataset.uiUntranslated=''; host.style.top = kind==='shelf'?'var(--window-controls-safe-height,38px)':headH() + 'px'; if(kind==='shelf'){host.classList.add('sh-shelf-host');doc.body.append(host);doc.body.classList.add('shelf-sahne-on');const old=doc.querySelector('.ms-podcast-workspace');if(old)old.inert=true;}else{layer.append(host);layer.classList.add('cp-sahne-on');}
    inst = new Sahne(host, makeAdapter(kind, mode), {
      mode, intro: intro && !had, prefs,
      onMode: (m, p) => {
        if(kind==='shelf'||kind==='local')window.MediaShelfUI?.rememberQueueScene?.(m);
        const restoreTabFocus = !!inst?.root.contains(doc.activeElement) && doc.activeElement.matches('[role="tab"][data-mode]');
        sticky = p;
        if(kind==='shelf')mount('shelf',m==='study'?'study':'podcast',false,p);
        else { if (kind === 'browser') window.BrowserPodcastUI?.setMode(m === 'podcast'); else {localView=m==='cinema'?'cinema':'study';PW().setPodcastMode(m==='podcast');} evaluate(); }
        if(restoreTabFocus)inst?.root.querySelector('[role="tab"][aria-selected="true"]')?.focus({preventScroll:true});
      },
      onClose: () => {
        const opener=stageOpener;stageOpener=null;
        if(kind==='shelf'){window.MediaShelfUI?.closePodcastMode?.();unmount();}
        else{
          if(kind==='browser')window.BrowserStudy?.close?.();
          else{localView='cinema';PW().setPodcastMode(false);SS.set('cp-sahne-off','1');}
          evaluate();
        }
        const fallback=kind==='browser'?doc.querySelector('[data-podcast-view]'):$('cpSahneBtn');
        (opener?.isConnected&&!opener.disabled?opener:fallback)?.focus({preventScroll:true});
      },
      onClassic: () => { if(mode!=='cinema'){void inst?.run('advanced');return;} SS.set('cp-sahne-off', '1'); evaluate(); },
      onSource: (id, p) => { sticky = p; const [a, b] = key.split(':'); unmount(); if(a==='shelf'){if(window.MediaShelfUI?.readSnapshot())void window.CinemaSahne.openShelf({mode:b}).catch(error=>console.warn('shelf-sahne',error));return;}mount(a,b,false,p); }   // kaynak değişti: döngü/uyku bu örnekle birlikte biter, yenisi temiz açılır
    });
    key = k;
    if(!had&&stageOpener===active)inst.root.querySelector('[role=tab][aria-selected=true]')?.focus({preventScroll:true});
  }
  let sticky;
  const evaluate = safe(() => {
    if (!ready()) return; if(key.startsWith('shelf:')&&layer.classList.contains('hidden')){if(window.MediaShelfUI?.readSnapshot())return;unmount();} let want = null;
    if (!layer.classList.contains('hidden')) {
      if (layer.classList.contains('workspace-browser')) { if (layer.classList.contains('browser-podcast-presentation')) want = ['browser', 'podcast']; else if (layer.classList.contains('browser-study-mode')) want = ['browser', 'study']; }
      else if ((localView!=='cinema'||PW().isPodcastMode()||SS.get('cp-sahne-off')!=='1') && PW().bridge && !document.getElementById('playerWorkspaceV3')?.hidden && !layer.classList.contains('source-catalog-open')) want = ['local', PW().isPodcastMode() ? 'podcast' : localView];
    }
    if (!want) { if (inst) unmount(); entries(); return; }
    mount(want[0], want[1], true, sticky); entries();
  });
  const entries = safe(() => {
    const actions = doc.querySelector('.player-head-actions');
    if (actions && !$('cpSahneBtn')) { const b = doc.createElement('button'); b.type = 'button'; b.id = 'cpSahneBtn'; b.className = 'catalog-entry player-catalog-entry'; b.dataset.uiUntranslated = ''; b.textContent = T('Sahne', 'Stage'); b.onclick = () => { if (!PW()?.bridge) return; SS.set('cp-sahne-off', '0'); evaluate(); }; actions.prepend(b); }
    const lb = $('cpSahneBtn'); if (lb) { lb.textContent=T('Sahne','Stage'); lb.hidden = layer.classList.contains('workspace-browser'); const ok = !!PW()?.bridge; lb.disabled = !ok; lb.title = ok ? T('Çift dilli sahne (yerel oynatıcı)', 'Bilingual stage (local player)') : T('Önce bir medya aç.', 'Open a media file first.'); }
  });

  new MutationObserver(evaluate).observe(layer, { attributes: true, attributeFilter: ['class'] });
  doc.addEventListener('ui-locale-change', () => { if (inst) { const k = key, p = inst.prefs(); unmount(); const [a, b] = k.split(':'); mount(a, b, false, p); } });
  const off = PW()?.subscribe?.(() => { if(!document.hidden)evaluate(); });
  doc.addEventListener('visibilitychange',()=>{doc.documentElement.dataset.sahneHidden=String(document.hidden);if(!document.hidden)evaluate();});
  window.addEventListener('resize',()=>{if(host&&!key.startsWith('shelf:'))host.style.top=headH()+'px';});
  doc.addEventListener('click',e=>{if(e.target.closest?.('[data-podcast-view]')){SS.set('cp-sahne-off','0');queueMicrotask(evaluate);}},true);
  window.CinemaSahne = Object.freeze({async openShelf({mode='podcast'}={}){const owner=window.MediaShelfUI?.readSnapshot();if(!owner)return {ok:false,code:'no-source'};if(!window.MediaShelfUI.isPodcastMode?.())await window.MediaShelfUI.openPodcastMode();const now=window.MediaShelfUI.readSnapshot();if(now?.mediaKey!==owner.mediaKey||now?.generation!==owner.generation)return {ok:false,code:'stale-source'};mount('shelf',mode==='study'?'study':'podcast',false);return {ok:true};},open({mode='cinema'}={}){SS.set('cp-sahne-off','0');if(player.workspaceMode==='browser'){window.BrowserStudy?.open?.({preservePodcast:true});window.BrowserPodcastUI?.setMode(mode==='podcast');}else{localView=mode==='cinema'?'cinema':'study';PW()?.setPodcastMode(mode==='podcast');}evaluate();},close(){SS.set('cp-sahne-off','1');unmount();},evaluate,get current(){return inst;}});
  evaluate();
})();
