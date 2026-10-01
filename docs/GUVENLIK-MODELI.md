# Güvenlik Modeli — Whisper Browser

Bu belge uygulamanın güven sınırlarını, köprü (preload) sözleşmesini ve
savunma katmanlarını tek yerde toplar. Amaç: yeni özellik eklerken hangi
kuralın nerede kilitlendiğini bulmak ve gerilemeleri erken yakalamak.

## 1. Süreç modeli

Üç katman, tek yön veri akışı:

- **Ana süreç (`src/main.js`)**: Node erişimi, dosya sistemi, subprocess
  (Python/ffmpeg) spawn, kalıcı depo. Ayrıcalıklı tek nokta.
- **Preload (`src/preload.js`)**: `contextBridge` ile `window.api` köprüsü.
  Renderer'a Node doğrudan verilmez.
- **Renderer (`src/renderer/`)**: sandbox'lı UI.

Tüm pencere yüzeyleri aynı sertleştirilmiş tercihlerle açılır:
`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`,
`webSecurity: true`. Kapsayan yüzeyler: ana pencere (`index.html`),
tarayıcı sekmeleri (`WebContentsView`), SmartTube TV oturumu ve mini
oynatıcı penceresi. Kural statik ratchet ile kilitlidir
(`tests/` içindeki webPreferences denetimi — R154).

`<webview>` etiketi uygulama genelinde **reddedilir** (global webview kapısı).

## 2. Preload köprü sözleşmesi

- `window.api` yalnız **sabit kanal adları** içerir; renderer'dan gelen
  argüman asla kanal adını belirlemez (keyfi IPC yok).
- `tests/preload-usage-ratchet.test.js` her `api.<ad>` export'unun en az bir
  gerçek çağrı sitesini ister; kullanılmayan export yalnız gerekçeli
  `DORMANT` listesiyle kalabilir. Şu an: 241 export, 7 dormant, 0 çıplak.
- Preload↔main kanal paritesi ayrı statik testle kilitli
  (her köprü metodu canlı bir `ipcMain.handle`'a gider).
- Yayın kanalları (`api.on*`) sarmalanmış dinleyici + unsubscribe döndürür;
  renderer'ın kendi dinleyicisini main'e sızdırması engellenir.
- `ipcRenderer.sendSync` yalnız pencere kapanırken tamamlanması gereken
  yazımlarda (`saveSettingsSync`, `saveWatchItemBeforeClose`) kullanılır —
  senkron IPC renderer'ı bloke ettiği için listeye yeni üye eklenmez.

## 3. IPC gönderici doğrulaması

Ayrıcalıklı handler'lar `event.sender`/`event.senderFrame` ile arayanı
doğrular (`mainWindow.webContents.mainFrame`, sekme `WebContentsView` vb.).
Unguarded (doğrulamasız) handler ratchet'i kilitli: yeni `ipcMain.handle`
eklendiğinde gönderici kontrolü veya `= {}` güvenli varsayılanı şart.

## 4. Navigasyon ve pencere açma

- `setWindowOpenHandler`: yeni pencere istekleri reddedilir veya
  allowlist'e göre yeni sekmeye yönlendirilir (ana pencere, tarayıcı
  sekmeleri, TV, mini oynatıcı ayrı handler — R265 boşlukları kapattı).
- `will-navigate`: köken/şema bekçileri; ana pencerede tamamen engellenir,
  sekme içeriklerinde politika denetimine girer.
- İzinler: `setPermissionRequestHandler` köken-bazlı `sitePermissions`
  kararı; `media` isteği kamera+mikrofon bileşenlerine ayrıştırılır,
  çerçeve atfı olmayan istek fail-closed reddedilir.

## 5. Özel şemalar

`whisper-*` ailesi (`whisper-pdf`, `whisper-assets`, `whisper-live`,
`whisper-output`, `whisper-local` vb.) `protocol.handle` ile servis edilir:

- Kaynak kimlikleri **oturum nonce'uyla** tahmin edilemez (`whisper-assets`,
  `whisper-pdf`) — içeriği bilen bir sayfa bile rastgele belge açamaz.
- Handler'lar köken/kapı kontrolü yapar (kendi renderer'ı Origin'siz
  istekleriyle geçer; yabancı http kökeni reddedilir).
- `whisper-assets` `bypassCSP` ayrıcalığı yalnız varlık sunumu içindir.

## 6. Ağ / SSRF savunmaları

- **DNS rebinding**: altyazı/medya indirmeleri doğrulanan IP listesine
  `lookup` pinning ile bağlanır; DNS sonrası IP değişimi kabul edilmez.
- **Özel IP / localhost kapıları**: sağlayıcı URL'leri (Invidious, manga OCR,
  yt-dlp güncelleyici) literal-IP ve iç-ağ hedeflerini reddeder.
- **Proxy zincirleri**: `resolveProxy` belirsizliğinde doğrudan bacak
  güvenli yedeğe düşer; Secure çerezler http'ye taşınmaz.
- **Gövde sınırları**: tüm ağ okumaları bayt sınırıyla akıştan okunur;
  sınırsız `arrayBuffer`/`text` birikimi yok.

## 7. Gizli veri ve oturumlar

- API anahtarları **argv'de değil** ortam değişkeninde gider
  (`WHISPER_HF_TOKEN`, `WHISPER_LLM_API_KEY`) — süreç listesine sızmasın diye.
- OAuth/Invidious oturumları `safeStorage` ile şifreli dosyada;
  `access_token` yalnız bellekte tutulur, diske yazılmaz.
- Ayar/teşhis dışa aktarımı hassas alanları redakte eder
  (`browser-diagnostics-export` sanitizer'ları).

## 8. Renderer sertleştirme

- CSP katı: `script-src 'self'` (inline script yok), `object-src 'none'`,
  `base-uri 'none'`; `browser-mini.html` aynı politikada.
- `innerHTML`/`localStorage` yüzeyi süpürüldü (R185); HTML enjeksiyonu
  statik taramayla kilitli.
- Dosya adı türetimi Windows ayrılmış köklerini + yol traversal'ı eler
  (R178); `.wbp` paket okuyucu zip metaveri süslemesini reddeder (R166).

## 9. Test kilitleri (regresyon envanteri)

| Ratchet | Kilitlediği kural |
|---|---|
| `preload-usage-ratchet.test.js` | her api export'u canlı kullanım veya gerekçeli dormant |
| IPC parity testi | köprü↔handler birebir |
| unguarded ratchet (R176) | sender doğrulaması / güvenli varsayılan |
| webview reddi + webPreferences ratchet (R154) | sandbox/contextIsolation her yüzeyde |
| `browser-dialog-occlusion.test.js` (R269) | açık diyalog native yüzeyi occlude eder |
| navigation guard smokes (R265) | yeni-pencere + will-navigate kapıları |
| DNS-pinning / indirme testleri (R242) | doğrulanan IP'ye pinning |

## 10. Bilinen sınırlar

- `bypassCSP` yalnız `whisper-assets`'te — bu şemanın içeriği tamamen
  kendi renderer'ımızca üretilir; dış HTML yüklenmez.
- Proxy'li ortamda DNS sabitleme istemci tarafında çözülemez (CONNECT
  tünelleme); o ortamda Chromium indirme yoluna düşülür — bilinçli tercih.
- Teşhis dışa aktarımı "hassas" bayrağı açıkken yalnız kullanıcı onayıyla
  içerir; smoke'lar sızıntıyı kilitler ama kullanıcı paylaşımı kendi
  sorumluluğundadır.
