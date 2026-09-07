const crypto = require('crypto');
const { SENTENCE_PROTOCOL_VERSION, normalizeText, protectedCue, sentenceEnded,
  decodeSentenceTranslation, fitTranslationParts } = require('./subtitle-sentence-layout');

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeCues(rawCues) {
  return (Array.isArray(rawCues) ? rawCues : []).map((cue, index) => ({
    id: String(cue && (cue.id ?? cue.index ?? index)),
    start: Math.max(0, finiteNumber(cue && cue.start)),
    end: Math.max(0, finiteNumber(cue && cue.end)),
    text: String(cue && cue.text || '').replace(/\s+/g, ' ').trim(),
    speaker: String(cue?.speaker || ''),
    protected: Boolean(cue?.protected) || protectedCue(cue || {}),
  })).filter((cue) => cue.text && cue.end >= cue.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function sentenceIdFor(cues) {
  const raw = cues.map((cue) => `${cue.id}:${cue.text}`).join('|');
  const hash = crypto.createHash('sha1').update(raw, 'utf8').digest('hex').slice(0, 12);
  return `sentence:${cues[0].id}:${cues[cues.length - 1].id}:${hash}`;
}

function assembleCueSentences(rawCues, options = {}) {
  const cues = normalizeCues(rawCues);
  const maxGap = Math.max(0, finiteNumber(options.maxGap, 1.2));
  const maxChars = Math.max(40, finiteNumber(options.maxChars, 280));
  const maxDuration = Math.max(1, finiteNumber(options.maxDuration, 12));
  const maxParts = Math.max(1, Math.min(12, Math.trunc(finiteNumber(options.maxParts, 6))));
  const sentences = [];
  let group = [];

  const flush = () => {
    if (!group.length) return;
    const text = group.map((cue) => cue.text).join(' ').replace(/\s+/g, ' ').trim();
    sentences.push({
      id: sentenceIdFor(group),
      start: group[0].start,
      end: group[group.length - 1].end,
      text,
      cueIds: group.map((cue) => cue.id),
      pieces: group.map((cue) => ({ cueId: cue.id, text: cue.text, start: cue.start, end: cue.end })),
    });
    group = [];
  };

  for (const cue of cues) {
    const previous = group[group.length - 1];
    const joinedLength = group.reduce((sum, item) => sum + item.text.length + 1, 0) + cue.text.length;
    if (previous && (cue.protected || previous.protected || cue.speaker !== previous.speaker
      || cue.start - previous.end < -0.05 || cue.start - previous.end > maxGap
      || cue.end - group[0].start > maxDuration || group.length >= maxParts || joinedLength > maxChars)) flush();
    group.push(cue);
    if (cue.protected || sentenceEnded(cue.text)) flush();
  }
  flush();
  return sentences;
}

function translationCacheKey(sentence, context = {}) {
  const material = JSON.stringify({
    version: SENTENCE_PROTOCOL_VERSION,
    promptVersion: String(context.promptVersion || SENTENCE_PROTOCOL_VERSION),
    mediaIdentity: String(context.mediaIdentity || ''),
    trackIdentity: String(context.trackIdentity || ''),
    sourceLineage: String(context.sourceLineage || ''),
    text: normalizeText(sentence?.text),
    pieces: (sentence?.pieces || []).map((piece) => [normalizeText(piece.text),
      finiteNumber(piece.end) - finiteNumber(piece.start)]),
    before: normalizeText(sentence?.contextBefore),
    after: normalizeText(sentence?.contextAfter),
    contextHash: String(sentence && sentence.contextHash || context.contextHash || ''),
    targetLanguage: String(context.targetLanguage || ''),
    model: String(context.model || ''),
    provider: String(context.provider || ''),
    style: String(context.style || ''),
    glossaryVersion: String(context.glossaryVersion || ''),
    // Oturum içinde öğrenilen terimler değiştikçe eski çeviri cache'i
    // yeni prompt'a yanlışlıkla yeniden kullanılmamalı.
    terminologyVersion: String(context.terminologyVersion || ''),
  });
  return crypto.createHash('sha256').update(material, 'utf8').digest('hex');
}

function planTranslationWindow(sentences, playhead, options = {}) {
  const now = Math.max(0, finiteNumber(playhead));
  const lookBehind = Math.max(0, finiteNumber(options.lookBehind, 15));
  const lookAhead = Math.max(1, finiteNumber(options.lookAhead, 90));
  const excluded = options.excluded instanceof Set ? options.excluded : new Set(options.excluded || []);
  return (Array.isArray(sentences) ? sentences : []).filter((sentence) => (
    sentence && !excluded.has(sentence.id)
      && finiteNumber(sentence.end) >= now - lookBehind
      && finiteNumber(sentence.start) <= now + lookAhead
  )).sort((a, b) => {
    const aActive = a.start <= now && a.end >= now ? 0 : 1;
    const bActive = b.start <= now && b.end >= now ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    const aAhead = a.start >= now ? 0 : 1;
    const bAhead = b.start >= now ? 0 : 1;
    if (aAhead !== bAhead) return aAhead - bAhead;
    return aAhead === 0 ? a.start - b.start : b.end - a.end;
  });
}

function distributeTranslation(sentence, translatedText) {
  const pieces = Array.isArray(sentence && sentence.pieces) ? sentence.pieces : [];
  if (!pieces.length) return [];
  const translation = decodeSentenceTranslation(translatedText, pieces.length);
  if (translation.parts) return pieces.map((piece, index) => ({ ...piece, text: translation.parts[index] }));
  const normalized = String(translation.text || '').trim();
  if (!normalized) return [];
  // CJK/Tayca gibi boşluksuz yazılarda split() tek parça üretip diğer cue'ları
  // sessizce düşürüyordu. Grapheme dizisiyle kayıpsız dağıtım yap.
  const spaceless = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0e00-\u0e7f]/u.test(normalized)
    && !/\s/u.test(normalized);
  const words = spaceless ? Array.from(normalized) : normalized.split(/\s+/).filter(Boolean);
  const separator = spaceless ? '' : ' ';
  if (pieces.length === 1) return [{ ...pieces[0], text: words.join(separator) }];
  // Çeviri kaynak parçadan daha az kelimeye düştüğünde her kaynak cue için
  // ayrı metin üretmek boş veya yinelenen balonlara yol açar. Komşu zaman
  // aralıklarını birleştirerek her çıktı cue'sunun okunur metni olmasını sağla.
  if (words.length < pieces.length) {
    return words.map((word, index) => {
      const firstIndex = Math.floor((index * pieces.length) / words.length);
      const lastIndex = Math.max(firstIndex,
        Math.floor(((index + 1) * pieces.length) / words.length) - 1);
      return { ...pieces[firstIndex], end: pieces[lastIndex].end, text: word };
    });
  }
  const parts = fitTranslationParts(normalized, pieces);
  return pieces.map((piece, index) => ({ ...piece, text: parts[index] }));
}

class BrowserTranslationScheduler {
  constructor(options = {}) {
    if (typeof options.translate !== 'function') throw new TypeError('translate fonksiyonu gerekli.');
    this.translate = options.translate;
    this.requireSentenceParts = Boolean(options.requireSentenceParts);
    this.cache = options.cache || new Map();
    this.maxConcurrent = Math.max(1, Math.trunc(finiteNumber(options.maxConcurrent, 2)));
    this.lookBehind = Math.max(0, finiteNumber(options.lookBehind, 15));
    this.lookAhead = Math.max(1, finiteNumber(options.lookAhead, 90));
    this.farSeekThreshold = Math.max(1, finiteNumber(options.farSeekThreshold, 30));
    this.maxAttempts = Math.max(1, Math.trunc(finiteNumber(options.maxAttempts, 3)));
    this.retryBaseMs = Math.max(10, finiteNumber(options.retryBaseMs, 1000));
    this.retryMaxMs = Math.max(this.retryBaseMs, finiteNumber(options.retryMaxMs, 10000));
    this.onResult = typeof options.onResult === 'function' ? options.onResult : () => {};
    this.onState = typeof options.onState === 'function' ? options.onState : () => {};
    this.context = { ...(options.context || {}) };
    this.sentences = [];
    this.results = new Map();
    this.pending = new Map();
    this.failures = new Map();
    this.retryTimers = new Set();
    this.inFlightByCacheKey = new Map();
    this.queue = [];
    this.playhead = 0;
    this.generation = 0;
    this.completeTrack = false;
    this.paused = Boolean(options.paused);
    this.idleWaiters = [];
  }

  setContext(context = {}) {
    this.context = { ...this.context, ...context };
    return this.context;
  }

  hasStableCacheIdentity() {
    // An explicitly empty track identity is unsafe for browser cache reuse.
    // Legacy standalone scheduler callers without the field keep old behavior;
    // the production entry point rejects an empty track id before scheduling.
    if (!Object.prototype.hasOwnProperty.call(this.context, 'trackIdentity')) return true;
    return String(this.context.trackIdentity || '').trim().length > 0;
  }

  setSentences(sentences) {
    this.cancelAll('Kaynak altyazı değişti.');
    this.generation += 1;
    this.sentences = (Array.isArray(sentences) ? sentences : []).map((sentence) => ({ ...sentence }));
    this.results.clear();
    this.failures.clear();
    this.completeTrack = false;
    return this.sentences.length;
  }

  reconcileSentences(sentences) {
    const next = (Array.isArray(sentences) ? sentences : []).map((sentence) => ({ ...sentence }));
    const previous = new Map(this.sentences.map((sentence) => [sentence.id, sentence]));
    // Aynı metnin zamanları, cue sınırları veya bağlamı değişmiş olabilir.
    // Yalnız tamamen aynı cümlenin sonucu ve çalışan isteği korunur.
    const unchanged = new Set(next.filter((sentence) =>
      JSON.stringify(previous.get(sentence.id)) === JSON.stringify(sentence)).map((sentence) => sentence.id));
    for (const [id, job] of this.pending) {
      if (unchanged.has(id)) continue;
      job.controller.abort('Kaynak cümle güncellendi.');
      this.pending.delete(id);
    }
    for (const id of this.results.keys()) if (!unchanged.has(id)) this.results.delete(id);
    for (const id of this.failures.keys()) if (!unchanged.has(id)) this.failures.delete(id);
    this.sentences = next;
    this.updatePlayhead(this.playhead);
    return this.sentences.length;
  }

  updatePlayhead(seconds) {
    const next = Math.max(0, finiteNumber(seconds));
    const farSeek = Math.abs(next - this.playhead) >= this.farSeekThreshold;
    this.playhead = next;
    const windowIds = new Set(planTranslationWindow(this.sentences, next, {
      lookBehind: this.lookBehind,
      lookAhead: this.lookAhead,
    }).map((sentence) => sentence.id));
    if (farSeek) {
      for (const [id, job] of this.pending.entries()) {
        if (!windowIds.has(id)) {
          job.controller.abort('Oynatma konumu değişti.');
          // Abort sinyali sağlayıcıya göre asenkron gelebilir; işi hemen
          // pending'den çıkarmak aynı cue'nun ikinci kez kuyruğa girmesini önler.
          this.pending.delete(id);
        }
      }
    }
    const now = Date.now();
    const excluded = new Set([...this.results.keys(), ...this.pending.keys()]);
    for (const [id, failure] of this.failures.entries()) {
      if (failure.terminal || failure.retryAt > now) excluded.add(id);
    }
    const windowQueue = planTranslationWindow(this.sentences, next, {
      lookBehind: this.lookBehind,
      lookAhead: this.lookAhead,
      excluded,
    });
    if (this.completeTrack) {
      const windowIds = new Set(windowQueue.map((sentence) => sentence.id));
      const rest = this.sentences.filter((sentence) => !excluded.has(sentence.id) && !windowIds.has(sentence.id))
        .sort((a, b) => Math.abs(a.start - next) - Math.abs(b.start - next));
      this.queue = [...windowQueue, ...rest];
    } else {
      this.queue = windowQueue;
    }
    this.emitState();
    this.pump();
    return this.queue.map((sentence) => sentence.id);
  }

  emitState() {
    const incomplete = this.sentences.filter((sentence) => !this.results.has(sentence.id));
    this.onState({
      playhead: this.playhead,
      queued: this.queue.length,
      pending: this.pending.size,
      completed: this.results.size,
      total: this.sentences.length,
      remaining: incomplete.length,
      estimatedTokens: Math.ceil(incomplete.reduce((sum, sentence) => sum + sentence.text.length, 0) / 4),
      completeTrack: this.completeTrack,
      failed: [...this.failures.values()].filter((failure) => failure.terminal).length,
      retrying: [...this.failures.values()].filter((failure) => !failure.terminal).length,
      paused: this.paused,
    });
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this.emitState();
    if (!this.paused) this.pump();
    return this.paused;
  }

  completeAll() {
    this.completeTrack = true;
    this.updatePlayhead(this.playhead);
    return this.queue.length + this.pending.size;
  }

  retryFailed() {
    const failedIds = [...this.failures.entries()]
      .filter(([, failure]) => failure.terminal)
      .map(([sentenceId]) => sentenceId);
    if (!failedIds.length) return 0;
    for (const sentenceId of failedIds) this.failures.delete(sentenceId);
    this.completeTrack = true;
    this.updatePlayhead(this.playhead);
    return failedIds.length;
  }

  async readCache(key) {
    if (!this.hasStableCacheIdentity()) return undefined;
    return this.cache && typeof this.cache.get === 'function' ? this.cache.get(key) : undefined;
  }

  async writeCache(key, value) {
    if (!this.hasStableCacheIdentity()) return;
    if (this.cache && typeof this.cache.set === 'function') await this.cache.set(key, value);
  }

  translateShared(sentence, cacheKey, jobController) {
    // Cache okuması sürerken seek/cancel gelmiş olabilir. AbortSignal, olay
    // dinleyicisi sonradan eklenince geçmiş abort olayını yeniden yayımlamaz;
    // bu kapı olmazsa artık tüketicisi olmayan pahalı bir API isteği başlar.
    if (jobController.signal.aborted) {
      return Promise.reject(new Error(String(jobController.signal.reason || 'Çeviri isteği iptal edildi.')));
    }
    let shared = this.inFlightByCacheKey.get(cacheKey);
    if (shared && (shared.settled || shared.controller.signal.aborted)) {
      if (this.inFlightByCacheKey.get(cacheKey) === shared) this.inFlightByCacheKey.delete(cacheKey);
      shared = null;
    }
    if (!shared) {
      const controller = new AbortController();
      shared = { controller, consumers: new Set(), settled: false, promise: null };
      shared.promise = Promise.resolve().then(() => this.translate(
        sentence, { ...this.context, signal: controller.signal }
      )).finally(() => {
        shared.settled = true;
        if (this.inFlightByCacheKey.get(cacheKey) === shared) this.inFlightByCacheKey.delete(cacheKey);
      });
      this.inFlightByCacheKey.set(cacheKey, shared);
    }
    const consumer = {};
    shared.consumers.add(consumer);
    const release = () => {
      shared.consumers.delete(consumer);
      if (!shared.settled && shared.consumers.size === 0) shared.controller.abort('Çeviri isteği artık kullanılmıyor.');
    };
    jobController.signal.addEventListener('abort', release, { once: true });
    return shared.promise.finally(() => {
      jobController.signal.removeEventListener('abort', release);
      release();
    });
  }

  pump() {
    if (this.paused) {
      this.emitState();
      return;
    }
    while (this.pending.size < this.maxConcurrent && this.queue.length) {
      const sentence = this.queue.shift();
      if (!sentence || this.pending.has(sentence.id) || this.results.has(sentence.id)) continue;
      this.start(sentence);
    }
    this.emitState();
    this.resolveIdleIfNeeded();
  }

  start(sentence) {
    const generation = this.generation;
    const controller = new AbortController();
    const cacheKey = translationCacheKey(sentence, this.context);
    const job = { sentence, controller, cacheKey, generation };
    this.pending.set(sentence.id, job);
    Promise.resolve(this.readCache(cacheKey)).then((cached) => {
      if (cached !== undefined && cached !== null && cached !== '') {
        try { return { ...decodeSentenceTranslation(cached, sentence.pieces.length, this.requireSentenceParts), cached: true }; }
        catch (_) { /* Bozuk kayıt yeniden istenir; aynı hata önbellekten tekrarlanmaz. */ }
      }
      return this.translateShared(sentence, cacheKey, controller)
        .then((value) => ({ ...decodeSentenceTranslation(value, sentence.pieces.length, this.requireSentenceParts), cached: false }));
    }).then(async (result) => {
      if (controller.signal.aborted || generation !== this.generation) return;
      if (!String(result.text || '').trim()) throw new Error('Çeviri sağlayıcısı boş yanıt döndürdü.');
      const cues = distributeTranslation(sentence, result);
      if (!result.cached) {
        // Önbellek bir hızlandırmadır; disk/kasa yazımı başarısız olduğunda
        // sağlayıcıdan başarıyla gelen çeviriyi kullanıcıdan saklama.
        try { await this.writeCache(cacheKey, JSON.stringify({ text: result.text, parts: result.parts })); }
        catch (_) { /* Sonuç kullanılabilir; yalnız bu tur kalıcılaştırılamadı. */ }
      }
      if (controller.signal.aborted || generation !== this.generation) return;
      const value = {
        sentenceId: sentence.id,
        text: result.text,
        cached: result.cached,
        cues,
      };
      this.failures.delete(sentence.id);
      this.results.set(sentence.id, value);
      this.onResult(value, sentence);
    }).catch((error) => {
      if (!controller.signal.aborted && generation === this.generation) {
        const previous = this.failures.get(sentence.id);
        const attempts = (previous?.attempts || 0) + 1;
        const terminal = attempts >= this.maxAttempts;
        const delay = Math.min(this.retryMaxMs, this.retryBaseMs * (2 ** Math.max(0, attempts - 1)));
        const failure = {
          attempts,
          terminal,
          retryAt: terminal ? Infinity : Date.now() + delay,
          error: error.message || String(error),
        };
        this.failures.set(sentence.id, failure);
        this.onResult({
          sentenceId: sentence.id,
          error: failure.error,
          attempt: attempts,
          retrying: !terminal,
          nextRetryMs: terminal ? 0 : delay,
          cues: [],
        }, sentence);
        if (!terminal) {
          const timer = setTimeout(() => {
            this.retryTimers.delete(timer);
            if (generation === this.generation) this.updatePlayhead(this.playhead);
            else this.resolveIdleIfNeeded();
          }, delay);
          this.retryTimers.add(timer);
        }
      }
    }).finally(() => {
      const current = this.pending.get(sentence.id);
      if (current === job) this.pending.delete(sentence.id);
      this.pump();
    });
  }

  cancelAll(reason = 'İptal edildi.') {
    this.queue = [];
    for (const job of this.pending.values()) job.controller.abort(reason);
    this.pending.clear();
    for (const shared of this.inFlightByCacheKey.values()) shared.controller.abort(reason);
    this.inFlightByCacheKey.clear();
    for (const timer of this.retryTimers) clearTimeout(timer);
    this.retryTimers.clear();
    this.failures.clear();
    this.emitState();
    this.resolveIdleIfNeeded();
  }

  resolveIdleIfNeeded() {
    if (this.queue.length || this.pending.size || this.retryTimers.size) return;
    const waiters = this.idleWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  whenIdle() {
    if (!this.queue.length && !this.pending.size && !this.retryTimers.size) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  snapshot() {
    return {
      playhead: this.playhead,
      total: this.sentences.length,
      completed: this.results.size,
      remaining: this.sentences.length - this.results.size,
      completeTrack: this.completeTrack,
      paused: this.paused,
      queued: this.queue.map((sentence) => sentence.id),
      pending: [...this.pending.keys()],
      failures: [...this.failures.entries()].map(([sentenceId, failure]) => ({ sentenceId, ...failure })),
      results: [...this.results.values()].map((value) => ({ ...value, cues: value.cues.map((cue) => ({ ...cue })) })),
    };
  }
}

module.exports = {
  BrowserTranslationScheduler,
  assembleCueSentences,
  distributeTranslation,
  normalizeCues,
  planTranslationWindow,
  translationCacheKey,
};
