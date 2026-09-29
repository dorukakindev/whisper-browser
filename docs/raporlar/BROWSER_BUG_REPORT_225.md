# R275 — IPC payload fuzz turu 2 (derin payload bombardımanı)

**Tarih:** 2026-09-29 · Dal: `fix/r275-ipc-payload-fuzz` → `master` · **Sonuç: temiz — bug yok**

## Kapsam

`tests/adversarial-ipc.test.js` 213 `ipcMain.handle` kanalının **gönderici-yetki** kapılarını
denetler ancak payload'ı asla handler gövdesine ulaştırmaz. Bu tur ikinci katmanı kaplar:
yetkili göndericiyle **her kanal × her argüman pozisyonu × 37 hostile payload**
(9.240 çağrı toplam).

## Yöntem

Her handler `vm.runInNewContext` içinde kaydedilir; context global'i bilinmeyen tüm adları
callable+awaitable **kaydedici proxy**'ye çözer (çağrı yolu + arg önizlemesi kaydedilir).
Stub-truthy artefaktını önlemek için kapı adları gerçekçi double'lar alır:

- `authorizeLocalMediaPath`/`authorizeMediaFile`/`authorizeSubtitleFile`/`authorizeWatchFolder`:
  yalnız dolu string kabul ("yetkili dosya"), diğer tipler reddedilir.
- `subtitleFileAccess`/`mediaFileAccess` gerçek sınıf; `pdfFileAccess`/`watchFolderAccess`/
  `shellTargetAccess` reddeden double.
- `dialog.*` her zaman iptal/red; `decideUrlPolicy` gerçek protokol filtresini taklit eder
  (yalnız `http:`/`https:` external).
- Çocuk süreç `.on('close'|'exit'|'finish'|'end')` dinleyicileri mikro-görevde kod 1 ile
  tetiklenir — handler subprocess beklerken asılı kalmaz.
- Modül-düzeyi `let` durumları falsy, `new Set/Map` kolleksiyonları gerçek olarak kurulur
  ("başka iş çalışıyor" kapıları payload doğrulamasını gölgelemez).
- `clonePublicOptions`/`validateQueueOptions`/`canonicalLocalPath`/`decodeSubtitleBuffer`
  gerçek modüllerden gelir.

## İhlal sınıfları ve sonuç

| İnvariant | Sonuç |
|---|---|
| Allowlist dışı tehlikeli sink (spawn/exec/fs-yazımı/shell/net/app.quit…) | **0** |
| `Object.prototype`/`Array.prototype` kirliliği (`__proto__`, `constructor.prototype` payload'ları) | **0** |
| 2 sn üstü çağrı (hang) | 1 — `youtube:authCode` (OAuth loopback bekleme — tasarım gereği, arg'suz) |
| Error olmayan değerle throw/reject | **0** |

İlk (ham) koşu 1.075 sahte pozitif üretti — recorder-truthy artefaktı (yetki fonksiyonlarının
gerçek dönüşünü taklit etmeyen kör proxy'ler). Double'lar kalibre edilince tüm sink'ler
kanalın amacıyla birebir örtüştü.

## Allowlist'e alınan sink'ler (gerekçeli)

| Kanal | Sink | Gerekçe |
|---|---|---|
| `youtube-tv:signout` | `session…clearStorageData` | Kanalın tek işi oturum bölümünü temizlemek |
| `logs:openFolder` | `shell.openPath` | Sabit günlük klasörünü açmak |
| `browser:adapters:openFolder` | `mkdirSync`+`openPath` | Sabit adapters dizinini oluşturup açmak |
| `maintenance:updateYtdlp` | `spawn` | Sabit argv güncelleme betiği |
| `media:probeTracks`/`extractSubtitleTrack` | `spawn`/`mkdirSync` | Yetkili dosyada ffprobe/ffmpeg — kanalın işi |
| `transcribe:start` | `spawn`/`mkdirSync` | Yetkili girdide python işi + userData/tmp iş dizini |
| `queue:save` | `writeQueueState` | Kuyruk persist işi; `validateQueueOptions`+merge önceden |
| `settings:save` | `saveSettings` | Ayar persist işi (payload = ayar nesnesi) |
| `player:external` | `spawn` | `EXTERNAL_PLAYER_NAMES` + yetki/politika kapıları önceden |
| `app:getEnvInfo` | `spawn` | Sabit argv ortam probu |
| `youtube:authCode` | hang | Loopback OAuth onay bekleme — tasarım gereği |

## Doğrulanan derin yollar (örnekler)

- `player:external` `schema-player-file` (`{player:'x', file:'/etc/passwd'}`) spawn'a ulaştı;
  `schema-player-url` (`file:///etc/passwd`) protokol kapısında spawn'suz reddedildi.
- `transcribe:start` `schema-path` payload'ı yetki kapısından geçip iş-dizini kurulumuna
  ulaştı; `mkdirSync` yalnız `userData/tmp` altında.
- `queue:save` `{__proto__:{polluted}}` nesnesini normalize edip yazdı — pollution invariant'ı
  temiz (kendi veri özelliği olarak serileşir, prototype zinciri dokunulmaz; yeniden yüklemede
  `loadQueueState` şema süzgecinden geçer).
- `settings:save` hostile anahtarları `settings.json`'a veri olarak yazar — aynı gerekçe.

## Kalan sınır

- Senkron ölümcül döngü (örn. `{length:1e9}` ile `Array` yapıcı yolu) asenkron bekçiyle
  yakalanamaz; bunun için worker izolasyonu gerekir — korpus boyutları kasıtlı orta tutuldu.
- `ipcMain.on` kanalları (settings:saveSync gibi) bu turun dışında — handle yüzeyi tamam.
- Gerçek `spawn` argüman güvenliği argv-array biçimiyle kanıtlı (shell yok); önizlemelerde
  traversal/URL payload'ları yalnız yetkili-string yolundan argv'ye ulaştı.

## Testler

`node tests/ipc-payload-fuzz.test.js` — 213/213 kanal, 9.240 çağrı, 0 ihlal, PASS.
`npm test`'e otomatik dahil (`tests/run-all.js` `*.test.js` keşfi).
