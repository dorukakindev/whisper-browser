const crypto = require('crypto');

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
  })).filter((cue) => cue.text && cue.end >= cue.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function sentenceEnded(text) {
  return /[.!?…]["'”’)}\]]*$/.test(String(text || '').trim());
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
    if (previous && (cue.start - previous.end > maxGap || joinedLength > maxChars)) flush();
    group.push(cue);
    if (sentenceEnded(cue.text) || joinedLength >= maxChars) flush();
  }
  flush();
  return sentences;
}

function translationCacheKey(sentence, context = {}) {
  const material = JSON.stringify({
    text: String(sentence && sentence.text || ''),
    contextHash: String(sentence && sentence.contextHash || context.contextHash || ''),
    targetLanguage: String(context.targetLanguage || ''),
    model: String(context.model || ''),
    style: String(context.style || ''),
    glossaryVersion: String(context.glossaryVersion || ''),
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
  const words = String(translatedText || '').trim().split(/\s+/).filter(Boolean);
  if (pieces.length === 1) return [{ ...pieces[0], text: words.join(' ') }];
  const weights = pieces.map((piece) => Math.max(1, String(piece.text || '').replace(/\s/g, '').length));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const result = [];
  let cursor = 0;
  let cumulativeWeight = 0;
  for (let index = 0; index < pieces.length; index++) {
    cumulativeWeight += weights[index];
    let end = index === pieces.length - 1 ? words.length : Math.round((cumulativeWeight / totalWeight) * words.length);
    if (words.length >= pieces.length) {
      end = Math.max(cursor + 1, Math.min(words.length - (pieces.length - index - 1), end));
    }
    result.push({ ...pieces[index], text: words.slice(cursor, end).join(' ') });
    cursor = end;
  }
  return result;
}

class BrowserTranslationScheduler {
  constructor(options = {}) {
    if (typeof options.translate !== 'function') throw new TypeError('translate fonksiyonu gerekli.');
    this.translate = options.translate;
    this.cache = options.cache || new Map();
    this.maxConcurrent = Math.max(1, Math.trunc(finiteNumber(options.maxConcurrent, 2)));
    this.lookBehind = Math.max(0, finiteNumber(options.lookBehind, 15));
    this.lookAhead = Math.max(1, finiteNumber(options.lookAhead, 90));
    this.farSeekThreshold = Math.max(1, finiteNumber(options.farSeekThreshold, 30));
    this.onResult = typeof options.onResult === 'function' ? options.onResult : () => {};
    this.onState = typeof options.onState === 'function' ? options.onState : () => {};
    this.context = { ...(options.context || {}) };
    this.sentences = [];
    this.results = new Map();
    this.pending = new Map();
    this.queue = [];
    this.playhead = 0;
    this.generation = 0;
    this.completeTrack = false;
    this.idleWaiters = [];
  }

  setContext(context = {}) {
    this.context = { ...this.context, ...context };
    return this.context;
  }

  setSentences(sentences) {
    this.cancelAll('Kaynak altyazı değişti.');
    this.generation += 1;
    this.sentences = (Array.isArray(sentences) ? sentences : []).map((sentence) => ({ ...sentence }));
    this.results.clear();
    this.completeTrack = false;
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
        if (!windowIds.has(id)) job.controller.abort('Oynatma konumu değişti.');
      }
    }
    const excluded = new Set([...this.results.keys(), ...this.pending.keys()]);
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
    });
  }

  completeAll() {
    this.completeTrack = true;
    this.updatePlayhead(this.playhead);
    return this.queue.length + this.pending.size;
  }

  async readCache(key) {
    return this.cache && typeof this.cache.get === 'function' ? this.cache.get(key) : undefined;
  }

  async writeCache(key, value) {
    if (this.cache && typeof this.cache.set === 'function') await this.cache.set(key, value);
  }

  pump() {
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
      if (cached !== undefined && cached !== null && cached !== '') return { text: String(cached), cached: true };
      return Promise.resolve(this.translate(sentence, { ...this.context, signal: controller.signal }))
        .then((value) => ({ text: typeof value === 'string' ? value : String(value && value.text || ''), cached: false }));
    }).then(async (result) => {
      if (controller.signal.aborted || generation !== this.generation) return;
      if (!result.cached) await this.writeCache(cacheKey, result.text);
      const value = {
        sentenceId: sentence.id,
        text: result.text,
        cached: result.cached,
        cues: distributeTranslation(sentence, result.text),
      };
      this.results.set(sentence.id, value);
      this.onResult(value, sentence);
    }).catch((error) => {
      if (!controller.signal.aborted && generation === this.generation) {
        this.onResult({ sentenceId: sentence.id, error: error.message || String(error), cues: [] }, sentence);
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
    this.emitState();
    this.resolveIdleIfNeeded();
  }

  resolveIdleIfNeeded() {
    if (this.queue.length || this.pending.size) return;
    const waiters = this.idleWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  whenIdle() {
    if (!this.queue.length && !this.pending.size) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  snapshot() {
    return {
      playhead: this.playhead,
      queued: this.queue.map((sentence) => sentence.id),
      pending: [...this.pending.keys()],
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
