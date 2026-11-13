(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrowserTranscriptSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fold(value) {
    // tr-TR lowercase 'I'→'ı' üretir; İngilizce metinleri de aranabilir tutmak
    // için I/İ/ı tek 'i'ye katlanır. \p{L}\p{N} CJK/Kiril/Arapça'yı korur.
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[Iİı]/g, 'i').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  const STOP = new Set('acaba ama ancak aslında ben bir bu çok da de daha diye en gibi için ile ise mi mu ne nasıl neden o olan olarak sen şu ve veya ya'
    .split(' ').map(fold));
  // English function words: the Turkish-only list above let "the/what/about" dominate
  // evidence ranking for English transcripts. If a question consists only of such
  // words the previous behavior (Turkish stop list only) is kept as a fallback.
  const STOP_EN = new Set(('a an the and or but if of to in on at by for with from as is are was were be been being am do does did done have has had having '
    + 'i me my we our you your he him his she her it its they them their this that these those what which who whom whose when where why how not no yes than then '
    + 'so such can could should would will shall may might must about into over under up down out off also just very more most some any each other another there here')
    .split(' '));
  function tokens(value) {
    const all = [...new Set(fold(value).split(/\s+/).filter((token) => token.length > 1 && !STOP.has(token)))];
    const kept = all.filter((token) => !STOP_EN.has(token));
    return (kept.length ? kept : all).slice(0, 40);
  }
  // Conservative English plural folding applied to both query and cue words, so the
  // comparison stays symmetric ("cables" matches "cable"). Other languages pass through.
  function stem(word) {
    if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
    if (word.length > 4 && /(?:ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
    if (word.length > 3 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
    return word;
  }
  // BM25 over the eligible cues (Robertson & Spärck Jones). Whole-word/plural matches count fully;
  // a query term that only begins a longer cue word (Turkish inflection) counts half; a term merely
  // contained inside a word ("the" in "other") no longer scores. Position proximity is a tie-break.
  function scoreRows(pool, queryTokens, position) {
    const K1 = 1.2, B = 0.75;
    const stems = queryTokens.map(stem);
    const docs = pool.map((row) => {
      const body = fold(`${row.text} ${row.translation}`);
      const words = body ? body.split(' ') : [];
      return { row, words, folded: words.map(stem) };
    });
    const avg = Math.max(1, docs.reduce((sum, doc) => sum + doc.words.length, 0) / Math.max(1, docs.length));
    const df = stems.map(() => 0);
    for (const doc of docs) {
      doc.match = stems.map((term, i) => {
        let tf = 0;
        for (const word of doc.folded) if (word === term) tf++;
        const weight = tf || (queryTokens[i].length >= 4 && doc.words.some((word) => word.startsWith(queryTokens[i])) ? 0.5 : 0);
        if (weight) df[i]++;
        return weight;
      });
    }
    const N = Math.max(1, docs.length);
    return docs.map((doc) => {
      let score = 0;
      doc.match.forEach((weight, i) => {
        if (!weight) return;
        const idf = Math.log(1 + (N - df[i] + 0.5) / (df[i] + 0.5));
        score += idf * (weight * (K1 + 1)) / (weight + K1 * (1 - B + B * doc.words.length / avg));
      });
      return { row: doc.row, score, matched: doc.match.some(Boolean) };
    }).sort((a, b) => b.score - a.score || Math.abs(a.row.start - position) - Math.abs(b.row.start - position) || a.row.index - b.row.index);
  }
  function clock(seconds) {
    const number = Number(seconds);
    const value = Number.isFinite(number) ? Math.max(0, number) : 0;
    const h = Math.floor(value / 3600); const m = Math.floor(value % 3600 / 60); const s = Math.floor(value % 60);
    return h ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  function excerpt(value, queryTokens, limit=4000) {
    const original=String(value||''),text=original.trim(),leading=original.length-original.trimStart().length;
    limit=Math.max(1,Math.min(4000,Math.floor(Number(limit)||4000)));
    if(text.length<=limit)return {text,offset:leading,truncated:text.length!==original.length};
    const body=fold(text),starts=new Set([0]);
    for(const token of queryTokens){
      const at=body.indexOf(token);if(at<0)continue;
      // Folded offsets differ from source offsets (accents, spaces, punctuation).
      // Prefix lengths are monotonic, so locate the original anchor without
      // assuming the normalized text has the same character positions.
      let low=0,high=text.length;
      while(low<high){const mid=Math.floor((low+high)/2);if(fold(text.slice(0,mid)).length<=at)low=mid+1;else high=mid;}
      starts.add(Math.max(0,low-1-300));
    }
    let best=0,bestScore=-1;
    for(const start of starts){const window=fold(text.slice(start,start+limit)),score=queryTokens.reduce((n,token)=>n+(window.includes(token)?1:0),0);if(score>bestScore){best=start;bestScore=score;}}
    return {text:text.slice(best,best+limit),offset:leading+best,truncated:true};
  }
  function normalizedRows(cues, queryTokens) {
    const validTime = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));
    return (Array.isArray(cues) ? cues : []).filter(cue => validTime(cue?.start) && validTime(cue?.end) && Number(cue.end) >= Number(cue.start)).map((cue, index) => {const source=excerpt(cue?.text,queryTokens),translation=excerpt(cue?.translation,queryTokens);return ({
      index,
      start: Math.max(0, Number(cue?.start) || 0),
      end: Math.max(Math.max(0, Number(cue?.start) || 0), Number(cue?.end) || Number(cue?.start) || 0),
      text: source.text, translation: translation.text,
      textOffset:source.offset,translationOffset:translation.offset,textTruncated:source.truncated,translationTruncated:translation.truncated,
    });}).filter((cue) => cue.text || cue.translation).slice(0, 50000).map((cue,index)=>({...cue,index}));
  }
  // Tüm-transkript niyeti: kelime-başı kök eşleşmesi 'tamamen', 'tamamla',
  // 'tamamlamış' gibi ilgisiz çekimleri de pozitif sayıyordu (R86-05).
  // Kabul, açık çekimli biçim listesiyle sınırlıdır; fold() çıktısı ASCII'dir.
  const WHOLE_TRANSCRIPT_PHRASES = [
    'entire video', 'whole video', 'full video', 'whole transcript', 'full transcript',
    'entire transcript', 'from beginning to end', 'main idea', 'overall summary',
    'ana fikir', 'ana fikri', 'bastan sona', 'basindan sonuna', 'uctan uca',
    'tum transkript', 'butun transkript', 'tum video', 'butun video',
    'tum icerik', 'butun icerik', 'genel ozet', 'tam metin',
  ];
  const WHOLE_TRANSCRIPT_WORDS = new Set([
    // tamamı / tümü / bütünü çekimleri ('tamamen', 'tamamla', 'tamamlamış'
    // ve söylem belirteci tek başına 'tamam' bilinçli dışarıda).
    'summarize', 'summarise', 'summary', 'overview',
    'tamami', 'tamamini', 'tamamin', 'tamamina', 'tamaminda',
    'tum', 'tumu', 'tumunu', 'tumun', 'tumunun', 'tumune', 'tumunde',
    'butun', 'butunu', 'butununu', 'butunun', 'butunune', 'butununde',
    // özet / genel / konu / argüman niyetleri
    'ozet', 'ozeti', 'ozetini', 'ozetin', 'ozetle', 'ozetler', 'ozetlerini',
    'ozetleme', 'ozetlemek', 'ozetlemeni', 'ozetleyebilir', 'ozetleyin',
    'ozetliyor', 'ozetlenen', 'ozetlenmis',
    'genel', 'geneli', 'genelini', 'genele',
    'konu', 'konuyu', 'konunun', 'konuya', 'konuda', 'konusu', 'konusunu',
    'konusma', 'konusmasi', 'konusmayi',
    'arguman', 'argumani', 'argumanlar', 'argumanlari', 'argumantasyon',
  ]);
  function wholeTranscriptIntent(question) {
    const folded = fold(question);
    const query = ` ${folded} `;
    if (WHOLE_TRANSCRIPT_PHRASES.some((phrase) => query.includes(` ${phrase} `))) return true;
    return folded.split(/\s+/).some((word) => WHOLE_TRANSCRIPT_WORDS.has(word));
  }
  function buildTranscriptEvidence(cues, question, options = {}) {
    const queryTokens = tokens(question);
    const rows = normalizedRows(cues,queryTokens);
    const scope = ['nearby', 'watched', 'full'].includes(options.scope) ? options.scope : 'watched';
    const position = Number.isFinite(Number(options.position)) ? Math.max(0, Number(options.position)) : 0;
    const eligible = scope === 'watched' ? rows.filter((row) => row.start <= position + 0.75) : rows;
    const pool = scope === 'nearby' ? eligible.filter((row) => Math.abs(row.start - position) <= 180) : eligible;
    const scored = scoreRows(pool, queryTokens, position);
    const selected = new Set();
    const distributed = [];
    const limit = Math.max(6, Math.min(48, Math.floor(Number(options.limit) || 36)));
    const addWithNeighbors = (index, radius = 1) => {
      for (let i = Math.max(0, index - radius); i <= Math.min(rows.length - 1, index + radius); i++) {
        const row = rows[i];
        if (scope === 'watched' && row.start > position + 0.75) continue;
        if (scope === 'nearby' && Math.abs(row.start - position) > 180) continue;
        selected.add(i);
      }
    };
    // Lexical matches win the hit slots. Cues merely close to the playhead no longer pad them,
    // except the two nearest ones, which keep "what was just said" questions grounded.
    const matched = scored.filter((hit) => hit.matched);
    const nearest = [...pool].sort((x, y) => Math.abs(x.start - position) - Math.abs(y.start - position)).slice(0, 2);
    const hits = matched.length
      ? [...matched.slice(0, 10), ...nearest.map((row) => ({ row }))]
      : scored.slice(0, queryTokens.length ? 10 : 4);
    for (const hit of hits) addWithNeighbors(hit.row.index, 1);
    if (wholeTranscriptIntent(question) && pool.length) {
      const samples = Math.min(16, pool.length, Math.max(2, Math.floor(limit / 2)));
      for (let sample = 0; sample < samples; sample++) {
        const row = pool[Math.round(sample * (pool.length - 1) / Math.max(1, samples - 1))];
        addWithNeighbors(row.index, 0);
        distributed.push(row.index);
      }
    }
    // Önce skora göre seç, sonra kronolojik göster — eski sürüm index sırasıyla
    // kesiyordu ve videonun sonundaki yüksek-skorlu isabetler düşüyordu.
    const scoreByIndex = new Map(scored.map(({ row, score }) => [row.index, score]));
    const ranked = [...selected]
      .sort((a, b) => (scoreByIndex.get(b) || 0) - (scoreByIndex.get(a) || 0) || a - b)
      .filter(index => !distributed.includes(index));
    // Reserve the playhead slots before truncation; high lexical scores otherwise
    // remove them again when the caller requests a small evidence budget.
    const evidence = [...new Set([...distributed, ...nearest.map(row => row.index), ...ranked])].slice(0, limit)
      .sort((a, b) => a - b)
      .map((index) => {
      const row = rows[index];
      return { id: `T${index + 1}`, zaman: clock(row.start), baslangic: row.start,
        bitis: row.end, metin: row.text, ceviri: row.translation,
        ...(row.textTruncated?{textOffset:row.textOffset,textTruncated:true}:{}),
        ...(row.translationTruncated?{translationOffset:row.translationOffset,translationTruncated:true}:{}) };
    });
    return { scope, position, totalCues: rows.length, eligibleCues: eligible.length,
      queryTerms: queryTokens, coverage: wholeTranscriptIntent(question) ? 'distributed' : 'lexical', evidence };
  }
  return { buildTranscriptEvidence, transcriptExcerpt:excerpt, foldTranscriptText: fold, transcriptClock: clock, transcriptTokens: tokens };
});
