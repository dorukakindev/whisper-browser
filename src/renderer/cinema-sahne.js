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
    const sourceVersion = () => `observed:${tabId()}:${player.mediaKey}:${player.generation}`;

    const hashText = (t) => { let h = 0; const s = String(t || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
    const projected = new Map();
    function tracks() {

      const roles = browserSubtitleRoleCues();
      const out = ['source', 'translation'].map((role) => {
        const cues = roles[role] || [], secondary = cues === player.cues2;
        const loaded = (player.browserTracks || []).find((t) => t.id === (secondary ? player.browserLoadedTrackId2 : player.browserLoadedTrackId));
        // Resolve source proof once for this projection, rather than at every cue/word endpoint.
        const timeTransform = subtitleVideoTransform(secondary);
        const id = `browser:${tabId()}:${loaded?.id || (secondary ? 'secondary' : 'primary')}:${role}`;
        const language = loaded?.language || loaded?.lang || '';
        let h = 7;
        for (const cue of cues) {
          h = (h * 31 + hashText(cue.id) + hashText(cue.start) + hashText(cue.end) * 7
            + hashText(cue.text) + hashText(cue.qualityWarning)) | 0;
          for (const word of cue.wordRanges || []) {
            h = (h * 31 + hashText(word.start) + hashText(word.end) + hashText(word.timeStart) + hashText(word.timeEnd)) | 0;
          }
        }
        const revision = JSON.stringify([sourceVersion(), secondary, language, cues.length, h, timeTransform]);
        const previous = projected.get(role);
        if (previous?.id === id && previous.revision === revision && previous.input === cues) return previous.track;
        const mapped = cues.map((cue, index) => ({ ...cue, id: String(cue.id ?? index),
          rawStart: cue.start, rawEnd: cue.end,
          start: subtitleVideoTime(cue.start, secondary, timeTransform), end: subtitleVideoTime(cue.end, secondary, timeTransform) }));
        const track = { id, revision, role, timed: true, offsetSeconds: 0, secondary, timeTransform, language, cues: mapped };
        projected.set(role, { id, revision, input: cues, track });
        return track;
      });
      return out;
    }
    const snap = () => {
      if (!player.mediaKey) return null; const [s, t] = tracks(), dur = num(player.browserDuration) || null, seen = !!player.browserMediaSeen;
      const sample = typeof browserTabState === 'function' ? browserTabState()?.browserClockSample : null;
      const live = sample?.live === true && sample.mediaKey === player.mediaKey && sample.generation === player.generation;
      return { mediaKey: player.mediaKey, generation: player.generation, title: player.browserPageTitle || '', time: num(player.browserTime), duration: dur, paused: !!player.browserPaused, adPlaying: !!player.browserAdPlaying, rate: num(player.browserRate) || 1, live, sourceVersion: sourceVersion(), projectedTracks: [s, t], sourceTrack: { id: s.id, revision: s.revision }, secondaryTrack: t.cues.length ? { id: t.id, revision: t.revision } : null, capabilities: { seek: { support: live || player.isLive || player.browserAdPlaying ? 'no' : (seen && dur ? 'yes' : 'unknown') } } };
    };
    const sampleFor = state => {
      const sample = typeof browserTabState === 'function' ? browserTabState()?.browserClockSample : null;
      return sample && sample.mediaKey === state.mediaKey && sample.generation === state.generation && sample.time === state.time ? sample : null;
    };
    const displayTime = state => {
      const sample = sampleFor(state);
      if (!sample?.advancing || sample.waiting || sample.seeking || state.paused || state.adPlaying || !(state.duration > 0)) return state.time;
      const elapsed = Math.max(0, Math.min(1, (window.performance.now() - sample.at) / 1000));
      return Math.min(state.duration, state.time + elapsed * state.rate);
    };
    const role = () => { const [s] = tracks(); return { trackId: s.id, trackRevision: s.revision, cues: s.cues, offsetSeconds: 0 }; };
    async function exec(c) {
      const id = tabId(), go = async (a, v) => norm(await browserCommand(a, v, id));
      switch (c.type) {
        case 'seekCue': {
          const cues = role().cues;
          const cue = cues.find(x => x.id === c.cueId);
          if (!cue) return { ok: false, code: 'unknown-cue' };
          const start = Math.max(0, cue.start);
          let end = Math.min(cue.end, num(player.browserDuration) || Infinity);
          // The latest overlapping cue wins the active highlight.
          for (const next of cues) {
            if (next.start > cue.start && next.start < end && next.end > next.start) end = next.start;
          }
          if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || !(end > start)) return { ok: false, code: 'invalid-range', message: T('Altyazı satırının zamanı geçersiz veya video süresinin dışında.', 'The caption timing is invalid or outside the video duration.') };
          return go('seek', TM().landingTime(start, end));
        }
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
    const loadedLangs = () => { const roles = browserSubtitleRoleCues(), byId = (id) => (player.browserTracks || []).find((t) => t.id === id), t1 = byId(player.browserLoadedTrackId), t2 = byId(player.browserLoadedTrackId2); const of = (cues) => cues && cues.length ? (cues === player.cues2 ? t2 : t1) : null; const s = of(roles.source), r = of(roles.translation); return { src: roles.source.length ? langCode(s?.language || s?.lang || (roles.source === player.cues2 ? player.sub2Lang : player.subLang)) : null, tr: roles.translation.length ? langCode(r?.language || r?.lang || (roles.translation === player.cues2 ? player.sub2Lang : player.subLang)) : null }; };
    return { kind: 'browser', tab: tabId, sourceVersion, snap, displayTime, sampleFor, tracks, dispatch: (c) => bridge.dispatch(c), dispose: () => bridge.dispose(), words: wordsOf, langs: loadedLangs, mediaTitle: () => player.browserPageTitle || $('playerTitle')?.textContent || '', sub: () => { try { return browserTabState()?.mediaPublisher || new URL(player.browserPageUrl).hostname.replace(/^www\./, ''); } catch (_) { return ''; } }, cover: () => { try { const u = typeof currentBrowserYoutubeUrl === 'function' ? currentBrowserYoutubeUrl() : ''; if(u)return window.MediaHomeModel?.thumbnail?.({url:u})||'';const sample=browserTabState()?.browserClockSample;return sample?.mediaKey===player.mediaKey&&sample.generation===player.generation?sample.artworkUrl||'':''; } catch (_) { return ''; } }, slot: () => adopt($('browserViewSlot')), unslot: () => $('browserViewSlot')?.classList.remove('sh-slot-fill') };
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
    return { kind: 'local', tab: () => '', snap: () => PW().snapshot(), tracks: () => PW().getTranscriptTracks(), dispatch: (c) => PW().executeExisting(c), dispose() {}, words, langs, mediaTitle: () => podcast()?.title || window.PlayerUiKit?.displayTitle($('playerTitle')?.textContent || '') || '', sub: () => podcast() ? [podcast().publisher,podcast().publisherKind==='web-episode'?T('Yayıncı sayfası','Publisher page'):T('Yayıncı RSS','Publisher RSS')].filter(Boolean).join(' · ') : $('playerMeta')?.textContent || '', cover: () => podcast()?.image || '', timingNotice: () => podcast()?.transcriptTimingNotice || '', eyebrow: () => podcast() ? (podcast().publisherKind==='web-episode'?T('Web podcasti','Web podcast'):T('Podcast · RSS','Podcast · RSS')) : T('Yerel oynatıcı','Local player'), slot, unslot };
  }

  function shelfFacade(){
    const shelf=()=>window.MediaShelfUI;
    const reading=new Map();
    const empty=role=>({id:'shelf-empty:'+role,revision:'none',role,timed:false,offsetSeconds:0,cues:[]});
    return {kind:'shelf',tab:()=>'',snap:()=>shelf()?.readSnapshot(),tracks:()=>['source','translation'].map(role=>{
      const all=shelf()?.getTranscriptTracks?.()||[],track=all.find(t=>(t.role||'source')===role)||empty(role);
      if(track.timed===false && track.recordedCues?.length)return {...track,cues:track.recordedCues};
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
    }),dispatch:c=>shelf().executeExisting(c),dispose(){},words:()=>null,langs:()=>({}),timingNotice:()=>{
      const track=shelf()?.getTranscriptTracks?.().find(t=>t.role==='source');
      return track?.timingState==='needs-review' && track.timestamped
        ? T('Bu dökümün zamanları kayıtlı. Açık RSS sesiyle eşleşmesi doğrulanmadığından takip ve satıra atlama kapalı.', 'This transcript has saved timestamps. Following and sentence seeking are disabled because alignment with the open RSS audio is unverified.')
        : '';
    },mediaTitle:()=>shelf()?.readSnapshot()?.title||'',sub:()=>T('Yayıncı RSS','Publisher RSS'),cover:()=>shelf()?.podcastInfo?.()?.image||'',slot:()=>null,unslot(){} };
  }

  /* ── Ortak adaptör: cepheden Sahne sözleşmesine ── */
  function makeAdapter(kind, mode) {
    const F = kind === 'browser' ? browserFacade() : kind === 'shelf' ? shelfFacade() : localFacade();
    const first = F.snap(); const bound = first ? { mediaKey: first.mediaKey, generation: first.generation, sourceVersion: first.sourceVersion } : { mediaKey: '', generation: -1 };
    const identity = () => { if (kind === 'browser') return F.sourceVersion(); const s = F.snap(); return `${kind}|${F.tab()}|${s ? s.mediaKey : ''}|${s ? s.generation : ''}|${s?.sourceVersion || ''}`; };
    let cache = { rev: '', rows: [], meta: [], untimed: false }, ownLoop = null, disposed = false, lastAction = null;
    let playbackIntent = 0;
    const current = (now = F.snap()) => !disposed && !!now && now.mediaKey === bound.mediaKey && now.generation === bound.generation && (!bound.sourceVersion || now.sourceVersion === bound.sourceVersion);
    const activeLoop = (s, range) => kind === 'shelf' ? s?.loopRange?.a === range.a && s.loopRange?.b === range.b
      : player.abA === range.a && player.abB === range.b;
    function clearOwnedLoop() {
      const range = ownLoop; ownLoop = null;
      if (range?.preview) playbackIntent++;
      if (!range || !current() || !activeLoop(F.snap(), range)) return;
      if (kind === 'shelf') void dispatch('clearAB', {a:range.a,b:range.b});
      else setAB(null, null);
    }
    function build(src, sec, s) {
      const meta = [], secById = new Map(sec.cues.map((c) => [c.id, c]));
      const partial = sec.status === 'partial' || /\.partial\.srt$/i.test(sec.id);
      const language = sec.language || (partial ? 'tr' : F.langs().tr);
      const sourceByTime = new Map(src.cues.map(cue => [cue.start+':'+cue.end,cue]));
      const matchingSource = sec.cues.map(cue => sourceByTime.get(cue.start+':'+cue.end));
      const suspectIndices = window.TranslationReviewSummary?.untranslatedIndices(matchingSource, sec.cues, String(language).toLowerCase().split('-')[0]) || [];
      const suspected = new Set(suspectIndices.map(index => sec.cues[index].id));
      const missingTranslation = cues => cues.some(cue => cue.translationMissing) ? 'confirmed'
        : cues.some(cue => suspected.has(cue.id)) ? 'suspected' : '';
      if(src.timed===false&&src.timestamped&&src.cues.length){
        const translations=new Map(sec.timestamped?sec.cues.map(c=>[c.start+':'+c.end,c]):[]);
        return {rows:src.cues.map(c=>{
          const translated = translations.get(c.start+':'+c.end);
          return {id:c.id,start:0,end:0,timed:false,recordedRange:{start:c.start,end:c.end},src:c.text,trs:translated?[translated.text]:[],translationMissing:translated?missingTranslation([translated]):'',unc:[],words:null};
        }),meta:[],untimed:true};
      }
      if(src.timed===false && src.cues.length){
        return {rows:[{id:'plain-source',start:0,end:0,timed:false,src:src.cues.map(c=>c.text).join('\n\n'),trs:sec.cues.length?[sec.cues.map(c=>c.text).join('\n\n')]:[],unc:[],words:null}],meta:[],untimed:true};
      }
      if (src.cues.length) {
        const trows = TM().buildTranscriptRows({ sourceTrack: src, secondaryTrack: sec.cues.length ? sec : null, mediaKey: s.mediaKey, generation: s.generation });
        const byId = new Map(src.cues.map((c) => [c.id, c])), trackTimed = src.timed !== false;
        const rows = trows.map((r) => {
          const timed = trackTimed && Number.isFinite(r.videoStart) && Number.isFinite(r.videoEnd) && r.videoEnd > r.videoStart;
          meta.push({ cueId: r.cueId, trackId: r.trackId, trackRevision: r.trackRevision });
          const matched = (r.secondaryCueIds || []).map(id => secById.get(id)).filter(cue => cue?.text?.trim());
          const offset = num(sec.offsetSeconds);
          const translationRanges = matched.map(cue => sec.timed !== false && Number.isFinite(cue.start)
            && Number.isFinite(cue.end) && cue.end > cue.start ? { start: cue.start + offset, end: cue.end + offset } : null);
          const translationRange = translationRanges.reduce((first, range) =>
            range && (!first || range.start < first.start) ? range : first, null);
          const copied = matched.some(c => String(c.text).trim() === String(r.sourceText).trim() && String(c.text).trim().length > 10);
          return { id: r.cueId, trackId:src.id, start: timed ? r.videoStart : 0, end: timed ? r.videoEnd : 0, timed, src: String(r.sourceText || ''), trs: matched.map(c=>c.text), translationCueIds: matched.map(c=>c.id), translationRanges, translationRange, translationMissing:missingTranslation(matched), translationReview:copied||matched.some(c=>c.qualityWarning), unc: r.pairing === 'uncertain' ? (r.secondaryCandidates || []).map((c) => c.text) : [], words: timed ? F.words(byId.get(r.cueId), src) : null };
        });
        const paired = new Set(rows.flatMap(row => row.translationCueIds));
        const standalone = mode === 'cinema' || sec.timed === false ? [] : sec.cues.filter(cue => !paired.has(cue.id)
          && cue.text?.trim() && Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start);
        if (!standalone.length) return { rows, meta, untimed: !trackTimed };
        const entries = rows.map((row, i) => ({ row, binding: meta[i] }));
        for (const cue of standalone) {
          const start = cue.start + num(sec.offsetSeconds), end = cue.end + num(sec.offsetSeconds);
          entries.push({
            row: { id: cue.id, trackId:sec.id, start, end, timed: true, src: '', trs: [cue.text], unc: [], words: null,
              translationCueIds: [cue.id], translationRange: { start, end }, standaloneTranslation: true, translationMissing:missingTranslation([cue]) },
            binding: { cueId: cue.id, trackId: sec.id, trackRevision: sec.revision }
          });
        }
        entries.sort((a, b) => a.row.start - b.row.start);
        return { rows: entries.map(entry => entry.row), meta: entries.map(entry => entry.binding), untimed: !trackTimed };
      }
      if (sec.cues.length) { // yalnız çeviri izi yüklü: kaynak sanılmaz, yine de okunabilir
        const timedTrack = sec.timed !== false;
        const rows = sec.cues.map(cue => {
          const timed = timedTrack && Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start;
          const start = timed ? cue.start + num(sec.offsetSeconds) : 0;
          const end = timed ? cue.end + num(sec.offsetSeconds) : 0;
          meta.push({ cueId: cue.id, trackId: sec.id, trackRevision: sec.revision });
          return { id: cue.id, trackId: sec.id, start, end, timed, src: '', trs: [String(cue.text || '')],
            translationRange: timed ? { start, end } : null, translationMissing:missingTranslation([cue]), unc: [], words: null };
        });
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
      const [src, sec] = s.projectedTracks || F.tracks(); const rev = `${src.id}|${src.revision}|${src.offsetSeconds}|${sec.id}|${sec.revision}|${sec.offsetSeconds}|${sec.language||''}|${sec.missingRevision||''}|${s.mediaKey}|${s.generation}`;
      if (rev !== cache.rev) cache = { rev, ...build(src, sec, s), captionTracks: [src, sec] };
      return cache;
    }
    const dispatch = (type, args = {}, rowIdx = -1) => {
      if (type === 'seek' || type === 'seekCue' || type === 'togglePlay') playbackIntent++;
      const m = rowIdx >= 0 ? cache.meta[rowIdx] : null, range=ownLoop;
      const target=type==='seek'?args.time:type==='seekCue'?cache.rows[rowIdx]?.start:undefined;
      return Promise.resolve(F.dispatch({ type, mediaKey: bound.mediaKey, generation: bound.generation, ...(m ? { trackId: m.trackId, trackRevision: m.trackRevision } : {}), ...args })).then(norm).then(result=>{
        // A successful explicit jump out of this sentence must not snap back on the next media tick.
        if(result.ok&&range&&ownLoop===range&&Number.isFinite(target)&&(target<range.a||target>=range.b))clearOwnedLoop();
        return result;
      });
    };
    const landing = (start, end) => (window.PlayerTranscriptModel?.landingTime ? window.PlayerTranscriptModel.landingTime(start, end) : Math.max(0, num(start) + .01));
    function seekTranslationRange(range, snapshot) {
      const start = Math.max(0, range?.start);
      const end = Math.min(snapshot?.duration, range?.end);
      return snapshot?.capabilities?.seek?.support === 'yes'
        && Number.isFinite(range?.start) && Number.isFinite(range?.end) && end > start
        ? dispatch('seek', { time: landing(start, end) })
        : Promise.resolve({ok:false,code:'untimed',message:T('Çevirinin zamanı doğrulanamadı.', 'Translation timing is unverified.')});
    }
    function seekRow(index) {
      const row = cache.rows[index];
      const snapshot = F.snap();
      if (!row.src && row.translationRange) return seekTranslationRange(row.translationRange, snapshot);
      return cache.meta[index]?.trackId === snapshot?.sourceTrack?.id
        ? dispatch('seekCue', { cueId: row.id }, index)
        : dispatch('seek', { time: landing(row.start, row.end) });
    }
    const staleTrack = () => ({ ok: false, code: 'stale-track', message: T('Altyazı değişti; satırı yeniden seçin.', 'The transcript changed; select the line again.') });
    function timingCue(snapshot, role) {
      const track = rowsFor(snapshot).captionTracks?.[role==='translation'?1:0];
      if (!track || track.timed===false || snapshot.adPlaying || snapshot.capabilities?.seek?.support!=='yes') return null;
      const offset = num(track.offsetSeconds), time = num(snapshot.time) - offset;
      const cue = track.cues.reduce((active, item) => item.start<=time && time<item.end && (!active || item.start>=active.start) ? item : active, null);
      if (!cue) return null;
      const a=Math.max(0,cue.start+offset), b=Math.min(num(snapshot.duration),cue.end+offset);
      return b>a ? {track,cue,a,b} : null;
    }
    function timingPreviewCurrent(data, preview) {
      const track=data.captionTracks?.[preview.role==='translation'?1:0];
      return track?.id===preview.trackId && track.timed!==false && track.cues.some(cue =>
        cue.id===preview.cueId && (cue.rawStart??cue.start)===preview.rawStart
        && (cue.rawEnd??cue.end)===preview.rawEnd && cue.text===preview.text);
    }
    async function previewTiming(role, trackId) {
      const snapshot=F.snap();
      if (!current(snapshot)) return stale;
      if (ownLoop?.preview && ownLoop.role===role) {
        clearOwnedLoop();
        return {ok:true};
      }
      const selected=timingCue(snapshot,role);
      if (!selected || selected.track.id!==trackId) return staleTrack();
      if (ownLoop || (player.abA!==null && player.abB!==null)) {
        return {ok:false,message:T('Önce açık cümle veya A–B döngüsünü kapatın.','Stop the active sentence or A–B loop first.')};
      }
      const {track,cue,a,b}=selected;
      const range=ownLoop={preview:true,role,trackId:track.id,cueId:cue.id,rawStart:cue.rawStart??cue.start,
        rawEnd:cue.rawEnd??cue.end,text:cue.text,a,b,revision:cache.rev};
      try {
        const result=await dispatch('setAB',{a,b});
        if (!result.ok || ownLoop!==range || !current()) {
          if (ownLoop===range) clearOwnedLoop();
          return result.ok?stale:result;
        }
        range.confirmed=true;
        const playback=await finishReplay(dispatch('seek',{time:landing(a,b)}),snapshot.paused,cache.rev);
        if (!playback.ok && ownLoop===range) clearOwnedLoop();
        return playback;
      } catch (error) {
        if (ownLoop===range) clearOwnedLoop();
        throw error;
      }
    }
    async function finishReplay(seek, wasPaused, revision) {
      const intent = playbackIntent;
      const result = await seek;
      if (!result.ok) return result;
      const now = F.snap();
      if (!current(now)) return stale;
      if (rowsFor(now).rev !== revision) return staleTrack();
      return intent === playbackIntent && wasPaused && now.paused ? dispatch('togglePlay') : result;
    }
    const idxAt = (t) => { let at = -1; cache.rows.forEach((r, i) => { if (r.timed && !r.standaloneTranslation && r.start <= t && t < r.end && (at < 0 || r.start >= cache.rows[at].start)) at = i; }); return at; };
    function neighbor(time, direction, duration) {
      const timed = cache.rows.map((row, index) => row.timed && !row.standaloneTranslation
        && row.end > 0 && row.start < duration ? index : -1).filter(index => index >= 0);
      const active = idxAt(time);
      const anchor = cache.rows[active]?.start ?? time;
      if (direction < 0) {
        if (active >= 0 && time - anchor > 1.5) return active;
        return timed.findLast(index => cache.rows[index].start < anchor) ?? timed[0] ?? -1;
      }
      return timed.find(index => cache.rows[index].start > anchor) ?? -1;
    }
    function translationNavigation(s, command) {
      const track = cache.captionTracks?.[1];
      if (cache.untimed || !track || track.timed === false) return {};
      const offset = num(track.offsetSeconds), time = num(s.time), duration = num(s.duration);
      let active, previous, next, first;
      for (const cue of track.cues) {
        if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start || !cue.text?.trim()) continue;
        const start = Math.max(0, cue.start + offset), end = Math.min(duration, cue.end + offset);
        if (!(end > start)) continue;
        const range={start,end};
        if (first === undefined || start < first.start) first = range;
        if (start <= time && time < end && (active === undefined || start >= active.start)) active = range;
      }
      const anchor = active?.start ?? time;
      for (const cue of track.cues) {
        if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start || !cue.text?.trim()) continue;
        const start = Math.max(0, cue.start + offset);
        const end=Math.min(duration,cue.end+offset);
        if (!(end > start)) continue;
        const range={start,end};
        if (start < anchor && (previous === undefined || start > previous.start)) previous = range;
        if (start > anchor && (next === undefined || start < next.start)) next = range;
      }
      const targets={prevCue:active&&time-active.start>1.5?active:previous??first,nextCue:next,replay:active};
      if(!command)return {prevCue:targets.prevCue?.start,nextCue:next?.start,replay:active?.start};
      const range=targets[command];
      if(!range)return {};
      const end=track.cues.reduce((limit,cue)=>{
        const start=cue.start+offset;
        return start>range.start&&start<limit&&Number.isFinite(cue.end)&&cue.end>cue.start&&cue.text?.trim()?start:limit;
      },range.end);
      return {[command]:landing(range.start,end)};
    }
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

    let fullscreenPending=null;
    function toggleStageFullscreen(){
      if(!current())return Promise.resolve(stale);
      if(fullscreenPending)return fullscreenPending;
      fullscreenPending=(async()=>{
        if(doc.fullscreenElement&&doc.exitFullscreen)await doc.exitFullscreen();
        else if(!doc.fullscreenElement&&host?.requestFullscreen)await host.requestFullscreen();
        else return {ok:false,code:'unsupported'};
        return current()?{ok:true}:stale;
      })().finally(()=>{fullscreenPending=null;});
      return fullscreenPending;
    }
    function job() {
      const snap = F.snap(), service = kind === 'shelf' ? window.MediaShelfUI : snap?.sourceKind === 'rss' ? window.PlayerSourceCatalogIntegration : null;
      if (kind==='browser'&&typeof browserAudioPreparationStatus==='function') {
        const preparation=browserAudioPreparationStatus();
        if(preparation)return preparation;
      }
      if (service) {
        const status = service.podcastTaskState?.() || {}, task = status.job || {state:'idle'};
        const recovery=status.translationRetry,partial=!!recovery?.partial&&!status.preparing&&!['queued','running','failed','stopped'].includes(task.state);
        const repair=missingTranslationAction(snap,service,status);
        const canRetry=(!!recovery?.partial||recovery?.failed>0)&&!!repair&&!repair.disabled;
        return { ...task, state: status.preparing || task.state === 'queued' ? 'running' : partial?'partial':task.state,
          text: status.preparing ? T('Podcast sesi hazırlanıyor…', 'Preparing podcast audio…') : partial?(recovery.total>0?`${recovery.completed}/${recovery.total} `+T('çeviri satırı hazır.','translated lines ready.'):T('Kısmi çeviri kaydedildi.','Partial translation saved.'))+' '+(canRetry?T('Kaydedilmiş satırlar korunur; yalnız eksikleri tamamlayabilirsiniz.','Saved lines are kept; complete only the missing lines.'):T('Eksikleri tamamlamak için İşlemler’den çeviriyi yeniden inceleyin.','Review translation in Tasks to complete the missing lines.')):task.text,
          retry:canRetry?()=>{const retry=actions().find(action=>action.id==='retry-translation');if(current()&&retry&&!retry.disabled)return retry.run();}:null,
          retryLabel:canRetry?repair.label:null,
          retryActionId:canRetry?'retry-translation':null,
          cancel: current() && task.cancellable ? () => window.cancelPodcastQueueTask?.(snap, task.id) : null };
      }
      const activeJob = player.job;
      if (activeJob?.mediaKey && (activeJob.mediaKey !== snap?.mediaKey
        || (activeJob.generation != null && activeJob.generation !== snap?.generation)
        || (kind === 'browser' && activeJob.browserTabId && activeJob.browserTabId !== F.tab()))) {
        return { state: 'idle' };
      }
      const bar = $('playerJobBar'), vis = !!bar && !bar.classList.contains('hidden'), text = $('playerJobText')?.textContent?.trim() || '';
      const terminal = player.jobBarTerminal;
      if (vis && terminal && (!activeJob || terminal.job===activeJob)) {
        const matches = terminal.mediaKey===snap?.mediaKey && terminal.generation===snap?.generation
          && (!terminal.job.browserTabId || terminal.job.browserTabId===F.tab());
        if (!matches) return {state:'idle'};
        if (terminal.outcome!=='failed' || !activeJob) return {state:terminal.outcome,text,ownerToken:terminal.job};
      }
      const failed = !!(player.job && player.job.failed), pct = parseFloat($('playerJobFill')?.style.width);
      const cancel = $('playerJobCancel') || $('cancelBtn');
      const retryAction = lastAction;
      const jobCurrent = () => current() && player.job === activeJob;
      return { ownerToken:activeJob, state: vis ? (failed ? 'failed' : activeJob?.running ? 'running' : 'idle') : 'idle', text: text || (failed ? T('İşlem başarısız oldu.', 'The task failed.') : T('İşlem sürüyor…', 'Working…')), progress: Number.isFinite(pct) && pct > 0 ? Math.min(1, pct / 100) : null, cancel: current() && activeJob?.running && !activeJob.loading && cancel && !cancel.disabled ? () => { if(jobCurrent() && !cancel.disabled)cancel.click(); } : null, retry: current() && retryAction ? () => { if(!jobCurrent() || lastAction !== retryAction)return; const b = retryAction(); if (b && !b.disabled) b.click(); } : null };
    }
    const mirror = (resolver, label) => { const b = resolver(); if (!b) return null; const lbl = (label || b.textContent || '').trim().replace(/\s+/g, ' '); return { type: 'button', label: lbl || b.title, hint: b.disabled ? (b.title || '') : '', disabled: !!b.disabled, pressed: b.getAttribute('aria-pressed') === 'true' ? true : undefined, run: () => { if (!current()) return; const target = resolver(); if (target && !target.disabled) { lastAction = resolver; target.click(); } } }; };
    const trackLabel = (t) => (t.label || window.PlayerUiKit?.languageName?.(t.language, window.UiLocale?.get?.()) || T('Altyazı izi', 'Caption track')) + (t.role === 'translation' ? ' · ' + T('çeviri', 'translation') : '');
    function browserWhisperActions() {
      const hasSource=!!((player.subRole==='source'&&player.subPath&&player.cues?.length)
        || (player.sub2Role==='source'&&player.sub2Path&&player.cues2?.length));
      const canTranscribe=$('browserWhisperSubtitles')&&!$('browserWhisperSubtitles').disabled;
      const canTranslate=hasSource&&$('makeTransBtn')&&!$('makeTransBtn').disabled;
      const preparing=typeof browserAudioPreparationStatus==='function'&&browserAudioPreparationStatus()?.state==='running';
      const audio=typeof currentBrowserWhisperAudio==='function'&&currentBrowserWhisperAudio();
      const settings=[$('model')?.value,$('engine')?.value,$('device')?.value,$('computeType')?.value].filter(Boolean).join(' · ');
      const whisperHint=(audio?T('Bölüm sesi indirilir ve doğrulanır. ','Episode audio is downloaded and verified. '):'')
        +T('YouTube ile ortak Whisper ayarları','Shared Whisper settings with YouTube')+(settings?' · '+settings:'');
      const primary=canTranslate&&!preparing?'translate-existing':canTranscribe?'transcribe':'live';
      const options=[
        ...(hasSource?[['translate-existing', 'makeTransBtn', T('Mevcut metni çevir','Translate existing transcript')]]:[]),
        ['transcribe', 'browserWhisperSubtitles', T('Yalnız yazıya dök','Transcribe only')],
        ['transcribe-translate', 'browserWhisperTranslate', T('Yazıya dök ve çevir','Transcribe and translate')],
        ['live', 'browserLiveAsr', T('Canlı Whisper','Live Whisper')],
      ];
      const actions=options.flatMap(([id,button,label])=>{
        const action=mirror(()=>$(button),label);
        if(!action)return [];
        if(preparing&&id==='translate-existing')return [{...action,id,disabled:true,hint:T('Ses hazırlanıyor…','Preparing audio…')}];
        return [{...action,id,hint:action.hint||(['transcribe','transcribe-translate'].includes(id)?whisperHint:''),primary:id===primary&&!action.disabled}];
      });
      if(typeof currentBrowserWhisperAudio==='function'&&currentBrowserWhisperAudio()){
        actions.unshift({id:'whisper-saved',type:'button',label:T('Kayıtlı metni aç','Open saved transcript'),
          hint:T('Bu ses sürümü ve kapsam için iş geçmişini kontrol eder.','Checks job history for this audio version and scope.'),
          disabled:!canTranscribe,run:()=>{if(current())return startBrowserYoutubeWhisper(false,{savedOnly:true});}});
      }
      return actions.sort((a,b)=>Number(!!b.primary)-Number(!!a.primary));
    }
    function browserWhisperScope() {
      if(typeof browserWhisperScopeLabel!=='function'||!(currentBrowserYoutubeUrl()||currentBrowserWhisperAudio()))return null;
      return {id:'whisper-scope',type:'button',label:T('Whisper kapsamı','Whisper scope'),hint:browserWhisperScopeLabel(),
        run:()=>{if(current())openBrowserWhisperRangeSettings(doc.activeElement);}};
    }
    let missingTranslationPending = false;
    function missingTranslationAction(snapshot, service, status = {}) {
      const recovery = status.translationRetry;
      const savedRetry = recovery?.canRetry && !!service?.runPodcastTask;
      const selectedFile = () => kind === 'shelf' ? '' : player.subRole === 'translation' ? player.subPath
        : player.sub2Role === 'translation' && player.sub2Path ? player.sub2Path : player.subPath || '';
      const shelfTrack = () => kind === 'shelf' ? service?.getTranscriptTracks?.().find(track => track.role === 'translation') : null;
      const file = selectedFile(), track = shelfTrack();
      const canInspect = !!window.SubtitleTranslationRepair?.review && (!!file || !!track?.text);
      const knownPartial = !!recovery?.partial || recovery?.failed > 0;
      if (!savedRetry && !canInspect && !knownPartial) return null;

      const isBusy = value => !!value.preparing || ['queued', 'running'].includes(value.job?.state);
      const selection = () => JSON.stringify([player.subPath, player.sub2Path, player.subRole, player.sub2Role]);
      const selectedTracks = selection();
      const label = T('Eksik çeviriyi tamamla', 'Complete missing translation');
      return {
        id:'retry-translation', type:'button', label:savedRetry && recovery.failed > 0 ? label + ' · ' + recovery.failed : label,
        primary: knownPartial && (savedRetry || canInspect),
        disabled: !current() || isBusy(status) || (!savedRetry && !canInspect),
        hint: savedRetry ? T('Hazır satırlar ve zamanları korunur.', 'Completed lines and timestamps are kept.')
          : canInspect ? T('Altyazıyı incele ve bulunan eksikleri onayla.', 'Inspect subtitles and approve the lines to translate.')
          : T('Önce zamanlı çeviri dosyasını açın.', 'Open a timed translation file first.'),
        async run() {
          const freshStatus = () => service?.podcastTaskState?.() || {};
          const valid = () => current() && !isBusy(freshStatus()) && (kind === 'shelf'
            ? shelfTrack() === track : selectedFile() === file && selection() === selectedTracks);
          if (!valid()) return stale;
          if (missingTranslationPending) return {ok:true};
          missingTranslationPending = true;
          try {
            if (savedRetry) {
              const sameRecovery = () => valid() && JSON.stringify(freshStatus().translationRetry) === JSON.stringify(recovery);
              if (!sameRecovery()) return stale;
              const approved = await openAppDialog({
                title:label,
                description:T(`${recovery.failed} eksik satır yeniden çevrilsin mi? Hazır satırlar ve zamanları korunur.`,
                  `Translate ${recovery.failed} missing lines? Completed lines and timestamps are kept.`),
                confirmLabel:T('Eksikleri çevir','Translate missing lines'), intent:'primary'
              });
              if (!approved) return {ok:true,cancelled:true};
              if (!sameRecovery()) return stale;
              const expected = {mediaKey:snapshot.mediaKey,generation:snapshot.generation,sourceVersion:snapshot.sourceVersion};
              return await service.runPodcastTask({operation:'retry-translation',expected,isCancelled:()=>!sameRecovery()});
            }
            let subtitle = file;
            if (kind === 'shelf') {
              const binding = await service.processingBinding();
              if (!valid()) return stale;
              const result = await window.api.feedsRequest({action:'podcast-materialize',entryId:binding.entryId,sourceVersion:binding.sourceVersion,role:'translation',as:'srt'});
              if (!valid()) return stale;
              if (!result?.ok) throw Error(result?.error || T('Zamanlı çeviri bulunamadı.','Timed translation unavailable.'));
              subtitle = result.path;
            }
            return await window.SubtitleTranslationRepair.review(subtitle,{allowMixed:true,isCurrent:valid});
          } finally {
            missingTranslationPending = false;
          }
        }
      };
    }
    function actions() {
      const snapshot = F.snap();
      const service = kind === 'shelf' ? window.MediaShelfUI : snapshot?.sourceKind === 'rss' ? window.PlayerSourceCatalogIntegration : null;
      const status = service?.podcastTaskState?.() || {};
      const repair = missingTranslationAction(snapshot, service, status);
      if (!service?.runPodcastTask) {
        if(kind==='browser'){
          const captions=mirror(()=>$('browserTrackTranslate'),T('Altyazıyı yükle ve çevir','Load and translate captions'));
          const scope=browserWhisperScope();
        return [...browserWhisperActions(),...(scope?[{...scope,label:scope.hint,hint:''}]:[]),
            ...(captions&&!captions.disabled?[{...captions,id:'translate-track'}]:[]),...(repair?[repair]:[])];
        }
        const buttons = [
          ['whisper', () => $('makeSubsBtn'), T('Whisper ile yazıya dök', 'Transcribe with Whisper')],
          ['translate-track', () => $('makeTransBtn'), T('Altyazıyı çevir', 'Translate captions')]
        ];
        return [...buttons.map(([id, resolver, label]) => { const action = mirror(resolver, label); return action && { ...action, id, primary:id==='whisper' }; }).filter(Boolean), ...(repair?[repair]:[])];
      }
      const expected = { mediaKey: snapshot.mediaKey, generation: snapshot.generation, sourceVersion: snapshot.sourceVersion };
      const primary=repair?.primary?'retry-translation':status.hasSourceTranscript?'translate':'transcribe';
      const tasks = [
        ['transcribe', T('Whisper ile yazıya dök', 'Transcribe with Whisper')],
        ['transcribe-translate', T('Yazıya dök ve çevir', 'Transcribe and translate')],
        ...(status.hasSourceTranscript ? [['translate', T('Transkripti çevir', 'Translate transcript')]] : [])
      ].map(([id, label]) => ({ id, type: 'button', label, primary: id===primary,
        disabled: !current() || !!status.preparing || ['queued','running'].includes(status.job?.state),
        hint: status.preparing ? T('Kaynak hazırlanıyor…', 'Preparing source…') : '',
        run: (config={}) => { if (!current()) throw new Error(T('Kaynak değişti; işlem başlatılmadı.', 'Source changed; task not started.'));
          return service.runPodcastTask({ operation: id, expected,range:config.range||null, isCancelled: () => !current() }); }
      }));
      if (repair) tasks.push(repair);
      return tasks.sort((a,b)=>Number(b.primary)-Number(a.primary));
    }
    function openAdvanced() {
      if (!current()) return;
      if (kind === 'local') { PW()?.openAdvanced?.(); return; }
      advancedOverlay?.close?.();
      const opener=doc.activeElement;
      const content = kind === 'browser' ? $('playerSide') : doc.querySelector('.ms-podcast-identity');
      if (!content) return;
      const anchor = doc.createComment('shared-study-advanced-home'); content.before(anchor);
      const previousStyle = content.getAttribute('style'), previousInert = content.inert, wasRail=content.classList.contains('side-rail');
      content.classList.remove('side-rail');
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
        content.classList.toggle('side-rail',wasRail); content.inert = previousInert; dialog.remove(); if (advancedOverlay === dialog) advancedOverlay = null; if(opener?.isConnected)opener.focus({preventScroll:true}); bounds();
      }, { once: true });
      doc.body.append(dialog); advancedOverlay = dialog; dialog.showModal(); bounds();
    }
    function askAssistant(){if(!current())return Promise.resolve(stale);const stage=window.CinemaSahne?.current;stage?.captureAssistantPassage?.();if(stage?.assistantSelectionError)return Promise.resolve({ok:false,code:'selection-too-long',message:stage.assistantSelectionError});window.api.showAssistant?.();return Promise.resolve({ok:true});}
    function openNotebook(){
      if(!current())return stale;
      const entry=$('libraryViewResearch');
      if(kind==='shelf'||!entry||typeof setSideTab!=='function')return {ok:false,code:'unsupported',message:T('Araştırma defterini kütüphaneden açın.','Open the research notebook from the library.')};
      setSideTab('library');entry.click();openAdvanced();return {ok:true};
    }
    function panel() {
      const sections = [], a11y = [];
      const merge=$('mergeContinuation');
      const workflowItems=merge?[{id:'sentence-merge',type:'checkbox',label:T('Cümleleri birleştir','Merge sentences'),value:merge.checked,disabled:!current(),
        hint:T('Yeni altyazı ve çeviri işlerinde devam cümlelerini birleştirir; dublajı cümle akışıyla hazırlar. Çalışan iş değişmez.','Combines continuation sentences for new subtitle and translation jobs; prepares dubbing with sentence flow. Running jobs are unchanged.'),
        onChange:value=>{if(!current())return;window.SentenceMergeControl?.set(value);}}]:[];
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
          const snapshot=F.snap(), active=ownLoop?.preview && ownLoop.role===role && activeLoop(snapshot,ownLoop);
          const candidate=!active && current(snapshot) ? timingCue(snapshot,role) : null;
          const clock=value=>{
            const tenths=Math.round(value*10);
            return `${Math.floor(tenths/600)}:${((tenths%600)/10).toFixed(1).padStart(4,'0')}`;
          };
          items.push({id:'timing-preview-'+role,type:'button',pressed:!!active,
            label:active?T('Döngüyü kapat','Stop preview loop'):T('Bu cümleyi döngüde dinle','Loop this sentence'),
            hint:active?`${clock(ownLoop.a)} – ${clock(ownLoop.b)} · `+T('Ses aralığı sabit','Audio range stays fixed')
              : candidate?T('Dinlerken altyazıyı 0,1 sn adımlarla kaydırın.','Adjust subtitles in 0.1 s steps while listening.')
              : T('Önce zamanlı bir altyazı cümlesine gelin.','First move to a timed subtitle sentence.'),
            disabled:!active&&!candidate,
            run:()=>previewTiming(role,candidate?.track.id)});
          if(active && ownLoop.text)items.push({type:'note',text:ownLoop.text.replace(/\s+/g,' ').slice(0,160)});
        }
        if (items.length) sections.push({ title: T('Altyazı zamanlaması', 'Subtitle timing'), items });
      }
      if(kind==='shelf'||kind==='local'&&F.snap()?.sourceKind==='rss')sections.push({title:T('Dinleme kuyruğu','Listening queue'),items:[{type:'button',label:T('Bu bölümü kuyruğa ekle','Add this episode to queue'),run:()=>{if(current())window.MediaShelfUI?.enqueueCurrentPodcast();}},{type:'button',label:T('Dinleme kuyruğunu yönet','Manage listening queue'),run:()=>{if(current())window.MediaShelfUI?.openQueue();}}]});
      if(kind==='shelf'){
        const track=window.MediaShelfUI?.getTranscriptTracks?.().find(t=>t.role==='source'), exact=track?.exactSource;
        if(exact)sections.push({title:T('Zamanlı döküm','Timed transcript'),items:[{
          type:'button',label:T('Whisper’ın kullandığı ses kopyasını aç','Open the audio copy used by Whisper'),
          hint:T('Kayıtlı ses ve altyazıyı birlikte açar.','Opens the saved audio together with its transcript.'),
          run:async()=>{
            if(!current())return;
            const proof=await window.api.feedsRequest({action:'podcast-exact-audio',entryId:exact.entryId});
            if(!current())return;
            if(!proof?.available||proof.sourceVersion!==exact.sourceVersion)throw Error(T('Whisper ses kopyası artık mevcut değil.','The Whisper audio copy is no longer available.'));
            const result=await window.PlayerSourceCatalogIntegration.openPodcastEntry(exact.entryId,{
              exactVersion:exact.sourceVersion,view:mode==='study'?'bilingual':'podcast',
              isCancelled:()=>!current()&&player.mediaKey!=='podcast-copy:'+exact.entryId+':'+exact.sourceVersion
            });
            if(result?.readOnly)throw Error(T('Ses kopyası değişti. Yeniden açın.','The audio copy changed. Reopen it.'));
          }
        }]});
        sections.unshift({title:T('Podcast işlemleri','Podcast tasks'),items:[...actions(),...workflowItems,{type:'button',label:T('Döküm, Whisper ve çeviri araçları','Transcript, Whisper and translation tools'),run:openAdvanced}]});
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
        }
        if(items.length) sections.push({ id: 'captions', title: T('Altyazı izleri', 'Caption tracks'), items });
        const wh=browserWhisperActions();
        const repair=actions().find(action=>action.id==='retry-translation');
        if(repair)wh.push(repair);
        const scope=browserWhisperScope();
        if(scope)wh.push(scope);
        if (!wh.length) wh.push({ type: 'note', text: T('Bu kaynak için Whisper işlemi sunulmuyor.', 'No Whisper action is offered for this source.') });
        sections.unshift({ title: T('Whisper ve çeviri', 'Whisper and translation'), items: [...wh, ...workflowItems] });
        const sample=F.sampleFor?.(F.snap());
        const sourceItems=[];
        if(sample?.audioChoices?.length>1||sample?.pinnedAudio){
          const options=[{value:'',label:T('Otomatik','Automatic')},...(sample.audioChoices||[]).map((choice,index)=>{
            const seconds=Math.round(choice.duration||0);
            const duration=seconds>0?` · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'';
            const name=choice.label||T('Ses '+(index+1),'Audio '+(index+1));
            return {value:choice.token,label:name+duration+(choice.token===sample.mediaToken?T(' · Etkin',' · Active'):'')};
          })];
          sourceItems.push({type:'select',label:T('Sayfadaki ses','Page audio'),value:sample.pinnedAudio||'',options,
            onChange:value=>{if(current())void browserCommand('select-audio',value,F.tab()).then(result=>{
              if(!result?.ok&&current())setBrowserSignal(result?.error||T('Ses seçimi uygulanamadı.','Could not select audio.'),false);
            });}});
        }
        if (typeof currentBrowserWhisperAudio === 'function' && currentBrowserWhisperAudio() && window.PodcastLinkUI?.reviewPlayingEpisode) {
          sourceItems.push({ type:'button', label:T('Kütüphaneye kaydet…','Save to library…'), run:()=>{if(current())window.PodcastLinkUI.reviewPlayingEpisode();} });
        }
        if(sourceItems.length){
          const section={title:T('Bölüm kaynağı','Episode source'),items:sourceItems};
          if(sourceItems[0].type==='select')sections.unshift(section);
          else sections.push(section);
        }
      } else {
        const sourceActions=F.snap()?.sourceKind==='rss'?[...actions(),{type:'button',label:T('Podcast / Whisper ve çeviri araçları','Podcast / Whisper and translation tools'),run:()=>{if(current())window.PlayerSourceCatalogIntegration?.podcastTools?.();}}]:[mirror(()=>$('makeSubsBtn'),T('Whisper ile altyazı oluştur','Create subtitles with Whisper')),mirror(()=>$('makeTransBtn'),T('Yüklü altyazıyı çevir','Translate loaded subtitles')),actions().find(action=>action.id==='retry-translation')];
        const loc = [...sourceActions, ...workflowItems, mirror(() => $('playerPickSub'), T('Altyazı dosyası seç', 'Choose a subtitle file')), {type:'button',label:T('Tüm oynatıcı ayarları','All player settings'),run:openAdvanced}].filter(Boolean);
        sections.unshift({ title: T('Altyazı ve Whisper', 'Subtitles and Whisper'), items: loc });
      }
      const attachDub = $(kind === 'browser' ? 'browserDubAdd' : 'playerDubAdd');
      if (kind !== 'shelf' && attachDub) sections.push({ title: T('Dublaj', 'Dubbing'), items: [{
        type: 'button', label: T('Hazır dublaj sesi ekle', 'Attach dubbing audio'), disabled: attachDub.disabled,
        run: () => { if (current() && !attachDub.disabled) attachDub.click(); }
      }] });
      if(kind!=='shelf'&&$('libraryViewResearch'))sections.push({title:T('Okuma ve notlar','Reading and notes'),items:[{id:'saved-notes',type:'button',label:T('Kayıtlı pasajlar ve notlar','Saved passages and notes'),hint:T('Araştırma defterinde inceleyin, düzenleyin veya kaynağa dönün.','Review, edit or return to the source in your research notebook.'),run:openNotebook}]});
      if(kind!=='browser'){
        sections.push({ title: T('Asistan', 'Assistant'), items: [{ type: 'button', label: T('Asistana sor', 'Ask assistant'), hint: T('Mevcut asistan penceresi, bu medyanın bağlamıyla açılır.', 'Opens the existing assistant window with this media as context.'), run: askAssistant }] });
        sections.push({title:T('Oynatma ve görünüm','Playback and view'),items:[{type:'range',label:T('Ses düzeyi','Volume'),value:kind==='shelf'?num($('mediaShelfAudio')?.volume??1):num($('playerVideo')?.volume??1),onChange:value=>{if(current())dispatch('setVolume',{volume:Number(value)});}}, {type:'button',label:T('Sahneyi tam ekran aç','Open stage fullscreen'),run:toggleStageFullscreen}]});
      }
      return { job: job(), sections };
    }
    return {
      caps: { queue:kind==='shelf'||F.snap()?.sourceKind==='rss', loop: true, save: typeof window.api.upsertResearchAnnotation==='function', cinema:kind==='local', study:true, word:kind!=='shelf', dub: typeof window.DubGeneratorUI?.prepareCurrent === 'function' },
      identity, panel, actions, job, verifyTiming:()=>kind==='shelf'&&!!window.MediaShelfUI?.getTranscriptTracks?.().find(track=>track.role==='source')?.exactSource,
      recovery: () => {if(!current())return null;const recovery=kind==='shelf'?window.MediaShelfUI?.playbackRecovery():activePlaybackRecovery();return recovery?{...recovery,ownerToken:recovery,run:kind==='shelf'?recovery.run:()=>runPlaybackRecovery({expected:recovery,report:false})}:null;},
      processing:kind==='shelf'||F.snap()?.sourceKind==='rss'?()=>({duration:F.snap()?.duration}):null,
      info: () => {
        const s=F.snap(),l=F.langs(),audio=kind==='local'&&player.workspaceAudio;
        const sample=kind==='browser'&&typeof browserTabState==='function'?browserTabState()?.browserClockSample:null;
        const browserAudio=sample?.mediaType==='audio'&&sample.mediaKey===s?.mediaKey&&sample.generation===s?.generation;
        const podcast=s?.sourceKind==='rss'&&audio?.generation===s.generation&&audio.mediaKey===s.mediaKey;
        const duration=s?.duration,published=audio?.publisherDuration;
        const chapterTiming=podcast&&audio.publisherTiming&&Number.isFinite(duration)&&Number.isFinite(published)
          &&Math.abs(duration-published)<=Math.min(3,Math.max(1,published*.01));
        const rawTitle=browserAudio?(sample.audioTitle||(sample.sourceChanged?T('Web sesi','Web audio'):F.mediaTitle())):F.mediaTitle()||s?.title||'';
        const program=browserAudio?sample.showTitle||'':'';
        const sub=(browserAudio&&(sample.publisher||sample.siteName))||F.sub()||'';
        const titleParts=rawTitle.split(/\s+[|\-–—·]\s+/);
        const suffixes=[program,sub,browserAudio?sample.siteName:'',kind==='browser'&&!browserAudio?'YouTube':'']
          .filter(Boolean).map(value=>value.toLowerCase());
        const suffix=titleParts.at(-1).trim().toLowerCase();
        const title=browserAudio&&titleParts.length>1&&suffixes.includes(suffix)
          ? rawTitle.slice(0,rawTitle.lastIndexOf(titleParts.at(-1))).replace(/\s+[|\-–—·]\s+$/,'')
          : kind==='browser'&&!browserAudio?rawTitle.replace(/\s*[-–|]\s*YouTube\s*$/i,''):rawTitle;
        const live = kind==='browser' && s?.live === true;
        return { title, sub:program&&sub.toLowerCase()===program.toLowerCase()?'':sub, program, live, eyebrow: F.eyebrow?.() || (kind === 'browser' ? (live?T('Canlı yayın','Live broadcast'):browserAudio?T('Podcast','Podcast'):T('Web videosu','Web video')) : kind === 'shelf' ? T('Podcast', 'Podcast') : T('Yerel oynatıcı', 'Local player')), cover: F.cover(), fallbackCover:browserAudio?sample.fallbackArtworkUrl:'', tint: null, webSource:kind==='browser', webVideo:kind==='browser'&&mode==='study'&&!browserAudio,
          captionTrackCount: kind === 'browser' ? (player.browserTracks || []).filter(track => track.path).length : 0,
          youtubeCaptions: kind === 'browser' && /^browser:youtube:/.test(s?.mediaKey || ''),
        chapters:podcast?(audio.publisherChapters||[]).map(chapter=>({...chapter,t:chapterTiming&&chapter.t!==null&&chapter.t<duration?chapter.t:null})):kind!=='local'?[]:(player.chapters||[]).filter(c=>Number.isFinite(c.start)&&c.start>=0&&(!s?.duration||c.start<s.duration)).map(c=>({t:c.start,label:String(c.title||T('Bölüm','Chapter'))})),
        listeningQueue:window.MediaShelfUI?.queueSnapshot?.(),queue:(()=>{const next=window.MediaShelfUI?.upNext?.();return next&&next.title?[{index:next.index,title:next.title,queueKey:next.queueKey}]:null;})()||(kind==='local'?(player.playlist||[]).map((file,index)=>({index,title:window.PlayerUiKit?.displayTitle(String(file).split(/[\\/]/).pop())||String(file)})).slice(Math.max(0,player.playlistIndex+1),Math.max(0,player.playlistIndex+1)+2):[]),native:kind==='local'&&!!window.NativePlayerUI?.active(),audio:browserAudio||mode==='podcast'||kind==='shelf'||s?.sourceKind==='rss'||kind==='local'&&num($('playerVideo')?.readyState)>=2&&!num($('playerVideo')?.videoWidth),langs:l }; },
      state: () => {
        const s = F.snap();
        if (!s) return { time: 0, duration: 0, paused: true, rate: 1, rows: [], rev: 'none', canSeek: false };
        const r = rowsFor(s);
        if (ownLoop?.failed) clearOwnedLoop();
        if (ownLoop?.preview) {
          if (s.adPlaying || (ownLoop.revision!==r.rev && !timingPreviewCurrent(r,ownLoop))) clearOwnedLoop();
          else if (ownLoop) ownLoop.revision=r.rev;
        } else if (ownLoop && ownLoop.revision !== r.rev) {
          const index = r.rows.findIndex((row, i) => row.id === ownLoop.cueId && r.meta[i]?.trackId === ownLoop.trackId
            && row.timed && row.start === ownLoop.a && row.end === ownLoop.b);
          if (index < 0) clearOwnedLoop();
          else Object.assign(ownLoop, { row: index, revision: r.rev });
        }
        const loopRow = ownLoop && activeLoop(s, ownLoop) ? ownLoop.row : -1;
        if (ownLoop?.confirmed && !activeLoop(s,ownLoop)) ownLoop = null;
        const sample = F.sampleFor?.(s);
        const translationTargets = translationNavigation(s);
        return { time: num(s.time), duration: num(s.duration), paused: !!s.paused, rate: num(s.rate) || 1, volume: kind === 'shelf' ? num($('mediaShelfAudio')?.volume ?? 1) : kind === 'browser' ? num(player.browserVolume ?? 1) : num($('playerVideo')?.volume ?? 1), rows: r.rows, rev: cache.rev, untimed: r.untimed, timingNotice:F.timingNotice?.()||'', canSeek: s.capabilities?.seek?.support === 'yes', canRate: !s.capabilities?.rate || s.capabilities.rate.support==='yes', loopRow, adPlaying: !!s.adPlaying, displayTime: F.displayTime?.(s), captionTracks: r.untimed ? undefined : r.captionTracks, waiting: !!sample?.waiting && !s.paused, seeking: !!sample?.seeking, translationTargets };
      },
      slot: (m) => { const el = F.slot(m); if (el) { el.classList.add('sh-slot-fill'); bounds(); } return el; },
      transferLoopTo(target) {
        if (ownLoop && !ownLoop.preview && !ownLoop.failed && current() && activeLoop(F.snap(), ownLoop)
            && target.acceptLoop(identity(), ownLoop)) ownLoop = null;
      },
      acceptLoop(sourceIdentity, range) {
        const snap = F.snap();
        if (identity() !== sourceIdentity || !current() || !activeLoop(snap, range)) return false;
        const data = rowsFor(snap);
        const index = data.rows.findIndex((row, i) => row.timed && row.id === range.cueId
          && data.meta[i]?.trackId === range.trackId && row.start === range.a && row.end === range.b);
        if (index < 0) return false;
        ownLoop = range;
        Object.assign(ownLoop, { row: index, revision: data.rev });
        return true;
      },
      releaseSlot: () => { clearOwnedLoop(); disposed = true; F.unslot(); restore(); F.dispose(); },
      stopTimingPreview() { if(ownLoop?.preview)clearOwnedLoop(); },
      cmd(t, v, expectedRevision) {
        if (t === 'loop' && !(v && v.on)) { clearOwnedLoop(); return Promise.resolve({ ok: true }); }   // kendi A–B döngümüzü her durumda kapat
        const s = F.snap(); if (!current()) return Promise.resolve(stale);
        rowsFor(s);
        if(expectedRevision && expectedRevision!==cache.rev && ['seekCue','seekTranslation','playCue','loop','replay','prevCue','nextCue','wordInfo','wordSave','wordLookup','openQueued','save','assistant'].includes(t))return Promise.resolve(staleTrack());
        if (v === 'translation' && ['prevCue','nextCue','replay'].includes(t)) {
          const time = translationNavigation(s,t)[t];
          if (s.capabilities?.seek?.support !== 'yes' || !Number.isFinite(time)) {
            return Promise.resolve({ok:false,code:'untimed',message:T('Bu konumda zamanlı çeviri yok.', 'No timed translation is available at this position.')});
          }
          const revision = cache.rev;
          const seek = dispatch('seek', {time});
          return t === 'replay' ? finishReplay(seek, s.paused, revision) : seek;
        }
        switch (t) {
          case 'retryCaptions':
            return kind === 'browser' && typeof retryBrowserCaptionCapture === 'function'
              ? retryBrowserCaptionCapture({ tabId: F.tab(), mediaKey: s.mediaKey, generation: s.generation })
              : Promise.resolve({ ok: false, code: 'unsupported' });
          case 'save': {
            const index=typeof v==='number'?v:v?.row,row=cache.rows[index];
            if(!row||!Number.isInteger(index)||typeof window.api.upsertResearchAnnotation!=='function')return Promise.resolve({ok:false,code:'unsupported'});
            const excerpt=v?.excerpt===undefined?'':String(v.excerpt).trim();
            if(v?.excerpt!==undefined&&(!excerpt||!row.src.includes(excerpt)))return Promise.resolve({ok:false,code:'invalid-excerpt',message:T('Kaynak metinden bir bölüm seçin.','Select a passage from the source text.')});
            const source=excerpt||row.src,translation=excerpt?'':row.trs.join('\n\n');
            if(source.length>4000||translation.length>4000)return Promise.resolve({ok:false,code:'passage-too-long',message:T('Metin kayıt sınırını aşıyor. Kaynak metinden daha kısa bir bölüm seçin (en fazla 4000 karakter).','The text exceeds the save limit. Select a shorter passage from the source text (up to 4000 characters).')});
            const podcast=kind==='shelf'||s.sourceKind==='rss',audio=kind==='local'&&player.workspaceAudio?.mediaKey===s.mediaKey&&player.workspaceAudio?.generation===s.generation?player.workspaceAudio:null;
            const browserSample=kind==='browser'?F.sampleFor?.(s):null;
            const sourceVersion=browserSample?.mediaType==='audio'?'browser-audio:'+(browserSample.audioSourceIdentity||'unverified'):s.sourceVersion;
            const payload={type:excerpt&&excerpt.length<=120&&!/\s/u.test(excerpt)?'word':'quote',mediaId:s.mediaKey,mediaType:podcast?'podcast':kind==='browser'?'browser':'local',mediaTitle:F.mediaTitle(),mediaUrl:kind==='browser'?window.BrowserPlaceUrl?.redactUrlSensitiveParams?.(player.browserPageUrl)||'':'',
              source,translation,...(String(v?.note||'').trim()?{note:String(v.note)}:{}),timed:row.timed,start:row.timed?row.start:null,end:row.timed?row.end:null,
              trackId:cache.meta[index]?.trackId||'readonly',cueId:row.id,sourceVersion,sourceBinding:s.sourceBinding,episodeIdentity:s.episodeIdentity,playbackOwner:s.playbackOwner,
              sourceEntryId:audio?.entryId||s.entryId||''};
            return Promise.resolve(window.api.upsertResearchAnnotation(payload)).then(result=>result?.ok?{ok:true,annotation:result.annotation}: {ok:false,code:'save-failed',message:T('Not kaydedilemedi.','Could not save the note.')}).catch(()=>({ok:false,code:'save-failed',message:T('Not kaydedilemedi.','Could not save the note.')}));
          }
          case 'notebook':return Promise.resolve(openNotebook());
          case 'listeningQueue':window.MediaShelfUI?.openQueue();return Promise.resolve({ok:true});
          case 'advanced':openAdvanced();return Promise.resolve({ok:true});
          case 'assistant':return askAssistant();
          case 'display':
            if(kind==='browser'&&typeof setSubtitleMode==='function')setSubtitleMode({src:'source',tr:'translation',both:'both'}[v]||'both',false);
            return Promise.resolve({ok:true});
          case 'verifiedAudio':
          case 'dub': {
            if (!window.DubGeneratorUI?.prepareCurrent) return Promise.resolve({ok:false,code:'unsupported'});
            if (kind !== 'shelf') return Promise.resolve(window.DubGeneratorUI.prepareCurrent()).then(() => ({ok:true}));
            // Library audio is not a dubbing target: dubbing attaches to the player's audio. Open THIS episode in the player
            // through the existing Podcast entry (the verified Whisper copy when the saved timings belong to it), then open the
            // shared dubbing panel for that player media. Nothing of a previously hidden player media is carried over.
            return (async () => {
              let entryId = s.entryId; const owner = { mediaKey: s.mediaKey, generation: s.generation }, actionEpoch=stageEpoch, openingIntent=Number(player.openIntent)||0;
              const sameShelf = () => current() && F.snap()?.mediaKey === owner.mediaKey && F.snap()?.generation === owner.generation;
              if(!entryId){const binding=await window.MediaShelfUI?.processingBinding?.();if(!sameShelf())return stale;entryId=binding?.entryId;}
              if (!entryId || typeof window.PlayerSourceCatalogIntegration?.openPodcastEntry !== 'function')
                return { ok:false, code:'source-unavailable', message:T('Bölüm kaynağı hazırlanamadı. İşlemler’den yeniden deneyin.', 'The episode source could not be prepared. Retry in Tasks.') };
              const exact = window.MediaShelfUI?.getTranscriptTracks?.().find(track => track.role === 'source')?.exactSource;
              if (exact) {
                const proof = await window.api.feedsRequest({ action:'podcast-exact-audio', entryId:exact.entryId });
                if (!sameShelf()) return stale;
                if (!proof?.available || proof.sourceVersion !== exact.sourceVersion)
                  return { ok:false, code:'exact-unavailable', message:T('Whisper ses kopyası artık mevcut değil.', 'The Whisper audio copy is no longer available.') };
              }
              const target = exact?.entryId || entryId;
              await window.PlayerSourceCatalogIntegration.openPodcastEntry(target, { view: mode === 'study' ? 'bilingual' : 'podcast', autoplay:false, ...(exact ? { exactVersion:exact.sourceVersion } : {}),
                isCancelled: () => stageEpoch!==actionEpoch || !sameShelf() && !(player.workspaceMode==='player'&&player.openIntent===openingIntent+1) });
              const audio = player.workspaceAudio;
              // The handoff must really have produced this episode as the current player media before the panel opens.
              if (stageEpoch!==actionEpoch || !audio || audio.entryId !== target || audio.mediaKey !== player.mediaKey || audio.generation !== player.generation || (exact && (!audio.exactAudio || audio.sourceVersion !== exact.sourceVersion)))
                return { ok:false, code:'source-changed', message:T('Bölüm oynatıcıda açılamadı; dublaj başlatılmadı.', 'The episode could not be opened in the player; dubbing was not started.') };
              window.MediaShelfUI?.adoptPodcastPlayer?.(owner,target);
              if(t==='dub')await window.DubGeneratorUI.prepareCurrent();
              return { ok:true, handoff:{entryId:target,mediaKey:audio.mediaKey,generation:audio.generation}, from:owner };
            })();
          }
          case 'fullscreen': return toggleStageFullscreen();
          case 'wordInfo':case 'wordSave':case 'wordLookup':return wordAction(t,v);
          case 'openQueued':
            if (v?.queueKey) return window.MediaShelfUI.playUpNext(v).then(result => result?.code === 'stale-queue'
              ? {...result,message:T('Kuyruk değişti. Güncel sıradaki bölümü seçin.','The queue changed. Select the current next episode.')}
              : result);
            if(kind!=='local'||!Number.isInteger(v)||v<=player.playlistIndex||v>=player.playlist.length)return Promise.resolve({ok:false,code:'invalid-range'});return Promise.resolve(playPlaylistDelta(v-player.playlistIndex)).then(()=>({ok:true}));
          case 'toggle': return dispatch('togglePlay');
          case 'pause':
            if (!s.paused) return dispatch('togglePlay');
            playbackIntent++;
            return Promise.resolve({ ok: true });
          case 'seek': return dispatch('seek', { time: Math.max(0, Math.min(num(s.duration) || Infinity, v)) });
          case 'seekBy': return dispatch('seek', { time: Math.max(0, Math.min(num(s.duration) || Infinity, num(s.time) + v)) });
          case 'seekCue': return cache.rows[v]?.timed ? seekRow(v) : Promise.resolve({ ok: false, code: 'untimed', message: T('Zamansız satıra atlanamaz.', 'Cannot seek to an untimed line.') });
          case 'playCue': {
            const row = cache.rows[v?.index];
            if (!row?.timed) return Promise.resolve({ok:false,code:'untimed'});
            const seek = v.translation ? seekTranslationRange(row.translationRanges?.[v.part] || row.translationRange,s) : seekRow(v.index);
            return finishReplay(seek,s.paused,cache.rev);
          }
          case 'seekTranslation': {
            const hasPart = v && typeof v === 'object';
            const row = cache.rows[hasPart ? v.row : v];
            return seekTranslationRange(hasPart ? row?.translationRanges?.[v.part] : row?.translationRange, s);
          }
          case 'prevCue': case 'nextCue': { const i = neighbor(num(s.time), t === 'prevCue' ? -1 : 1, num(s.duration) || Infinity); return i >= 0 ? seekRow(i) : Promise.resolve({ ok: false, code: 'none', message: T('Zamanlı cümle yok.', 'No timed sentence.') }); }
          case 'replay': {
            const i = idxAt(num(s.time));
            if (i < 0) return Promise.resolve({ ok: false, code: 'none', message: T('Şu an çalan zamanlı cümle yok.', 'No timed sentence is playing.') });
            const revision = cache.rev;
            return finishReplay(seekRow(i), s.paused, revision);
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
            const refuse = () => {
              range.failed = true;
              if (ownLoop !== range) return;
              if (previous && current() && activeLoop(F.snap(), previous)) ownLoop = previous;
              else clearOwnedLoop();
            };
            return dispatch('setAB', {a:range.a,b:range.b}).then(result => {
              if (!result.ok) refuse();
              else range.confirmed = true;
              return result;
            }, error => { refuse(); throw error; });
          }
          case 'copy':
            return Promise.resolve(window.api.copyText?.(v)).then(result => result === true
              ? { ok: true }
              : { ok: false, message: T('Metin panoya kopyalanamadı.', 'Could not copy text to the clipboard.') });
          default: return Promise.resolve({ ok: false, code: 'unsupported' });
        }
      }
    };
  }

  let mountedIdentity, mountedBrowserSession, mountedBrowserMediaKey;
  function unmount(keepFullscreenHost=false) {
    advancedOverlay?.close?.();
    if (inst) {
      if (mountedBrowserSession) {
        mountedBrowserSession.readingPrefs = inst.prefs(true);
        mountedBrowserSession.readingMediaKey = mountedBrowserMediaKey;
      }
      inst.destroy();
      inst = null;
    }
    mountedBrowserSession = null;
    mountedBrowserMediaKey = undefined;
    mountedIdentity = undefined;
    restore();
    if(!keepFullscreenHost){
      host?.remove();
      host = null;
      layer.classList.remove('cp-sahne-on');
      doc.body.classList.remove('shelf-sahne-on');
      const old = doc.querySelector('.ms-podcast-workspace');
      if (old) old.inert = false;
    }
    key = '';
  }
  function mount(kind, mode, intro, prefs, rebuild=false) {
    const k = `${kind}:${mode}`;
    if (!rebuild && inst && key === k && mountedIdentity === inst.a.identity()) return;
    const had = !!inst, active = doc.activeElement;
    if(!had&&active?.matches?.('button,a,summary')&&!active.closest('.sh-host'))stageOpener=active;
    const adapter = makeAdapter(kind, mode);
    if (!prefs && inst && key.startsWith(kind+':') && mountedIdentity===adapter.identity()) prefs=inst.prefs(true);
    const keepFullscreenHost=!!inst&&key.startsWith(kind+':')&&mountedIdentity===adapter.identity()&&doc.fullscreenElement===host;
    if (inst && key.startsWith(kind + ':') && prefs?.reading?.identity === adapter.identity()) inst.a.transferLoopTo(adapter);
    unmount(keepFullscreenHost);
    mountedIdentity = adapter.identity();
    mountedBrowserSession = kind === 'browser' ? window.BrowserStudy?.stageSession?.() : null;
    if (mountedBrowserSession) {
      mountedBrowserMediaKey = player.mediaKey;
      if (prefs?.reading?.identity !== mountedIdentity && mountedBrowserSession.readingMediaKey === mountedBrowserMediaKey) {
        const saved = mountedBrowserSession.readingPrefs;
        if (saved?.reading) {
          const draft=saved.reading.noteDraft;
          // Reopening this verified tab/media changes the presentation identity,
          // not the draft owner. Keep the shared receipt for an in-flight save.
          if(draft?.identity===saved.reading.identity)draft.identity=mountedIdentity;
          prefs = { ...saved, reading: { ...saved.reading, identity: mountedIdentity } };
        }
      }
    }
    if(!host){host = doc.createElement('div'); host.className = 'sh-host'; host.dataset.uiUntranslated=''; if(kind==='shelf'){host.classList.add('sh-shelf-host');doc.body.append(host);doc.body.classList.add('shelf-sahne-on');const old=doc.querySelector('.ms-podcast-workspace');if(old)old.inert=true;}else{layer.append(host);layer.classList.add('cp-sahne-on');}}
    host.style.top = kind === 'shelf' ? 'var(--window-controls-safe-height,38px)' : headH() + 'px';
    const isMounted = () => inst?.a === adapter;
    inst = new Sahne(host, adapter, {
      mode, intro: intro && !had, prefs,
      onMode: (m, p) => {
        if(!isMounted()||mountedIdentity!==adapter.identity())return;
        if(kind==='shelf'||kind==='local')window.MediaShelfUI?.rememberQueueScene?.(m);
        const restoreTabFocus = !!inst?.root.contains(doc.activeElement) && doc.activeElement.matches('[role="tab"][data-mode]');
        sticky = p;
        if(kind==='shelf'){sticky=undefined;mount('shelf',m==='study'?'study':'podcast',false,p);}
        else { if (kind === 'browser') window.BrowserPodcastUI?.setMode(m === 'podcast'); else {localView=m==='cinema'?'cinema':'study';PW().setPodcastMode(m==='podcast');} evaluate(); }
        if(restoreTabFocus)inst?.root.querySelector('[role="tab"][aria-selected="true"]')?.focus({preventScroll:true});
      },
      onClose: () => {
        if(!isMounted())return;
        stageEpoch++;
        const opener=stageOpener;stageOpener=null;
        if(kind==='shelf'){window.MediaShelfUI?.closePodcastMode?.();unmount();}
        else{
          if(kind==='browser'){window.BrowserStudy?.close?.();unmount();}
          else{localView='cinema';PW().setPodcastMode(false);SS.set('cp-sahne-off','1');}
          evaluate();
        }
        if(kind==='browser')window.syncBrowserOcclusion?.();
        const fallback=kind==='browser'?$('browserStudyOpen'):$('cpSahneBtn');
        (opener?.isConnected&&!opener.disabled?opener:fallback)?.focus({preventScroll:true});
      },
      onClassic: () => { if(mode!=='cinema'){void inst?.run('advanced');return;} SS.set('cp-sahne-off', '1'); evaluate(); },
      onSource: (id, p) => { sticky = p; unmount(); if(kind==='shelf'){if(window.MediaShelfUI?.readSnapshot())void window.CinemaSahne.openShelf({mode}).catch(error=>console.warn('shelf-sahne',error));return;}window.BrowserStudy?.refresh?.();evaluate(); }
    });
    key = k;
    if(!had&&stageOpener===active)inst.root.querySelector('[role=tab][aria-selected=true]')?.focus({preventScroll:true});
  }
  let sticky;
  // Bumped whenever the user closes the Stage; a late asynchronous open compares it before mounting.
  let stageEpoch = 0, openTicket = 0;
  const evaluate = safe(() => {
    if (!ready()) return; if(key.startsWith('shelf:')&&layer.classList.contains('hidden')){if(window.MediaShelfUI?.readSnapshot())return;unmount();} let want = null;
    if (!layer.classList.contains('hidden')) {
      if (layer.classList.contains('workspace-browser')) {
        if (window.BrowserStudy?.isActive?.() ?? layer.classList.contains('browser-study-mode')) {
          want = ['browser', window.BrowserPodcastUI?.isActive?.() ? 'podcast' : 'study'];
        }
      }
      else if ((localView!=='cinema'||PW().isPodcastMode()||SS.get('cp-sahne-off')!=='1') && PW().bridge && !document.getElementById('playerWorkspaceV3')?.hidden && !layer.classList.contains('source-catalog-open')) want = ['local', PW().isPodcastMode() ? 'podcast' : localView];
    }
    if (!want) { if (inst) unmount(); entries(); return; }
    const prefs = sticky;
    sticky = undefined;
    mount(want[0], want[1], true, prefs); entries();
  });
  const entries = safe(() => {
    const actions = doc.querySelector('.player-head-actions');
    if (actions && !$('cpSahneBtn')) { const b = doc.createElement('button'); b.type = 'button'; b.id = 'cpSahneBtn'; b.className = 'catalog-entry player-catalog-entry'; b.dataset.uiUntranslated = ''; b.textContent = T('Sahne', 'Stage'); b.onclick = () => { if (!PW()?.bridge) return; SS.set('cp-sahne-off', '0'); evaluate(); }; actions.prepend(b); }
    const lb = $('cpSahneBtn'); if (lb) { lb.textContent=T('Sahne','Stage'); lb.hidden = layer.classList.contains('workspace-browser'); const ok = !!PW()?.bridge; lb.disabled = !ok; lb.title = ok ? T('Çift dilli sahne (yerel oynatıcı)', 'Bilingual stage (local player)') : T('Önce bir medya aç.', 'Open a media file first.'); }
  });

  new MutationObserver(evaluate).observe(layer, { attributes: true, attributeFilter: ['class'] });
  doc.addEventListener('ui-locale-change', () => {
    if(!inst)return;
    const active=doc.activeElement,identity=inst.a.identity();
    const readingFocus=inst.root.contains(active)&&active.matches?.('[data-r=q],[data-r=chapterSearch]')
      ?{role:active.dataset.r,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection}:null;
    const k=key,p=inst.prefs(true),[a,b]=k.split(':');
    mount(a,b,false,p,true);
    if(readingFocus&&inst?.a.identity()===identity){
      const input=inst.root.querySelector(`[data-r="${readingFocus.role}"]`);
      if(input&&!input.closest('[hidden]')){
        input.focus({preventScroll:true});
        if(readingFocus.start!==null)input.setSelectionRange(readingFocus.start,readingFocus.end,readingFocus.direction);
      }
    }
  });
  const off = PW()?.subscribe?.(() => { if(!document.hidden)evaluate(); });
  doc.addEventListener('visibilitychange',()=>{doc.documentElement.dataset.sahneHidden=String(document.hidden);if(!document.hidden)evaluate();});
  window.addEventListener('resize',()=>{if(host&&!key.startsWith('shelf:'))host.style.top=headH()+'px';});
  doc.addEventListener('click',e=>{if(e.target.closest?.('[data-podcast-view]')){SS.set('cp-sahne-off','0');queueMicrotask(evaluate);}},true);
  window.CinemaSahne = Object.freeze({async openShelf({mode='podcast'}={}){const owner=window.MediaShelfUI?.readSnapshot();if(!owner)return {ok:false,code:'no-source'};const epoch=stageEpoch,ticket=++openTicket;if(!window.MediaShelfUI.isPodcastMode?.())await window.MediaShelfUI.openPodcastMode();const now=window.MediaShelfUI.readSnapshot();if(now?.mediaKey!==owner.mediaKey||now?.generation!==owner.generation)return {ok:false,code:'stale-source'};if(epoch!==stageEpoch||typeof window.MediaShelfUI.isPodcastMode==='function'&&!window.MediaShelfUI.isPodcastMode())return {ok:false,code:'closed'};if(ticket!==openTicket)return {ok:false,code:'superseded'};mount('shelf',mode==='study'?'study':'podcast',false);return {ok:true};},open({mode='cinema'}={}){SS.set('cp-sahne-off','0');if(player.workspaceMode==='browser'){window.BrowserStudy?.open?.({preservePodcast:true});window.BrowserPodcastUI?.setMode(mode==='podcast');}else{localView=mode==='cinema'?'cinema':'study';PW()?.setPodcastMode(mode==='podcast');}evaluate();},close(){
    stageEpoch++;
    SS.set('cp-sahne-off','1');
    if (key.startsWith('browser:')) window.BrowserStudy?.close?.();
    unmount();
  },evaluate,get current(){return inst;}});
  evaluate();
})();
