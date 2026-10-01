# BROWSER_BUG_REPORT_361 — Kuyruk-50 Madde 49: Tekrarlanabilir Windows paketi

Tarih: 2026-10-01 · Dal: `devin/1790893544-kuyruk-49` · Başlangıç kod: `5f08659` · Bitiş kod: `bd6243b`

## Kapsam ve yöntem

Madde 49: *"Tekrarlanabilir Windows paketi (paket kaynakları + runtime bağımlılık manifesti, temiz üretim farkları, internetsiz açılış + yerel medya/altyazı)."* Dört eksen denetlendi; iki eksik kapatıldı, ağ yüzeyi kanıtlı temiz.

## B-49-01 — Üretim farkı ölçülemiyordu (düzeltildi)

`BUILD-MANIFEST.json` yalnız provenance taşıyordu (`createdAt` — her üretimde değişir); iki paket arasındaki gerçek içerik farkını karşılaştıracak alan yoktu.

**Düzeltme:** `tools/package-manifest.js` → `packageInputSha256(root, electronVersion)` — kanonik `requiredPackageFiles` listesinin sıralı içerik hash'i + `PACKAGER_IGNORE` serileştirmesi + `package.json`/`package-lock.json` hash'leri tek SHA-256'da. `BUILD-MANIFEST.inputSha256` olarak yazılır: aynı kaynak ağacı aynı hash'i üretir; herhangi bir kaynak/bağımlılık sürüklenmesi hash'i değiştirir. `createdAt` provenance olarak kalır.

## B-49-02 — Runtime bağımlılık manifesti yoktu (düzeltildi)

Paketin çalışması için paket dışında ne gerektiği yazılı değildi. `BUILD-MANIFEST.runtimeRequirements` eklendi: Node ≥22.13 (kurulum tarafı), CPython 3.10/3.11 (install.bat venv), ffmpeg+ffprobe (`backend\bin` veya PATH), modellerin ilk kullanımda HF indirmesi, "açılış ağ gerektirmez" notu.

## Internetsiz açılış — temiz

`app.whenReady` bloğu denetlendi: `prepareWidevineComponents` `void`+catch (Widevine CDM indirmesi arayüzü beklemez), `startBrowserAdblock` promise'i catch'li ve `createWindow`'u bloklamıyor, `restoreInvidiousSessions`/`restoreYoutubeSession` yalnız secret-store okur. `createWindow` → yerel `index.html`; internetsiz açılışta yerel medya/altyazı akışı (file picker → yerel parse/oynatma) ağ gerektirmez. Ratchet: whenReady bloğunda `await` ağ-hazırlığı yasak.

## Yerel medya/altyazı — temiz

`subtitleFileAccess` + dosya seçici akışı internetsiz çalışır; unicode-paths (2429 kontrol) Türkçe/UTF-8 yolları kilitli.

## Test kanıtı

- `tests/package-reproducible.test.js` (yeni, 5 bölüm): determinizm (aynı ağaç → aynı hash, 64-hex), sürüm duyarlılığı + liste sıralaması, sahte-ağaçta içerik-değişimi yakalama, manifest bağlantısı, internetsiz-açılış ratchet'i — **PASS**.
- `tests/windows-manifest-longpath.test.js` — 9 bölüm **PASS** (regresyon yok), `tests/package-integrity.test.js` — **PASS** (1..9).
- `node --check tools/package-manifest.js tools/package-windows.js` — temiz.

## Windows'ta doğrulanamayan sınırlar

- Gerçek paket üretimi `package:win` Windows'ta koşar; `inputSha256`'nın iki Windows üretimi arasında eşitliği el listesinde.
- İnternetsiz fiziksel açılış (uçak modu + yerel medya) gerçek Windows'ta denenmedi — başlangıç ağ yolları statik ratchetle kilitli.
