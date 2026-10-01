'use strict';
// Kuyruk-50 madde 26 — ortak iş durum modeli.
//
// Transkripsiyon, çeviri, indirme, PDF, OCR ve yakalama işleri durumlarını
// tek sözleşmede bildirir: her durum bir faza eşlenir (idle/queued/active/
// done/partial/failed/cancelled) ve geçişler faz matrisine göre doğrulanır.
// Amaç: UI ile backend'in aynı işi aynı fazda göstermesi ve geçersiz
// geçişlerin (ör. terminalden canlıya) erken engellenmesi.
const JOB_STATE_PHASES = Object.freeze({
  idle: 'idle',
  pending: 'queued', queued: 'queued', 'retry-wait': 'queued',
  starting: 'active', running: 'active', refreshing: 'active', loading: 'active',
  translating: 'active', paused: 'active', ready: 'active',
  done: 'done', complete: 'done', completed: 'done',
  partial: 'partial', interrupted: 'partial',
  error: 'failed', failed: 'failed', 'translation-error': 'failed',
  'wrong-document': 'failed', missing: 'failed', ambiguous: 'failed',
  skipped: 'failed', unsupported: 'failed',
  cancelled: 'cancelled',
});

const TERMINAL_PHASES = new Set(['done', 'partial', 'failed', 'cancelled']);

// Faz geçiş matrisi: terminal fazlar yeniden kuyruğa alınabilir (retry/resume)
// ama canlıdan başka faza doğrudan geri dönüş yoktur.
const PHASE_TRANSITIONS = Object.freeze({
  idle: new Set(['queued', 'active', 'failed', 'cancelled']),
  queued: new Set(['active', 'done', 'failed', 'cancelled']),
  active: new Set(['active', 'queued', 'done', 'partial', 'failed', 'cancelled']),
  done: new Set(['queued', 'active']),
  partial: new Set(['queued', 'active', 'done', 'failed', 'cancelled']),
  failed: new Set(['queued', 'active', 'done']),
  cancelled: new Set(['queued', 'active']),
});

function jobStatePhase(state) {
  return JOB_STATE_PHASES[String(state || '')] || null;
}

function isTerminalJobState(state) {
  return TERMINAL_PHASES.has(jobStatePhase(state));
}

function isActiveJobState(state) {
  const phase = jobStatePhase(state);
  return phase === 'queued' || phase === 'active';
}

// İki durum adı arasında geçiş yasal mı? Bilinmeyen durum geçersizdir.
function canTransitionJobState(from, to) {
  const fromPhase = jobStatePhase(from);
  const toPhase = jobStatePhase(to);
  if (!fromPhase || !toPhase) return false;
  if (from === to) return true;
  return PHASE_TRANSITIONS[fromPhase]?.has(toPhase) === true;
}

// domain: hata mesajında iş tipi (ör. 'cea', 'queue'). Bilinmeyen durum veya
// geçersiz geçişte Error fırlatır — yeni durum adı önce sözleşmeye yazılmalı.
function assertJobTransition(domain, from, to) {
  if (!jobStatePhase(to)) {
    throw new Error(`${domain}: bilinmeyen iş durumu '${to}'`);
  }
  if (!canTransitionJobState(from, to)) {
    throw new Error(`${domain}: geçersiz iş durum geçişi '${from}' → '${to}'`);
  }
  return to;
}

module.exports = { JOB_STATE_PHASES, jobStatePhase, isTerminalJobState,
  isActiveJobState, canTransitionJobState, assertJobTransition };
