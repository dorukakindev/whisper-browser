# BROWSER_BUG_REPORT_387 — 50-kuyruk batch 4: izleme deneyimi (madde 16–20)

Tarih: 2026-10-02 · Dal: `devin/1790917694-watch-experience-b4` · Kod commit: `17457af`
Kapsam: kullanıcının 50'lik özellik-tamamlama kuyruğunun 4. grubu. Beş madde de mevcut
izleme akışlarını tamamlıyor; hepsi kullanıcıya görünen yeni işlev veya ölçülebilir
kalite kazanımı üretti.

## Madde 16 — Alternatif altyazı karşılaştırması

**Ne eklendi:** İki altyazı kanalı (birincil + ikincil) yüklüyken altyazı işlemleri
menüsündeki "Altyazıları karşılaştır" düğmesi (`subCompareBtn`) karşılaştırma
diyaloğu açıyor. `alignSubtitlePair(a, b, 3s)` örtüşme + yakınlık iki-göstergeçli
hizalama ile satır çiftleri üretir; her çift için `driftMs` (başlangıç kayması)
gösterilir. İstatistik satırı: eşleşen / sadece-A / sadece-B sayıları + ortalama
kayma. Bitişik sadece-B koşuları birleştirilip "Bu parçayı A'ya ekle" satırı
sunulur — tıklanınca mevcut `writeSubtitle` + `subtitleStatFor` + sessiz-yükleme
sözleşmesiyle birincil dosyaya eklenir (kaynak dosyalar asla değiştirilmez).

**Kanit:** `tests/watch-experience-16-20.test.js` — hizalama (örtüşen / tolerans
dışı / örtüşmesiz-yakın), istatistikler, düğme kapısı (16 test).

## Madde 17 — Dil tercihlerini hatırlama

**Ne eklendi:** `captureWatchPrefs()` artık `audioTrackLang`, `subLang`,
`sub2Lang` alanlarını da topluyor; `state.seriesPrefs` + medya bazlı
`watchPrefs` üzerinden kalıcı. `applySavedLanguagePrefs()` kaynak yüklendikten
sonra (YouTube iz listesi, tarayıcı `browserTracks`, HLS `audioTracks`)
kayıtlı tercihi uygular; tercih edilen parça yoksa `playerLangPrefHint`
üzerinden görünür Türkçe ipucu basar — **sessizce yanlış parça seçilmez**.
`subLangFromPath()` dosya-adı dil sonekini okur; `loadSubtitle` bu değeri
`player.subLang`/`sub2Lang`'e yazıyor.

**Bulunan ve düzeltilen kusur (uygulama sırasında):** HLS dalı yanlış select
id'sini (`playerAudioLang`) sürüklüyordu; gerçek id `playerStreamAudio` —
düzeltildi.

## Madde 18 — Dizi düzeyinde izleme ayarları

**Ne eklendi:** `seriesKeyForPlayer()` üç kaynaktan dizi anahtarı türetir:
`player.browserSeriesKey` (browser-features'in site-bazlı anahtarı, `|`
ayırıcılı), yerel dosya adından `seriesKeyFromLocalPath()` (SxxEyy, NxNN,
"Bölüm N", sondaki sayı), veya `series:youtube:<authorId>`. `SERIES_PREF_KEYS`
izinli alanları (hız, görünüm, diller, altyazı stili, otomasyon) `state.seriesPrefs`
altında saklar; `flushWatchState` değişince yazar, `restoreWatchProfile`
`{...seriesPrefs, ...itemPrefs}` önceliğiyle geri uygular — **bölümün özel
ayarı korunur**. `playerSeriesChip` çipi "Dizi ayarları bu diziye bağlı"
durumunu görünür kılar.

**Bulunan ve düzeltilen kusur:** `seriesWatchSubset(null)` TypeError atıyordu
(test yakaladı) — boş-girdi toleransı eklendi.

## Madde 19 — Bölüm–transkript bağlantısı

