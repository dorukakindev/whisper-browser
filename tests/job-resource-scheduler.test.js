// Kuyruk-50 madde 28 — kaynaklara göre kuyruk planlama kilitleri.
const assert = require('assert');
const { createResourceScheduler } = require('../src/job-resource-scheduler');

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}${extra ? ' — ' + extra : ''}`); }
}

// Limit: sınıf başına eşzamanlılık korunur
{
  const s = createResourceScheduler({ network: 2 });
  assert.equal(s.enqueue({ id: 'a', classes: ['network'] }), 'running');
  assert.equal(s.enqueue({ id: 'b', classes: ['network'] }), 'running');
  assert.equal(s.enqueue({ id: 'c', classes: ['network'] }), 'queued');
  check('network limiti korunur', s.snapshot().running.length === 2
    && s.snapshot().queued.length === 1);
  s.release('a');
  check('release kuyruğu doldurur', s.snapshot().running.some((j) => j.id === 'c'));
}

// Starvation-free kısa yuva: uzun işler kısa işleri süresiz bekletemez
{
  const s = createResourceScheduler({ network: 3 });
  // 2 uzun iş alır (limit-1 yuva tüketilir), 3. uzun iş bekler.
  assert.equal(s.enqueue({ id: 'L1', classes: ['network'], long: true }), 'running');
  assert.equal(s.enqueue({ id: 'L2', classes: ['network'], long: true }), 'running');
  assert.equal(s.enqueue({ id: 'L3', classes: ['network'], long: true }), 'queued',
    'üçüncü uzun iş ayrık yuva olmadan beklemeli');
  // Ama kısa iş her zaman girer — büyük işler küçüğü bloke edemez.
  assert.equal(s.enqueue({ id: 'S1', classes: ['network'], long: false }), 'running',
    'kısa iş uzun işler doluyken de başlar');
  check('kısa-yuva garantisi', s.snapshot().classes.network.count === 3
    && s.snapshot().classes.network.long === 2);
  s.release('S1');
  check('kısa release uzun işi başlatmaz (yuva korunur)',
    !s.snapshot().running.some((j) => j.id === 'L3'));
  s.release('L2');
  check('uzun release sonraki uzunu başlatır',
    s.snapshot().running.some((j) => j.id === 'L3'));
}

// Çok sınıflı iş: tüm sınıflar uygunsa başlar
{
  const s = createResourceScheduler({ network: 4, disk: 1 });
  assert.equal(s.enqueue({ id: 'dl1', classes: ['network', 'disk'] }), 'running');
  assert.equal(s.enqueue({ id: 'dl2', classes: ['network', 'disk'] }), 'queued',
    'disk sınıfı doldu — network boş olsa da bekler');
  s.release('dl1');
  check('çok-sınıflı iş her iki sınıfı da iade eder',
    s.snapshot().running.some((j) => j.id === 'dl2')
    && s.snapshot().classes.network.count === 1 && s.snapshot().classes.disk.count === 1);
}

// Öncelik: yüksek öncelik önce dağıtılır; eşitlikte eski bekleme
{
  const s = createResourceScheduler({ cpu: 1 });
  s.enqueue({ id: 'run', classes: ['cpu'] });
  s.enqueue({ id: 'low', classes: ['cpu'], priority: 0, enqueuedAt: 1 });
  s.enqueue({ id: 'high', classes: ['cpu'], priority: 5, enqueuedAt: 2 });
  s.enqueue({ id: 'mid', classes: ['cpu'], priority: 3, enqueuedAt: 0 });
  s.release('run');
  check('öncelik yüksek kazanır', s.snapshot().running[0].id === 'high');
  s.release('high');
  check('sonraki en yüksek öncelik', s.snapshot().running[0].id === 'mid');
  // setPriority kuyruktaki işi öne alır
  s.setPriority('low', 10);
  s.release('mid');
  check('setPriority kuyruk sırasını değiştirir', s.snapshot().running[0].id === 'low');
}

// İptal kuyruktaki işi ve kaynağı doğru serbest bırakır
{
  const s = createResourceScheduler({ gpu: 1 });
  s.enqueue({ id: 'g1', classes: ['gpu'] });
  s.enqueue({ id: 'g2', classes: ['gpu'] });
  check('kuyruktaki iptal çıkarır', s.cancel('g2') === true
    && s.snapshot().queued.length === 0);
  check('koşan işi iptal yuvayı açar', s.release('g1') === true
    && s.snapshot().classes.gpu.count === 0);
  check('çift iade no-op', s.release('g1') === false);
}

// onDispatch hook: yuva açılan işin id'si bildirilir
{
  const dispatched = [];
  const s = createResourceScheduler({ network: 1 }, { onDispatch: (id) => dispatched.push(id) });
  s.enqueue({ id: 'x', classes: ['network'] });
  s.enqueue({ id: 'y', classes: ['network'] });
  s.release('x');
  check('onDispatch kuyruktan çıkanı bildirir', dispatched.length === 1 && dispatched[0] === 'y');
}

// normalize: bilinmeyen sınıf atılır, sınıfsız iş cpu'ya düşer
{
  const s = createResourceScheduler({ cpu: 1, network: 2 });
  assert.equal(s.enqueue({ id: 'k1', classes: ['unknown-class'] }), 'running');
  check('sınıfsız/bilinmeyen sınıf cpu sayılır',
    s.snapshot().running[0].classes.join() === 'cpu');
  assert.equal(s.enqueue({ id: '', classes: ['cpu'] }), 'invalid');
  assert.equal(s.enqueue({ id: 'k1', classes: ['cpu'] }), 'invalid',
    'aynı id iki kez kabul edilmez');
}

console.log(`job-resource-scheduler: ${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
