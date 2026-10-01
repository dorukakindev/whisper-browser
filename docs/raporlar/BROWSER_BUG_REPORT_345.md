# BROWSER_BUG_REPORT_345 — Kuyruk-50 madde 33: Taşınabilir proje paketi

Tarih: 2026-10-01 · Dal: `devin/1790887591-workspace-package-scope` · Kod: `f833203` → `aa6c403`

## Madde

> "Taşınabilir proje paketi: Seçili medya ilişkileri, altyazı, not ve senkron ayarlarını dışa/içe aktar. Göreli yolları destekle; paket kapsamını göster ve hesap/anahtar verilerini dışarıda tut."

## Mevcut uygulama denetimi (önce mevcut davranış doğrulandı)

`.wbp` çalışma paketi sistemi zaten kapsamlı kurulu:

| İstek | Mevcut durum | Kanıt |
|---|---|---|
| Medya ilişkileri + altyazı + not + senkron dışa/içe aktarım | ✅ `exportPackage`/`restorePackage` ROOTS=9 dosya (katalog, watch-library, tombstones, notlar, oturum, geçmiş, altyazı-tercih, seri-bağlam, skip-segments) + 4 dizin (posterler, altyazılar, workspace-assets, subtitle-edits) | `src/workspace-package.js` |
| Göreli yollar | ✅ `{{ROOT}}`/`{{VIDEO}}/` yeniden eşleme; mutlak yol ifşası yok | `rewrite()`, `workspace-video-package.js` |
| Paket kapsamını göster | ⚠️ Yalnız dosya sayısı + video sayısı + tarih — bölüm/kayıt detayı YOKTU | `catalog-extensions.js` package-preview |
| Hesap/anahtar dışarıda | ✅ settings.json ROOTS'ta değil; ama bunu kilitleyen test YOKTU | `allowed()` allowlist |

Senkron ayarları: `browser-subtitle-preferences.json` + sekme başına `subtitleSyncRecords` (`browser-session.json` içinde) — ikisi de ROOTS'ta ✓.

## Yapılan işler (kalan boşluklar kapatıldı)

1. **`describePackage(data)`** (workspace-package.js): paket kapsam özeti — bölüm başına dosya/bayt sayısı + kayıt sayıları (eser/bölüm, izleme kaydı, not, altyazı dosyası, düzenleme, senkron kaydı, sekme). Yalnız meta sayıları döner; içerik/yol sızdırmaz.
2. **`package-preview` IPC** artık `scope` döndürüyor (catalog-extensions.js); `media-catalog.js` geri-yükleme onayı üstünde "Paket kapsamı: 5 eser (12 bölüm) · 3 izleme kaydı · ..." satırı gösteriyor — kullanıcı onaylamadan önce neyin yerini alacağını bilir.
3. **`tests/workspace-privacy.test.js`** (yeni, 4 test): sır-sızıntısı ratchet'i — `settings.json` (token'lar), `youtube-accounts.json`, `.env`, `cookies.dat`, `watch-index.db` pakete adıyla ve içeriğiyle GİREMEZ; `allowed()` hepsini reddeder.

## Test kanıtı

- `node tests/workspace-privacy.test.js` → 4/4 PASS (sızıntı ratchet'i, allowed() kapısı, kapsam sayıları, bozuk-girdi güvenliği)
- `node tests/workspace-restore-regressions.test.js` → PASS (restore akışı dokunulmadı)
- `node tests/package-integrity.test.js` → todo 0
- `node tests/workspace-video-bounds.test.js` → 16 kontrol
- `node tests/browser-session-package.test.js` → PASS
- `node --check` 3 değişen dosya → temiz

## Windows etkisi

Yok — paket formatı/yol eşleme değişmedi; yeni yalnız meta-özet hesabı (saf JS) ve bir UI satırı. `start.bat` akışı etkilenmez.

## Kalan / kapsam dışı

- Videolu paket hâlâ tüm-katalog ölçeğinde (seçili-eser alt-küme dışa aktarımı ileride genişletilebilir).
- `watch-index.db` (FTS indeksi) kasıtlı olarak pakette yok — geri yüklemede yeniden inşa edilir.
