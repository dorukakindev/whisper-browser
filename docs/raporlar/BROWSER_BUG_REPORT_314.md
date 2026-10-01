# BROWSER_BUG_REPORT_314 — Kullanım kuyruğu yeniden doğrulama turu (R414–R433)

Tarih: 2026-10-01 · Kapsam: kullanıcının yeniden gönderdiği 20 maddelik
kullanım-odaklı kuyruğun tamamının regresyon doğrulaması. Kuyruk R388–R407
ile daha önce uygulanmıştı; bu tur her maddenin kanıtını güncel master
(`16c1608` üzeri) üzerinde tekrar koşturdu.

## Bulgular

| # | Bulgu | Durum |
|---|-------|-------|
| B-314-01 | `tools/install-orchestrator.js` `ELECTRON_COMMIT` pini Electron v43.5.0+wvcus yükseltmesiyle eskidi — preflight kurulumu `ELECTRON_COMMIT` ile reddediyordu | DÜZELTİLDİ (pin `2ffdf82`... güncellendi + `KURULUM_TEDARIK_ZINCIRI.md` senkron) |

Tag→commit eşleşmesi GitHub API ile doğrulandı
(`v43.5.0+wvcus` = `2ffdf82aa3214acedfb7447e2e920efc0398270b`, package-lock
resolved değeriyle birebir). Sırf pin bükülmüş olsaydı bunu kanıtlamazdık.

## Madde ↔ kanıt tablosu

| Madde | Kanıt | Sonuç |
|-------|-------|-------|
| 1 EN/TR kullanıcı verisi | ui-locale-userdata (10), ui-locale (14), ui-locale-dynamic (73+71) | temiz |
| 2 Eksik çeviriler | i18n-coverage (0/0 eksik), ui-locale-dedupe, electron-ui-locale smoke | temiz |
| 3 Dar pencere | electron-ui-narrow-tr smoke | temiz |
| 4 Tema kontrastı | electron-ui-theme-contrast smoke (2 tema, 0 kontrast ihlali) | temiz |
| 5 Klavye akışı | electron-ui-keyboard smoke (Esc/ok/Enter/odak dönüşü) | temiz |
| 6 Çift altyazı | electron-subtitle-overlap smoke | temiz |
| 7 Tam ekran | overlap smoke içindeki fullscreen senaryosu + browser-subtitles birimleri | temiz* |
| 8 Transkript perf | cue-list-perf (5) | temiz |
| 9 Kayıt hatası | electron-subtitle-save-retry smoke + job-recovery-contracts (8) | temiz |
| 10 Çeviri iptali | electron-translate-cancel smoke + pipeline-cancel (10) | temiz |
| 11 Sağlayıcı kurtarma | browser-retry-state, browser-subtitle-retry (6) | temiz |
| 12 Video değişimi | browser-subtitle-pair-recovery | temiz |
| 13 Canlı yayın | hls-recovery (14), live-cue-merge (10), electron-overlay-timing | temiz |
| 14 Kuyruk kurtarma | electron-queue-kill-resume E2E, queue-persistence (14), queue-state-corruption (25.015 kontrol), electron-crash-integrity | temiz |
| 15 Kuyruk seçenekleri | queue-opts-roundtrip (61.388 kontrol), queue-ordering-invariants, queue-lifecycle (21), electron-queue-reorder | temiz |
| 16 YouTube hesapları | electron-youtube-oauth smoke (device+code+refresh+revoke çağrı sayımları doğru) | temiz |
| 17 Kütüphane bağlantıları | media-relink (8/8), electron-media-catalog | temiz |
| 18 PDF kurtarma | pdf-partial-retry (7/7), electron-pdf-translate | temiz |
| 19 Manga/OCR | manga-region-layout (9/9), manga-layout-state, manga-ocr-hardening (65), browser-manga (93), manga-fetch/restore-deadzone (6+6), lookahead-lifecycle (10) | temiz |
| 20 Windows teslimi | install-supply-chain (51 senaryo — B-314-01 düzeltmesiyle), unicode-paths (2.429), path-to-file-url (8/8), persist-paths-deadzone (8), .bat envanteri | temiz |

\* Tam ekran görsel durumu Linux xvfb'de temsili; gerçek Windows DRM/tam-ekran
davranışı Windows el-kontrol listesinde ayrıca doğrulanacak.

## Ortam-kapalı koşu

- `electron-page-translation-live`: `--live` grubu smoke'u; gerçek sağlayıcı
  anahtarı + kullanıcı profili (settings.json + secrets.safe.json) gerektirir.
  Bu makinede profil yok → tasarım gereği `--all` dışında, atlandı (regresyon
  değil).

## Değişen dosyalar

- `tools/install-orchestrator.js` — ELECTRON_COMMIT sabiti
- `docs/KURULUM_TEDARIK_ZINCIRI.md` — aynı commit referansı
- `docs/raporlar/BROWSER_BUG_REPORT_314.md` — bu rapor
- `docs/devir/2026-10-01-2100.md` — devir notu
- `DEVIR-NOTU.md` — indeks satırı
