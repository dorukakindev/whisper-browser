// Kuyruk-50 madde 26 — ortak iş durum modeli kilitleri.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JOB_STATE_PHASES, jobStatePhase, isTerminalJobState, isActiveJobState,
  canTransitionJobState, assertJobTransition } = require('../src/job-state-contract');

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}${extra ? ' — ' + extra : ''}`); }
}

// Faz eşleme: mevcut tüm durum adları bilinen bir faza bağlanır
check('pending→queued', jobStatePhase('pending') === 'queued');
check('running→active', jobStatePhase('running') === 'active');
check('refreshing→active', jobStatePhase('refreshing') === 'active');
check('retry-wait→queued', jobStatePhase('retry-wait') === 'queued');
check('complete→done', jobStatePhase('complete') === 'done');
check('partial→partial', jobStatePhase('partial') === 'partial');
check('interrupted→partial', jobStatePhase('interrupted') === 'partial');
check('error→failed', jobStatePhase('error') === 'failed');
check('cancelled→cancelled', jobStatePhase('cancelled') === 'cancelled');
check('bilinmeyen → null', jobStatePhase('bogus-state') === null && jobStatePhase('') === null);

// Terminal yardımcıları
check('complete terminal', isTerminalJobState('complete'));
check('partial terminal', isTerminalJobState('partial'));
check('running terminal değil', !isTerminalJobState('running'));
check('pending aktif-küme', isActiveJobState('pending') && isActiveJobState('running'));
check('done aktif değil', !isActiveJobState('done'));

// Geçiş matrisi — yasal yollar
check('idle→running yasal', canTransitionJobState('idle', 'running'));
check('running→retry-wait yasal', canTransitionJobState('running', 'retry-wait'));
check('retry-wait→running yasal', canTransitionJobState('retry-wait', 'running'));
check('running→refreshing yasal', canTransitionJobState('running', 'refreshing'));
check('refreshing→complete yasal', canTransitionJobState('refreshing', 'complete'));
check('refreshing→partial yasal', canTransitionJobState('refreshing', 'partial'));
check('running→cancelled yasal', canTransitionJobState('running', 'cancelled'));
check('error→running yasal (retry)', canTransitionJobState('error', 'running'));
check('partial→running yasal (resume)', canTransitionJobState('partial', 'running'));
check('aynı durum → aynı durum', canTransitionJobState('running', 'running'));

// Geçersiz geçişler engellenir
check('done→partial engelli', !canTransitionJobState('done', 'partial'));
check('done→cancelled engelli', !canTransitionJobState('done', 'cancelled'));
check('cancelled→partial engelli', !canTransitionJobState('cancelled', 'partial'));
check('bilinmeyen hedef engelli', !canTransitionJobState('running', 'yok'));
check('bilinmeyen kaynak engelli', !canTransitionJobState('yok', 'running'));
check('boş kaynak engelli', !canTransitionJobState('', 'running'));

// assertJobTransition: geçerli geçiş değeri döner, geçersizde fırlatır
check('assert yasal geçiş to döner', assertJobTransition('cea', 'running', 'partial') === 'partial');
check('assert geçersiz geçiş fırlatır', (() => {
  try { assertJobTransition('cea', 'complete', 'partial'); return false; }
  catch (e) { return /geçersiz/.test(e.message); }
})());
check('assert done→retry-wait yasal (yeniden kuyruk)', (() => {
  try { return assertJobTransition('queue', 'done', 'pending') === 'pending'; }
  catch (_) { return false; }
})());
check('assert bilinmeyen durum fırlatır', (() => {
  try { assertJobTransition('cea', 'running', 'spinning'); return false; }
  catch (e) { return /bilinmeyen/.test(e.message); }
})());
check('assert domain adı mesajda', (() => {
  try { assertJobTransition('pdf', 'done', 'cancelled'); return false; }
  catch (e) { return e.message.startsWith('pdf:'); }
})());

// Statik ratchet: main.js'te kullanılan tüm durum adları sözleşmede kayıtlı
{
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const literals = new Set();
  for (const match of main.matchAll(/sendBrowserHlsCeaFullProgress\([^,]+,\s*'([a-z-]+)'/g)) {
    literals.add(match[1]);
  }
  check('sendBrowserHlsCeaFullProgress durumları sözleşmede', literals.size > 0
    && [...literals].every((s) => jobStatePhase(s) !== null), [...literals].join(','));
  // CEA iş makinesinin kullandığı canlı-durum kapısı da sözleşmeyle uyumlu:
  for (const s of ['running', 'refreshing', 'retry-wait']) {
    check(`'${s}' canlı/queued faz`, isActiveJobState(s));
  }
}

// Statik ratchet: assertJobTransition gerçekten sendProgress içinde bağlı
{
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  check('sendProgress assertJobTransition kullanır',
    /function sendBrowserHlsCeaFullProgress[\s\S]{0,800}assertJobTransition\(/.test(main));
}

console.log(`job-state-contract: ${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
