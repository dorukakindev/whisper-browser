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
  function tokens(value) {
    return [...new Set(fold(value).split(/\s+/).filter((token) => token.length > 1 && !STOP.has(token)))].slice(0, 40);
  }
  function clock(seconds) {
    const number = Number(seconds);
    const value = Number.isFinite(number) ? Math.max(0, number) : 0;
    const h = Math.floor(value / 3600); const m = Math.floor(value % 3600 / 60); const s = Math.floor(value % 60);
    return h ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  function normalizedRows(cues) {
    return (Array.isArray(cues) ? cues : []).map((cue, index) => ({
      index,
      start: Math.max(0, Number(cue?.start) || 0),
      end: Math.max(Math.max(0, Number(cue?.start) || 0), Number(cue?.end) || Number(cue?.start) || 0),
      text: String(cue?.text || '').trim().slice(0, 4000),
      translation: String(cue?.translation || '').trim().slice(0, 4000),
    })).filter((cue) => cue.text || cue.translation).slice(0, 50000).map((cue,index)=>({...cue,index}));
  }
  // Tüm-transkript niyeti: kelime-başı kök eşleşmesi 'tamamen', 'tamamla',
  // 'tamamlamış' gibi ilgisiz çekimleri de pozitif sayıyordu (R86-05).
  // Kabul, açık çekimli biçim listesiyle sınırlıdır; fold() çıktısı ASCII'dir.
  const WHOLE_TRANSCRIPT_PHRASES = [
    'ana fikir', 'ana fikri', 'bastan sona', 'basindan sonuna', 'uctan uca',
    'tum transkript', 'butun transkript', 'tum video', 'butun video',
    'tum icerik', 'butun icerik', 'genel ozet', 'tam metin',
  ];
  const WHOLE_TRANSCRIPT_WORDS = new Set([
    // tamamı / tümü / bütünü çekimleri ('tamamen', 'tamamla', 'tamamlamış'
    // ve söylem belirteci tek başına 'tamam' bilinçli dışarıda).
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
    const rows = normalizedRows(cues);
    const scope = ['nearby', 'watched', 'full'].includes(options.scope) ? options.scope : 'watched';
    const position = Math.max(0, Number(options.position) || 0);
    const eligible = scope === 'watched' ? rows.filter((row) => row.start <= position + 0.75) : rows;
    const pool = scope === 'nearby' ? eligible.filter((row) => Math.abs(row.start - position) <= 180) : eligible;
    const queryTokens = tokens(question);
    const scored = pool.map((row) => {
      const body = fold(`${row.text} ${row.translation}`);
      let score = 0;
      for (const token of queryTokens) {
        if (body === token) score += 8;
        else if (body.includes(` ${token} `) || body.startsWith(`${token} `) || body.endsWith(` ${token}`)) score += 4;
        else if (body.includes(token)) score += 1;
      }
      score += 1 / (1 + Math.abs(row.start - position) / 45);
      return { row, score };
    }).sort((a, b) => b.score - a.score || a.row.index - b.row.index);
    const selected = new Set();
    const addWithNeighbors = (index, radius = 1) => {
      for (let i = Math.max(0, index - radius); i <= Math.min(rows.length - 1, index + radius); i++) {
        const row = rows[i];
        if (scope === 'watched' && row.start > position + 0.75) continue;
        if (scope === 'nearby' && Math.abs(row.start - position) > 180) continue;
        selected.add(i);
      }
    };
    for (const hit of scored.slice(0, queryTokens.length ? 10 : 4)) addWithNeighbors(hit.row.index, 1);
    if (wholeTranscriptIntent(question) && eligible.length) {
      const samples = Math.min(16, eligible.length);
      for (let sample = 0; sample < samples; sample++) {
        const row = eligible[Math.min(eligible.length - 1, Math.floor(sample * eligible.length / samples))];
        addWithNeighbors(row.index, 0);
      }
    }
    const limit = Math.max(6, Math.min(48, Number(options.limit) || 36));
    // Önce skora göre seç, sonra kronolojik göster — eski sürüm index sırasıyla
    // kesiyordu ve videonun sonundaki yüksek-skorlu isabetler düşüyordu.
    const scoreByIndex = new Map(scored.map(({ row, score }) => [row.index, score]));
    const evidence = [...selected]
      .sort((a, b) => (scoreByIndex.get(b) || 0) - (scoreByIndex.get(a) || 0) || a - b)
      .slice(0, limit)
      .sort((a, b) => a - b)
      .map((index) => {
      const row = rows[index];
      return { id: `T${index + 1}`, zaman: clock(row.start), baslangic: row.start,
        bitis: row.end, metin: row.text, ceviri: row.translation };
    });
    return { scope, position, totalCues: rows.length, eligibleCues: eligible.length,
      queryTerms: queryTokens, coverage: wholeTranscriptIntent(question) ? 'distributed' : 'lexical', evidence };
  }
  return { buildTranscriptEvidence, foldTranscriptText: fold, transcriptClock: clock, transcriptTokens: tokens };
});
