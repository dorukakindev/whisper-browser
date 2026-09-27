# BROWSER_BUG_REPORT_139 — R140 npm audit + R141 startup perf + R142 CSS token

Tarih: 2026-09-27 · Dal: `codex/r140-142-audit-cleanup-1790502100`

## R140 — npm audit + bağımlılıklar

- `npm audit`: **0 vulnerability** — bağımlılık ağacı temiz.
- Lockfile: 192 paket, hepsi resolved, `npm ci --dry-run` temiz.
- Uyarı (bug değil): `jsdom@30.0.1` engine `^22.22.2 || ^24.15.0 || >=26`
  istiyor; ortam 22.14.0. Yalnız dev-dep → test harness'ı etkilenmiyor.
- Atlanan güncellemeler: `hls.js 1.7.3` ve `darkreader 4.9.133` — ikisi de
  <7 gün önce yayınlanmış; supply-chain kuralı (≥7 gün) gereği ertelendi.

## R141 — başlangıç performans profili

`src/main.js` tepesindeki 21 Electron-bağımsız modül require'i ayrı ayrı
ölçüldü: **toplam 12ms**, hiçbiri 15ms'i geçmiyor. main.js'in asıl başlangıç
maliyeti Electron `app.whenReady` + I/O; require zincirinde lazy-load ile
kazanılacak anlamlı bütçe yok → değişiklik gerekmiyor, belgelendi.

## R142 — CSS token temizliği

- Baseline **447 → 445** (`css-hardcoded-color-baseline.txt` düşürüldü).
- `#64bdcc` 2 sabit kullanım `var(--group-cyan)`'a çevrildi (token `:root`
  kapsamlı).
- `--pc-shortcut`/`--player-text` adayları eleme dışı: bu tokenlar
  `.player-controls`/`.player-layer` seçici kapsamlı — browser-chrome'da
  çözünmez; sınır belgelendi.
- Kalan ~410 sabit `rgba()` tonları tam token taksonomisi gerektirir —
  ayrı tasarım kararı; bu turda bırakıldı.

## Windows etkisi

Yok — iki renk sabiti değer olarak birebir aynı.
