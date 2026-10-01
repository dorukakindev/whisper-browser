# BROWSER_BUG_REPORT_338 — Kuyruk-50 madde 26: ortak iş durum modeli

Tarih: 2026-10-01 · Başlangıç: `87ecd1f`

## Kapsam

Madde 26: "Transkripsiyon, çeviri, indirme, PDF ve OCR işlerinin durum
geçişlerini ortak sözleşmede tanımla. Geçersiz geçişleri engelle; UI ile
backend'in aynı işi aynı durumda göstermesini sağla."

## Uygulanan — `src/job-state-contract.js`

- `JOB_STATE_PHASES`: tüm iş durumu adları tek faza eşlenir —
  idle / queued / active / done / partial / failed / cancelled.
  UI ve backend aynı durum adını aynı fazda görür; sözleşmede olmayan yeni
  ad `jobStatePhase → null` döndürür ve statik ratchet testi düşer.
- `PHASE_TRANSITIONS`: faz geçiş matrisi — terminal fazlar (done/partial/
  failed/cancelled) yalnızca kuyruk/canlıya dönebilir (retry/resume);
  done→partial, done→cancelled gibi tutarsız geçişler engellidir.
- `assertJobTransition(domain, from, to)`: bilinmeyen durum ya da geçersiz
  geçişte fırlatır.

## Bağlama

`sendBrowserHlsCeaFullProgress` (CEA tam-yakalama iş makinesi) artık
`job.state` atamadan önce sözleşmeyi doğrular; geçersiz geçiş tanıya düşer ve
atlanır. CEA'nın kullandığı tüm durumlar (running/refreshing/retry-wait/
partial/complete/error/cancelled) sözleşmede kayıtlı.

## Kanıt — `tests/job-state-contract.test.js` → 41/41 PASS

Faz eşlemeleri, terminal/aktif yardımcıları, yasal+yasak geçiş matrisi,
assert davranışı, statik ratchet: main.js'teki tüm ilerleme durumu
literal'ları sözleşmede kayıtlı (yeni durum adı ekleyen kod sözleşmeyi
güncellemek zorunda).
