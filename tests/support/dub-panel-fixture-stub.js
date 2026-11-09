// Dublaj paneli için kontrollü window.api katmanı (yalnız tests/ Chromium düzeneği; ürün koduna girmez).
// discover-fixture-stub.js'in Proxy'sinin üstüne feedsRequest/dubConfig vb. koyar; gerçek renderer HTML/CSS/JS'si çalışır.
(() => {
  'use strict';
  const base = window.api, over = {}, fx = window.__dub = { calls: [], over };
  fx.listeners = []; fx.emit = event => { for (const callback of fx.listeners) callback(event); };
  over.onDubEvent = callback => { fx.listeners.push(callback); }; // Birden çok modül kaydolur; testler olayı hepsine yayar.
  const VERSION = 'a'.repeat(64), SHA = 'c'.repeat(64);
  window.api = new Proxy({}, { get(_, key) { if (key === 'then') return undefined; return Object.prototype.hasOwnProperty.call(over, key) ? over[key] : base[key]; } });
  const track = (extra = {}) => ({ state: 'timed', format: 'vtt', provenance: 'publisher', status: 'complete', ...extra });
  const scenarios = {
    ready: { workspace: { transcript: track(), translation: track({ provenance: 'user', targetLanguage: 'tr' }) } },
    longnames: { title: 'Bölüm 214 — Çok uzun bir bölüm başlığı: yapay zekâ, dil öğrenimi ve gündelik konuşmada doğal çeviri üzerine üç saatlik tartışma (uzun sürüm)', workspace: { transcript: track({ provenance: 'asr', coverage: { start: 600, end: 750 }, timeline: { clock: 'absolute-media-seconds', sha256: SHA } }), translation: track({ provenance: 'asr', targetLanguage: 'tr', status: 'partial', coverage: { start: 600, end: 750 }, timeline: { clock: 'absolute-media-seconds', sha256: SHA } }) }, exact: true },
    untimed: { workspace: { transcript: { state: 'untimed', format: 'plain', provenance: 'publisher', status: 'complete' } } },
    unverified: { workspace: { transcript: track({ provenance: 'asr', timeline: { clock: 'absolute-media-seconds', sha256: SHA } }), translation: track({ provenance: 'asr', targetLanguage: 'tr', timeline: { clock: 'absolute-media-seconds', sha256: SHA } }) } },
    novoice: { workspace: { transcript: track(), translation: track({ provenance: 'user', targetLanguage: 'tr' }) }, noVoice: true },
    partialsrt: { workspace: { transcript: track(), translation: track({ provenance: 'user', targetLanguage: 'tr' }) }, partialPath: true },
    failed: { workspace: { transcript: track(), translation: track({ provenance: 'user', targetLanguage: 'tr' }) }, materializeError: 'Transcript timing could not be preserved for dubbing / Dublaj için döküm zamanları korunamadı.' },
  };
  fx.scenarios = Object.keys(scenarios);
  // Sahne (shelf Podcast) görünümü için: gerçek MediaShelfUI yerine dar, kontrollü kaynak; gerçek cinema-sahne.js/sahne.js/CSS çalışır.
  fx.sahne = async (mode, variant) => {
    const sentences = ['Welcome back to the show, today we talk about how language models change the way people learn to speak.', 'The first thing to notice is that fluency is not the same as accuracy, and listeners forgive a lot.', 'Our guest has spent twenty years teaching conversation to adults who were afraid to open their mouths.', 'Let me start with a simple question: what does a good translation feel like when you hear it spoken?', 'It feels invisible, she said, you stop noticing the words and start following the person.'];
    const tr = ['Programa tekrar hoş geldiniz; bugün dil modellerinin insanların konuşmayı öğrenme biçimini nasıl değiştirdiğini konuşuyoruz.', 'Fark edilecek ilk şey, akıcılığın doğrulukla aynı olmadığı ve dinleyicilerin çok şeyi bağışladığıdır.', 'Konuğumuz, ağzını açmaktan korkan yetişkinlere yirmi yıl boyunca konuşma öğretti.', 'Basit bir soruyla başlayayım: iyi bir çeviri sesli duyulduğunda nasıl hissettirir?', 'Görünmez hissettirir dedi, sözcükleri fark etmeyi bırakıp kişiyi takip etmeye başlarsınız.'];
    const cues = (list, lag = 0) => Array.from({ length: 40 }, (_, i) => ({ id: 'c' + i, start: i * 7 + lag, end: i * 7 + 6 + lag, text: list[i % list.length] }));
    const track = (role, list) => ({ id: role + '-track', revision: 'r1', role, timed: true, offsetSeconds: 0, cues: cues(list), language: role === 'source' ? 'en' : 'tr' });
    const tracks = variant === 'untimed' ? [{ id: 'source-text', revision: 'r1', role: 'source', timed: false, text: sentences.join('\n\n'), cues: [] }]
      : variant === 'single' ? [track('source', sentences)] : [track('source', sentences), track('translation', tr)];
    if (variant === 'missing') {
      tracks[1].cues[1].translationMissing = true;
      tracks[1].cues[1].text = sentences[1];
      tracks[0].cues[3].text = tracks[1].cues[3].text = 'The people who were there would have heard what they said in the room.';
    }
    const snap = { mediaKey: 'shelf:B', generation: 1, entryId: 'entry-B', sourceVersion: VERSION, title: 'Bölüm 214 — Yapay zekâ ve dil öğrenimi: konuşmayı yeniden düşünmek', duration: 1800, time: 21, paused: false, rate: 1, capabilities: { seek: { support: 'yes' } } };
    if (mode === 'cinema') {
      const source = tracks[0], translation = tracks[1] || {id:'translation-track', revision:'empty', role:'translation', cues:[], offsetSeconds:0};
      Object.assign(player, { workspaceMode:'player', mediaKey:'local:fixture', generation:1,
        subRole:'source', sub2Role:'translation', subLang:'en', sub2Lang:'tr',
        subPath:'C:/fixture/source.srt', offset:0, cues:source.cues, cues2:translation.cues });
      fx.stageCommands=[];
      let podcastMode=false;
      window.PlayerWorkspaceIntegration = { ...window.PlayerWorkspaceIntegration, bridge:{},
        snapshot:() => ({...snap, mediaKey:player.mediaKey, sourceKind:'local'}),
        getTranscriptTracks:() => [{...source,offsetSeconds:player.offset}, translation],
        executeExisting:async command=>{
          fx.stageCommands.push(command.type);
          if(command.type==='setAB'){player.abA=command.a;player.abB=command.b;}
          if(command.type==='seek')snap.time=command.time;
          return {ok:true};
        },
        isPodcastMode:() => podcastMode, setPodcastMode(value) {podcastMode=value;} };
      document.getElementById('playerTitle').textContent = snap.title;
      document.getElementById('playerEmpty').classList.add('hidden');
      document.getElementById('playerWorkspaceV3').hidden = false;
      document.getElementById('playerLayer').classList.remove('hidden');
      hideHomeOnVideoLoad();
      CinemaSahne.open({mode});
      return {ok:CinemaSahne.current?.o.mode === mode};
    }
    const shelf = { readSnapshot: () => snap, isPodcastMode: () => true, openPodcastMode: async () => {}, getTranscriptTracks: () => tracks, executeExisting: async () => ({ ok: true }), podcastInfo: () => ({}) };
    window.MediaShelfUI = new Proxy(shelf, { get: (target, key) => key in target ? target[key] : key === 'then' ? undefined : () => null });
    return CinemaSahne.openShelf({ mode });
  };
  fx.reset = name => {
    const cfg = scenarios[name], layer = document.getElementById('playerLayer'), video = document.getElementById('playerVideo');
    fx.cfg = cfg; fx.calls.length = 0; fx.revision = 'one'; fx.holdPlan = false; fx.started = null;
    layer.classList.remove('hidden'); video.setAttribute('src', 'data:audio/wav;base64,UklGRgAAAABXQVZF');
    document.getElementById('playerTitle').textContent = cfg.title || 'Bölüm 12 — Kısa başlık';
    Object.assign(player, { workspaceMode: 'player', mediaKey: 'rss:ep1', generation: 3, localPath: '', subPath: '', sub2Path: '', sub2Role: '', browserTracks: [],
      workspaceAudio: { entryId: 'e1', sourceVersion: VERSION, mediaKey: 'rss:ep1', generation: 3, ...(cfg.exact ? { exactAudio: true, sourceBinding: { sha256: SHA } } : {}) } });
    over.feedsRequest = async request => {
      fx.calls.push(request.action + (request.role ? ':' + request.role : ''));
      if (request.action === 'podcast-workspace') return { ok: true, sourceVersion: VERSION, workspace: cfg.workspace };
      if (request.action === 'podcast-materialize') return cfg.materializeError ? { ok: false, error: cfg.materializeError } : { ok: true, path: `C:/podcast-transcripts/${request.role || 'source'}-dub-${fx.revision}${cfg.partialPath ? '.partial' : ''}.srt`, derived: true, format: 'srt', role: request.role || 'source', revision: (request.role || 'source') + fx.revision + '0123456789' };
      if (request.action === 'podcast-exact-audio') return { available: true, sourceVersion: 'copyver' };
      return { ok: false };
    };
    over.dubConfig = async () => cfg.noVoice ? ({ ok: true, ready: false, reference: '', transcript: '', engine: 'voxcpm2' }) : ({ ok: true, ready: true, reference: 'C:/Voices/Anna reference.wav', transcript: 'Referans metni', engine: 'voxcpm2' });
    over.planDub = async () => { if (fx.holdPlan) await new Promise(resolve => { fx.releasePlan = resolve; }); return ({ ok: true, groups: [{ key: 'g1', seconds: 2.4, text: 'Merhaba, bugünkü bölüme hoş geldiniz.', start: 0, end: 2400 }], sourceHash: 'hash', skipped: 0 }); };
    over.latestDub = async () => ({ ok: true, output: null });
    over.startDub = async payload => { fx.started = payload; fx.calls.push('startDub'); return { ok: true }; };
    window.PlayerSourceCatalogIntegration = { podcastTools() {}, async openPodcastEntry() { return {}; } };
    return true;
  };
})();
