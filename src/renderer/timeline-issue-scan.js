// Zamanlama masası saf yardımcıları — DOM/renderer bağımsız, Node testlerinde
// doğrudan require edilebilir (status-copy.js ile aynı UMD kalıbı).
(function initTimelineIssueScan(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TimelineIssueScan = api;
}(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  // CPS şeridi: 0 → limit, 1 → limit*1.6 ve üzeri. drawTimeline renk dönüşümü
  // için 0..1 kesir döner; kırmızı eşiği ayrıca cpsLimit kontrolüyle çizilir.
  function visibleText(value) {
    return String(value || '').replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/?(?:i|b|u|s|font|c|v|ruby|rt|lang)(?:[\s.][^>]*|)>/gi, '')
      .replace(/\{\\[^}]*\}/g, '');
  }
  function cpsOf(cue) {
    const dur = Math.max(.05, (Number(cue?.end) || 0) - (Number(cue?.start) || 0));
    return visibleText(cue?.text).trim().length / dur;
  }
  function cpsTier(cue, cpsLimit) {
    const limit = Number(cpsLimit) > 0 ? Number(cpsLimit) : 20;
    return Math.min(1, cpsOf(cue) / (limit * 1.6));
  }

  // Sorun taraması: boş metin, aşırı kısa süre (<1s), komşu çakışması,
  // CPS limiti aşımı, satır kırılması (3+ satır veya satır genişliği aşımı).
  // Çakışma bir SONRAKİ bloğa atanır (i-1.end > i.start).
  const PROFILES={custom:{},'tr-dialogue':{cpsLimit:17,lineLimit:42,minDuration:5/6,maxDuration:7},'tr-children':{cpsLimit:13,lineLimit:42,minDuration:5/6,maxDuration:7},'tr-sdh':{cpsLimit:20,lineLimit:42,minDuration:5/6,maxDuration:7}};
  const KINDS = ['empty', 'short', 'overlap', 'fast', 'lines', 'invalid','long','gap','shot'];
  function scan(cues, options = {}) {
    options={...options,...(PROFILES[options.profile]||{})};
    const frame=1/([24,25,30,50,60].includes(Number(options.fps))?Number(options.fps):24);
    const profiled=options.profile&&options.profile!=="custom";
    const cpsLimit = Number(options.cpsLimit) > 0 ? Number(options.cpsLimit) : 20;
    const lineLimit = Number(options.lineLimit) > 0 ? Number(options.lineLimit) : 80;
    const shots=(Array.isArray(options.shots)?options.shots:[]).filter(Number.isFinite).sort((a,b)=>a-b);
    const crossesShot=(start,end)=>{let lo=0,hi=shots.length;while(lo<hi){const mid=(lo+hi)>>1;if(shots[mid]<=start+frame)lo=mid+1;else hi=mid;}return lo<shots.length&&shots[lo]<end-frame;};
    const issues = [];
    const list = Array.isArray(cues) ? cues : [];
    let previousEnd = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const c = list[i] || {};
      if (![c.start, c.end].every(value => typeof value === 'number' && Number.isFinite(value)) || c.start < 0 || c.end <= c.start) {
        issues.push({ i, kind: 'invalid' }); continue;
      }
      const start = Number(c.start) || 0;
      const end = Number(c.end) || 0;
      const text = visibleText(c.text).trim();
      const dur = Math.max(0, end - start);
      if (!text) issues.push({ i, kind: 'empty' });
      else {
        if (dur < (options.minDuration||1)) issues.push({ i, kind: 'short' });
        if (text.length / Math.max(.1, dur) > cpsLimit) issues.push({ i, kind: 'fast' });
        const lines = visibleText(c.text).split(/\r?\n/);
        if (lines.length >= 3 || lines.some((l) => l.length > lineLimit)) issues.push({ i, kind: 'lines' });
      }
      if(profiled&&dur>options.maxDuration)issues.push({i,kind:'long'});
      if(profiled&&previousEnd!==-Infinity&&start>=previousEnd&&start-previousEnd<2*frame-.001)issues.push({i,kind:'gap'});
      if(crossesShot(start,end))issues.push({i,kind:'shot'});
      if (previousEnd > start + .01) issues.push({ i, kind: 'overlap' });
      previousEnd = Math.max(previousEnd, end);
    }
    return issues;
  }

  // Kurtarma kaydı taban imzası: aynı kaynak aynı içerikle açılırsa kaydedilen
  // imzayla eşleşir; dosya/kaynak değiştiyse farklılık uygulanamaz durumu gösterir.
  function cueSignature(cues) {
    const list = Array.isArray(cues) ? cues : [];
    if (!list.length) return '#0#0#0';
    // Two independent 32-bit rolling hashes include every cue's full content.
    let a=2166136261, b=5381;
    for (const c of list) for (const ch of JSON.stringify([c?.start,c?.end,String(c?.text || '')])) {
      const n=ch.codePointAt(0); a=Math.imul(a^n,16777619); b=Math.imul(b,33)^n;
    }
    return `v2:${list.length}:${(a>>>0).toString(16)}:${(b>>>0).toString(16)}`;
  }

  return { PROFILES, KINDS, scan, cpsOf, cpsTier, cueSignature };
}));
