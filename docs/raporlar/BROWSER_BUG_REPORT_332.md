# BROWSER_BUG_REPORT_332 — Kuyruk-50 madde 20: Oynatma saati tutarlılığı

Tarih: 2026-10-01 · Dal: `devin/<ts>-r420-clock-drift` · Başlangıç: `d6a927d`

## Kapsam

Madde 20: "Uzun filmlerde altyazı ve video saatinin kaymasını izleyen küçük bir
doğrulama katmanı; kayma belirli eşiği aşınca kullanıcıya anlaşılır öneri."

## Ön denetim

- Sabit-olusum ve sürüklenme **düzeltme** araçları mevcut: `playerAutoSync`
  (ses-tabanlı), parça-bazlı senkron profilleri (madde 18), çok-noktalı senkron
  least-squares + LOO (madde 6), HLS kararlılık takibi `hlsRecovery`.
- **Pasif izleme yoktu** — kullanıcı fark edene dek sapma sessizce büyürdü.
  Boşluk kapatıldı.

## Uygulanan katman

- `player.clockDriftSamples` {w, m, r} halkası (≤240): `timeupdate` akışında
  yalnız oynarken + `workspaceMode==='player'` + canlı olmayan + süre sonlu
  iken örneklenir.
- `analyzeClockDrift` saf karar: ardışık sürekli aralıklar üzerinden
  `observed = Δmedia/Δwall`; atlama (dm>1.5s), duraklatma boşluğu (dw>3s),
  hız değişimi (r farkı) ve geri-adım aralıkları elenir; ≥15 sn pencerede
  `|observed/expected − 1| ≥ %2` → `drift`, yoksa `stable`/`insufficient`.
- Eşik aşılınca `clockDriftWarned` medya başına tek sefer: `playerClockDriftHint`
  + `logLine` — "Video saati ~%X hızlı/yavaş ilerliyor — uzun filmlerde altyazı
  zamanla kayar; Sese göre otomatik senkronla ile düzeltebilirsin" (TR+EN,
  şablonlu locale).
- `resetMediaBoundState` yeni medyada örnekleri + uyarı + hint'i sıfırlar.

## Kanıt

- `node tests/local-clock-drift.test.js` — **17/17 PASS** (stable/drift
  matrisi, %2 eşiği, seek/pause/rate-change elemesi, insufficient kuralları).
- `node tests/local-stutter-probe.test.js` — 25/25 (madde-19 regresyonu).
- `node --check` temiz.

## Windows notu

`timeupdate`+`performance.now` çifti platformdan bağımsız; gerçek saat
sürüklenmesi (donanım/OS ses saati sapması) yalnız uzun-film izlemede
üretilir — sinyal varsa öneri medya başına tek sefer görünür.
