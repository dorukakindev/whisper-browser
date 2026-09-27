(function exposeSubtitleFindReplace(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SubtitleFindReplace = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const WORD = /[\p{L}\p{N}_]/u;

  // foldSearchText tek karakterin uzunluğunu değiştirdiğinde (NFKC uyumluluk
  // ayrışması: ﬀ→ff, ²→2, çevrili/üst simgeler vb.) katlanmış-ofsetler kaynak
  // ofsetlerle birebir örtüşmez; bu sınıf o kod noktalarını yakalar. Otomasyon:
  // `f(ch).length !== ch.length` olan tüm kod noktalarının aralıkları.
  const FOLD_LENGTH_CHANGING = /[\u{a8}\u{af}\u{b4}\u{b8}\u{bc}-\u{be}\u{132}-\u{133}\u{13f}-\u{140}\u{149}\u{1c4}-\u{1cc}\u{1f1}-\u{1f3}\u{2d8}-\u{2dd}\u{344}\u{37a}\u{384}-\u{385}\u{587}\u{675}-\u{678}\u{958}-\u{95f}\u{9dc}-\u{9dd}\u{9df}\u{a33}\u{a36}\u{a59}-\u{a5b}\u{a5e}\u{b5c}-\u{b5d}\u{e33}\u{eb3}\u{edc}-\u{edd}\u{f43}\u{f4d}\u{f52}\u{f57}\u{f5c}\u{f69}\u{f73}\u{f75}-\u{f79}\u{f81}\u{f93}\u{f9d}\u{fa2}\u{fa7}\u{fac}\u{fb9}\u{1e9a}\u{1fbd}\u{1fbf}-\u{1fc1}\u{1fcd}-\u{1fcf}\u{1fdd}-\u{1fdf}\u{1fed}-\u{1fee}\u{1ffd}-\u{1ffe}\u{2017}\u{2025}-\u{2026}\u{2033}-\u{2034}\u{2036}-\u{2037}\u{203c}\u{203e}\u{2047}-\u{2049}\u{2057}\u{20a8}\u{2100}-\u{2101}\u{2103}\u{2105}-\u{2106}\u{2109}\u{2116}\u{2120}-\u{2122}\u{213b}\u{2150}-\u{215f}\u{2161}-\u{2163}\u{2165}-\u{2168}\u{216a}-\u{216b}\u{2171}-\u{2173}\u{2175}-\u{2178}\u{217a}-\u{217b}\u{2189}\u{222c}-\u{222d}\u{222f}-\u{2230}\u{2469}-\u{24b5}\u{2a0c}\u{2a74}-\u{2a76}\u{2adc}\u{309b}-\u{309c}\u{309f}\u{30ff}\u{3200}-\u{321e}\u{3220}-\u{3243}\u{3250}-\u{325f}\u{327c}-\u{327d}\u{32b1}-\u{32cf}\u{32ff}-\u{33ff}\u{fa6c}\u{facf}-\u{fad1}\u{fad5}-\u{fad7}\u{fb00}-\u{fb06}\u{fb13}-\u{fb17}\u{fb1d}\u{fb1f}\u{fb2a}-\u{fb36}\u{fb38}-\u{fb3c}\u{fb3e}\u{fb40}-\u{fb41}\u{fb43}-\u{fb44}\u{fb46}-\u{fb4f}\u{fbdd}\u{fbea}-\u{fbfb}\u{fc00}-\u{fd3d}\u{fd50}-\u{fd8f}\u{fd92}-\u{fdc7}\u{fdf0}-\u{fdfc}\u{fe19}\u{fe30}\u{fe49}-\u{fe4c}\u{fe70}-\u{fe72}\u{fe74}\u{fe76}-\u{fe7f}\u{fef5}-\u{fefc}\u{ffe3}\u{10781}-\u{10785}\u{10787}-\u{1079b}\u{1079d}-\u{1079e}\u{107a0}\u{107a2}-\u{107a6}\u{107a8}-\u{107b0}\u{107b2}-\u{107b8}\u{1ccd6}-\u{1ccf9}\u{1d15e}-\u{1d164}\u{1d1bb}-\u{1d1c0}\u{1d400}-\u{1d454}\u{1d456}-\u{1d49c}\u{1d49e}-\u{1d49f}\u{1d4a2}\u{1d4a5}-\u{1d4a6}\u{1d4a9}-\u{1d4ac}\u{1d4ae}-\u{1d4b9}\u{1d4bb}\u{1d4bd}-\u{1d4c3}\u{1d4c5}-\u{1d505}\u{1d507}-\u{1d50a}\u{1d50d}-\u{1d514}\u{1d516}-\u{1d51c}\u{1d51e}-\u{1d539}\u{1d53b}-\u{1d53e}\u{1d540}-\u{1d544}\u{1d546}\u{1d54a}-\u{1d550}\u{1d552}-\u{1d6a5}\u{1d6a8}-\u{1d7cb}\u{1d7ce}-\u{1d7ff}\u{1e030}-\u{1e06d}\u{1ee00}-\u{1ee03}\u{1ee05}-\u{1ee1f}\u{1ee21}-\u{1ee22}\u{1ee24}\u{1ee27}\u{1ee29}-\u{1ee32}\u{1ee34}-\u{1ee37}\u{1ee39}\u{1ee3b}\u{1ee42}\u{1ee47}\u{1ee49}\u{1ee4b}\u{1ee4d}-\u{1ee4f}\u{1ee51}-\u{1ee52}\u{1ee54}\u{1ee57}\u{1ee59}\u{1ee5b}\u{1ee5d}\u{1ee5f}\u{1ee61}-\u{1ee62}\u{1ee64}\u{1ee67}-\u{1ee6a}\u{1ee6c}-\u{1ee72}\u{1ee74}-\u{1ee77}\u{1ee79}-\u{1ee7c}\u{1ee7e}\u{1ee80}-\u{1ee89}\u{1ee8b}-\u{1ee9b}\u{1eea1}-\u{1eea3}\u{1eea5}-\u{1eea9}\u{1eeab}-\u{1eebb}\u{1f110}-\u{1f12c}\u{1f130}-\u{1f149}\u{1f14e}\u{1f202}\u{1f210}-\u{1f23b}\u{1f240}-\u{1f248}\u{1f250}-\u{1f251}\u{1fbf0}-\u{1fbf9}\u{2f800}-\u{2f802}\u{2f804}-\u{2f80c}\u{2f80e}-\u{2f811}\u{2f813}-\u{2f815}\u{2f817}-\u{2f81b}\u{2f81d}-\u{2f833}\u{2f835}-\u{2f837}\u{2f839}-\u{2f858}\u{2f85a}-\u{2f85f}\u{2f862}-\u{2f86b}\u{2f86d}-\u{2f870}\u{2f872}-\u{2f87a}\u{2f87c}\u{2f87e}-\u{2f888}\u{2f88a}-\u{2f88e}\u{2f890}\u{2f893}-\u{2f896}\u{2f899}-\u{2f8a3}\u{2f8a5}-\u{2f8b7}\u{2f8b9}-\u{2f8bd}\u{2f8bf}-\u{2f8c9}\u{2f8cb}-\u{2f8dc}\u{2f8de}-\u{2f8e2}\u{2f8e4}-\u{2f8eb}\u{2f8ed}-\u{2f8ef}\u{2f8f1}-\u{2f8f6}\u{2f8fa}\u{2f8fc}-\u{2f905}\u{2f907}-\u{2f90c}\u{2f90e}-\u{2f90f}\u{2f912}-\u{2f91a}\u{2f91c}\u{2f91e}\u{2f920}-\u{2f922}\u{2f924}-\u{2f925}\u{2f928}-\u{2f934}\u{2f936}\u{2f938}\u{2f93a}\u{2f93e}-\u{2f940}\u{2f945}-\u{2f94c}\u{2f94e}-\u{2f951}\u{2f953}\u{2f956}-\u{2f95b}\u{2f95f}-\u{2f960}\u{2f962}-\u{2f964}\u{2f966}-\u{2f96a}\u{2f96c}-\u{2f971}\u{2f974}\u{2f976}\u{2f978}-\u{2f97a}\u{2f97d}\u{2f97f}\u{2f981}-\u{2f986}\u{2f98b}-\u{2f996}\u{2f998}-\u{2f9a3}\u{2f9a7}-\u{2f9aa}\u{2f9ac}\u{2f9ae}-\u{2f9af}\u{2f9b2}-\u{2f9c4}\u{2f9c6}-\u{2f9ca}\u{2f9cd}-\u{2f9d2}\u{2f9d4}-\u{2f9d7}\u{2f9da}-\u{2f9dc}\u{2f9de}-\u{2f9df}\u{2f9e2}-\u{2f9e4}\u{2f9e6}-\u{2f9ec}\u{2f9ee}-\u{2f9f0}\u{2f9f2}-\u{2f9f5}\u{2f9f8}-\u{2f9fa}\u{2f9fc}\u{2f9fe}-\u{2fa00}\u{2fa02}-\u{2fa08}\u{2fa0a}-\u{2fa0f}\u{2fa11}\u{2fa15}-\u{2fa1c}]/u;


  // NFKC + Türkçe case-fold. Bul/değiştir eşleşmeleri metni değiştirdiği için
  // arama indeksindeki bulanık eşleşmenin aksine ı ve i kimliği korunur.
  function foldSearchText(value, caseSensitive = false) {
    const normalized = String(value == null ? '' : value).normalize('NFKC');
    return caseSensitive ? normalized : normalized.toLocaleLowerCase('tr-TR');
  }

  function codePointBoundaries(text) {
    const result = [0];
    let offset = 0;
    for (const character of String(text)) {
      offset += character.length;
      result.push(offset);
    }
    return result;
  }

  function literalRanges(text, query, options = {}) {
    const source = String(text == null ? '' : text);
    const caseSensitive = options.caseSensitive === true;
    const needle = foldSearchText(query, caseSensitive);
    if (!source || !needle) return [];
    const ranges = [];
    // Hızlı yol: kod noktası başına katlama uzunluk koruyorsa (ortak durum —
    // NFKC birleşen im sınırı yoksa) metni bir kez katlayıp indexOf ile tara.
    // Her bulgu ayrıca pencere-katlama ile doğrulanır; ikisinin uyuşmadığı nadir
    // sınır durumunda yavaş yol alttaki taramayı üstlenir.
    const foldedSource = foldSearchText(source, caseSensitive);
    const fastOk = foldedSource.length === source.length && !FOLD_LENGTH_CHANGING.test(source);
    if (fastOk) {
      let from = 0;
      for (;;) {
        const found = foldedSource.indexOf(needle, from);
        if (found < 0) break;
        const end = found + needle.length;
        if (foldSearchText(source.slice(found, end), caseSensitive) === needle) {
          const matched = { start: found, end };
          let word = true;
          if (options.wholeWord === true) {
            const before = source.slice(0, matched.start).match(/[\s\S]$/u)?.[0] || '';
            const after = source.slice(matched.end).match(/^[\s\S]/u)?.[0] || '';
            if ((before && WORD.test(before)) || (after && WORD.test(after))) word = false;
          }
          if (word) ranges.push(matched);
        }
        from = end > found ? end : found + 1;
      }
      return ranges;
    }
    const boundaries = codePointBoundaries(source);
    let startPoint = 0;
    while (startPoint < boundaries.length - 1) {
      let matched = null;
      for (let endPoint = startPoint + 1; endPoint < boundaries.length; endPoint++) {
        const candidate = foldSearchText(source.slice(boundaries[startPoint], boundaries[endPoint]),
          options.caseSensitive === true);
        if (candidate === needle) {
          matched = { start: boundaries[startPoint], end: boundaries[endPoint] };
          break;
        }
        if (candidate.length > needle.length + 2) break;
      }
      if (!matched) { startPoint++; continue; }
      if (options.wholeWord === true) {
        const before = source.slice(0, matched.start).match(/[\s\S]$/u)?.[0] || '';
        const after = source.slice(matched.end).match(/^[\s\S]/u)?.[0] || '';
        if ((before && WORD.test(before)) || (after && WORD.test(after))) {
          startPoint++;
          continue;
        }
      }
      ranges.push(matched);
      while (startPoint < boundaries.length && boundaries[startPoint] < matched.end) startPoint++;
    }
    return ranges;
  }

  function findLiteralMatches(entries, query, options = {}) {
    const allowed = options.field === 'source' || options.field === 'translation'
      ? options.field : 'both';
    const matches = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || (allowed !== 'both' && entry.field !== allowed)) continue;
      const ranges = literalRanges(entry.text, query, options);
      ranges.forEach((range, occurrence) => matches.push({
        id: `${entry.field}:${entry.channel}:${entry.index}:${occurrence}`,
        ...entry,
        occurrence,
        range,
      }));
    }
    return matches;
  }

  function replaceLiteralRanges(text, matches, replacement) {
    let result = String(text == null ? '' : text);
    const ranges = (Array.isArray(matches) ? matches : []).map((item) => item.range || item)
      .filter((range) => Number.isInteger(range?.start) && Number.isInteger(range?.end)
        && range.start >= 0 && range.end > range.start && range.end <= result.length)
      .sort((a, b) => b.start - a.start || b.end - a.end);
    let lastStart = Infinity;
    for (const range of ranges) {
      if (range.end > lastStart) continue;
      result = `${result.slice(0, range.start)}${String(replacement ?? '')}${result.slice(range.end)}`;
      lastStart = range.start;
    }
    return result;
  }

  function buildReplacementPlan(matches, selectedIds, replacement) {
    const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
    const grouped = new Map();
    for (const match of Array.isArray(matches) ? matches : []) {
      if (!selected.has(match.id)) continue;
      const key = `${match.field}|${match.channel}|${match.index}`;
      if (!grouped.has(key)) grouped.set(key, { ...match, ranges: [] });
      grouped.get(key).ranges.push(match.range);
    }
    return [...grouped.values()].map((entry) => ({
      ...entry,
      before: String(entry.text ?? ''),
      after: replaceLiteralRanges(entry.text, entry.ranges, replacement),
      matchCount: entry.ranges.length,
    })).filter((entry) => entry.before !== entry.after);
  }

  return { buildReplacementPlan, findLiteralMatches, foldSearchText, literalRanges, replaceLiteralRanges };
}));
