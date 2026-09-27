# BROWSER BUG REPORT 158 — Windows dosya adı kuralları (R178)

- **Tarih:** 2026-09-27 · **Dal:** `codex/r178-windows-filename-guard` · **Kod commit:** `1ef9b86`
- **Kapsam:** preload↔main en az-ayrıcalık denetimi (temiz) + türetilen dosya adlarının Windows kural denetimi.

## Bulgular

### F1 — Sayfa başlığından türetilen otomatik altyazı adı Windows'ta yazılamaz (düzeltildi)
`browserConfiguredSubtitlePath` (`src/main.js`) web sekmesinin başlığından dosya adı üretip `writeSubtitleAtomic` ile **diyalogsuz** yazar. Temizleyici yalnız `< > : " / \ | ? *` ve denetim karakterlerini ayıklıyordu; iki Windows kuralı eksikti:

1. **Ayrılmış aygıt kökleri:** `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9` — ilk nokta öncesi kök bu adlara eşitse dosya her uzantıyla geçersizdir (`CON.x.srt` bile aygıt adı sayılır). Windows'ta `fs.writeFile` EPERM/ENOENT ile düşer.
2. **Sondaki nokta/boşluk:** kabuk son bileşenin kuyruğundaki `.`/` ` karakterlerini kırpar — `bölüm.` adı `bölüm` olur; tutarsızlık/sessiz yeniden-yazma riski.

Aynı eksik desen dört türetme noktasında tekrarlanıyordu: `browserExportTitle` (mhtml/pdf/png/manga defaultPath'leri), `browser:subtitle:export` ve A-B klip `safeTitle`, `browserImageFileName`, ekran görüntüsü `suggestedName` ve iş günlüğü `safe` adı. Diyalog besleyenlerde yerel pencere reddedip kullanıcıya yeniden adlandırtır (kabul edilebilir), fakat **otomatik yazıda** başarısızlık sessiz kalırdı.

**Düzeltme:** `windowsSafeFileName(name, fallback)` tek merkezî ayıklayıcı — geçersiz karakterler → boşluk, boşluk katlama, trim, kuyruk `.`/boşluk kırpma, ayrılmış köke `_` öneki, boşsa yedek. Tüm türetme noktaları bu yardımcıya taşındı (`startJobLog` dahil — salt-nokta girdide önceden `...` adlı dosya oluşurdu).

**Regresyon:** `tests/browser-subtitles.test.js` R178 testi — yardımcının davranışını kilitler (6 ayrılmış kök × uzantılı/uzantısız, kuyruk nokta, yedek, Türkçe ad geçişi) + otomatik yolun yardımcıyı kullandığını kaynakta doğrular.

## Temiz çıkanlar (R177 devamı)

- `src/preload.js` `window.api` yüzeyi: tüm metotlar **literal kanal adlı** `invoke`/`send`/`sendSync` çağrıları — genel `invoke(channel, …)` geçişi yok. `ipcRenderer` hiçbir dünyaya doğrudan açılmıyor.
- `src/browser-preload.js`: `__whisperTrustedBridgeSend` yalnız izole preload dünyasında; `browser:trusted-bridge` ana süreçte `senderFrame === mainFrame` + `webContents === event.sender` sekme eşlemesi + tür beyaz listesi + aktif-sekme kapısı (page-blocks/page-action hariç — arka-plan keşfi için kasıtlı) ile doğrulanıyor.
- `browser:mini:command` ve modül-registered handle'lar kendi webContents denetimini yapıyor.
- Prototip kirliliği: `provider-api-keys`, `provider-model-profiles`, `secret-store`, `settings-security` `__proto__`/`constructor`/`prototype` anahtar setleriyle korunuyor.

## Windows etkisi

Doğrudan iyileştirme — Windows'a özgü hata sınıfı kapatıldı. Doğrulanmamış sınır: gerçek Windows'ta "CON" başlıklı sayfada otomatik altyazı kaydı (Linux'ta yazma başarılı olur; kural Windows'a özgü).
