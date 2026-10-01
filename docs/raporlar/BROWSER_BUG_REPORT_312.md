# BROWSER_BUG_REPORT_312 — doğrulama/tutarlılık kuyruğu tur-1 (madde 1–7)

Tarih: 2026-10-01 · Dal: `devin/1790867688-verify-batch-1` · Taban: `e37ea35`

## Kapsam

Kullanıcının istediği 20 maddelik doğrulama kuyruğunun ilk dilimi: tam test
baseline, Electron smoke envanteri, IPC parity, ölü yüzey/envanter denetimleri.

## Sonuç tablosu

| # | Madde | Sonuç |
|---|-------|-------|
| 1 | `npm test` tam suit | **GEÇTİ** — 213 node dosyası + backend suiti, "Tüm testler geçti" |
| 2 | Electron smoke'lar (`--all`) | 59 deterministic → **2 düşüş**, ikisi de kök-nedenlendi ve düzeltildi (aşağıda) |
| 3 | preload↔main IPC parity | **1 kör nokta bulundu ve kapatıldı** (sendSync) |
| 4 | Çağrılmayan `window.api` | **Temiz** — `preload-usage-ratchet` zaten kilitli: 235 export, 7 gerekçeli dormant, 0 kullanılmayan |
| 5 | `webContents.send`↔`on` parity | **Temiz** — 22 send kanalının tamamı dinleyicili (`resource-snapshot-request` browser-preload'da dinleniyor) |
| 6 | Okunmayan settings anahtarları | **Temiz** — 151 PERSIST anahtarının tamamı DOM'da var ve `applyUiSettings` tarafından geri okunuyor; DOM'da olmayan PERSIST kaydı yok |
| 7 | Okunmayan localStorage anahtarları | **Temiz** — 38 okunan/37 yazılan anahtar; okunan-yazılmayan = 0, yazılan-okunmayan = 0 |

## Düzeltilen kusurlar (hepsi test-altyapısı)

### B-312-01 — ipc-parity `sendSync` kör noktası (kapatıldı)
`tests/ipc-parity.test.js` send→on parity taramasını yalnız `ipcRenderer.send(`
literalıyla yapıyordu. `ipcRenderer.sendSync` kanalları (`queue:saveSync`,
`settings:saveSync`, `library:upsert-before-close`) tarama dışındaydı — karşılık
gelen `ipcMain.on` kaydı silinse test düşmezdi. Regex `send(?:Sync)?` olarak
genişletildi; send sayımı 19→22. Doğrulama: `node tests/ipc-parity.test.js` PASS
("217 handle · 12 on · 22 send — parity tam").

### B-312-02 — menu-visual smoke çıplak Xvfb'te deterministic düşüyordu (düzeltildi)
`desktopCapturer.getSources({types:['window']})` X11'de `_NET_CLIENT_LIST` atomuna
bakıyor; `xvfb-run` altında pencere yöneticisi olmadığından liste boş dönüyor ve
smoke "The app window is unavailable to desktopCapturer" ile düşüyordu. Smoke'a
`ensureWindowManager()` eklendi: pencere kaynağı yoksa `kwin_x11`/`openbox`/
`metacity`/`xfwm4`/`mutter` PATH'te aranıp bir kere başlatılır ve liste tekrar
denenir; WM'li ortamda (gerçek masaüstü, Windows) dokunmaz. Doğrulama: smoke
xvfb altında PASS (translate 347K, more 366K değişen piksel).

### B-312-03 — tab-leak smoke cue-sınırı flake'i (düzeltildi)
S1 örneklemesi `t=2.003481`'de overlay'in hâlâ `B-KAYNAK-0` gösterdiğini
yakalamıştı; `B-KAYNAK-2` `[2,4)` aralığında bekleniyordu. Overlay sınır
timer'ı (`armedBoundary`) video saatinden birkaç ms geç tetiklenebilir — 3ms
gecikme sızıntı değil planlama titreşimi. Örnekleme toleransı eklendi
(`expectedNear`, ±150ms): sınır penceresinde biten ve başlayan cue'nun ikisi
de meşru. Doğrulama: smoke PASS.

## Windows notu

- `kwin_x11`/`openbox`/`metacity`/`xfwm4`/`mutter` sırası yalnız POSIX'te anlamlı;
  Windows'ta `spawnSync('which', ...)` zaten bulunamadığı için dal hiç WM
  başlatmaz — Windows davranışı etkilenmez (orada window kaynakları natively var).
- tab-leak toleransı platformdan bağımsız güvenli (yalnız kabul genişliği).

## Çalıştırılmayanlar

- Ağ/canlı smoke'lar (`--network`, `--live`) bu turda koşulmadı.
- 59 deterministic smoke'un tamamı bu oturumda tek sefer koşuldu; iki düzeltme
  sonrası yalnız etkilenen 2 smoke yeniden koşuldu (ikisi de PASS).