**Ne eklendi:** `chapterAtTime(t)` ikili araması `player.chapters` üzerinde
aktif bölümü bulur; `playerChapterNow` çipi her iki zamanlayıcı kancasında
(yerel `timeupdate` + tarayıcı `tick`) güncellenir. `renderResolvedChapters`
seçeneği artık `pSecToTime(start) · başlık` biçimini ve satır sayısını
gösterir; bölüm değişimi `scrollTranscriptToTime(start)` ile aynı navigasyon
akışında transkripti kaydırır. `renderCueList` bölüm sınırındaki cue kartına
`cue-card-chapter` rozeti basar.

**Bulunan ve düzeltilen kusur:** `uiText('Bölüm')` sözlükte 'Episode'a
eşleşiyordu; video bölümleri için `interfaceChoice('Bölüm','Chapter')`
kullanıldı — ara-string'ler observer tarafından çevrilemediği için tüm
birleşik metinler `interfaceChoice`'a taşındı.

## Madde 20 — Klasörde medya–altyazı eşleştirme

**Ne eklendi:** Yeni IPC `media:scanFolderBundle` (main.js):
`authorizedBrowserSender` + `authorizeLocalMediaPath` kapılı, seçilen video
dosyalarının dizinlerinde derinlik ≤1 BFS ile medya + altyazı dosyalarını
tarar (`.srt/.vtt/.ass/.ssa`, 4000 sınırı). Klasör seçiminde altyazı varsa
`openFolderMatchDialog()` her video için aday eşleştirmeyi önizler:
`folderMatchScore` kök-eşitliği (100), önek+dil (80), bölüm jetonu (60)
puanlar; iki aday arası <15 puan ise satır `fm-ambiguous` olarak işaretlenir
ve **boş bırakılır** — kullanıcı karar verir. Onay `player.folderMatch`
haritasını kurar; `attachSiblingSubtitles` bu haritayı autoload'da kullanır.
Kaynak dosyalar asla taşınmaz/değiştirilmez.

**Bulunan ve düzeltilen kusur:** bölüm jetonu karşılaştırması `'01|02' ≠ '1|02'`
yüzünden S01E02 ↔ 1x02 eşleşmiyordu — iki taraf da sayısala indirgenip
karşılaştırılıyor.

## Locale / a11y durumu

13 yeni çift-kültürlü giriş + 7 kalıp `ui-locale.js`'e eklendi (madde 16–20
metinleri). `ui-locale.test.js` NEUTRAL listesine batch-3'ten kalan iki
placeholder (`0.30`, `gemini-3.8-pro`) eklendi — batch-3 kaçağı bu turda
kapatıldı; ayrıca 'Birinci/İkinci kanal' zaten sözlükte varmış, çift giriş
kaldırıldı (uniq anahtar ratchet'i yakaladı).

## Test kanıtı

- `node tests/watch-experience-16-20.test.js` → **16/16**
- `node tests/ui-locale*.test.js` + `dialog-locale` + `browser-chapters` +
  `browser-feature-services` + `watch-library*` → yeşil
- `ipc-parity` (225 handle · 12 on · 22 send), `preload-sandbox`,
  `preload-usage-ratchet`, `settings-*`, `persistent-schema-inventory`,
  `adversarial-ipc`, `ipc-payload-fuzz`, `browser-bulk-edit-locks` → yeşil
- Electron smoke (xvfb): `electron-ui-locale` (EN'de kalan TR = 0),
  `electron-subtitle-overlap`, `electron-browser-subtitle-gauntlet`,
  `electron-feature-lifecycle` → **4/4**
- `node --check` tüm düzenlenen dosyalar → OK

## Windows etkisi / doğrulanmayanlar

Linux + Electron'da doğrulandı. Windows'ta doğrulanmayanlar: `media:scanFolderBundle`
IPC'nin Windows yol ayrıştırması (path.win32 normalize edilmedi — UNC/uzun yol),
klasör diyaloğunun dosya seçici entegrasyonu, HLS ses-iz geçişi (donanıma bağlı).
Hepsi el-kontrol listesine yazıldı.
