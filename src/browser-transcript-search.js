(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrowserTranscriptSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fold(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/gi, ' ').trim();
  }
  const STOP = new Set('acaba ama ancak aslında ben bir bu çok da de daha diye en gibi için ile ise mi mu ne nasıl neden o olan olarak sen şu ve veya ya'
    .split(' ').map(fold));
  function tokens(value) {
    return [...new Set(fold(value).split(/\s+/).filter((token) => token.length > 1 && !STOP.has(token)))].slice(0, 40);
  }
  function clock(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
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
  function wholeTranscriptIntent(question) {
    const query = ` ${fold(question)} `;
    return ['ozet', 'özet', 'tamamı', 'butun', 'bütün', 'genel', 'ana fikir', 'konu', 'arguman',
      'argüman', 'tum', 'tüm'].some((intent) => query.includes(` ${intent} `));
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
    const evidence = [...selected].sort((a, b) => a - b).slice(0, limit).map((index) => {
      const row = rows[index];
      return { id: `T${index + 1}`, zaman: clock(row.start), baslangic: row.start,
        bitis: row.end, metin: row.text, ceviri: row.translation };
    });
    return { scope, position, totalCues: rows.length, eligibleCues: eligible.length,
      queryTerms: queryTokens, coverage: wholeTranscriptIntent(question) ? 'distributed' : 'lexical', evidence };
  }
  return { buildTranscriptEvidence, foldTranscriptText: fold, transcriptClock: clock, transcriptTokens: tokens };
});
