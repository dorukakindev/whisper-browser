'use strict';
// Kuyruk-50 madde 28 — kaynaklara göre kuyruk planlama.
//
// CPU, GPU, ağ ve disk kullanan işler farklı limitlerle yönetilir. Her sınıfın
// bir eşzamanlılık limiti vardır; uzun işler (long) sınıf içinde ayrı bir
// alt-limitte koşar — kısa işlerin beklemek zorunda kaldığı yuvayı tüketemez,
// böylece büyük işler küçükleri süresiz bekletmez (starvation-free kısa yuva).
// Öncelik değişimi kuyruğu yeniden sıralar; iptal ve bitiş kaynağı doğru serbest
// bırakır (release her zaman çağrılabilir, çift-release korunur).
const RESOURCE_CLASSES = Object.freeze(['gpu', 'cpu', 'network', 'disk']);

function createResourceScheduler(limits = {}, hooks = {}) {
  const onDispatch = typeof hooks.onDispatch === 'function' ? hooks.onDispatch : null;
  const classLimits = {};
  for (const name of RESOURCE_CLASSES) {
    const value = Math.floor(Number(limits[name]));
    classLimits[name] = Number.isFinite(value) && value >= 1 ? value : 1;
  }
  const running = new Map(); // id → {id, classes, long, priority, enqueuedAt}
  const pending = new Map(); // id → aynı kayıt (running'e geçmemişler)
  const classUse = {};       // sınıf → {count, long}
  for (const name of RESOURCE_CLASSES) classUse[name] = { count: 0, long: 0 };

  function normalize(job) {
    if (!job || typeof job.id !== 'string' || !job.id) return null;
    const classes = (Array.isArray(job.classes) ? job.classes : [])
      .filter((name) => RESOURCE_CLASSES.includes(name));
    if (!classes.length) classes.push('cpu');
    return { id: job.id, classes,
      long: job.long === true,
      priority: Math.max(-100, Math.min(100, Math.floor(Number(job.priority) || 0))),
      enqueuedAt: Number(job.enqueuedAt) || Date.now() };
  }

  // limit > 1 iken en az bir yuva kısa işlere ayrılmıştır: uzun iş ancak
  // runningLong < limit - 1 iken başlayabilir.
  function admitsLong(className) {
    const limit = classLimits[className];
    if (limit <= 1) return classUse[className].count === 0;
    return classUse[className].count < limit && classUse[className].long < limit - 1;
  }

  function admitsShort(className) {
    return classUse[className].count < classLimits[className];
  }

  function fits(job) {
    return job.classes.every((name) => (job.long ? admitsLong(name) : admitsShort(name)));
  }

  function occupy(job) {
    for (const name of job.classes) {
      classUse[name].count += 1;
      if (job.long) classUse[name].long += 1;
    }
    running.set(job.id, job);
  }

  function vacate(job) {
    for (const name of job.classes) {
      classUse[name].count = Math.max(0, classUse[name].count - 1);
      if (job.long) classUse[name].long = Math.max(0, classUse[name].long - 1);
    }
  }

  // Öncelik (yüksek önce), eşitlikte eski bekleme önce — FIFO yaşlanma.
  function nextPending() {
    let best = null;
    for (const job of pending.values()) {
      if (!best || job.priority > best.priority
          || (job.priority === best.priority && job.enqueuedAt < best.enqueuedAt)) {
        best = job;
      }
    }
    return best;
  }

  // Kuyruktaki ilk uygun işi çalıştırır; dönen id ya da null.
  // Head-of-line korumalı: ilk iş uymuyorsa sonraki kısa işler de denenir.
  function dispatch() {
    let dispatched = null;
    for (const job of [...pending.values()]
        .sort((a, b) => (b.priority - a.priority) || (a.enqueuedAt - b.enqueuedAt))) {
      if (!fits(job)) continue;
      pending.delete(job.id);
      occupy(job);
      dispatched = job.id;
      break;
    }
    if (dispatched && onDispatch) {
      try { onDispatch(dispatched); } catch (_) {}
    }
    return dispatched;
  }

  function enqueue(job) {
    const record = normalize(job);
    if (!record || running.has(record.id) || pending.has(record.id)) return 'invalid';
    if (fits(record)) { occupy(record); return 'running'; }
    pending.set(record.id, record);
    return 'queued';
  }

  // Bitiş / iptal: kaynağı serbest bırak, sonra kuyruktakileri doldur.
  // İki kez çağrı güvenlidir (ikinci çağrı no-op).
  function release(id) {
    const live = running.get(id);
    const queued = pending.get(id);
    if (!live && !queued) return false;
    if (live) { vacate(live); running.delete(id); }
    if (queued) pending.delete(id);
    dispatch();
    return true;
  }

  // İptal = release'in açık adı (kaynak iadesi aynı törenden geçer).
  const cancel = release;

  // Öncelik değişimi: kuyruktaki işin sırasını günceller; koşana etkisi yoktur
  // (iş zaten kaynağını almıştır — preempt etmiyoruz, bu kasıtlı basitliktir).
  function setPriority(id, priority) {
    const job = pending.get(id);
    if (!job) return false;
    job.priority = Math.max(-100, Math.min(100, Math.floor(Number(priority) || 0)));
    return true;
  }

  function snapshot() {
    return {
      running: [...running.values()].map((j) => ({ id: j.id, classes: j.classes,
        long: j.long, priority: j.priority })),
      queued: [...pending.values()]
        .sort((a, b) => (b.priority - a.priority) || (a.enqueuedAt - b.enqueuedAt))
        .map((j) => ({ id: j.id, classes: j.classes, long: j.long, priority: j.priority })),
      classes: Object.fromEntries(RESOURCE_CLASSES.map((name) => [name,
        { limit: classLimits[name], ...classUse[name] }])),
      next: (() => { const job = nextPending(); return job ? job.id : null; })(),
    };
  }

  return { enqueue, release, cancel, setPriority, dispatch, snapshot,
    classLimits };
}

module.exports = { createResourceScheduler, RESOURCE_CLASSES };
