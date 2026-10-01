# BROWSER_BUG_REPORT_358 — Kuyruk-50 Madde 46: Temiz Windows kurulum matrisi

Tarih: 2026-10-01 · Dal: `devin/1790893047-kuyruk-46` · Başlangıç kod: `f167e07` · Bitiş kod: `4452152`

## Kapsam ve yöntem

Madde 46: *"Temiz Windows kurulum matrisi: Python/Node sürümleri, eksik araçlar, boşluklu yollar, sınırlı yazma izinleri."* Gerçek temiz-Windows kurulumu bu ortamda koşamaz; dört eksen statik denetim + birim/matris testiyle doğrulandı ve bulunan tek kusur düzeltildi.

## Matris denetim sonucu

| Eksen | Durum | Kanıt |
|---|---|---|
| Python sürümleri | TEMİZ | `supportedPython` yalnız 3.10/3.11 kabul; `PYTHON_VERSION` hatası "yan yana kurup yeniden deneyin" iletir. Win32 tarama sırası `python` → `py -3.11` → `py -3.10`. |
| Node sürümü | TEMİZ | `supportedNode` ≥22.13 kapısı + `NODE_VERSION`; `install.bat` `where node` ile erken yakalar. |
| Eksik araçlar | TEMİZ | `preflight`: `NPM_MISSING`/`GIT_MISSING`/`FFMPEG_MISSING` (yerel `backend\bin` ya da PATH ikilisi), `PYTHON_MISSING`, `NPM_LOCK_*`, `DISK_SPACE` (10 GiB taban) — hepsi eylemlenebilir kod+mesaj. |
| Boşluklu yollar | TEMİZ | Tüm `.bat` dosyalarında `%~` genişlemeleri çift tırnak içinde; `set` atamaları tırnaklı ya da boşluksuz sabit. `spawnSync shell:false` + argüman dizisi — `D:\Whisper Local` altındaki yollar argv parçalanması yaşamaz. Test ratchet'i tüm `.bat`'leri tarıyor. |
| Sınırlı yazma izinleri | **DÜZELTİLDİ** | Aşağıda B-46-01. |

## B-46-01 — Yazma izni hataları ham sızdı (düzeltildi)

`tools/install-orchestrator.js` içindeki tüm fs yazma adımları (`renameSync` venv/node_modules takası, `writeFileSync` lock/state, `rmSync` temizlik) ve `run()`'daki `spawnSync` hataları `EACCES`/`EPERM`/`EROFS` olarak ham fırlıyordu. `main()` yakalaması bunları `HATA [UNEXPECTED]: EPERM: operation not permitted, rename ...` diye basıyordu — `C:\Program Files` altına, salt-okunur/senkronize klasöre ya da AV kilidi olan dizine kuran kullanıcı eylemsiz kaldı.

**Düzeltme:** yeni `classifyInstallError()` bu üç errno'yu `InstallError('PERMISSION', '… yazma izni yok (<hedef>). Kurulumu kullanıcı dizininizin altına (ör. D:\Whisper Local) taşımak veya klasöre yazma izni vermek gerekir.')` iletir. İki bağlama noktası: `run()` içinde `result.error` sınıflandırması (çalıştırıcı engellemesi durumunda `PROCESS_START` yerine) ve `main()` catch bloğu (tüm fs yollarını kapsayan son ağ). `PERMISSION` dışı hatalar davranışı değiştirmez.

## Test kanıtı

- `tests/install-clean-windows-matrix.test.js` (yeni, 5 bölüm): sürüm matrisi (6+6 değer), PERMISSION sınıflandırması (3 errno + 3 negatif), `run()` gerçek spawn EACCES → `PERMISSION` (kutuda canlı doğrulandı), `.bat` tırnak ratchet'i (7 dosya tarama — `set` boşluklu-değer daralmasıyla), main() bağlama ratchet'i — **PASS**.
- `tests/install-supply-chain.test.js` — 51 izole kurulum/failure-injection senaryosu **PASS** (regresyon yok).
- `tests/windows-package-ignore.test.js` — **PASS**.
- `node --check tools/install-orchestrator.js` — temiz.

## Windows'ta doğrulanamayan sınırlar

- Gerçek Windows EACCES/EPERM yol üretimi (nt status → EPERM eşlemesi) — kod her üç errno'yu kapsıyor ama uçtan-uca yalnız Linux'ta prova edildi.
- `py` başlatıcısı, `where.exe`, `%~dp0` davranışı ve `cd /d` gerçek cmd oturumunda denenmedi — statik ratchet ile kilitli.
- Gerçek temiz-kurulum uçtan uca (venv oluşturma + pip + npm ci) Windows makinede çalıştırılmadı; Windows el-kontrol listesine taşıyor.
