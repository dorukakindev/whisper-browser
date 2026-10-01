# BROWSER_BUG_REPORT_371 — 100-kuyruk batch 8: doküman/infra senkron

## Kapsam

Ürün belgelerinin mevcut koda karşı drift denetimi (madde 71–80).

## Bulgular → düzeltmeler

| # | Belge | Drift | Düzeltme |
|---|-------|-------|----------|
| 71 | `docs/raporlar/INDEX.md` | 300'de kalmış; 301–370 arası 70 rapor indeksiz | 70 satır eklendi (yeni→eski); **330/330 dosya indeksli, 0 ölü bağlantı** |
| 72 | `AGENTS.md` | "son: 300" | → **370** |
| 73 | `docs/IPC-KATALOG.md` | "216 handle" gerçeğin gerisinde; on kanalları belgesiz | Yeniden üretildi: **223 handle + 12 on**, 30 önek tablosu, kaynak-doğrulu |
| 74 | `docs/GUVENLIK-MODELI.md` | "234 export" | → **241 export** (ratchet gerçeği: 241/7 dormant/0 çıplak) |
| 75 | `CHANGELOG.md` Unreleased | Kuyruk-50 + 100-kuyruk + Electron 43.5 + translatePattern/speakerMap girdisiz | Added/Changed/Fixed özet girdileri eklendi |
| 76 | `README.md` | Temiz — özellik tablosu güncel | Doğrulandı |
| 77 | `docs/KURULUM.md` + `INSTALLATION.md` | Temiz (önceki turda 3 installer tamamlanmıştı) | Doğrulandı |
| 78 | `docs/ARCHITECTURE.md` | Temiz — satır sayısı/kanal sayısı iddiası yok | Doğrulandı |
| 79 | `docs/ACIK-KARARLAR.md` | Güncel (R332 damgalı, yeni needs_human yok) | Doğrulandı |
| 80 | `YENI-BILGISAYAR.md` | Tarihsel engel listesi bilinçli korunuyor; güncel-idddia metni yok | Doğrulandı |

## Ölçüm kanıtı

- Kanal çıkarımı: `grep -oE ipcMain\.(handle|on)` → main.js 220 handle,
  +3 servis modülü = 223 benzersiz handle; 12 `ipcMain.on`.
- Preload export sayımı: `preload-usage-ratchet` → 241 export.
- INDEX bütünlüğü: her `BROWSER_BUG_REPORT_<n>.md` dosyası ↔ indeks satırı
  (330/330, çift yönlü eşleşme).

## Windows etkisi

Yalnız belge değişiklikleri; ürün davranışı yok.
