# BROWSER_BUG_REPORT_141 — R147 gauntlet bakiyesi (T6 + T8)

**Tarih:** 2026-09-27 · **Dal:** `codex/r147-gauntlet-1790506539` · **Taban:** master `8edab3c`

## Kapsam ve yöntem

T1–T12 gauntlet'inin kalan hatları; bu tur T8 (IPC güvenliği — derin
denetim + ratchet) ve T6 (çökme/veri bütünlüğü — yazma envanteri). Daha
önceki turlar: T1/T3/T4 → R118, T2 overlay → R113, T5 çapraz-sekme → R113,
T11 soak → R145.

## T8 — IPC güvenliği: 222 işleyici envanteri

`ipcMain.handle`/`ipcMain.on` kayıtlarının tamamı tarandı. Bulgu:

- 215/222 doğrudan `authorizedBrowserSender` çağırıyor.
- Kalan 7 `ipcMain.on` kanalı eşdeğer kimlik kontrolü kullanıyor
  (`library:upsert-before-close` → `event.sender === mainWindow.webContents` +
  mainFrame; `library:flush-before-close-complete` → bekleyen-el-sıkışma
  `pending.sender` eşleşmesi; `browser:trusted-bridge`/`open-link`/
  `page-mutated`/`resource-snapshot-response` → `senderFrame === mainFrame` +
  sekmenin kendi `webContents`'i ile eşleşme; `browser:discovery-signal` →
  `browserDiscoveryFrameAllowed` + aktif-sekme + görünüm doğrulaması).
- Dosya-yazan tüm işleyiciler (`media:writeSubtitle`, `saveSubtitleCopy`,
  `saveImage`) boyut sınırı + `authorizeSubtitleFile` + atomik yazıcı +
  kaydetme diyaloğu kombinasyonu kullanıyor; `shell:openPath`/`showInFolder`
  uzantı beyaz listesi + onay diyaloğu; `shell:openExternal`
  `decideUrlPolicy`'den geçiyor; `player:external` yalnız yetkili medya
  dosyası veya http/https URL'si kabul ediyor; `transcribe:start` girdi
  dosyalarını medya/altyazı yetkilendiricisinden geçiriyor, YouTube URL'si
  URL-politikasından.

**Ratchet:** `adversarial-ipc.test.js`'e envanter testi eklendi — herhangi
bir `ipcMain.*` kaydının ilk 2000 karakterinde yetki jetonu bulunmazsa CI
düşer (korumasız yeni kanal regresyonu engellenir).

## T6 — çökme/veri bütünlüğü: 1 doğrulanmış bug

**`publishBrowserTrackNow` atomik olmayan yazı (düzeltildi).** Canlı web
altyazı izi (`browser-subtitles/web-*.srt`) oynatıcı tarafından sürekli
okunurken `fs.writeFileSync` ile yerinde yazılıyordu — süreç yazım ortasında
ölürse (veya oynatıcı yazım anında okursa) yarım/kesik SRT görülürdü. Repo
zaten `writeSubtitleAtomic` (tmp→rename, BOM'u srt/ass/ssa için ekler)
yazıcısına sahipti; çağrı onunla değiştirildi. Diğer atomik-olmayan
yazmalar tarandı: kalanlar kullanıcının "farklı kaydet" diyaloğuyla
seçtiği tek seferlik dışa aktarımlar (PDF/tanı paketi/abonelik/Anki/
oturum paketi/PNG kare) — bu yüzeyler için kesinti-yarım-dosya kabul
edilebilir (konvansiyonel); kuyruk/ayar/oturum durumları zaten
`writeJsonAtomic` + `.bak` yedeği kullanıyor. Soak yazıcı bütçesi
(`subtitleFiles: 6/cycle`) rename fazladan ~1 op ile yine bütçe altında.

**Regresyon testi:** kaynak ratchet'i — `publishBrowserTrackNow`
gövdesinde `fs.writeFileSync` yasak, `writeSubtitleAtomic` zorunlu.

## Sonuç

- Bug: 1 (atomik olmayan canlı-iz yazımı) — düzeltildi.
- IPC envanteri: korumasız kanal yok; koruma değişmezi CI'a kodlandı.
- Kalan gauntlet işi: T2 PTS/timescale kenarları, T9 gerçek-UI kabulü
  (Windows/etkileşim), T10 kurulum akışı statik denetimi (R155'te ayrı
  madde olarak var), T12 birleşik rapor.

## Windows etkisi

Atomik rename Windows'ta Electron/Node'da destekli; hedef dosya açıkken
rename davranışı NTFS'te POSIX'ten farklı olabilir — oynatıcının dosyayı
kısa ömürlü okuması (aç→oku→kapat) nedeniyle pratik risk düşük; Windows'ta
"altyazı izi yüklenirken uygulamayı kapat" senaryosu el kontrolü önerilir.
