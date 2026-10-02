# BROWSER_BUG_REPORT_373 — 100-kuyruk batch 10: kapanış temizliği (91–100)

**Tarih:** 2026-10-02 · **Kapsam:** depo sağlık süpürmesi — bağımlılık, ölü dosya, ratchet baseline'ları, doküman indeksleri, CHANGELOG, açık kararlar, IPC/preload sayaçları, çalışma ağacı, final suit + smoke seti, kapanış özeti.

## Sonuç

10 madde tarandı; **5 küçük doküman drift'i onarıldı + 1 test-altyapı kusuru düzeltildi**, ürün kodu kusuru yok. 100-kuyruk kampanyası bu raporla kapanıyor.

## Madde bulguları

| # | Madde | Bulgular | Aksiyon |
|---|-------|----------|---------|
| 91 | npm audit + outdated | 0 açık; jsdom 30.0.1 bilinçli pin | — |
| 92 | Orphan/ölü dosya | `src/` tamamı referanslı; `tools/` tamamı referanslı; kökte sahipsiz dosya yok | — |
| 93 | Ratchet baseline tazeliği | `ci-determinism` (math_random=0, wallclock=13), css-token (430), i18n-signal — hepsi gerçek değerle uyumlu; Math.random eşleşmeleri yalnız yorum | — |
| 94 | Devir + rapor indeksleri | **5 not eksik** (1215/1655/1804/1956/2000), **2 yanlış hedef** (1934→1925, 1952→2000), **rapor INDEX'te 371+372 satırı eksik** | DEVIR-NOTU onarıldı (0 eksik/ölü), INDEX tamamlandı |
| 95 | CHANGELOG | 100-kuyruk batch 1–9 + batch-9 düzeltmeleri eklendi | yapıldı |
| 96 | ACIK-KARARLAR | 10 açık madde hâlâ geçerli; damga güncellendi | güncellendi |
| 97 | IPC/preload sayaçları | 223 `handle` + 12 `on` — IPC-KATALOG ile birebir; preload 241 export/7 dormant/0 açık ratchet'le kilitli | — |
| 98 | Çalışma ağacı | sahipsiz/stray dosya yok; tek kalan değişiklik bu batch'in dokümanları | — |
| 99 | Final suit + smoke | `npm test` tam suit yeşil; `run-electron-smokes.js --all` **57/57 GEÇTİ**. `electron-burnin-close-midjob` deterministik düşüyordu → kök neden: sürücü `kill(-child.pid)` yalnız xvfb-run/Electron grubunu öldürüyor; main.js `spawn` sarmalayıcısı ffmpeg'i `detached:true` (kendi grup lideri) başlattığı için ffmpeg yetim kalıp tmp encode'u bitiriyordu → kurtarma restart yerine `canFinalize` koluna giriyordu (ürün davranışı doğru — test tasarım açığı). Sürücü artık 'start' işaretinde recovery.json'daki kayıtlı ffmpeg pid'ini kendi grubuyla öldürüyor → yarım tmp garantili → restart kolu tekrar kapsanıyor (60.0s çıktı) | düzeltildi |
| 100 | Kapanış özeti | bu rapor + devir notu | yapıldı |

## 100-kuyruk kampanya özeti

- 10 batch × 10 madde — tamamı sırayla işlendi (PR #401–#411 aralığı).
- Doğrulanmış ve düzeltilen gerçek kusurlar batch raporlarında (363–373): kuyruk yaşam döngüsü yarışları, fsync/atomik yazım boşlukları, çeviri sözleşme ihlalleri, performans darboğazları, Windows dosya-sistemi kusurları (rename kilidi + yol katlaması), güvenlik ratchet boşlukları.
- Temiz kapanan maddelerin kanıtları ilgili raporların tablolarında.

## Kalan bilinen sınırlar

- GitHub Actions hesapta kapalı — tüm doğrulama yerel `npm test` + `run-electron-smokes.js --all` (xvfb).
- Windows-elle-doğrulama listesi `docs/ACIK-KARARLAR.md` + Windows oturumlarında birikimli.
- `devin_review_manage` 404 dönüyor (hesap flag'i) — report_triage toplu bildirimi askıda.
